// The practice screen: one task at a time, instant verdict, a feedback sheet, and a living background.
import { h, sleep, pick } from '../util.js';
import { icon } from '../icons.js';
import { SKILL, STRANDS, LEVELS, palOf } from '../content/skills.js';
import { SKILLS } from '../content/skills.js';
import { Session, whyThis } from '../engine/picker.js';
import * as model from '../engine/model.js';
import { mountExercise } from './ex/index.js';
import { speak, stopSpeaking, prefetch, getAudio, voiceAvailable } from '../voice.js';
import { VoiceInput } from '../mic.js';
import { explainMistake, moreSentences, mayGenerateFor } from '../ai.js';
import { getSettings, aiReady, describeError } from '../gemini.js';
import { sfx } from '../sfx.js';
import { ring, flashWord, confirmDialog, toast } from './kit.js';
import { label } from '../content/lexicon.js';

const RIGHT = ['Richtig!', 'Sehr gut!', 'Stark!', 'Genau!', 'Perfekt!', 'Klasse!', 'Super!', 'Toll!'];
const HYPE = { 3: 'Dreier!', 5: 'Fünf in Folge!', 8: 'Wahnsinn!', 12: 'Unaufhaltsam!', 20: 'Legende!' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function expectedOf(ex) {
  if (ex.type === 'type') return ex.answers[0];
  if (ex.type === 'order') return ex.answers[0].join(ex.join ?? ' ');
  return ex.answer || ex.fix || ex.full || '';
}
/** `full` with the answer highlighted. */
function hilite(full, target) {
  const f = esc(full); const t = esc(target);
  if (!t || !f) return f;
  const i = f.toLowerCase().indexOf(t.toLowerCase());
  return i < 0 ? f : `${f.slice(0, i)}<mark>${f.slice(i, i + t.length)}</mark>${f.slice(i + t.length)}`;
}

export async function mount(app, params = {}) {
  const session = new Session({ mode: params.mode || 'flow', skillId: params.skillId || null, size: params.size, script: params.script || null, ctx: { voiceOk: voiceAvailable(), speakOk: VoiceInput.available } });
  app.session = session;
  const s0 = getSettings();
  let ex = null; let comp = null; let answered = false; let onCheck = null; let curResult = null; let sheet = null; let micLevel = null; let busy = false; let gone = false;
  let unlockedBefore = new Set();

  // ── DOM ─────────────────────────────────────────────────────────────────────────────────
  const ticks = Array.from({ length: session.size }, () => h('i'));
  const prog = h('div.sess-prog', ticks);
  const comboPill = h('div.pill.fire.hidden', h('span', { html: icon('flame', 16) }), h('b', '0'));
  const xpPill = h('div.pill.xp', h('span', { html: icon('bolt', 16) }), h('b', '0'));
  const exit = h('button.icon-btn', { 'aria-label': 'Выйти', html: icon('close', 18), onclick: leave });
  const top = h('header.sess-top', exit, prog, h('div.sess-stats', comboPill, xpPill));
  const orbSlot = h('div.orb-slot');
  const skillTitle = h('b', '…'); const skillSub = h('small', '');
  let skillRing = ring(0, { size: 46, stroke: 5, label: '0' });
  const skillRow = h('div.sess-skill', orbSlot, h('div.skill-meta', skillTitle, skillSub), h('div.skill-ring', skillRing));
  const stage = h('div.stage.flat');
  const checkBtn = h('button.btn.primary.lg', { type: 'button', disabled: true, onclick: doCheck }, h('span', { html: icon('check', 18) }), 'Проверить');
  const giveUp = h('button.btn.ghost', { type: 'button', onclick: doGiveUp }, 'Не знаю');
  const bar = h('footer.sess-bar.hidden', h('div.bar-inner', giveUp, checkBtn));
  const root = h('section.screen.sess', top, skillRow, h('main.stage-wrap', stage), bar);
  app.root.append(root);
  app.scene.anchor('orb', orbSlot, { fill: 0.92 });
  window.gsap?.from([top, skillRow], { opacity: 0, y: -14, duration: 0.6, stagger: 0.08, ease: 'power3.out' });

  // ── per-task API handed to components ───────────────────────────────────────────────────
  const makeApi = () => ({
    setReady: (b) => { checkBtn.disabled = !b; },
    setCheck: (fn) => { onCheck = fn; bar.classList.remove('hidden'); checkBtn.disabled = true; giveUp.classList.remove('hidden'); },
    hideBar: (b) => bar.classList.toggle('hidden', !!b),
    finish: (r) => onResult(r),
    speak: (t, o) => speak(t, o),
    setMicLevel: (fn) => { micLevel = fn; },
  });

  app.scene.setLevelSource(() => micLevel?.() || app.narrator.level);

  // ── flow ────────────────────────────────────────────────────────────────────────────────
  async function nextTask() {
    if (busy || gone) return; busy = true;
    closeSheet();
    if (session.finished) { busy = false; return finishRound(); }
    app.scene.setThinking(true);
    ex = session.next();
    if (!ex) { app.scene.setThinking(false); busy = false; toast('Не получилось подобрать задание — вернёмся домой.', { kind: 'warn' }); return app.go('home'); }
    session.current = ex;
    unlockedBefore = new Set(SKILLS.filter((s) => model.isUnlocked(s.id)).map((s) => s.id));
    if (ex.hideText && aiReady()) await Promise.race([getAudio(ex.say), sleep(6500)]);
    if (gone) return;
    app.scene.setThinking(false);
    answered = false; onCheck = null; curResult = null; checkBtn.disabled = true; giveUp.classList.remove('hidden');
    bar.classList.add('hidden');
    comp?.destroy?.(); stopSpeaking();
    // palette + skill chip
    const pal = palOf(ex.skill); app.setPalette(pal);
    const sk = SKILL[ex.skill]; const st = STRANDS[ex.skill];
    skillTitle.textContent = sk ? sk.title : st?.title || 'Wortschatz';
    skillSub.replaceChildren(...(sk ? [h('span.lvl', sk.lvl.toUpperCase())] : []), whyThis(ex.skill) + (ex.retry ? ' · ещё раз' : ''));
    const p = model.mastery(ex.skill); const nr = ring(p, { size: 46, stroke: 5, label: `${Math.round(p * 100)}`, color: 'var(--c1)' });
    skillRing.replaceWith(nr); skillRing = nr;
    ticks.forEach((t, i) => t.classList.toggle('cur', i === session.done));
    // stage swap
    const g = window.gsap;
    const build = () => { stage.replaceChildren(); comp = mountExercise(stage, ex, makeApi()); };
    if (g && stage.firstChild) { await new Promise((r) => g.to(stage.firstChild, { opacity: 0, y: -16, filter: 'blur(6px)', duration: 0.18, ease: 'power2.in', onComplete: r })); }
    build();
    if (g) g.from(stage.firstChild, { opacity: 0, y: 26, scale: 0.985, filter: 'blur(8px)', duration: 0.5, ease: 'power3.out', clearProps: 'filter,transform' });
    if (ex.full && !ex.hideText) prefetch(ex.full);
    busy = false;
    maybeFresh(ex.skill);
  }

  function doCheck() { if (answered || !onCheck || checkBtn.disabled) return; onCheck(); }
  function doGiveUp() {
    if (answered) return;
    const exp = expectedOf(ex);
    onResult({ correct: false, given: '—', expected: exp, errors: [{ given: '—', expected: exp, prompt: ex.sentence || ex.ru || ex.full || '' }], gaveUp: true });
  }

  function onResult(result) {
    if (answered) return; answered = true;
    bar.classList.add('hidden');
    curResult = result;
    const score = result.score ?? (result.correct ? 1 : 0);
    const kind = score >= 0.999 ? 'right' : score >= 0.5 && result.errors?.length ? 'part' : 'wrong';
    const rep = session.report(ex, result);
    // progress tick, pills
    const idx = session.done - 1;
    ticks[idx]?.classList.remove('cur'); ticks[idx]?.classList.add('done', kind === 'right' ? 'good' : 'bad');
    ticks[session.done]?.classList.add('cur');
    xpPill.querySelector('b').textContent = session.xp; xpPill.classList.remove('bump'); void xpPill.offsetWidth; xpPill.classList.add('bump');
    comboPill.classList.toggle('hidden', session.combo < 2); comboPill.querySelector('b').textContent = session.combo;
    if (session.combo >= 2) { comboPill.classList.remove('bump'); void comboPill.offsetWidth; comboPill.classList.add('bump'); }
    // skill ring follows the mastery estimate
    const p = model.mastery(ex.skill); skillRing.set(p); const lab = skillRing.querySelector('.ring-l'); if (lab) lab.textContent = Math.round(p * 100);
    // reactions
    const sc = app.scene; const pal = palOf(ex.skill);
    if (kind === 'right') {
      sfx.right(); sc.pulse(1); sc.setMood('joyful', 1500); sc.scatter(0.9); sc.burst(pal[1], 70);
      if (HYPE[session.combo]) { sfx.combo(session.combo); flashWord(HYPE[session.combo]); }
    } else if (kind === 'part') { sfx.drop(); sc.pulse(0.5); sc.setMood('focus', 1200); } else { sfx.wrong(); sc.setMood('oops', 1400); sc.scatter(0.25); window.gsap?.fromTo(stage, { x: 0 }, { x: 10, duration: 0.06, repeat: 5, yoyo: true, clearProps: 'x' }); }
    comp?.freeze?.(result);
    showSheet(kind, result, rep);
    // say the correct sentence aloud
    if (s0.autoSpeak && ex.full && !ex.hideText && ex.type !== 'flash' && ex.type !== 'speak') setTimeout(() => { if (!gone) speak(ex.full); }, 450);
    maybeFresh(ex.skill, true);
  }

  // ── feedback sheet ──────────────────────────────────────────────────────────────────────
  function showSheet(kind, r, rep) {
    closeSheet(true);
    const body = h('div.fb-body');
    const exp = r.expected || expectedOf(ex);
    const partial = kind !== 'right';
    // what was right
    if (ex.full && (ex.type === 'choice' || ex.type === 'type' || ex.type === 'order' || ex.type === 'errorhunt' || ex.type === 'picture' || ex.type === 'flash')) {
      const target = ex.type === 'errorhunt' ? ex.fix : ex.answer || (ex.answers && ex.answers[0]) || '';
      const html = ex.type === 'flash' ? esc(ex.full) : ex.full.length > 60 || ex.type === 'order' ? hilite(ex.full, ex.type === 'order' ? '' : target) : hilite(ex.full, target);
      body.append(h('div.fb-label', kind === 'right' ? 'Так и есть' : 'Правильно'), h('div.fb-ans', { html }));
      if (ex.ru && ex.type !== 'flash') body.append(h('div.fb-note', `«${ex.ru}»`));
    } else if (!partial) body.append(h('div.fb-ans', { html: ex.type === 'bucket' || ex.type === 'table' || ex.type === 'match' ? 'Alles richtig — ohne Fehler!' : esc(exp) }));
    // diff for dictation / speaking
    if (r.diff && kind !== 'right') body.append(h('div.fb-ans', { html: r.diff.map((w) => (w.st === 'ok' ? esc(w.w) : `<mark class="miss">${esc(w.w)}</mark>`)).join(' ') }));
    if (partial && r.given && r.given !== '—' && !r.self && (ex.type === 'type' || ex.type === 'order' || ex.type === 'choice')) body.append(h('div.fb-note', { html: `Твой ответ: <b>${esc(r.given)}</b>` }));
    if (r.errors?.length && (ex.type === 'bucket' || ex.type === 'table' || ex.type === 'match')) {
      body.append(h('div.fb-label', 'Над чем стоит подумать'));
      for (const e of r.errors.slice(0, 5)) body.append(h('div.fb-note', { html: `<b>${esc(e.prompt)}</b>: ${esc(e.given)} → <b>${esc(e.expected)}</b>` }));
    }
    if (r.note === 'case') body.append(h('div.fb-note', '✍️ Верно! Но существительные в немецком пишутся с большой буквы.'));
    if (r.note === 'umlaut') body.append(h('div.fb-note', '✍️ Верно! Правильное написание — с умляутом (ä ö ü ß).'));
    if (r.close && kind !== 'right') body.append(h('div.fb-note', '🔎 Почти! Проверь буквы — опечатка в одной.'));
    if (r.note && !['case', 'umlaut'].includes(r.note)) body.append(h('div.fb-note', r.note));
    if (kind !== 'right' && ex.note) body.append(h('div.fb-rule', { html: `<b>Почему:</b> ${esc(ex.note)}` }));
    if (kind !== 'right' && ex.rule) { const rule = h('div.fb-rule', { html: `<b>Правило.</b> ${ex.rule}` }); if (SKILL[ex.skill]) rule.append(h('div.more', { onclick: () => app.openRule(ex.skill) }, 'Подробнее о правиле →')); body.append(rule); }
    if (kind === 'right' && ex.note && Math.random() < 0.3) body.append(h('div.fb-note', { html: `💡 ${esc(ex.note)}` }));
    const explainHost = h('div');
    body.append(explainHost);

    const title = kind === 'right' ? (HYPE[session.combo] && session.combo > 4 ? 'Wahnsinn!' : pick(RIGHT)) : kind === 'part' ? 'Fast geschafft' : r.gaveUp ? 'Das merken wir uns' : r.close ? 'Fast!' : 'Nicht ganz';
    const xp = h('div.fb-xp', `+${rep.xp} XP`);
    const next = h('button.btn.primary.lg', { type: 'button', onclick: proceed }, 'Weiter', h('span', { html: icon('send', 18) }));
    const actions = h('div.fb-actions');
    if (kind !== 'right' && aiReady() && SKILL[ex.skill]) {
      const eb = h('button.btn', { type: 'button', onclick: () => explain(eb, explainHost, r) }, h('span', { html: icon('sparkles', 16) }), 'Объясни');
      actions.append(eb);
    }
    if (ex.full && !ex.hideText && ex.type !== 'flash') actions.append(h('button.btn.ghost', { type: 'button', onclick: () => speak(ex.full) }, h('span', { html: icon('volume', 16) }), 'Ещё раз'));
    actions.append(h('div.grow'), next);
    sheet = h('aside.fb.' + kind, h('div.fb-head', h('div.fb-badge', { html: icon(kind === 'right' ? 'check' : kind === 'part' ? 'target' : 'close', 24) }), h('div.fb-title', title), xp), body, actions);
    root.append(sheet);
    window.gsap?.fromTo(sheet, { yPercent: 105 }, { yPercent: 0, duration: 0.5, ease: 'power3.out' });
    setTimeout(() => next.focus({ preventScroll: true }), 80);
    sheet._rep = rep;
  }
  function closeSheet(instant) {
    if (!sheet) return; const s = sheet; sheet = null;
    if (instant || !window.gsap) { s.remove(); return; }
    window.gsap.to(s, { yPercent: 105, duration: 0.3, ease: 'power2.in', onComplete: () => s.remove() });
  }
  async function explain(btn, host, r) {
    btn.disabled = true; host.replaceChildren(h('div.explain-card', h('div.shimmer'), h('div.shimmer', { style: { width: '80%' } }), h('div.shimmer', { style: { width: '60%' } })));
    app.scene.setThinking(true);
    try {
      const out = await explainMistake({ ex, given: r.given, expected: r.expected || expectedOf(ex) });
      host.replaceChildren(h('div.explain-card',
        h('div.why', out.why),
        out.tip ? h('div.tip', h('span', { html: icon('bulb', 18) }), out.tip) : null,
        out.example?.de ? h('div.ex2.story', out.example.de, h('small', out.example.ru || '')) : null));
      if (out.example?.de) prefetch(out.example.de);
    } catch (e) { host.replaceChildren(h('div.fb-note', describeError(e))); btn.disabled = false; }
    app.scene.setThinking(false);
  }

  async function proceed() {
    if (busy || !answered) return;
    const rep = sheet?._rep;
    closeSheet();
    if (rep?.masteredNow || rep?.levelUp) await celebrate(rep);
    nextTask();
  }

  async function celebrate(rep) {
    sfx.level(); app.scene.ring(palOf(ex.skill)[0]); app.scene.burst(palOf(ex.skill)[2], 140); app.scene.pulse(1.6); app.scene.setMood('wonder', 2000);
    const sk = SKILL[ex.skill];
    const unlockedNow = SKILLS.filter((s) => model.isUnlocked(s.id) && !unlockedBefore.has(s.id));
    const lvl = model.levelOf(model.state.profile.xp);
    await new Promise((resolve) => {
      const close = () => { window.gsap ? window.gsap.to(card, { opacity: 0, y: 20, duration: 0.25, onComplete: () => { wrap.remove(); resolve(); } }) : (wrap.remove(), resolve()); };
      const head = rep.masteredNow ? h('h2', 'Regel gemeistert!') : h('h2', `Level ${lvl}!`);
      const card = h('div.moment-card',
        h('div.eyebrow', rep.masteredNow ? 'Правило освоено' : 'Новый уровень'),
        head,
        rep.masteredNow && sk ? h('div.sub', h('b', sk.title), ' — теперь это в твоём активе. Я буду возвращаться к нему реже, чтобы ты не забыл.') : h('div.sub', 'Ты растёшь. Так держать!'),
        unlockedNow.length ? h('div', h('div.eyebrow', { style: { marginBottom: '8px' } }, 'Открылось'), h('div.unlock-row', unlockedNow.slice(0, 4).map((s) => h('span.unlock-chip', { style: { borderColor: palOf(s.id)[0] } }, s.title)))) : null,
        h('button.btn.primary.lg', { type: 'button', onclick: close }, 'Weiter', h('span', { html: icon('send', 18) })));
      const wrap = h('div.moment', card); root.append(wrap);
      window.gsap?.from(card, { opacity: 0, y: 40, scale: 0.92, duration: 0.55, ease: 'back.out(1.6)' });
      window.gsap?.from(wrap, { opacity: 0, duration: 0.3 });
      card.querySelector('button').focus();
    });
  }

  function finishRound() {
    gone = true;
    const summary = session.summary();
    app.go('summary', { summary, mode: session.mode, skillId: session.skillId });
  }
  async function leave() {
    if (session.done === 0 || await confirmDialog('Выйти из раунда?', 'Всё, что ты уже ответил, сохранено.', { ok: 'Выйти', cancel: 'Остаться' })) { gone = true; app.go('home'); }
  }

  // AI: keep fresh material coming for the rule you're on (never blocks the UI)
  function maybeFresh(skillId, afterAnswer = false) {
    if (!aiReady() || !SKILL[skillId] || !session.needsFresh(skillId)) return;
    const runningLow = !session.hasUnseen(skillId);
    if (!mayGenerateFor(skillId, runningLow)) return;
    moreSentences(skillId, { n: 8 }).then((n) => { if (n && !gone) toast(`Gemini придумал ${n} новых предложений для «${SKILL[skillId].title}»`, { kind: 'info', ms: 2600 }); }).catch(() => {});
  }

  // keyboard
  const onKey = (e) => {
    if (e.key === 'Enter') {
      if (e.target?.closest?.('.moment button, .modal button, .fb button')) return;
      if (sheet) { e.preventDefault(); proceed(); } else if (!checkBtn.disabled && onCheck) { e.preventDefault(); doCheck(); }
    } else if (e.key === 'Escape' && !document.querySelector('.modal')) leave();
  };
  addEventListener('keydown', onKey);

  await nextTask();
  return {
    async unmount() {
      gone = true; removeEventListener('keydown', onKey); comp?.destroy?.(); stopSpeaking(); model.flush();
      app.scene.setThinking(false); app.scene.setLevelSource(() => app.narrator.level);
      await new Promise((r) => (window.gsap ? window.gsap.to(root, { opacity: 0, duration: 0.25, onComplete: r }) : r()));
    },
  };
}
