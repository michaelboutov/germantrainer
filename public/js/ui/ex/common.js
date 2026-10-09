// Pieces shared by all exercise components.
import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { getSettings, aiReady } from '../../gemini.js';
import { wordById } from '../../engine/builders.js';
import { wordPicture, cachedPicture } from '../../ai.js';

export const ART_COLOR = { der: '#4a7dff', die: '#ff5d73', das: '#22b58a' };

/** Round speaker button. `text` may be a function (resolved on click). */
export function speakerBtn(api, text, { big = false, slow = false } = {}) {
  const b = h('button.speak-btn' + (big ? '.big' : '') + (slow ? '.slow' : ''), {
    type: 'button', 'aria-label': slow ? 'Послушать медленно' : 'Послушать', title: slow ? 'Медленнее' : 'Послушать',
    html: icon(slow ? 'turtle' : 'volume', big ? 30 : 20),
    onclick: async () => { b.classList.add('on'); try { await api.speak(typeof text === 'function' ? text() : text, { slow }); } finally { b.classList.remove('on'); } },
  });
  return b;
}

/** Sentence with a `___` gap → [text, blankEl, text]. */
export function sentenceNodes(text, blankEl) {
  const parts = String(text).split('___');
  if (parts.length < 2) return [text];
  return [parts[0], blankEl, parts.slice(1).join('___')];
}

/** The Russian clue: shown as a quiet line, or behind a "перевод" button on hard tasks. */
export function ruBlock(ex) {
  if (!ex.ru || ex.hideRu) return null;
  const always = ex.tier < 3 || ex.showRu || ex.type === 'order';
  if (always) return h('div.ex-ru', `«${ex.ru}»`);
  const box = h('div.ex-ru.peek');
  const btn = h('button.peek-btn', { type: 'button', onclick: () => { box.replaceChildren(`«${ex.ru}»`); box.classList.add('shown'); } }, h('span', { html: icon('eye', 15) }), 'показать перевод');
  box.append(btn);
  return box;
}

/** Emoji sticker, upgraded to a Nano Banana picture when one exists (or is generated for `generate`). */
export function visualFor(ex, { generate = false, size = 'md' } = {}) {
  const w = ex.word ? wordById(ex.word) : null;
  const emoji = ex.emoji ?? w?.emoji;
  if (!emoji && !w) return null;
  const box = h('div.vis.' + size);
  const emo = h('span.emo', emoji || (w?.de || '?').slice(0, 1));
  box.append(emo);
  if (w && getSettings().images) {
    const done = (url) => { if (!url || !box.isConnected) return; const img = h('img', { src: url, alt: '', draggable: 'false' }); img.onload = () => { box.append(img); box.classList.add('has-img'); }; };
    cachedPicture(w).then((u) => {
      if (u) return done(u);
      if (generate && aiReady()) { box.classList.add('loading'); wordPicture(w).then((x) => { box.classList.remove('loading'); done(x); }); }
    });
  }
  return box;
}

/** ä ö ü ß keys for typing on any keyboard. */
export function umlautRow(input) {
  const row = h('div.umlauts');
  for (const ch of ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']) {
    row.append(h('button.ukey', {
      type: 'button', tabindex: '-1',
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => {
        const s = input.selectionStart ?? input.value.length; const e = input.selectionEnd ?? s;
        input.value = input.value.slice(0, s) + ch + input.value.slice(e);
        input.setSelectionRange(s + 1, s + 1); input.focus(); input.dispatchEvent(new Event('input', { bubbles: true }));
      },
    }, ch));
  }
  return row;
}

/** Number keys 1..9 select the n-th option. Returns a disposer. */
export function numberKeys(handler) {
  const fn = (e) => {
    if (e.target?.closest?.('input, textarea')) return;
    if (/^[1-9]$/.test(e.key)) handler(Number(e.key) - 1);
  };
  addEventListener('keydown', fn);
  return () => removeEventListener('keydown', fn);
}
