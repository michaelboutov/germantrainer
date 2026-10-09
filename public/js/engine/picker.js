// The adaptive picker: decides WHAT you practise next and HOW hard it is, and learns from every answer.
//
//   • each rule has a mastery estimate → difficulty tier (recognise → assemble → produce)
//   • weak, forgotten and recently-missed rules are chosen more often (interleaved with a short "focus" streak)
//   • a wrong answer comes back ~3 tasks later in a different, easier shape — and again at the end if it still fails
//   • words climb a spaced-repetition ladder; new words are introduced a few per day
//   • when a rule is mastered the next rules open up on their own — you just keep pressing "next"
import { SKILLS, SKILL, STRANDS } from '../content/skills.js';
import { WORDS } from '../content/lexicon.js';
import { pick, shuffle, today } from '../util.js';
import { getSettings } from '../gemini.js';
import {
  state, isUnlocked, status, mastery, tierFor, isMastered, skillState, recordSkill, recordItem, recordWord, logMistake,
  recentMistakeSkills, addXp, levelOf, dayStat, dueItems, wordInfo, save, topConfusions,
} from './model.js';
import { buildFor, buildWord, buildWordMatch, buildPictureMatch, buildArticleRound, rebuildKey, allWords, itemsOf } from './builders.js';

const NEW_WORDS_PER_DAY = 6;

export class Session {
  constructor({ mode = 'flow', skillId = null, size = getSettings().roundSize || 10, ctx = {} } = {}) {
    this.mode = mode; this.skillId = skillId; this.size = size;
    this.ctx = { voiceOk: false, speakOk: false, ...ctx, recentKeys: new Set() };
    this.done = 0; this.right = 0; this.xp = 0; this.combo = 0; this.bestCombo = 0;
    this.queue = []; this.lastSkill = null; this.focus = null; this.focusLeft = 0;
    this.recent = []; this.mastered = []; this.lost = []; this.newWords = new Set(); this.wrong = []; this.skillsTouched = new Set();
    this.mistakePool = null; this.startedAt = Date.now();
    this.startLevel = levelOf(state.profile.xp);
  }
  get finished() { return this.done >= this.size && !this.queue.some((q) => q.final); }
  get progress() { return Math.min(1, this.done / this.size); }

  // ── choosing ─────────────────────────────────────────────────────────────────────────────
  next() {
    // 1) retries that are due
    const qi = this.queue.findIndex((q) => q.at <= this.done);
    if (qi >= 0) {
      const q = this.queue.splice(qi, 1)[0];
      const ex = rebuildKey(q.key, q.tier, this.ctx);
      if (ex) { ex.retry = q.tries; return this._remember(ex); }
    }
    let ex = null;
    if (this.mode === 'mistakes') ex = this._nextMistake();
    else if (this.mode === 'vocab') ex = this._nextVocab();
    else if (this.mode === 'skill') ex = this._nextGrammar(this.skillId);
    if (!ex && this.mode === 'flow') ex = Math.random() < (getSettings().vocabShare ?? 0.25) ? this._nextVocab() : this._nextGrammar();
    if (!ex) ex = this._nextGrammar() || this._nextVocab();
    return ex ? this._remember(ex) : null;
  }
  _remember(ex) {
    if (ex.key) { this.ctx.recentKeys.add(ex.key); if (this.ctx.recentKeys.size > 14) this.ctx.recentKeys.delete(this.ctx.recentKeys.values().next().value); }
    return ex;
  }

