// The learner model: everything the trainer remembers about you.
//   skills    — how well you know each rule (a mastery estimate p ∈ [0,1] + recent results)
//   items     — individual sentences you got wrong, on a spaced-repetition ladder (Leitner boxes)
//   words     — the same ladder for every vocabulary word
//   mistakes  — a log of what you answered vs. what was right (feeds the AI coach)
//   conf      — your personal "confusion pairs" such as den → dem
//
// Pure logic + persistence; no DOM. Tested in test/engine.test.mjs.
import { kv } from '../store.js';
import { SKILLS, SKILL } from '../content/skills.js';
import { today, DAY } from '../util.js';
import { getSettings } from '../gemini.js';

const MIN = 60000;
export const BOX_DELAY = [10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

const PRIORS = {
  a1:     { a1: 0.12, a2: 0.04, b1: 0.02 },
  a2:     { a1: 0.5, a2: 0.18, b1: 0.05 },
  a2plus: { a1: 0.72, a2: 0.42, b1: 0.12 },
};

export const state = {
  loaded: false,
  profile: null,
  items: {},
  words: {},
  userWords: [],
  mistakes: [],
  aiBank: {},
};
let saveTimer = null;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

function freshProfile() {
  return { v: 1, created: Date.now(), xp: 0, answered: 0, correct: 0, streak: { count: 0, last: null, best: 0 }, days: {}, skills: {}, conf: {}, seenIntro: false };
}

export async function load() {
  const [profile, items, words, userWords, mistakes, aiBank] = await Promise.all([
    kv.get('profile'), kv.get('items', {}), kv.get('words', {}), kv.get('userWords', []), kv.get('mistakes', []), kv.get('aiBank', {}),
  ]);
  state.profile = profile || freshProfile();
  state.items = items; state.words = words; state.userWords = userWords; state.mistakes = mistakes; state.aiBank = aiBank;
  state.loaded = true;
  touchStreak(false);
  return state;
}
/** Test hook: start from a blank slate without touching IndexedDB. */
export function reset(partial = {}) {
  state.profile = freshProfile(); state.items = {}; state.words = {}; state.userWords = []; state.mistakes = []; state.aiBank = {};
  Object.assign(state, partial); state.loaded = true;
}
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
  emit();
}
export async function flush() {
  clearTimeout(saveTimer);
  if (!state.loaded) return;
  await Promise.all([
    kv.set('profile', state.profile), kv.set('items', state.items), kv.set('words', state.words),
    kv.set('userWords', state.userWords), kv.set('mistakes', state.mistakes), kv.set('aiBank', state.aiBank),
  ]);
}
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { flush(); });

// ── skills ─────────────────────────────────────────────────────────────────────────────────
export function skillState(id) {
  const P = state.profile;
  const lvl = SKILL[id]?.lvl || 'a2';
  const prior = (PRIORS[getSettings().level] || PRIORS.a2)[lvl] ?? 0.1;
  if (!P.skills[id]) P.skills[id] = { p: prior, n: 0, c: 0, recent: [], last: 0, masteredAt: 0, wrong: 0 };
  else if (!P.skills[id].n) P.skills[id].p = prior; // an untouched rule follows your chosen starting level
  return P.skills[id];
}

/** Mastery with forgetting: untouched knowledge fades slowly (never below 70% of itself). */
export function mastery(id, now = Date.now()) {
  const s = skillState(id);
  if (!s.last) return s.p;
  const days = Math.max(0, (now - s.last) / DAY);
  return s.p * (1 - Math.min(0.3, days / 100));
}

export const tierFor = (p) => (p < 0.38 ? 1 : p < 0.7 ? 2 : 3);
export const isMastered = (id) => !!skillState(id).masteredAt;

export function isUnlocked(id) {
  const sk = SKILL[id];
  if (!sk) return true;
  return sk.req.every((r) => isMastered(r) || mastery(r) >= (sk.lvl === 'b1' ? 0.6 : 0.5));
}

/** 'locked' | 'new' | 'learning' | 'practiced' | 'mastered' | 'review' */
export function status(id) {
  if (!isUnlocked(id)) return 'locked';
  const s = skillState(id);
  if (s.masteredAt) return mastery(id) < 0.72 ? 'review' : 'mastered';
  if (s.n === 0) return 'new';
  return mastery(id) >= 0.6 ? 'practiced' : 'learning';
}

const K = { 1: 0.11, 2: 0.16, 3: 0.22 };
export function nextP(p, tier, correct, help = false) {
  if (correct) return p + (1 - p) * K[tier] * (help ? 0.5 : 1);
  return Math.max(0, p - p * (0.2 + (3 - tier) * 0.04));
}

/**
 * Record one answer for a skill. `score` is 0..1 (partial credit for multi-part tasks).
 * Returns { before, after, masteredNow, lostMastery, tier }.
 */
