// Multiple choice — a fill-the-gap sentence, an article pick, or a picture quiz. One tap answers.
import { h } from '../../util.js';
import { shake, pop } from '../kit.js';
import { sfx } from '../../sfx.js';
import { sentenceNodes, ruBlock, visualFor, speakerBtn, numberKeys } from './common.js';

export function mount(host, ex, api) {
  let done = false;
  const picture = ex.type === 'picture';
  const blank = h('span.blank', ' ');
  const sentence = ex.sentence ? h('div.ex-sentence.story' + (ex.big ? '.big' : ''), sentenceNodes(ex.sentence, blank)) : null;
  const vis = visualFor(ex, { generate: picture, size: picture ? 'lg' : 'md' });
  const ru = picture ? null : ruBlock(ex);
  const row = h('div.opts-row' + (ex.options.some((o) => o.length > 14) ? '.long' : ''));
  const btns = ex.options.map((o, i) => {
    const b = h('button.opt-pill', { type: 'button', onclick: () => choose(o, b) },
      h('span.k', i + 1),
      ex.colors?.[o] ? h('i.dot', { style: { background: ex.colors[o] } }) : null,
      h('span.t', o));
    return b;
  });
  row.append(...btns);
  const speak = ex.speakFirst ? speakerBtn(api, ex.say, { big: false }) : null;
  host.append(h('div.ex.ex-choice', h('div.ex-ask.eyebrow', ex.ask), vis, h('div.ex-line', sentence, speak), ru, row));
  if (ex.speakFirst && ex.say) api.speak(ex.say);
  const off = numberKeys((i) => btns[i] && choose(ex.options[i], btns[i]));

  function choose(o, b) {
    if (done) return; done = true;
    const correct = o === ex.answer;
    blank.textContent = o; blank.classList.add('filled', correct ? 'ok' : 'bad');
    b.classList.add(correct ? 'ok' : 'bad');
    if (!correct) btns[ex.options.indexOf(ex.answer)]?.classList.add('ok');
    btns.forEach((x) => { x.disabled = true; });
    correct ? pop(b) : shake(b);
    sfx.tick();
    api.finish({ correct, given: o, expected: ex.answer, errors: correct ? [] : [{ given: o, expected: ex.answer, prompt: ex.sentence || ex.full || '' }] });
  }
  return { destroy() { off(); } };
}
