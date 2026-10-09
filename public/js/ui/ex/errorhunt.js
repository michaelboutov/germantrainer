// "Find the mistake": tap the wrong word in a sentence, then pick the right form.
import { h } from '../../util.js';
import { shake, pop } from '../kit.js';
import { sfx } from '../../sfx.js';
import { ruBlock, speakerBtn } from './common.js';

export function mount(host, ex, api) {
  let done = false; let step = 1;
  const [a, b] = ex.span;
  const words = ex.tokens.map((t, i) => h('button.word', { type: 'button', onclick: () => tap(i) }, t));
  const sentence = h('div.eh-sentence.story', words);
  const fixBox = h('div.eh-fix.hidden');
  host.append(h('div.ex.ex-eh', h('div.ex-ask.eyebrow', ex.ask), h('div.ex-hint', 'Нажми на слово, в котором ошибка'), sentence, ruBlock(ex), fixBox));

  function tap(i) {
    if (done || step !== 1) return;
    const inSpan = i >= a && i <= b;
    if (!inSpan) {
      done = true; sfx.wrong(); shake(words[i]); words[i].classList.add('bad');
      for (let k = a; k <= b; k++) words[k].classList.add('missed');
      return api.finish({ correct: false, given: ex.tokens[i], expected: ex.fix, errors: [{ given: ex.wrongText, expected: ex.fix, prompt: ex.tokens.join(' ') }], note: 'Ошибка была не здесь' });
    }
    step = 2; sfx.tick();
    for (let k = a; k <= b; k++) words[k].classList.add('suspect');
    fixBox.classList.remove('hidden');
    fixBox.append(h('div.eyebrow', 'Как правильно?'), h('div.opts-row', ex.fixes.map((f, n) => h('button.opt-pill', { type: 'button', onclick: () => pick(f) }, h('span.k', n + 1), h('span.t', f)))));
    window.gsap?.from(fixBox, { y: 14, opacity: 0, duration: 0.4, ease: 'power3.out' });
  }
  function pick(f) {
    if (done) return; done = true;
    const ok = f === ex.fix;
    words[a].textContent = f;
    for (let k = a + 1; k <= b; k++) words[k].classList.add('gone');
    for (let k = a; k <= b; k++) { words[k].classList.remove('suspect'); words[k].classList.add(ok ? 'ok' : 'bad'); }
    ok ? pop(words[a]) : shake(words[a]);
    [...fixBox.querySelectorAll('.opt-pill')].forEach((p) => { p.disabled = true; if (p.textContent.endsWith(ex.fix)) p.classList.add('ok'); });
    api.finish({ correct: ok, given: f, expected: ex.fix, errors: ok ? [] : [{ given: f, expected: ex.fix, prompt: ex.tokens.join(' ') }] });
  }
  const onKey = (e) => { if (step === 2 && /^[1-9]$/.test(e.key)) { const f = ex.fixes[Number(e.key) - 1]; if (f) pick(f); } };
  addEventListener('keydown', onKey);
  return { destroy() { removeEventListener('keydown', onKey); } };
}
