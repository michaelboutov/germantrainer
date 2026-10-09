// A small pointer-based drag & drop engine (mouse, touch and pen) with a floating "ghost" that tilts with the
// motion, highlights drop zones, springs back when dropped nowhere, and settles from where you let go.
import { clamp } from '../util.js';

const gsap = () => window.gsap;

/**
 * Make `el` draggable.
 *  opts.targets()          → drop-zone elements right now
 *  opts.onStart(el)        → drag begins
 *  opts.onHover(zone|null, {x,y})
 *  opts.onDrop(zone|null, {x,y,ghostRect,tilt}) → true if accepted (the real element is then moved by the caller)
 *  opts.onTap()            → click / Enter / Space without dragging
 *  opts.disabled()         → true to ignore input
 */
export function draggable(el, opts = {}) {
  el.classList.add('dnd');
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  if (!el.getAttribute('role')) el.setAttribute('role', 'button');
  let st = null;
  const threshold = opts.threshold ?? 6;

  const hit = (x, y) => {
    const zones = opts.targets?.() || [];
    if (!zones.length) return null;
    const stack = document.elementsFromPoint(x, y);
    for (const s of stack) { const z = zones.find((t) => t === s || t.contains(s)); if (z) return z; }
    return null;
  };
  const setOver = (z, point) => {
    if (st.over === z) return;
    st.over?.classList.remove('over'); st.over = z; z?.classList.add('over');
    opts.onHover?.(z, point);
  };

  function down(e) {
    if ((e.button != null && e.button !== 0) || opts.disabled?.()) return;
    st = { id: e.pointerId, x0: e.clientX, y0: e.clientY, drag: false, ghost: null, vx: 0, lx: e.clientX, over: null, rect: null };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function begin(e) {
    st.drag = true;
    const r = st.rect = el.getBoundingClientRect();
    const g = st.ghost = el.cloneNode(true);
    g.classList.add('dnd-ghost'); g.classList.remove('dnd', 'over', 'sel');
    g.removeAttribute('tabindex'); g.removeAttribute('id');
    Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '90', transform: 'none' });
    document.body.append(g);
    el.classList.add('dnd-lifted');
    document.body.classList.add('is-dragging');
    gsap()?.fromTo(g, { scale: 1 }, { scale: 1.07, duration: 0.18, ease: 'power2.out' });
    opts.onStart?.(el);
  }
  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0; const dy = e.clientY - st.y0;
    if (!st.drag) { if (Math.hypot(dx, dy) < threshold) return; begin(e); }
    st.vx = st.vx * 0.75 + (e.clientX - st.lx) * 0.25; st.lx = e.clientX;
    st.tilt = clamp(st.vx * 1.3, -14, 14);
    st.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${st.tilt}deg) scale(1.07)`;
    setOver(hit(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
    opts.onMove?.({ x: e.clientX, y: e.clientY, zone: st.over });
  }
  function cleanup() {
    el.classList.remove('dnd-lifted'); document.body.classList.remove('is-dragging');
    if (st) { st.over?.classList.remove('over'); }
  }
  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!s.drag) { opts.onTap?.(e); return; }
    const zone = hit(e.clientX, e.clientY);
    s.over?.classList.remove('over');
    const ghostRect = s.ghost.getBoundingClientRect();
    const ok = opts.onDrop?.(zone, { x: e.clientX, y: e.clientY, ghostRect, tilt: s.tilt || 0 });
    document.body.classList.remove('is-dragging');
    if (ok) { s.ghost.remove(); el.classList.remove('dnd-lifted'); return; }
    // rejected: glide back
    const g = gsap();
    if (!g) { s.ghost.remove(); el.classList.remove('dnd-lifted'); return; }
    g.to(s.ghost, { x: 0, y: 0, rotate: 0, scale: 1, duration: 0.42, ease: 'back.out(1.7)', onComplete: () => { s.ghost.remove(); el.classList.remove('dnd-lifted'); } });
    // `transform` is set inline as a string; hand control to gsap by resetting from the current values
  }
  function cancel(e) {
    if (!st || e.pointerId !== st.id) return;
    st.ghost?.remove(); cleanup(); st = null;
  }
  function key(e) {
    if ((e.key === 'Enter' || e.key === ' ') && !opts.disabled?.()) { e.preventDefault(); opts.onTap?.(e); }
  }
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('keydown', key);
  el.addEventListener('dragstart', (e) => e.preventDefault());
  return {
    destroy() {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel); el.removeEventListener('keydown', key); st?.ghost?.remove(); cleanup();
    },
  };
}

/** Where in a wrapping row of tiles should a dragged tile be inserted for pointer position (x, y)? */
export function insertionIndex(container, x, y, sel = '.tile') {
  const kids = [...container.querySelectorAll(sel)].filter((k) => !k.classList.contains('dnd-lifted'));
  if (!kids.length) return 0;
  let best = 0; let bd = Infinity; let after = false;
  kids.forEach((k, i) => {
    const r = k.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, (y - cy) * 1.8);
    if (d < bd) { bd = d; best = i; after = x > cx; }
  });
  return best + (after ? 1 : 0);
}

/** Animate `el` from the ghost's rect (where the finger let go) to where it is now. */
export function settle(el, from, tilt = 0) {
  const g = gsap(); if (!g || !from) return;
  const b = el.getBoundingClientRect();
  g.fromTo(el, { x: from.left - b.left, y: from.top - b.top, rotate: tilt, scale: 1.07 }, { x: 0, y: 0, rotate: 0, scale: 1, duration: 0.42, ease: 'back.out(1.5)', clearProps: 'transform' });
}
