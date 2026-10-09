// Einstellungen: your Gemini key (kept in this browser), models, voice, practice rhythm, and your data.
import { h, downloadBlob } from '../util.js';
import { icon } from '../icons.js';
import { getSettings, saveSettings, backendInfo, backendMode, generate, describeError, probeBackend, demoOnly, aiReady } from '../gemini.js';
import { TEXT_MODELS, TTS_MODELS, IMAGE_MODELS, VOICES } from '../config.js';
import { modal, toast, confirmDialog } from './kit.js';
import { exportAll, importAll, wipeAll, persistent } from '../store.js';
import * as model from '../engine/model.js';
import { speak } from '../voice.js';

const opts = (list, cur) => list.map((m) => h('option', { value: m.id, selected: m.id === cur }, m.label || m.id));

export function openSettings(app, { focus = null } = {}) {
  const s = getSettings();
  const info = backendInfo();
  const statusText = () => ({
    demo: 'Офлайн-режим: только встроенные задания, без ИИ и без трат.',
    byok: 'Используется твой ключ Gemini (хранится только в этом браузере).',
    server: 'Ключ хранится на сервере — вводить ничего не нужно.',
    none: 'Нужен ключ Gemini — или включи офлайн-режим.',
  }[backendMode()]);
  const status = h('p.muted', { style: { fontSize: '14px' } }, statusText());
  const refresh = () => { status.textContent = statusText(); };

  const key = h('input.input', { type: 'password', placeholder: 'AIza… / AQ.…', value: s.apiKey, autocomplete: 'off', spellcheck: 'false' });
  const code = h('input.input', { type: 'password', placeholder: 'Код доступа', value: s.accessCode, autocomplete: 'off' });
  const test = h('button.btn.sm', { onclick: runTest }, h('span', { html: icon('key', 16) }), 'Проверить ключ');
  async function runTest() {
    saveSettings({ apiKey: key.value.trim(), accessCode: code.value.trim() }); refresh();
    if (['none', 'demo'].includes(backendMode())) { toast('Сначала введи ключ и выключи офлайн-режим.', { kind: 'warn' }); return; }
    test.disabled = true;
    try {
      await generate(getSettings().textModel, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }], generationConfig: { maxOutputTokens: 8 } }, { tries: 1 });
      toast('Ключ работает ✓');
    } catch (e) { toast(describeError(e), { kind: 'err', ms: 8000 }); }
    test.disabled = false;
  }
  const sw = (id, on, cb) => h('button.switch', { role: 'switch', 'aria-checked': String(!!on), onclick: (e) => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); saveSettings({ [id]: v }); cb?.(v); } });
  const seg = (id, items, cur, cb) => h('div.seg', items.map(([v, name]) => h('button', { class: String(cur) === String(v) ? 'on' : '', onclick: (e) => { saveSettings({ [id]: v }); [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); cb?.(v); } }, name)));
  const sel = (id, list, cur) => h('select.select', { onchange: (e) => saveSettings({ [id]: e.target.value }) }, opts(list, cur));
  const row = (label, node, hint) => h('div.field', h('label', label), node, hint && h('p.dim', { style: { fontSize: '13px' } }, hint));
  const line = (label, node, hint) => h('div.row', h('div.grow', h('div', { style: { fontWeight: 700 } }, label), hint && h('div.dim', { style: { fontSize: '13px' } }, hint)), node);

  const voiceSel = h('select.select', { onchange: (e) => saveSettings({ voice: e.target.value }) }, VOICES.map((v) => h('option', { value: v.id, selected: v.id === s.voice }, `${v.id} — ${v.ru}`)));
  const preview = h('button.btn.sm', { onclick: () => speak('Guten Tag! Ich bin deine Stimme. Wir lernen heute Deutsch.') }, h('span', { html: icon('volume', 16) }), 'Прослушать');

  const fileIn = h('input', { type: 'file', accept: 'application/json', class: 'hide', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { await importAll(f); await model.load(); toast('Прогресс загружен ✓'); app.refresh(); } catch (err) { toast(err.message, { kind: 'err' }); } } });

  const body = h('div.col', { style: { gap: '18px' } },
    h('div', h('div.eyebrow', 'Einstellungen'), h('h2', 'Как учимся')),
    demoOnly()
      ? h('div.glass', { style: { padding: '18px' } }, h('div', { style: { fontWeight: 800 } }, 'Предпросмотр в офлайн-режиме'), h('p.muted', { style: { fontSize: '14px' } }, 'Эта страница работает в песочнице без доступа к Google. Чтобы подключить Gemini, запусти приложение локально или на своём сервере.'))
      : h('div.glass', { style: { padding: '18px', display: 'grid', gap: '14px' } },
        h('div.row', h('span', { html: icon('key', 20) }), h('div', { style: { fontWeight: 800 } }, 'Gemini API')), status,
        row('Твой API-ключ', key, 'Остаётся в браузере и уходит только в Google. Получить: aistudio.google.com/apikey'),
        info.needsCode && row('Код доступа сервера', code),
        h('div.row', test, h('div.grow'), h('span.dim', { style: { fontSize: '13px' } }, 'Офлайн'), sw('demo', s.demo, refresh))),
    h('div.glass', { style: { padding: '18px', display: 'grid', gap: '16px' } },
      line('Озвучивать немецкий', sw('autoSpeak', s.autoSpeak), 'Gemini TTS читает предложения после ответа и в заданиях на слух'),
      line('Медленная речь', sw('slow', s.slow), 'Для упражнений на слух'),
      line('Картинки к словам', sw('images', s.images), 'Nano Banana рисует иллюстрации (один раз, потом кэш)'),
      line('Звуки интерфейса', sw('sfx', s.sfx)),
      row('Голос', h('div.row', voiceSel, preview))),
    h('div.glass', { style: { padding: '18px', display: 'grid', gap: '16px' } },
      row('Заданий в раунде', seg('roundSize', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], s.roundSize)),
      row('Доля слов в раунде', seg('vocabShare', [[0.1, 'меньше'], [0.25, 'норма'], [0.45, 'больше']], s.vocabShare)),
      row('Цель на день', seg('dailyGoal', [[10, '10'], [20, '20'], [40, '40']], s.dailyGoal)),
      row('Стартовый уровень', seg('level', [['a1', 'A1'], ['a2', 'A2'], ['a2plus', 'A2+']], s.level), 'Влияет на правила, которых ты ещё не касался')),
    h('details.glass', { style: { padding: '14px 18px' }, open: focus === 'models' },
      h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Модели и графика'),
      h('div.col', { style: { marginTop: '14px' } },
        row('Текст (объяснения, слова, разговор)', sel('textModel', TEXT_MODELS, s.textModel)),
        row('Озвучка (TTS)', sel('ttsModel', TTS_MODELS, s.ttsModel)),
        row('Картинки (Nano Banana)', sel('imageModel', IMAGE_MODELS, s.imageModel)),
        row('Качество 3D', seg('quality', [['auto', 'Auto'], ['high', 'Высокое'], ['low', 'Низкое']], s.quality, (v) => app.scene?.setQuality(v))))),
    h('div.glass', { style: { padding: '18px', display: 'grid', gap: '12px' } },
      h('div', { style: { fontWeight: 800 } }, 'Твой прогресс'),
      h('p.dim', { style: { fontSize: '13px' } }, 'Хранится в этом браузере (IndexedDB). Можно сохранить в файл и перенести на другое устройство.'),
      h('div.row', { style: { flexWrap: 'wrap' } },
        h('button.btn.sm', { onclick: async () => { await model.flush(); downloadBlob(await exportAll({ pictures: true }), 'fluss-progress.json'); } }, h('span', { html: icon('download', 16) }), 'Сохранить'),
        h('button.btn.sm', { onclick: () => fileIn.click() }, h('span', { html: icon('upload', 16) }), 'Загрузить'), fileIn,
        h('div.grow'),
        h('button.btn.sm.ghost', { onclick: async () => { if (await confirmDialog('Сбросить весь прогресс?', 'Правила, слова, ошибки и картинки будут удалены с этого устройства.', { danger: true, ok: 'Сбросить' })) { await wipeAll(); model.reset(); await model.load(); toast('Готово — начинаем с чистого листа'); box.close(); app.go('home'); } } }, 'Сбросить'))),
    h('div.row', { style: { justifyContent: 'flex-end' } },
      h('button.btn.primary', { onclick: async () => { saveSettings({ apiKey: key.value.trim(), accessCode: code.value.trim() }); await probeBackend(); box.close(); app.onSettingsChanged?.(); } }, 'Готово')));
  const box = modal(body, { onClose: () => { saveSettings({ apiKey: key.value.trim(), accessCode: code.value.trim() }); app.onSettingsChanged?.(); } });
  if (focus === 'key') setTimeout(() => key.focus(), 500);
  persistent().then((p) => { if (!p) toast('Браузер не разрешает хранить прогресс (приватный режим?) — он пропадёт при закрытии.', { kind: 'warn', ms: 7000 }); });
  return box;
}