export function recordSkill(id, { tier = 2, score = 1, help = false } = {}) {
  const s = skillState(id);
  const before = s.p;
  const correct = score >= 0.999;
  s.p = correct ? nextP(s.p, tier, true, help) : score > 0 ? nextP(s.p, tier, false) * 0.5 + s.p * 0.5 : nextP(s.p, tier, false);
  s.n++; if (correct) s.c++; else s.wrong = (s.wrong || 0) + 1;
  s.recent.push(correct ? 1 : 0); if (s.recent.length > 12) s.recent.shift();
  s.last = Date.now();
  let masteredNow = false; let lostMastery = false;
  const last8 = s.recent.slice(-8);
  const acc = last8.length ? last8.reduce((a, b) => a + b, 0) / last8.length : 0;
  if (!s.masteredAt && SKILL[id] && s.p >= 0.82 && s.n >= 8 && acc >= 0.85) { s.masteredAt = Date.now(); masteredNow = true; }
  else if (s.masteredAt && s.p < 0.62) { s.masteredAt = 0; lostMastery = true; }
  return { before, after: s.p, masteredNow, lostMastery, tier };
}

export function skillAccuracy(id) {
  const s = skillState(id);
  return s.recent.length ? s.recent.reduce((a, b) => a + b, 0) / s.recent.length : null;
}

// ── items (sentences) & words on a Leitner ladder ──────────────────────────────────────────
function ladder(table, key, correct, now = Date.now()) {
  const it = table[key] || (table[key] = { box: 0, due: 0, seen: 0, wrong: 0, last: 0 });
  it.seen++; it.last = now;
  if (correct) { it.box = Math.min(5, it.box + 1); it.due = now + BOX_DELAY[it.box]; } else { it.wrong++; it.box = Math.max(0, it.box - 2); it.due = now + BOX_DELAY[0]; }
  return it;
}
export const recordItem = (key, correct) => ladder(state.items, key, correct);
export const recordWord = (id, correct) => { const w = ladder(state.words, id, correct); if (correct) w.correct = (w.correct || 0) + 1; return w; };
export const itemInfo = (key) => state.items[key] || null;
export const wordInfo = (id) => state.words[id] || null;
export const dueItems = (now = Date.now()) => Object.entries(state.items).filter(([, it]) => it.wrong > 0 && it.due <= now && it.box < 3).map(([k]) => k);
export function wordStatus(id) {
  const w = state.words[id];
  if (!w || !w.seen) return 'new';
  return w.box >= 3 ? 'known' : 'learning';
}

// ── mistakes & confusions ──────────────────────────────────────────────────────────────────
export function logMistake(m) {
  state.mistakes.push({ t: Date.now(), ...m });
  if (state.mistakes.length > 400) state.mistakes.splice(0, state.mistakes.length - 400);
  const g = String(m.given ?? '').trim(); const e = String(m.expected ?? '').trim();
  if (g && e && g !== e && g.split(/\s+/).length <= 2 && e.split(/\s+/).length <= 2 && g.length < 18 && e.length < 24) {
    const k = `${g.toLowerCase()}→${e.toLowerCase()}`;
    const c = state.profile.conf[k] || (state.profile.conf[k] = { n: 0, last: 0, skill: m.skill });
    c.n++; c.last = Date.now();
  }
}
export function topConfusions(limit = 8) {
  return Object.entries(state.profile.conf).map(([k, v]) => ({ pair: k, ...v })).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit);
}
export function recentMistakeSkills(n = 10) {
  const out = {};
  for (const m of state.mistakes.slice(-n)) out[m.skill] = (out[m.skill] || 0) + 1;
  return out;
}

// ── xp · streak · days ─────────────────────────────────────────────────────────────────────
export const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 60));
export const levelFloor = (lvl) => 60 * (lvl - 1) ** 2;
export function dayStat(key = today()) { return (state.profile.days[key] ||= { n: 0, c: 0, xp: 0 }); }
export function touchStreak(commit = true) {
  const st = state.profile.streak; const t = today();
  if (st.last === t) return st;
  const y = new Date(Date.now() - DAY); const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (!commit) { if (st.last && st.last !== yk && st.last !== t) st.count = 0; return st; }
  st.count = st.last === yk ? st.count + 1 : 1; st.last = t; st.best = Math.max(st.best || 0, st.count);
  return st;
}
export function addXp(n, correct, answered = 1) {
  const P = state.profile;
  P.xp += n; P.answered += answered; if (correct) P.correct += answered;
  const d = dayStat(); d.n += answered; if (correct) d.c += answered; d.xp += n;
  touchStreak(true);
  const keys = Object.keys(P.days).sort(); while (keys.length > 70) delete P.days[keys.shift()];
}

// ── overview used by the UI ────────────────────────────────────────────────────────────────
export function overview() {
  const P = state.profile;
  const byLevel = { a1: [], a2: [], b1: [] };
  for (const s of SKILLS) byLevel[s.lvl].push({ id: s.id, p: mastery(s.id), status: status(s.id) });
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b.p, 0) / arr.length : 0);
  const mastered = SKILLS.filter((s) => isMastered(s.id)).length;
  return { xp: P.xp, level: levelOf(P.xp), streak: P.streak.count, best: P.streak.best, answered: P.answered, accuracy: P.answered ? P.correct / P.answered : null,
    mastered, total: SKILLS.length, a1: avg(byLevel.a1), a2: avg(byLevel.a2), b1: avg(byLevel.b1), today: dayStat() };
}
