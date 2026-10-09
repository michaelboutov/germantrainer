// End of a round: what you earned, what you mastered, which words stuck, and what to do about your mistakes.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { SKILL, palOf } from '../content/skills.js';
import * as model from '../engine/model.js';
import { wordById } from '../engine/builders.js';
import { label } from '../content/lexicon.js';
import { ring, countUp, sigil, magnetic, flashWord } from './kit.js';
import { sfx } from '../sfx.js';
import { speak } from '../voice.js';

const verdict = (acc) => (acc >= 0.9 ? ['Ausgezeichnet!', 'Почти без ошибок — отличный раунд.'] : acc >= 0.7 ? ['Gut gemacht!', 'Хороший раунд. Ошибки — это точки роста.'] : acc >= 0.4 ? ['Weiter so!', 'Ты уже запомнил то, что пока не получилось — я верну это позже.'] : ['Das wird schon!', 'Сложный раунд — зато я знаю, что тебе повторять.']);
const fmtTime = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return `${m} мин`; };

export async function mount(app, { summary, mode, skillId }) {
  const sm = summary;
  const [title, sub] = verdict(sm.acc);
  const pal = palOf(sm.skills[0] || 'a1.artikel');
  app.setPalette(pal);
  app.scene.pulse(1.4); app.scene.burst(pal[0], 120); if (sm.acc >= 0.7) { app.scene.ring(pal[1]); sfx.level(); }
  app.scene.anchor('orb', null);
  const accRing = ring(0, { size: 120, stroke: 10, label: '', color: 'var(--c1)' });
  const accNum = h('b.big', '0%');
  const xpNum = h('b', '0'); const comboNum = h('b', String(sm.bestCombo));
  const stat = (ic, num, cap) => h('div.stat', h('span.stat-ic', { html: icon(ic, 20) }), h('div', num, h('small', cap)));

  const master = sm.mastered.map((id) => h('div.sum-skill', h('span.sig', { style: { color: palOf(id)[0] }, html: sigil(id, 36) }), h('div', h('b', SKILL[id]?.title || id), h('small', 'правило освоено'))));
  const words = sm.newWords.map((id) => wordById(id)).filter(Boolean).map((w) => h('button.chip.w', { onclick: () => speak(label(w)) }, w.emoji ? `${w.emoji} ` : '', label(w), h('small', ` · ${w.ru}`)));
  const mist = [...new Map(sm.wrong.map((w) => [w.ex.key || w.ex.full, w])).values()].slice(0, 5).map((w) => h('div.sum-mistake',
    h('div.sm-s', w.ex.full || w.ex.sentence || ''), h('div.sm-d', w.given && w.given !== '—' ? h('span.given', w.given) : null, h('span', '→ '), h('b', w.expected))));

  const again = h('button.btn.primary.lg', { onclick: (e) => app.startSession({ mode: mode === 'skill' ? 'skill' : mode, skillId }, e.currentTarget) }, h('span', { html: icon('refresh', 18) }), 'Ещё раунд');
  magnetic(again);
  const fix = sm.wrong.length ? h('button.btn.lg', { onclick: (e) => app.startSession({ mode: 'mistakes' }, e.currentTarget) }, h('span', { html: icon('notebook', 18) }), 'Разобрать ошибки') : null;
  const home = h('button.btn.lg.ghost', { onclick: () => app.go('home') }, 'На главную');

  const root = h('section.screen.summary',
    h('div.sum-wrap',
      h('div.eyebrow', 'Runde beendet'),
      h('h1.display.sum-title', title), h('p.light-h.sum-sub', sub),
      h('div.sum-grid',
        h('div.glass.sum-card.acc', accRing, h('div.acc-l', accNum, h('small', `${sm.right} из ${sm.done} верно`))),
        h('div.glass.sum-card.stats', stat('bolt', xpNum, 'XP за раунд'), stat('flame', comboNum, 'лучшая серия'), stat('target', h('b', fmtTime(sm.ms)), 'время'), stat('trophy', h('b', `Lvl ${sm.level}`), 'уровень')),
        master.length ? h('div.glass.sum-card.wide', h('div.eyebrow', 'Освоено'), h('div.sum-skills', master)) : null,
        words.length ? h('div.glass.sum-card.wide', h('div.eyebrow', 'Новые слова'), h('div.chips', words)) : null,
        mist.length ? h('div.glass.sum-card.wide', h('div.eyebrow', 'Ошибки раунда — я их запомнил'), h('div.sum-mistakes', mist)) : null),
      h('div.cta.sum-cta', again, fix, home)));
  app.root.append(root);
  const g = window.gsap;
  if (g) {
    g.from(root.querySelectorAll('.eyebrow, .sum-title, .sum-sub'), { opacity: 0, y: 30, filter: 'blur(10px)', stagger: 0.1, duration: 0.9, ease: 'expo.out', clearProps: 'filter,transform' });
    g.from(root.querySelectorAll('.sum-card'), { opacity: 0, y: 34, scale: 0.97, stagger: 0.1, delay: 0.3, duration: 0.8, ease: 'power3.out', clearProps: 'transform' });
    g.from(root.querySelectorAll('.sum-cta > *'), { opacity: 0, y: 20, stagger: 0.08, delay: 0.7, duration: 0.7, ease: 'power3.out', clearProps: 'transform' });
  }
  setTimeout(() => { accRing.set(sm.acc); countUp(accNum, Math.round(sm.acc * 100), { fmt: (v) => `${Math.round(v)}%` }); countUp(xpNum, sm.xp, { dur: 1.3 }); }, 450);
  if (sm.mastered.length) setTimeout(() => flashWord('Regel gemeistert!'), 900);
  return { async unmount() { await new Promise((r) => (g ? g.to(root, { opacity: 0, duration: 0.25, onComplete: r }) : r())); } };
}