  _weight(s) {
    const st = status(s.id); const p = mastery(s.id);
    let w = st === 'mastered' ? 0.07 : st === 'review' ? 0.55 : (1 - p) * (st === 'new' ? 1.15 : 1);
    const miss = recentMistakeSkills(12)[s.id] || 0; w += 0.38 * Math.min(2, miss);
    if (dueItems().some((k) => k.startsWith(`${s.id}#`) || k.startsWith(`${s.id}@`))) w += 0.3;
    const sk = skillState(s.id);
    if (st === 'mastered' && sk.last && Date.now() - sk.last > 10 * 86400000) w += 0.25;
    if (s.lvl === 'b1') { const a2 = SKILLS.filter((x) => x.lvl === 'a2'); if (a2.filter((x) => mastery(x.id) >= 0.6).length < a2.length * 0.7) w *= 0.5; }
    if (s.id === this.lastSkill) w *= 0.6;
    return Math.max(0.02, w) ** 1.4;
  }
  _chooseSkill() {
    if (this.focus && this.focusLeft > 0 && isUnlocked(this.focus) && Math.random() < 0.72) { this.focusLeft--; return this.focus; }
    const cand = SKILLS.filter((s) => isUnlocked(s.id));
    let r = Math.random() * cand.reduce((a, s) => a + this._weight(s), 0);
    let chosen = cand[cand.length - 1];
    for (const s of cand) { r -= this._weight(s); if (r <= 0) { chosen = s; break; } }
    this.focus = chosen.id; this.focusLeft = 1 + Math.floor(Math.random() * 3);
    return chosen.id;
  }
  tierOf(skillId) {
    const p = mastery(skillId); const base = tierFor(p); const r = Math.random();
    let t = r < 0.14 ? Math.max(1, base - 1) : r > 0.9 ? Math.min(3, base + 1) : base;
    if (skillState(skillId).n < 2 && t > 2) t = 2;
    return t;
  }
  _nextGrammar(forced) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const id = forced || this._chooseSkill();
      const ex = buildFor(id, this.tierOf(id), this.ctx);
      if (ex) { this.lastSkill = id; this.skillsTouched.add(ex.skill); return ex; }
      if (forced) break;
      this.focus = null;
    }
    return null;
  }

  _nextVocab() {
    const now = Date.now(); const ctx = this.ctx;
    const r = Math.random();
    if (r < 0.1) { const ex = buildWordMatch(ctx); if (ex) return ex; }
    if (r < 0.17) { const ex = buildPictureMatch(ctx); if (ex) return ex; }
    if (r < 0.22) { const ex = buildArticleRound(ctx); if (ex) return ex; }
    const all = allWords().filter((w) => !(w.kind === 'p' && w.lvl === 'a2' && Math.random() < 0.3));
    const seen = (w) => wordInfo(w.id)?.seen > 0;
    const due = all.filter((w) => seen(w) && wordInfo(w.id).due <= now).sort((a, b) => wordInfo(a.id).box - wordInfo(b.id).box || wordInfo(a.id).due - wordInfo(b.id).due);
    const fresh = all.filter((w) => !seen(w) && w.kind !== 'p');
    const todayNew = dayStat().nw || 0;
    const canIntro = fresh.length && todayNew < NEW_WORDS_PER_DAY;
    let w;
    if (canIntro && (!due.length || Math.random() < 0.38)) {
      const ai = fresh.filter((x) => x.ai); const a1 = fresh.filter((x) => x.lvl === 'a1');
      w = ai.length && Math.random() < 0.7 ? pick(ai) : a1.length && Math.random() < 0.7 ? pick(a1) : pick(fresh);
      dayStat().nw = todayNew + 1; this.newWords.add(w.id);
      // consolidate the new word two tasks later
      this.queue.push({ key: w.id, tier: 1, at: this.done + 2, tries: 0, intro: true });
      return buildWord(w, 1, ctx);
    }
    if (due.length) w = pick(due.slice(0, 8));
    else {
      const learning = all.filter((x) => seen(x) && x.kind !== 'p').sort((a, b) => wordInfo(a.id).box - wordInfo(b.id).box);
      w = learning.length ? pick(learning.slice(0, 10)) : pick(all.filter((x) => x.kind !== 'p'));
    }
    const box = wordInfo(w.id)?.box ?? 0;
    const tier = box <= 1 ? (Math.random() < 0.6 ? 1 : 2) : box <= 3 ? 2 : 3;
    return buildWord(w, w.kind === 'p' ? Math.max(2, tier) : tier, ctx);
  }

  _nextMistake() {
    if (!this.mistakePool) {
      const keys = []; const seen = new Set();
      for (const k of dueItems()) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      for (const m of [...state.mistakes].reverse()) { const k = m.key; if (k && !seen.has(k)) { seen.add(k); keys.push(k); } if (keys.length >= 30) break; }
      this.mistakePool = keys;
    }
    while (this.mistakePool.length) {
      const k = this.mistakePool.shift();
      const sk = k.split(/[#@]/)[0];
      const tier = Math.min(2, Math.max(1, this.tierOf(SKILL[sk] ? sk : 'a1.artikel') - 0));
      const ex = rebuildKey(k, tier, this.ctx);
      if (ex) return ex;
    }
    // pool dried up: practise the weakest rules instead
    return null;
  }

  // ── learning from an answer ──────────────────────────────────────────────────────────────
  /**
   * result: { correct, score(0..1), given, expected, errors:[{given,expected,prompt}], help?, ms? }
   * → { xp, masteredNow, lostMastery, levelUp, combo, skill:{before,after} }
   */
  report(ex, result) {
    const score = result.score ?? (result.correct ? 1 : 0);
    const correct = score >= 0.999;
    const tier = ex.tier || 2;
    const out = { xp: 0, masteredNow: false, lostMastery: false, levelUp: false, combo: 0, skill: null };

    // skill mastery (+ strand like hearing/speaking)
    const rec = recordSkill(ex.skill, { tier, score, help: result.help });
    out.skill = rec; out.masteredNow = rec.masteredNow; out.lostMastery = rec.lostMastery;
    if (rec.masteredNow) this.mastered.push(ex.skill);
    if (rec.lostMastery) this.lost.push(ex.skill);
    if (ex.strand && ex.strand !== ex.skill) recordSkill(ex.strand, { tier, score, help: result.help });

    // memory ladders
    if (ex.src === 'bank' || ex.src === 'ai') recordItem(ex.key, correct);
    if (ex.word || ex.words) {
      const ids = ex.words || [ex.word];
      const bad = new Set((result.errors || []).map((e) => e.word).filter(Boolean));
      for (const id of ids) recordWord(id, ids.length > 1 && bad.size ? !bad.has(id) : correct);
    }

    // mistakes → memory + confusions
    if (!correct) {
      for (const e of (result.errors?.length ? result.errors : [{ given: result.given, expected: result.expected }]).slice(0, 3)) {
        logMistake({ skill: ex.skill, kind: ex.type, key: e.key || ex.key, word: e.word || ex.word || null, prompt: e.prompt || ex.sentence || ex.full || '', given: e.given, expected: e.expected, ru: ex.ru || '', tag: ex.tag });
      }
      this.wrong.push({ ex: { skill: ex.skill, key: ex.key, full: ex.full, sentence: ex.sentence }, given: result.given, expected: result.expected });
      this.combo = 0;
      if (ex.key && (ex.retry || 0) < 2) this.queue.push({ key: ex.key, tier: Math.max(1, tier - 1), at: this.done + 3 + Math.floor(Math.random() * 2), tries: (ex.retry || 0) + 1, final: (ex.retry || 0) >= 1 });
    } else { this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); this.right++; }

    // xp
    const base = Math.round(score * (7 + tier * 3));
    out.xp = base + (correct ? Math.min(6, this.combo) : 0) - (ex.retry ? 3 : 0);
    out.xp = Math.max(correct ? 3 : 0, out.xp);
    this.xp += out.xp; this.done++; out.combo = this.combo;
    addXp(out.xp, correct);
    out.levelUp = levelOf(state.profile.xp) > this.startLevel;
    if (out.levelUp) this.startLevel = levelOf(state.profile.xp);
    save();
    return out;
  }

  /** Does this rule need fresh material (AI) — it is nearly used up, or you keep missing it. */
  needsFresh(skillId) {
    if (!SKILL[skillId]) return false;
    const items = itemsOf(skillId); const unseen = items.filter((i) => !state.items[i.key]?.seen).length;
    const miss = recentMistakeSkills(12)[skillId] || 0;
    return unseen < 3 || miss >= 2;
  }
  summary() {
    return { done: this.done, right: this.right, xp: this.xp, acc: this.done ? this.right / this.done : 0, bestCombo: this.bestCombo, mastered: [...new Set(this.mastered)],
      lost: [...new Set(this.lost)], newWords: [...this.newWords], wrong: this.wrong, skills: [...this.skillsTouched], ms: Date.now() - this.startedAt, level: levelOf(state.profile.xp), confusions: topConfusions(3) };
  }
}

/** A short human line explaining why we are practising this rule right now. */
export function whyThis(skillId) {
  if (STRANDS[skillId]) return STRANDS[skillId].sub;
  const st = status(skillId); const miss = recentMistakeSkills(12)[skillId] || 0;
  if (miss >= 2) return 'ты недавно ошибался здесь';
  if (st === 'new') return 'новое правило';
  if (st === 'review') return 'пора освежить';
  if (st === 'mastered') return 'повторение';
  return 'закрепляем';
}
export { WORDS };
