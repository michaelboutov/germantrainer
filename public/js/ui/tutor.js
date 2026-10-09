// "Ask anything about German": a quick answer from Gemini in a side drawer.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { drawer, toast } from './kit.js';
import { askTutor, md } from '../ai.js';
import { aiReady, describeError } from '../gemini.js';

export async function openTutor(app, question, context = '') {
  if (!aiReady()) { toast('Чтобы задавать вопросы ИИ, подключи ключ Gemini.', { kind: 'warn', action: 'Настроить', onAction: () => app.openSettings({ focus: 'key' }) }); return null; }
  const out = h('div.tutor-answer', h('div.shimmer'), h('div.shimmer', { style: { width: '85%' } }), h('div.shimmer', { style: { width: '70%' } }));
  const d = drawer(h('div.col', { style: { gap: '16px' } },
    h('div', h('div.eyebrow', 'Frag Fluss'), h('h2', 'Ответ')),
    h('div.tutor-q', h('span', { html: icon('help', 18) }), question),
    out,
    h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.primary', { onclick: () => d.close() }, 'Понятно'))));
  app.scene.setThinking(true);
  try { const text = await askTutor(question, context); out.innerHTML = md(text); } catch (e) { out.replaceChildren(h('p.muted', describeError(e))); }
  app.scene.setThinking(false);
  return d;
}
