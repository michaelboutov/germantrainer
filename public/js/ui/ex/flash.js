// A vocabulary card: see it, hear it, flip it, and say whether you knew it.
import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { label } from '../../content/lexicon.js';
import { sfx } from '../../sfx.js';
import { speakerBtn, visualFor, ART_COLOR } from './common.js';
import { wordInfo } from '../../engine/model.js';

export function mount(host, ex, api) {
  const w = ex.word;
  let flipped = false; let done = false;
  const isNew = !(wordInfo(w.id)?.seen > 0);
  const vis = visualFor({ word: w.id, emoji: w.emoji }, { generate: true, size: 'lg' });
  const title = w.kind === 'n'
    ? h('div.fc-word', h('span.fc-art', { style: { color: ART_COLOR[w.art] } }, w.art), ' ', w.de)
    : h('div.fc-word', w.de);
  const front = h('div.fc-face.front', isNew ? h('span.fc-new', 'новое слово') : null, vis, title, h('div.fc-tap', 'нажми, чтобы увидеть перевод'));
  const extra = [];
  if (w.kind === 'n' && w.pl) extra.push(h('div.fc-row', h('span', 'мн. ч.'), h('b', `die ${w.pl}`)));
  if (w.kind === 'v') { if (w.forms) extra.push(h('div.fc-row', h('span', 'er/sie/es'), h('b', w.forms.er + (w.forms.sep ? ` … ${w.forms.sep}` : '')))); extra.push(h('div.fc-row', h('span', 'Perfekt'), h('b', w.perfect || `${w.aux === 'sein' ? 'ist' : 'hat'} ${w.pp}`))); }
  if (w.kind === 'a' && w.comp) extra.push(h('div.fc-row', h('span', 'сравн.'), h('b', `${w.comp} · ${w.sup}`)));
  const exm = w.ex ? h('div.fc-ex.story', h('div', w.ex.de), h('small', w.ex.ru)) : null;
  const back = h('div.fc-face.back', h('div.fc-ru', w.ru), ...extra, exm, w.mnemo ? h('div.fc-mnemo', h('span', { html: icon('bulb', 16) }), w.mnemo) : null);
  const card = h('div.flip-card', { role: 'button', tabindex: 0, 'aria-label': 'Перевернуть карточку', onclick: flip, onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } } }, front, back);
  const speak = speakerBtn(api, label(w), { big: true });
  const btns = h('div.flash-btns.hidden',
    h('button.btn.lg.again', { type: 'button', onclick: () => grade(false) }, 'Ещё не знаю'),
    h('button.btn.lg.primary.knew', { type: 'button', onclick: () => grade(true) }, h('span', { html: icon('check', 18) }), isNew ? 'Запомнил' : 'Знал'));
  host.append(h('div.ex.ex-flash', h('div.ex-ask.eyebrow', ex.ask), card, h('div.fc-tools', speak), btns));
  api.hideBar(true);
  setTimeout(() => api.speak(label(w)), 300);

  function flip() {
    if (done || flipped) return;
    flipped = true; sfx.tick();
    const g = window.gsap;
    card.classList.add('flipped');
    if (g) g.fromTo(card, { rotateY: 0 }, { rotateY: 180, duration: 0.6, ease: 'power3.inOut' });
    btns.classList.remove('hidden');
    g?.from(btns, { y: 16, opacity: 0, duration: 0.4, delay: 0.25, ease: 'power3.out' });
  }
  function grade(knew) {
    if (done) return; done = true;
    api.finish({ correct: knew, score: knew ? 1 : 0, given: knew ? 'знал' : 'не знал', expected: label(w), self: true, errors: knew ? [] : [{ given: '', expected: label(w), prompt: w.ru, word: w.id }] });
  }
  const onKey = (e) => { if (e.key === ' ' && !flipped) { e.preventDefault(); flip(); } else if (flipped && !done) { if (e.key === '1') grade(false); if (e.key === '2') grade(true); } };
  addEventListener('keydown', onKey);
  return { destroy() { removeEventListener('keydown', onKey); } };
}
