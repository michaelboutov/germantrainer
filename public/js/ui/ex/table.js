// Fill a table by dragging forms into cells (conjugations, article charts, pronouns). Each drop is judged at once.
import { h } from '../../util.js';
import { draggable, settle } from '../dnd.js';
import { flip, shake, pop } from '../kit.js';
import { sfx } from '../../sfx.js';

export function mount(host, ex, api) {
  let done = false; let remaining = 0; let selected = null;
  const failed = new Set(); const attempts = new Map(); const errors = [];
  const nCols = Math.max(...ex.rows.map((r) => r.cells.length));
  const slots = [];

  const grid = h('div.tbl', { style: { '--cols': nCols } });
  if (ex.cols) { grid.append(h('div.cell.corner')); ex.cols.forEach((c) => grid.append(h('div.cell.colh', c))); }
  ex.rows.forEach((row, ri) => {
    grid.append(h('div.cell.rowh', row.label));
    row.cells.forEach((c, ci) => {
      if (typeof c === 'object') { grid.append(h('div.cell.fixed', c.fixed)); return; }
      const el = h('div.cell.slot', { dataset: { r: ri, c: ci } });
      const slot = { el, answer: c, row: row.label, filled: false, key: `${ri}.${ci}` };
      slots.push(slot); remaining++;
      el.addEventListener('click', () => { if (selected && !done && !slot.filled) { const t = selected; select(null); attempt(t, slot, null); } });
      grid.append(el);
    });
  });
  const pool = h('div.pool');
  const tiles = ex.pool.map((text) => {
    const el = h('div.tile', text); const t = { el, text, locked: false };
    draggable(el, {
      targets: () => slots.filter((s) => !s.filled).map((s) => s.el),
      onDrop: (zone, info) => (zone ? attempt(t, slots.find((s) => s.el === zone), info) : false),
      onTap: () => select(t),
      disabled: () => done || t.locked,
    });
    pool.append(el); return t;
  });

  function select(t) {
    if (selected) selected.el.classList.remove('sel');
    selected = t && selected !== t ? t : null; selected?.el.classList.add('sel');
  }
  function fill(t, slot, info, revealed) {
    const others = tiles.filter((x) => x !== t && !x.locked).map((x) => x.el);
    flip(others, () => { slot.el.append(t.el); t.el.classList.add('placed', revealed ? 'revealed' : 'ok'); slot.el.classList.add('filled', revealed ? 'revealed' : 'ok'); });
    if (info) settle(t.el, info.ghostRect, info.tilt); else window.gsap?.fromTo(t.el, { scale: 0.8 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
    t.locked = true; slot.filled = true; t.el.classList.remove('sel');
    remaining--;
    if (remaining === 0) setTimeout(finish, 650);
  }
  function attempt(t, slot, info) {
    if (done || t.locked || !slot || slot.filled) return false;
    if (t.text === slot.answer) { sfx.drop(); fill(t, slot, info, false); pop(slot.el, 1.05); return !!info; }
    const n = (attempts.get(slot.key) || 0) + 1; attempts.set(slot.key, n);
    sfx.wrong(); shake(slot.el, 6); slot.el.classList.add('wrong'); setTimeout(() => slot.el.classList.remove('wrong'), 450); shake(t.el, 6);
    if (!failed.has(slot.key)) { failed.add(slot.key); errors.push({ given: t.text, expected: slot.answer, prompt: `${slot.row} · ${ex.title || ''}`.trim() }); }
    if (n >= 2) { const right = tiles.find((x) => !x.locked && x.text === slot.answer); if (right) { fill(right, slot, null, true); return false; } }
    return false;
  }
  function finish() {
    if (done) return; done = true;
    const total = slots.length; const bad = failed.size;
    api.finish({ correct: bad === 0, score: (total - bad) / total, given: `${total - bad} из ${total}`, expected: '', errors, summary: `${total - bad} из ${total} верно` });
  }

  host.append(h('div.ex.ex-table', h('div.ex-ask.eyebrow', ex.ask), h('div.tbl-title', h('b', ex.title || ''), ex.subtitle ? h('small', ex.subtitle) : null), grid, pool));
  return { destroy() {} };
}
