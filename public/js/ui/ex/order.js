// Sentence / word builder: drag tiles into the line (neighbours make room), tap to send them back.
// Used for "build the sentence", "build the Partizip II from parts", "spell the word", and listening-then-build.
import { h } from '../../util.js';
import { draggable, insertionIndex, settle } from '../dnd.js';
import { flip } from '../kit.js';
import { sfx } from '../../sfx.js';
import { anySeq, norm } from '../../engine/check.js';
import { speakerBtn, visualFor } from './common.js';

export function mount(host, ex, api) {
  const join = ex.join ?? ' ';
  const wordMode = join === '';
  const given = ex.given || [];
  let done = false;

  const line = h('div.order-line' + (wordMode ? '.word' : ''), { 'aria-label': 'Твой ответ' });
  const pool = h('div.order-pool');
  const preview = wordMode ? h('div.order-preview', ' ') : null;
  const gap = h('span.gap');
  const byEl = new Map();

  given.forEach((g) => line.append(h('div.tile.given', g)));

  const tiles = ex.pool.map((text) => {
    const el = h('div.tile', text);
    const t = { el, text, inLine: false };
    byEl.set(el, t);
    draggable(el, {
      targets: () => [line, pool],
      onMove: ({ x, y, zone }) => { if (zone === line) showGap(insertionIndex(line, x, y, '.tile:not(.given)'), el); else hideGap(); },
      onHover: (zone) => { if (zone !== line) hideGap(); },
      onDrop: (zone, info) => {
        hideGap();
        if (zone === line) { place(t, insertionIndex(line, info.x, info.y, '.tile:not(.given)'), info); return true; }
        if (zone === pool) { toPool(t, info); return true; }
        return false;
      },
      onTap: () => (t.inLine ? toPool(t) : place(t, placed().length)),
      disabled: () => done,
    });
    pool.append(el);
    return t;
  });
  const allEls = () => tiles.map((t) => t.el);
  const placed = () => [...line.querySelectorAll('.tile:not(.given)')].map((e) => byEl.get(e));

  function showGap(idx, dragged) {
    const kids = [...line.querySelectorAll('.tile:not(.given)')].filter((k) => k !== dragged);
    gap.style.width = `${dragged.getBoundingClientRect().width}px`;
    const ref = kids[idx] || null;
    if (gap.parentNode === line && gap.nextSibling === ref) return;
    line.insertBefore(gap, ref);
  }
  function hideGap() { gap.remove(); }

  function place(t, idx, info) {
    const others = allEls().filter((e) => e !== t.el);
    flip(others, () => {
      const kids = placed().map((p) => p.el).filter((k) => k !== t.el);
      line.insertBefore(t.el, kids[idx] || null);
      t.inLine = true; t.el.classList.add('in-line');
    });
    if (info) settle(t.el, info.ghostRect, info.tilt); else popIn(t.el);
    sfx.drop(); update();
  }
  function toPool(t, info) {
    const others = allEls().filter((e) => e !== t.el);
    flip(others, () => { pool.append(t.el); t.inLine = false; t.el.classList.remove('in-line'); });
    if (info) settle(t.el, info.ghostRect, info.tilt);
    update();
  }
  function popIn(el) { window.gsap?.fromTo(el, { scale: 0.85 }, { scale: 1, duration: 0.3, ease: 'back.out(2)', clearProps: 'transform' }); }
  function update() {
    const p = placed();
    line.classList.toggle('empty', !p.length && !given.length);
    if (preview) preview.textContent = (given.join('') + p.map((x) => x.text).join('')) || ' ';
    api.setReady(p.length > 0);
  }
  update();

  // top area: prompt / listening / translation
  const listen = !!ex.hideText;
  const vis = visualFor(ex, { size: 'md' });
  const head = [];
  if (ex.prompt) head.push(h('div.order-prompt', h('span', ex.prompt)));
  if (listen) head.push(h('div.speakers', speakerBtn(api, ex.say, { big: true }), speakerBtn(api, ex.say, { big: true, slow: true })));
  if (!ex.hideRu && ex.ru) head.push(h('div.ex-ru.lead', ex.type === 'order' && !ex.prompt ? `«${ex.ru}»` : ex.ru, !listen && ex.say ? speakerBtn(api, ex.say) : null));
  if (ex.hint) head.push(h('div.ex-hint', ex.hint));
  host.append(h('div.ex.ex-order' + (wordMode ? '.word-mode' : ''), h('div.ex-ask.eyebrow', ex.ask), vis, ...head, line, preview, pool));
  if (listen && ex.say) setTimeout(() => api.speak(ex.say), 250);

  api.setCheck(() => {
    const p = placed(); if (!p.length) return;
    done = true;
    const seq = [...given, ...p.map((x) => x.text)];
    const joined = seq.join(join);
    const ok = anySeq(seq, ex.answers) || (ex.answerStrs || []).some((s) => norm(s) === norm(joined));
    const ref = ex.answers[0];
    p.forEach((t, i) => t.el.classList.add(ok || norm(t.text) === norm(ref[given.length + i] ?? '') ? 'ok' : 'bad'));
    line.classList.add(ok ? 'ok' : 'bad');
    const expected = ref.join(join);
    api.finish({ correct: ok, given: joined, expected, errors: ok ? [] : [{ given: joined, expected, prompt: ex.ru || ex.full || '' }] });
  });
  return { destroy() { gap.remove(); } };
}
