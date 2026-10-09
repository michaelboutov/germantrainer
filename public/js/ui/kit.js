// Shared UI building blocks: toasts, modal, drawer, circular colour wipe, procedural sigils.
import { h, $, sleep } from '../util.js';
import { icon } from '../icons.js';

const gsap = () => window.gsap;

export function toast(msg, { kind = 'info', ms = 4600, action = null, onAction = null } = {}) {
  const host = $('#toasts');
  const ic = kind === 'err' ? 'close' : kind === 'warn' ? 'sparkles' : 'check';
  const el = h('div.toast.' + kind, { html: icon(ic, 18) }, h('div.grow', msg), action && h('button.act', { onclick: () => { onAction?.(); dismiss(); } }, action));
  host.append(el);
  gsap()?.fromTo(el, { y: 24, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' });
  let gone = false;
  function dismiss() {
    if (gone) return; gone = true;
    gsap() ? gsap().to(el, { y: 10, opacity: 0, duration: 0.3, onComplete: () => el.remove() }) : el.remove();
  }
  if (ms) setTimeout(dismiss, ms);
  el.addEventListener('click', (e) => { if (!e.target.closest('.act')) dismiss(); });
  return dismiss;
}

function layer(kind, node, { dismissable = true, onClose } = {}) {
  const host = $('#overlay');
  const scrim = h('div.scrim');
  host.append(scrim, node);
  const g = gsap();
  if (g) {
    g.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    if (kind === 'modal') g.fromTo(node, { opacity: 0, y: 28, scale: 0.96, xPercent: -50, yPercent: -50 }, { opacity: 1, y: 0, scale: 1, xPercent: -50, yPercent: -50, duration: 0.5, ease: 'power3.out' });
    else g.fromTo(node, { xPercent: 100 }, { xPercent: 0, duration: 0.55, ease: 'power3.out' });
  }
  let closed = false;
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  addEventListener('keydown', onKey);
  async function close() {
    if (closed) return; closed = true;
    removeEventListener('keydown', onKey);
    if (g) {
      g.to(scrim, { opacity: 0, duration: 0.3 });
      await new Promise((r) => (kind === 'modal' ? g.to(node, { opacity: 0, y: 16, scale: 0.97, xPercent: -50, yPercent: -50, duration: 0.3, onComplete: r }) : g.to(node, { xPercent: 100, duration: 0.4, ease: 'power3.in', onComplete: r })));
    }
    scrim.remove(); node.remove(); onClose?.();
  }
  if (dismissable) scrim.addEventListener('click', close);
  return { el: node, close };
}

export function modal(content, opts = {}) {
  const node = h('div.modal' + (opts.wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true' });
  node.append(content);
  if (opts.dismissable !== false) {
    const x = h('button.icon-btn.x', { 'aria-label': 'Close', html: icon('close', 18) });
    node.append(x);
    const l = layer('modal', node, opts);
    x.addEventListener('click', () => l.close());
    return l;
  }
  return layer('modal', node, opts);
}
export function drawer(content, opts = {}) {
  const node = h('aside.drawer', { role: 'dialog', 'aria-modal': 'true' });
  node.append(content);
  const l = layer('drawer', node, opts);
  return l;
}

export function confirmDialog(title, text, { ok = 'Да', cancel = 'Отмена', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); l.close(); };
    const body = h('div.col', { style: { gap: '18px' } },
      h('h2', title), h('p.muted', text),
      h('div.row', { style: { justifyContent: 'flex-end' } },
        h('button.btn.sm.ghost', { onclick: () => finish(false) }, cancel),
        h('button.btn.sm' + (danger ? '' : '.primary'), { style: danger ? { background: '#ff6b7d', color: '#1a0508', borderColor: 'transparent' } : {}, onclick: () => finish(true) }, ok)));
    const l = modal(body, { onClose: () => finish(false) });
  });
}

/** Colour disc that grows from an element/point to cover the screen; call .reveal() once content is swapped. */
export function wipe(origin, c1 = '#8b7bff', c2 = '#35e0c2') {
  const g = gsap();
  const host = $('#wipe');
  let x = innerWidth / 2; let y = innerHeight / 2;
  if (origin instanceof Element) { const r = origin.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else if (origin) ({ x, y } = origin);
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 1.05;
  const disc = h('div.wipe-disc', { style: { left: `${x - R}px`, top: `${y - R}px`, width: `${R * 2}px`, height: `${R * 2}px`, background: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${c1} 42%, #fff), color-mix(in srgb, ${c2} 34%, #f4efe8) 70%, #f4efe8)` } });
  host.append(disc);
  if (!g) return { cover: Promise.resolve(), reveal: async () => disc.remove() };
  const cover = new Promise((res) => g.fromTo(disc, { scale: 0 }, { scale: 1, duration: 0.62, ease: 'power3.inOut', onComplete: res }));
  const reveal = () => new Promise((res) => g.to(disc, { opacity: 0, scale: 1.08, duration: 0.7, ease: 'power2.out', onComplete: () => { disc.remove(); res(); } }));
  return { cover, reveal };
}

// ---- sigils: procedurally drawn emblem per option id -------------------------------------------
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 10000) / 10000; }; }
export function sigil(id, size = 56) {
  const r = rng(hash(id)); const c = 32;
  const poly = (n, rad, rot) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return `${(c + Math.cos(a) * rad).toFixed(1)},${(c + Math.sin(a) * rad).toFixed(1)}`; }).join(' ');
  const arc = (rad, a0, a1) => { const x0 = c + Math.cos(a0) * rad; const y0 = c + Math.sin(a0) * rad; const x1 = c + Math.cos(a1) * rad; const y1 = c + Math.sin(a1) * rad; return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${rad} ${rad} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" />`; };
  let svg = `<circle cx="32" cy="32" r="28" opacity=".35"/>`;
  const a0 = r() * 6.28; svg += arc(24, a0, a0 + 2 + r() * 2.6);
  const b0 = r() * 6.28; svg += arc(19, b0, b0 + 1.4 + r() * 2.4);
  svg += `<polygon points="${poly(3 + Math.floor(r() * 4), 11 + r() * 5, r() * 6.28)}" opacity=".9"/>`;
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) { const a = r() * 6.28; svg += `<circle cx="${(c + Math.cos(a) * 28).toFixed(1)}" cy="${(c + Math.sin(a) * 28).toFixed(1)}" r="1.9" fill="currentColor" stroke="none"/>`; }
  if (r() > 0.4) svg += `<path d="M32 ${(32 - 6).toFixed(0)}v12M${(32 - 6)} 32h12" opacity=".6"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg>`;
}

