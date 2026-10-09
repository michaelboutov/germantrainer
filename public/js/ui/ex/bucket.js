// Sort cards into bins (der/die/das, haben/sein, Dativ/Akkusativ …). Every drop is judged at once.
import { h } from '../../util.js';
import { draggable, settle } from '../dnd.js';
import { flip, shake, pop } from '../kit.js';
import { sfx } from '../../sfx.js';

const isWordId = (id) => /^[nvau]:/.test(String(id));

export function mount(host, ex, api) {
  let done = false; let remaining = ex.cards.length; let selected = null;
  const failed = new Map(); const attempts = new Map(); const errors = [];

  const bins = ex.bins.map((b) => {
    const body = h('div.bin-body');
    const el = h('div.bin', { dataset: { bin: b.id }, style: { '--bc': b.color || 'var(--c1)' } }, h('div.bin-h', b.label), body);
    return { ...b, el, body };
  });
  const tray = h('div.tray');
  const cards = ex.cards.map((c) => {
    const el = h('div.tile.card', c.emoji ? h('span.emo', c.emoji) : null, h('span.ct', c.label), c.sub ? h('span.cs', c.sub) : null);
    const card = { ...c, el, locked: false };
    draggable(el, {
      targets: () => bins.map((b) => b.el),
      onDrop: (zone, info) => (zone ? attempt(card, bins.find((b) => b.el === zone), info) : false),
      onTap: () => select(card),
      disabled: () => done || card.locked,
    });
    tray.append(el);
    return card;
  });
  bins.forEach((b) => b.el.addEventListener('click', () => { if (selected && !done) { const c = selected; select(null); attempt(c, b, null); } }));

  function select(c) {
    if (selected) selected.el.classList.remove('sel');
    selected = c && selected !== c ? c : null;
    selected?.el.classList.add('sel');
  }
  function lock(c, bin, info, revealed) {
    const others = cards.filter((x) => x !== c && !x.locked).map((x) => x.el);
    flip(others, () => { bin.body.append(c.el); c.el.classList.add('placed', revealed ? 'revealed' : 'ok'); });
    if (info) settle(c.el, info.ghostRect, info.tilt); else window.gsap?.fromTo(c.el, { scale: 0.8 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
    c.locked = true; c.el.classList.remove('sel');
    remaining--; pop(bin.el, 1.03);
    if (remaining === 0) setTimeout(finish, 650);
  }
  function attempt(c, bin, info) {
    if (done || c.locked || !bin) return false;
    if (bin.id === c.bin) { sfx.drop(); lock(c, bin, info, false); return !!info; }
    const n = (attempts.get(c.id) || 0) + 1; attempts.set(c.id, n);
    sfx.wrong(); shake(bin.el, 6);
    bin.el.classList.add('wrong'); setTimeout(() => bin.el.classList.remove('wrong'), 450);
    shake(c.el, 6);
    if (!failed.has(c.id)) {
      failed.set(c.id, true);
      const right = bins.find((b) => b.id === c.bin);
      errors.push({ given: bin.label, expected: right.label, prompt: c.label, word: isWordId(c.id) ? c.id : undefined });
    }
    if (n >= 2) { lock(c, bins.find((b) => b.id === c.bin), null, true); return !!info; }
    return false;
  }
  function finish() {
    if (done) return; done = true;
    const total = cards.length; const bad = failed.size;
    api.finish({ correct: bad === 0, score: (total - bad) / total, given: `${total - bad} из ${total}`, expected: '', errors, summary: `${total - bad} из ${total} верно` });
  }

  host.append(h('div.ex.ex-bucket', h('div.ex-ask.eyebrow', ex.ask), h('div.bins', bins.map((b) => b.el)), tray));
  return { destroy() {} };
}
