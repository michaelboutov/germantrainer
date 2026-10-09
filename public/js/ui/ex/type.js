// Typing — a gap inside a sentence, a whole word, or a dictation after listening.
import { h } from '../../util.js';
import { compareTyped, diffWords } from '../../engine/check.js';
import { sentenceNodes, ruBlock, visualFor, speakerBtn, umlautRow } from './common.js';

export function mount(host, ex, api) {
  const dictation = ex.mode === 'dictation';
  const answer = ex.answers[0];
  const input = h('input.blank-input' + (dictation ? '.wide' : ''), {
    type: 'text', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Твой ответ',
    placeholder: dictation ? 'Напиши, что услышал…' : '', size: Math.min(22, Math.max(5, answer.length + 2)),
  });
  input.addEventListener('input', () => api.setReady(input.value.trim().length > 0));
  const vis = visualFor(ex, { size: 'md' });
  let main;
  if (dictation) {
    main = h('div.dictation', h('div.speakers', speakerBtn(api, ex.say, { big: true }), speakerBtn(api, ex.say, { big: true, slow: true })), input);
  } else {
    main = h('div.ex-sentence.story' + (ex.big ? '.big' : ''), sentenceNodes(ex.sentence, input));
  }
  host.append(h('div.ex.ex-type', h('div.ex-ask.eyebrow', ex.ask), vis, main, dictation ? null : ruBlock({ ...ex, ru: ex.ru || ex.hint }), umlautRow(input)));
  if (dictation && ex.say) setTimeout(() => api.speak(ex.say), 250);
  setTimeout(() => input.focus({ preventScroll: true }), 120);

  api.setCheck(() => {
    const val = input.value.trim();
    if (!val) return;
    const r = compareTyped(val, ex.answers);
    input.disabled = true; input.classList.add(r.ok ? 'ok' : 'bad');
    const out = { correct: r.ok, given: val, expected: answer, note: r.note, close: r.close, errors: r.ok ? [] : [{ given: val, expected: answer, prompt: ex.sentence || ex.full || '' }] };
    if (dictation || answer.split(' ').length > 2) out.diff = diffWords(val, answer).words;
    api.finish(out);
  });
  return { destroy() {} };
}