/** Staggered entrance for a list of elements. */
export function stagger(els, { y = 26, blur = 10, delay = 0, each = 0.055, dur = 0.8 } = {}) {
  const g = gsap(); const list = [...els];
  if (!g || !list.length) return Promise.resolve();
  return new Promise((res) => g.fromTo(list, { opacity: 0, y, filter: `blur(${blur}px)` }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: dur, delay, stagger: each, ease: 'power3.out', clearProps: 'filter,transform', onComplete: res }));
}
export function fadeOut(els, { y = -16, dur = 0.35, each = 0.025 } = {}) {
  const g = gsap(); const list = [...els];
  if (!g || !list.length) return Promise.resolve();
  return new Promise((res) => g.to(list, { opacity: 0, y, filter: 'blur(8px)', duration: dur, stagger: each, ease: 'power2.in', onComplete: res }));
}
export { sleep };

/** Split an element's text into masked words; returns the inner spans for revealWords(). */
export function splitWords(el) {
  const text = el.textContent; el.textContent = '';
  const spans = [];
  text.split(/(\s+)/).forEach((tok) => {
    if (!tok) return;
    if (/^\s+$/.test(tok)) { el.append(' '); return; }
    const outer = h('span.mw'); const inner = h('span', tok); outer.append(inner); el.append(outer); spans.push(inner);
  });
  return spans;
}
/** Motion-graphic headline reveal: words rise out of a mask with a touch of blur. */
export function revealWords(el, { delay = 0, each = 0.05, dur = 1.0 } = {}) {
  const g = gsap(); const spans = el._words || (el._words = splitWords(el));
  if (!g) return Promise.resolve();
  return new Promise((res) => g.fromTo(spans, { yPercent: 115, rotate: 3, filter: 'blur(10px)' }, { yPercent: 0, rotate: 0, filter: 'blur(0px)', duration: dur, delay, stagger: each, ease: 'expo.out', clearProps: 'filter', onComplete: res }));
}
/** Huge word that slams across the screen — used as a punctuation beat between steps. */
export function flashWord(text) {
  const g = gsap();
  const el = h('div.flash-word', h('div', text.split(' ').map((w, i) => h('span.mw', { style: { marginRight: '.18em' } }, h('span', w)))));
  document.body.append(el);
  const spans = [...el.querySelectorAll('.mw > span')];
  if (!g) { setTimeout(() => el.remove(), 600); return Promise.resolve(); }
  return new Promise((res) => {
    const tl = g.timeline({ onComplete: () => { el.remove(); res(); } });
    tl.fromTo(spans, { yPercent: 120, filter: 'blur(18px)', rotate: 4 }, { yPercent: 0, filter: 'blur(0px)', rotate: 0, duration: 0.7, stagger: 0.07, ease: 'expo.out' })
      .to(spans, { yPercent: -120, filter: 'blur(14px)', duration: 0.5, stagger: 0.04, ease: 'expo.in' }, '+=0.35');
  });
}
/** Buttons that lean toward the pointer. */
export function magnetic(el, k = 0.28) {
  const g = gsap(); if (!g || !matchMedia('(pointer: fine)').matches) return el;
  const x = g.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' }); const y = g.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
  el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); x((e.clientX - (r.left + r.width / 2)) * k); y((e.clientY - (r.top + r.height / 2)) * k); });
  el.addEventListener('pointerleave', () => { x(0); y(0); });
  return el;
}

