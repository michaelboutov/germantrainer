// "Du wächst": level + XP meter, mastery rings per level and per skill-strand, and 14 days of activity.
// The activity chart follows the dataviz rules: one hue (today = the accent, other days = the same hue, lighter),
// thin columns with a 4px rounded top and a square baseline, no grid, a dashed daily-goal line, direct labels only
// where they matter (today, best day), a hover/focus tooltip and a table view for everything else.
import { h } from '../util.js';
import { icon } from '../icons.js';
import * as model from '../engine/model.js';
import { SKILLS, LEVELS } from '../content/skills.js';
import { getSettings } from '../gemini.js';
import { ring } from './kit.js';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plural = (n) => { const m = n % 100; const r = n % 10; return m >= 11 && m <= 14 ? 'заданий' : r === 1 ? 'задание' : r >= 2 && r <= 4 ? 'задания' : 'заданий'; };

export function last14() {
  const days = model.state.profile.days; const out = []; const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const s = days[key(d)] || { n: 0, c: 0, xp: 0 };
    out.push({ date: d, key: key(d), n: s.n, c: s.c, xp: s.xp, today: i === 0 });
  }
  return out;
}

export function progressPanel() {
  const ov = model.overview();
  const lvl = ov.level; const lo = model.levelFloor(lvl); const hi = model.levelFloor(lvl + 1);
  const into = (ov.xp - lo) / (hi - lo);

  // — level meter (a single ratio against a limit → a meter, not a pie)
  const meter = h('div.pg-meter', h('i', { style: { width: `${Math.round(into * 100)}%` } }));
  const levelTile = h('div.pg-level', h('div.eyebrow', 'Уровень'), h('div.pg-hero', h('b', lvl), h('span', `${ov.xp.toLocaleString('ru-RU')} XP`)), meter, h('small', `ещё ${Math.max(0, hi - ov.xp)} XP до уровня ${lvl + 1}`));

  // — rings
  const lv = ['a1', 'a2', 'b1'].map((l) => {
    const list = SKILLS.filter((s) => s.lvl === l);
    const avg = list.reduce((a, s) => a + (model.skillState(s.id).n ? model.mastery(s.id) : 0), 0) / list.length;
    const done = list.filter((s) => model.isMastered(s.id)).length;
    return h('div.pg-ring', ring(avg, { size: 64, stroke: 7, label: `${Math.round(avg * 100)}%`, color: 'var(--accent)' }), h('div', h('b', LEVELS[l].name), h('small', `${done}/${list.length} освоено`)));
  });
  const strands = [['x.wortschatz', 'Слова'], ['x.hoeren', 'Слух'], ['x.sprechen', 'Речь']].map(([id, name]) => {
    const st = model.skillState(id); const v = st.n ? model.mastery(id) : 0;
    return h('div.pg-ring.sm', ring(v, { size: 44, stroke: 5, label: st.n ? `${Math.round(v * 100)}` : '–', color: 'var(--accent)' }), h('div', h('b', name), h('small', st.n ? `${st.n} отв.` : 'ещё нет')));
  });

  // — 14-day columns
  const data = last14(); const goal = getSettings().dailyGoal || 20;
  const maxN = Math.max(...data.map((d) => d.n), 0);
  const top = Math.max(goal * 1.15, Math.ceil(maxN * 1.1), 5);
  const bestIdx = maxN > 0 ? data.findIndex((d) => d.n === maxN) : -1;
  const tip = h('div.pg-tip', { role: 'status' });
  const plot = h('div.pg-plot', { role: 'img', 'aria-label': `Активность за 14 дней. Всего ${data.reduce((a, d) => a + d.n, 0)} заданий.` });
  const goalLine = h('div.pg-goal', { style: { bottom: `${(goal / top) * 100}%` } }, h('span', `цель ${goal}`));
  const cols = data.map((d, i) => {
    const pct = (d.n / top) * 100;
    const label = d.n && (d.today || i === bestIdx) ? h('span.pg-val', d.n) : null;
    const col = h('button.pg-col' + (d.today ? '.today' : '') + (d.n ? '' : '.zero'), { type: 'button', 'aria-label': `${DOW[d.date.getDay()]} ${d.date.getDate()}: ${d.n} ${plural(d.n)}` },
      h('span.pg-bar', { style: { height: d.n ? `max(${pct}%, 6px)` : '2px' } }, label), h('span.pg-x', d.today ? 'сег' : DOW[d.date.getDay()]));
    const show = () => {
      const acc = d.n ? Math.round((d.c / d.n) * 100) : null;
      tip.replaceChildren(h('b', `${d.n} ${plural(d.n)}`), h('span', `${d.date.getDate()}.${String(d.date.getMonth() + 1).padStart(2, '0')}${acc != null ? ` · ${acc}% верно · ${d.xp} XP` : ' · день без занятий'}`));
      const r = col.getBoundingClientRect(); const p = plot.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left - p.left + r.width / 2, 70), p.width - 70)}px`; tip.classList.add('on');
    };
    col.addEventListener('pointerenter', show); col.addEventListener('focus', show);
    col.addEventListener('pointerleave', () => tip.classList.remove('on')); col.addEventListener('blur', () => tip.classList.remove('on'));
    return col;
  });
  plot.append(goalLine, h('div.pg-cols', cols), tip);

  // — table view (every value reachable without hovering)
  const table = h('table.pg-table.hidden', h('thead', h('tr', ['День', 'Заданий', 'Верно', 'XP'].map((t) => h('th', t)))),
    h('tbody', [...data].reverse().map((d) => h('tr', h('td', `${DOW[d.date.getDay()]} ${d.date.getDate()}.${String(d.date.getMonth() + 1).padStart(2, '0')}`), h('td', d.n), h('td', d.n ? `${Math.round((d.c / d.n) * 100)}%` : '–'), h('td', d.xp)))));
  const toggle = h('button.pg-toggle', { type: 'button', onclick: () => { const t = table.classList.toggle('hidden'); plot.classList.toggle('hidden', !t); toggle.textContent = t ? 'Таблица' : 'График'; } }, 'Таблица');
  const total = data.reduce((a, d) => a + d.n, 0); const active = data.filter((d) => d.n).length;
  const chart = h('div.pg-chart', h('div.pg-chart-h', h('div', h('b', 'Активность за 14 дней'), h('small', `${total} ${plural(total)} · ${active} из 14 дней с занятиями`)), toggle), plot, table);

  const panel = h('section.glass.progress', h('div.pg-top', levelTile, h('div.pg-rings', lv), h('div.pg-strands', strands)), chart);
  // columns grow from the baseline
  setTimeout(() => window.gsap?.from(panel.querySelectorAll('.pg-bar'), { scaleY: 0, transformOrigin: 'bottom', duration: 0.7, stagger: 0.03, ease: 'power3.out' }), 250);
  return panel;
}
