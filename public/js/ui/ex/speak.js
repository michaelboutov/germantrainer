// Pronunciation: say the sentence, we listen and compare it word by word.
import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { VoiceInput } from '../../mic.js';
import { diffWords } from '../../engine/check.js';
import { describeError } from '../../gemini.js';
import { speakerBtn } from './common.js';
import { sfx } from '../../sfx.js';

export function mount(host, ex, api) {
  let done = false; let mic = null;
  const live = h('div.speak-live', 'Нажми на микрофон и скажи фразу');
  const mbtn = h('button.micbtn.big', { type: 'button', 'aria-label': 'Микрофон', html: icon('mic', 30), onclick: toggle });
  const text = h('div.ex-sentence.story.big', ex.text);
  const self = h('div.self-grade.hidden', h('div.muted', 'Микрофон недоступен — оцени себя сам:'),
    h('div.row', h('button.btn', { type: 'button', onclick: () => finishSelf(false) }, 'Не получилось'), h('button.btn.primary', { type: 'button', onclick: () => finishSelf(true) }, 'Получилось')));
  const skip = h('button.btn.ghost.sm', { type: 'button', onclick: () => { skip.remove(); self.classList.remove('hidden'); mbtn.classList.add('hidden'); } }, 'Не могу говорить сейчас');
  host.append(h('div.ex.ex-speak', h('div.ex-ask.eyebrow', ex.ask), text, h('div.ex-ru', `«${ex.ru}»`),
    h('div.speak-tools', speakerBtn(api, ex.text, { big: true }), mbtn, speakerBtn(api, ex.text, { big: true, slow: true })), live, skip, self));
  if (!VoiceInput.available) { mbtn.classList.add('hidden'); self.classList.remove('hidden'); skip.remove(); live.textContent = ''; }
  api.hideBar(true);

  function toggle() {
    if (done) return;
    if (mic?.state === 'listening') { mic.stop(); return; }
    mic = new VoiceInput('de-DE'); api.setMicLevel(() => mic?.level || 0);
    mic.on('state', (s) => { mbtn.classList.toggle('live', s === 'listening'); live.textContent = s === 'listening' ? 'Слушаю…' : s === 'processing' ? 'Распознаю…' : live.textContent; });
    mic.on('interim', (t) => { live.textContent = t || 'Слушаю…'; });
    mic.on('final', (t) => { api.setMicLevel(null); evaluate(t); });
    mic.on('error', (e) => { api.setMicLevel(null); live.textContent = e?.name === 'NotAllowedError' || e?.message === 'not-allowed' ? 'Нет доступа к микрофону — разреши его в браузере.' : describeError(e); skip.classList.remove('hidden'); });
    mic.start();
  }
  function evaluate(said) {
    if (done) return;
    if (!said) { live.textContent = 'Не расслышал — попробуй ещё раз'; return; }
    done = true;
    const d = diffWords(said, ex.text);
    const ok = d.score >= 0.8;
    text.replaceChildren(...d.words.map((w, i) => h('span.dw.' + (w.st === 'ok' ? 'ok' : 'miss'), (i ? ' ' : '') + w.w)));
    live.textContent = `Ты сказал: «${said}»`;
    ok ? sfx.right() : sfx.wrong();
    api.finish({ correct: ok, score: ok ? 1 : d.score * 0.5, given: said, expected: ex.text, diff: d.words, errors: ok ? [] : [{ given: said, expected: ex.text, prompt: ex.ru }] });
  }
  function finishSelf(ok) { if (done) return; done = true; api.finish({ correct: ok, given: ok ? 'получилось' : 'не получилось', expected: ex.text, self: true, errors: ok ? [] : [{ given: '', expected: ex.text, prompt: ex.ru }] }); }
  return { destroy() { mic?.cancel(); api.setMicLevel(null); } };
}