/** Cut a feathered round window in a frosted panel where a 3D anchor slot sits. */
export function punchHole(panel, slot, { feather = 26, pad = 6, shape = 'circle' } = {}) {
  panel.classList.add('holed');
  const upd = () => {
    if (!panel.isConnected || !slot.isConnected) return;
    const p = panel.getBoundingClientRect(); const s = slot.getBoundingClientRect();
    panel.style.setProperty('--hx', `${s.left - p.left + s.width / 2}px`); panel.style.setProperty('--hy', `${s.top - p.top + s.height / 2}px`);
    panel.style.setProperty('--hr', `${Math.max(s.width, s.height) / 2 + pad}px`); panel.style.setProperty('--hf', `${feather}px`);
  };
  upd();
  const ro = new ResizeObserver(upd); ro.observe(panel); ro.observe(slot);
  return () => ro.disconnect();
}


// ───────────────────────────── Fluss additions ─────────────────────────────

/** Circular progress ring (SVG). value 0..1. Returns an element with .set(v). */
export function ring(value = 0, { size = 56, stroke = 6, color = 'var(--c1)', track = 'rgba(40,28,16,.1)', label = null } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const el = h('div.ring', { style: { width: `${size}px`, height: `${size}px` } });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>${label != null ? `<span class="ring-l">${label}</span>` : ''}`;
  const arc = el.querySelector('.arc');
  el.set = (v, animate = true) => {
    const to = c * (1 - Math.max(0, Math.min(1, v)));
    const g = gsap();
    if (g && animate) g.to(arc, { strokeDashoffset: to, duration: 0.9, ease: 'power3.out' }); else arc.style.strokeDashoffset = to;
  };
  return el;
}

/** Count a number up (or down) inside an element. */
export function countUp(el, to, { from = 0, dur = 1.1, fmt = (v) => Math.round(v).toLocaleString('ru-RU'), delay = 0 } = {}) {
  const g = gsap(); const o = { v: from };
  if (!g) { el.textContent = fmt(to); return; }
  g.to(o, { v: to, duration: dur, delay, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); }, onComplete: () => { el.textContent = fmt(to); } });
}

/**
 * FLIP: remember where elements are, run `mutate()` (which moves/reparents them), then animate each from its
 * old place to the new one. Elements that did not exist before pop in.
 */
export function flip(els, mutate, { dur = 0.5, ease = 'power3.out' } = {}) {
  const g = gsap(); const list = [...els];
  const first = new Map(list.map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  if (!g) return;
  for (const e of list) {
    if (!e.isConnected) continue;
    const a = first.get(e); const b = e.getBoundingClientRect();
    const dx = a.left - b.left; const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    g.fromTo(e, { x: dx, y: dy }, { x: 0, y: 0, duration: dur, ease, clearProps: 'transform' });
  }
}

/** Shake an element (wrong answer). */
export function shake(el, amp = 9) {
  const g = gsap(); if (!g || !el) return;
  g.fromTo(el, { x: 0 }, { x: amp, duration: 0.07, repeat: 5, yoyo: true, ease: 'power1.inOut', clearProps: 'x' });
}
/** Little success pop. */
export function pop(el, s = 1.08) {
  const g = gsap(); if (!g || !el) return;
  g.fromTo(el, { scale: 1 }, { scale: s, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'scale' });
}
/** Card that tilts toward the pointer. */
export function tilt(el, max = 7) {
  if (!matchMedia('(pointer: fine)').matches) return el;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  return el;
}
