// Gespräch: a conversation partner at A2 level. She answers in simple German, corrects your mistakes in a card
// under your message — and every correction goes into your mistake memory.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { SCENARIOS, chatStart, chatTurn } from '../ai.js';
import { aiReady, describeError, getSettings } from '../gemini.js';
import { SKILL, PALETTES } from '../content/skills.js';
import * as model from '../engine/model.js';
import { speak, stopSpeaking } from '../voice.js';
import { VoiceInput } from '../mic.js';
import { toast, fadeOut, stagger } from './kit.js';
import { shell } from './shell.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function mount(app) {
  const { header, bottom } = shell(app, 'chat');
  const root = h('section.screen.page', header);
  app.setPalette(PALETTES.sky);
  let scenario = null; let history = []; let busy = false; let mic = null;
  const orbSlot = h('div.chat-orb');

  if (!aiReady()) {
    root.append(h('div.page-body', h('div', h('div.eyebrow', 'Gespräch'), h('h1.display.page-title', 'Разговор'), h('p.page-sub', 'Живой собеседник на уровне A2: отвечает по-немецки, исправляет твои ошибки и озвучивает реплики. Работает на Gemini.')),
      h('div.glass.empty-ai', h('span', { html: icon('key', 28) }), h('div', h('b', 'Нужен ключ Gemini'), h('p.muted', 'Подключи ключ в настройках — и разговор заработает.')), h('button.btn.primary', { onclick: () => app.openSettings({ focus: 'key' }) }, 'Подключить'))), bottom);
    app.root.append(root);
    return { unmount() {} };
  }

  const msgs = h('div.msgs', { role: 'log', 'aria-live': 'polite' });
  const sugg = h('div.sugg');
  const input = h('input.chat-input', { placeholder: 'Напиши по-немецки… (или нажми микрофон)', maxlength: 300, autocomplete: 'off', onkeydown: (e) => { if (e.key === 'Enter') send(); } });
  const mbtn = h('button.micbtn', { type: 'button', 'aria-label': 'Голосом', html: icon('mic', 20), onclick: toggleMic });
  const sbtn = h('button.go', { type: 'button', 'aria-label': 'Отправить', html: icon('send', 18), onclick: () => send() });
  const composer = h('div.composer', input, mbtn, sbtn);
  const title = h('div.chat-title', h('b', 'Lena'), h('small', 'выбери сцену слева'));
  const panel = h('div.glass.chat-panel', title, msgs, sugg, composer);
  const scenes = h('div.scenes', SCENARIOS.map((sc) => h('button.scene', { onclick: () => start(sc), 'data-id': sc.id }, h('span.sc-em', sc.emoji), h('span', sc.title))));
  root.append(h('div.page-body.chat-body',
    h('div.chat-side', h('div', h('div.eyebrow', 'Gespräch'), h('h1.display.page-title.sm', 'Разговор')), orbSlot, scenes),
    panel), bottom);
  app.root.append(root);
  app.scene.anchor('orb', orbSlot, { fill: 0.9 });
  stagger(root.querySelectorAll('.scene'), { each: 0.05, dur: 0.5 });
  setEnabled(false);

  function setEnabled(on) { input.disabled = !on || busy; sbtn.disabled = !on || busy; }
  function scroll() { msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' }); }
  function typing() { const t = h('div.msg.ai.typing', h('i'), h('i'), h('i')); msgs.append(t); scroll(); return t; }

  function addAI(reply) {
    const ru = h('div.msg-ru.hidden', reply.ru || '');
    const m = h('div.msg.ai', h('div.msg-de.story', reply.de), ru,
      h('div.msg-tools', h('button.speak-btn', { 'aria-label': 'Послушать', html: icon('volume', 16), onclick: () => speak(reply.de) }), h('button.tl', { onclick: () => ru.classList.toggle('hidden') }, 'перевод')));
    msgs.append(m); window.gsap?.from(m, { opacity: 0, y: 14, duration: 0.45, ease: 'power3.out' }); scroll();
    history.push({ role: 'ai', de: reply.de });
    if (getSettings().autoSpeak) speak(reply.de);
  }
  function addUser(text) {
    const m = h('div.msg.user', h('div.msg-de', text)); msgs.append(m); window.gsap?.from(m, { opacity: 0, y: 14, duration: 0.35 }); scroll();
    history.push({ role: 'user', de: text }); return m;
  }
  function addCorrection(msgEl, text, c) {
    const sk = SKILL[c.skill];
    const card = h('div.corr', h('div.corr-h', h('span', { html: icon('bulb', 16) }), 'Можно лучше'),
      h('div.corr-t.story', { html: c.corrected ? esc(c.corrected) : '' }), c.explanation ? h('div.corr-e', c.explanation) : null,
      sk ? h('button.chip', { onclick: () => app.openRule(sk.id) }, `правило: ${sk.title}`) : null);
    msgEl.append(card); window.gsap?.from(card, { opacity: 0, y: -8, duration: 0.4 }); scroll();
    model.logMistake({ skill: c.skill || 'x.sprechen', kind: 'chat', key: null, prompt: text, given: c.wrong || text, expected: c.right || c.corrected, ru: '', tag: 'chat' }); model.save();
  }
  function suggestions(list = []) {
    sugg.replaceChildren(...list.slice(0, 3).map((s) => h('button.chip.sel-chip', { onclick: () => { input.value = s; input.focus(); } }, s)));
  }

  async function start(sc) {
    if (busy) return;
    scenario = sc; history = []; stopSpeaking();
    [...scenes.children].forEach((b) => b.classList.toggle('on', b.dataset.id === sc.id));
    title.replaceChildren(h('b', `Lena · ${sc.title}`), h('small', sc.brief.replace(/^Ты /, 'Сцена: ты ').slice(0, 90)));
    msgs.replaceChildren(); suggestions([]); busy = true; setEnabled(false);
    const t = typing(); app.scene.setThinking(true);
    try { const out = await chatStart(sc); t.remove(); addAI(out.reply); suggestions(out.suggestions); }
    catch (e) { t.remove(); msgs.append(h('div.msg.sys', describeError(e))); }
    app.scene.setThinking(false); busy = false; setEnabled(true); input.focus();
  }
  async function send(text = input.value.trim()) {
    if (!text || busy || !scenario) return;
    input.value = ''; busy = true; setEnabled(false); suggestions([]); stopSpeaking();
    const um = addUser(text); const t = typing(); app.scene.setThinking(true);
    try {
      const out = await chatTurn({ scenario, history: history.slice(0, -1), userText: text });
      t.remove();
      if (out.correction?.needed && out.correction.corrected) addCorrection(um, text, out.correction); else if (out.correction && out.correction.needed === false) um.classList.add('ok');
      addAI(out.reply); suggestions(out.suggestions);
      if (!out.correction?.needed) { app.scene.pulse(0.8); }
    } catch (e) { t.remove(); msgs.append(h('div.msg.sys', describeError(e))); }
    app.scene.setThinking(false); busy = false; setEnabled(true); input.focus();
  }
  function toggleMic() {
    if (!scenario) { toast('Сначала выбери сцену.', { kind: 'warn' }); return; }
    if (mic?.state === 'listening') { mic.stop(); return; }
    if (!VoiceInput.available) { toast('Голосовой ввод не поддерживается этим браузером.', { kind: 'warn' }); return; }
    stopSpeaking(); mic = new VoiceInput('de-DE'); app.mic = mic;
    app.scene.setLevelSource(() => (mic?.state === 'listening' ? mic.level : app.narrator.level));
    mic.on('state', (s) => mbtn.classList.toggle('live', s === 'listening'));
    mic.on('interim', (t) => { input.value = t; });
    mic.on('final', (t) => { if (t) { input.value = t; setTimeout(() => { if (input.value.trim() === t.trim()) send(); }, 700); } });
    mic.on('error', () => toast('Не получилось включить микрофон.', { kind: 'err' }));
    mic.start();
  }
  return { async unmount() { mic?.cancel?.(); stopSpeaking(); app.scene.setThinking(false); app.scene.setLevelSource(() => app.narrator.level); await fadeOut(root.querySelectorAll('.page-body > *'), { each: 0.02, dur: 0.25 }); } };
}
