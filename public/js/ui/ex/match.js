// Draw a line from a word to its partner (or tap one, then the other). Pairs lock in with a connecting curve.
import { h, shuffle } from '../../util.js';
import { shake, pop } from '../kit.js';
import { sfx } from '../../sfx.js';

const isWordId = (id) => /^[nvau]:/.test(String(id));

export function mount(host, ex, api) {
  let done = false; let remaining = ex.pairs.length; let sel = null; let drag = null;
  const failed = new Map(); const errors = [];
  const svgNS = 'http://www.w3.org/2000/svg';
  const wrap = h('div.match-cols');
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'match-svg');
  const colL = h('div.mcol'); const colR = h('div.mcol');
  const L = shuffle(ex.pairs).map((p) => ({ p, el: h('div.mchip.l.dnd', { tabindex: 0, role: 'button' }, p.emoji === true ? h('span.emo', p.l) : p.l), done: false }));
  const R = shuffle(ex.pairs).map((p) => ({ p, el: h('div.mchip.r', { tabindex: 0, role: 'button' }, p.emoji === true ? h('span.emo', p.r) : p.r), done: false }));
  L.forEach((x) => colL.append(x.el)); R.forEach((x) => colR.append(x.el));
  wrap.append(colL, colR, svg);

  const rel = (el, side) => { const a = wrap.getBoundingClientRect(); const b = el.getBoundingClientRect(); return { x: (side === 'r' ? b.right : b.left) - a.left, y: b.top + b.height / 2 - a.top }; };
  const curve = (a, b) => { const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
  const links = [];
  function drawLink(l, r) {
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('class', 'link ok'); svg.append(path);
    const upd = () => path.setAttribute('d', curve(rel(l.el, 'r'), rel(r.el, 'l')));
    upd(); links.push(upd);
    const len = path.getTotalLength?.() || 200; path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    window.gsap?.to(path, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }) ?? (path.style.strokeDashoffset = 0);
  }
  const onResize = () => links.forEach((f) => f());
  addEventListener('resize', onResize);

  function judge(l, r) {
    if (done || l.done || r.done) return;
    if (l.p.id === r.p.id) {
      l.done = r.done = true; l.el.classList.add('ok'); r.el.classList.add('ok'); l.el.classList.remove('sel', 'dnd');
      sfx.drop(); pop(l.el); pop(r.el); drawLink(l, r);
      if (--remaining === 0) setTimeout(finish, 700);
    } else {
      sfx.wrong(); shake(l.el, 6); shake(r.el, 6);
      l.el.classList.add('wrong'); r.el.classList.add('wrong'); setTimeout(() => { l.el.classList.remove('wrong'); r.el.classList.remove('wrong'); }, 450);
      if (!failed.has(l.p.id)) { failed.set(l.p.id, true); errors.push({ given: r.p.r, expected: l.p.r, prompt: l.p.l, word: isWordId(l.p.id) ? l.p.id : undefined }); }
    }
  }
  function select(l) {
    if (sel) sel.el.classList.remove('sel');
    sel = sel === l ? null : l; sel?.el.classList.add('sel');
  }
  R.forEach((r) => {
    const act = () => { if (sel && !done) { const l = sel; select(null); judge(l, r); } };
    r.el.addEventListener('click', act);
    r.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
  // dragging a line out of a left chip
  L.forEach((l) => {
    const path = document.createElementNS(svgNS, 'path'); path.setAttribute('class', 'link live'); path.style.display = 'none'; svg.append(path);
    let start = null; let moved = false;
    l.el.addEventListener('pointerdown', (e) => {
      if (done || l.done || (e.button != null && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY }; moved = false; try { l.el.setPointerCapture(e.pointerId); } catch { /* */ }
    });
    l.el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      moved = true; drag = l; path.style.display = ''; l.el.classList.add('sel');
      const a = wrap.getBoundingClientRect();
      path.setAttribute('d', curve(rel(l.el, 'r'), { x: e.clientX - a.left, y: e.clientY - a.top }));
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('mchip') && n.classList.contains('r'));
      R.forEach((r) => r.el.classList.toggle('over', r.el === over && !r.done));
    });
    const end = (e) => {
      if (!start) return;
      const wasDrag = moved; start = null; path.style.display = 'none'; drag = null; R.forEach((r) => r.el.classList.remove('over'));
      if (!wasDrag) { if (!l.done) select(l); return; }
      l.el.classList.remove('sel');
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('mchip') && n.classList.contains('r'));
      const r = R.find((x) => x.el === over); if (r) judge(l, r);
    };
    l.el.addEventListener('pointerup', end); l.el.addEventListener('pointercancel', end);
    l.el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !l.done) { e.preventDefault(); select(l); } });
  });

  function finish() {
    if (done) return; done = true;
    const total = ex.pairs.length; const bad = failed.size;
    api.finish({ correct: bad === 0, score: (total - bad) / total, given: `${total - bad} из ${total}`, expected: '', errors, summary: `${total - bad} из ${total} верно` });
  }
  host.append(h('div.ex.ex-match', h('div.ex-ask.eyebrow', ex.ask), wrap));
  return { destroy() { removeEventListener('resize', onResize); } };
}
