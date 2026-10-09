// Wörter: your whole vocabulary — tap a word for pictures, sound and memory tricks; ask Gemini to invent new ones.
import { h, debounce } from '../util.js';
import { icon } from '../icons.js';
import { TOPICS, label, ARTICLE_COLOR, NOUNS } from '../content/lexicon.js';
import * as model from '../engine/model.js';
import { allWords, wordById } from '../engine/builders.js';
import { PALETTES } from '../content/skills.js';
import { newWords, enrichWord, wordPicture, cachedPicture, canGenerateNow } from '../ai.js';
import { aiReady, describeError, getSettings } from '../gemini.js';
import { speak } from '../voice.js';
import { drawer, modal, toast, fadeOut, stagger, magnetic } from './kit.js';
import { spotlight } from '../util.js';
import { shell } from './shell.js';

const ST = { new: 'новое', learning: 'учу', known: 'знаю' };

export async function mount(app) {
  const { header, bottom } = shell(app, 'words');
  let topic = 'all'; let status = 'all'; let q = ''; let shown = 60;
  const root = h('section.screen.page');
  const grid = h('div.word-grid');
  const stats = h('div.word-stats');
  const more = h('button.btn.ghost', { onclick: () => { shown += 60; draw(); } }, 'Показать ещё');

  function counts() {
    const ws = allWords().filter((w) => w.kind !== 'p');
    const c = { new: 0, learning: 0, known: 0 };
    ws.forEach((w) => { c[model.wordStatus(w.id)]++; });
    return { total: ws.length, ...c };
  }
  function drawStats() {
    const c = counts();
    stats.replaceChildren(
      ...[['всего слов', c.total, ''], ['знаю', c.known, 'known'], ['учу', c.learning, 'learning'], ['новых', c.new, 'new']].map(([cap, n, cls]) => h('div.wstat.' + cls, h('b', n), h('small', cap))));
  }
  function visible() {
    return allWords().filter((w) => (topic === 'all' || w.topic === topic) && (status === 'all' || model.wordStatus(w.id) === status)
      && (!q || `${w.de} ${w.ru} ${w.art || ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (b.added || 0) - (a.added || 0));
  }
  function card(w) {
    const st = model.wordStatus(w.id);
    const el = h('button.wcard.' + st, { onclick: () => openWord(w.id), style: { '--ac': w.art ? ARTICLE_COLOR[w.art] : 'var(--c1)' } },
      h('div.wc-vis', w.emoji ? h('span.emo', w.emoji) : h('span.emo', w.de.slice(0, 1)), w.ai ? h('i.ai-badge', { html: icon('sparkles', 12) }) : null),
      h('div.wc-word', w.art ? h('span.wc-art', w.art) : null, ' ', w.de),
      h('div.wc-ru', w.ru), h('span.wc-st', ST[st]));
    cachedPicture(w).then((u) => { if (u && el.isConnected) { const v = el.querySelector('.wc-vis'); v.append(h('img', { src: u, alt: '' })); v.classList.add('has-img'); } });
    return spotlight(el);
  }
  function draw() {
    const list = visible();
    grid.replaceChildren(...list.slice(0, shown).map(card));
    more.classList.toggle('hidden', list.length <= shown);
    if (!list.length) grid.append(h('div.empty', 'Ничего не найдено. Попроси ИИ придумать новые слова!'));
    drawStats();
  }

  // ── topics / filters
  const topicChips = h('div.chips.topics', [['all', 'Все темы', '✨'], ...Object.entries(TOPICS).filter(([k]) => !['Phrasen'].includes(k)).map(([k, v]) => [k, v.ru, v.emoji])].map(([k, name, em]) => h('button.chip.sel-chip' + (k === topic ? '.on' : ''), { onclick: (e) => { topic = k; shown = 60; [...topicChips.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); draw(); } }, h('span', em), name)));
  const statusSeg = h('div.seg', [['all', 'Все'], ['new', 'Новые'], ['learning', 'Учу'], ['known', 'Знаю']].map(([k, name]) => h('button', { class: k === status ? 'on' : '', onclick: (e) => { status = k; shown = 60; [...statusSeg.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget)); draw(); } }, name)));
  const search = h('input.input.search', { placeholder: 'Найти слово…', oninput: debounce((e) => { q = e.target.value.trim(); shown = 60; draw(); }, 150) });

  // ── actions
  const practice = h('button.btn.primary.lg', { onclick: (e) => app.startSession({ mode: 'vocab' }, e.currentTarget) }, h('span', { html: icon('play', 16) }), 'Тренировать слова');
  const invent = h('button.btn.lg', { onclick: () => openInvent() }, h('span', { html: icon('sparkles', 18) }), 'Придумать новые слова');
  magnetic(practice);

  root.append(header, h('div.page-body',
    h('div', h('div.eyebrow', 'Wörter'), h('h1.display.page-title', 'Слова'), h('p.page-sub', 'Артикли, множественное число, примеры и лайфхаки. Слова, которые ты путаешь, возвращаются чаще — по системе интервальных повторений.')),
    h('div.words-top', stats, h('div.row.wrap', practice, invent)),
    h('div.words-filters', search, statusSeg), topicChips, grid, h('div.more-row', more)), bottom);
  app.root.append(root);
  app.setPalette(PALETTES.words);
  draw();
  stagger(root.querySelectorAll('.wcard'), { each: 0.01, dur: 0.5, y: 16, blur: 4, delay: 0.1 });

  // ── "invent new words" with Gemini
  function openInvent() {
    if (!app.requireAI('Придумывать слова умеет Gemini.')) return;
    const topicIn = h('input.input', { placeholder: 'Тема: кухня, путешествие, офис, хобби… (можно пусто)', maxlength: 60 });
    let level = getSettings().level === 'a1' ? 'a1' : 'a2'; let count = 8;
    const lvlSeg = h('div.seg', [['a1', 'A1'], ['a2', 'A2']].map(([k, n]) => h('button', { class: k === level ? 'on' : '', onclick: (e) => { level = k; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, n)));
    const cntSeg = h('div.seg', [6, 8, 12].map((n) => h('button', { class: n === count ? 'on' : '', onclick: (e) => { count = n; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, String(n))));
    const quick = h('div.chips', ['на кухне', 'в городе', 'в офисе', 'путешествие', 'здоровье', 'хобби', 'в магазине', 'погода'].map((t) => h('button.chip.sel-chip', { onclick: () => { topicIn.value = t; } }, t)));
    const out = h('div.invent-out');
    const go = h('button.btn.primary.lg', { onclick: run }, h('span', { html: icon('sparkles', 18) }), 'Придумать');
    const box = modal(h('div.col', { style: { gap: '16px' } }, h('div', h('div.eyebrow', 'Gemini 3.8 Flash'), h('h2', 'Новые слова')),
      h('p.muted', 'ИИ придумает полезные слова на твою тему — с артиклем, мн. числом, примером и лайфхаком. Слова, которые ты уже знаешь, он пропустит.'),
      h('div.field', h('label', 'Тема'), topicIn), quick, h('div.row.wrap', h('div.field', h('label', 'Уровень'), lvlSeg), h('div.field', h('label', 'Сколько'), cntSeg)), h('div.row', { style: { justifyContent: 'flex-end' } }, go), out), { wide: true });
    async function run() {
      go.disabled = true; out.replaceChildren(h('div.invent-load', h('div.spinner'), 'Gemini придумывает слова…')); app.scene.setThinking(true);
      try {
        const ws = await newWords({ topic: topicIn.value.trim(), level, n: count });
        out.replaceChildren(h('div.eyebrow', `Добавлено ${ws.length} слов`), h('div.invent-cards', ws.map((w) => { const c = card(w); c.onclick = () => { box.close(); openWord(w.id); }; return c; })),
          h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.primary', { onclick: (e) => { box.close(); app.startSession({ mode: 'vocab' }, e.currentTarget); } }, 'Сразу потренировать')));
        stagger(out.querySelectorAll('.wcard'), { each: 0.06, dur: 0.6 });
        app.scene.pulse(1.2); app.scene.burst('#ffd25a', 80);
        draw();
      } catch (e) { out.replaceChildren(h('p.muted', describeError(e))); }
      app.scene.setThinking(false); go.disabled = false;
    }
  }

  // ── a single word
  function openWord(id) {
    const w = wordById(id); if (!w) return;
    const info = model.wordInfo(w.id);
    const vis = h('div.wd-vis', w.emoji ? h('span.emo', w.emoji) : h('span.emo', w.de.slice(0, 1)));
    const setPic = (u) => { if (u && vis.isConnected) { vis.querySelector('img')?.remove(); vis.append(h('img', { src: u, alt: '' })); vis.classList.add('has-img'); } };
    cachedPicture(w).then(setPic);
    const picBtn = h('button.btn.sm', { onclick: async () => { if (!app.requireAI('Картинки рисует Nano Banana.')) return; picBtn.disabled = true; vis.classList.add('loading'); const u = await wordPicture(w); vis.classList.remove('loading'); if (u) setPic(u); else toast('Не получилось нарисовать — попробуй ещё раз.', { kind: 'warn' }); picBtn.disabled = false; } }, h('span', { html: icon('image', 16) }), 'Нарисовать');
    const facts = [];
    if (w.kind === 'n' && w.pl) facts.push(['мн. число', `die ${w.pl}`]);
    if (w.kind === 'v') { if (w.forms) facts.push(['er/sie/es', w.forms.er + (w.sep ? ` … ${w.sep}` : '')]); facts.push(['Perfekt', w.perfect || `${w.aux === 'sein' ? 'ist' : 'hat'} ${w.pp}`]); }
    if (w.kind === 'a' && w.comp) facts.push(['сравн. / превосх.', `${w.comp} · ${w.sup}`]);
    const exBox = h('div.wd-ex'); const mnBox = h('div.wd-mnemo');
    const drawX = (ww) => {
      exBox.replaceChildren(ww.ex ? h('div.story', ww.ex.de, h('small', ww.ex.ru), h('button.speak-btn', { onclick: () => speak(ww.ex.de), html: icon('volume', 16) })) : h('div.dim', 'Примера пока нет'));
      mnBox.replaceChildren(ww.mnemo ? h('div', h('span', { html: icon('bulb', 18) }), ww.mnemo) : h('div.dim', 'Лайфхака пока нет'));
    };
    drawX(w);
    const enrich = h('button.btn.sm', { onclick: async () => { if (!app.requireAI('Лайфхаки придумывает Gemini.')) return; enrich.disabled = true; app.scene.setThinking(true); try { await enrichWord(w); drawX(wordById(w.id)); } catch (e) { toast(describeError(e), { kind: 'err' }); } app.scene.setThinking(false); enrich.disabled = false; } }, h('span', { html: icon('sparkles', 16) }), 'Пример и лайфхак от ИИ');
    const box = h('div.col', { style: { gap: '16px' } },
      h('div.wd-head', vis, h('div', h('div.eyebrow', `${TOPICS[w.topic]?.ru || w.topic} · ${(w.lvl || 'a2').toUpperCase()}`), h('div.wd-word', w.art ? h('span', { style: { color: ARTICLE_COLOR[w.art] } }, w.art) : null, ' ', w.de), h('div.wd-ru', w.ru))),
      h('div.row.wrap', h('button.btn.sm', { onclick: () => speak(label(w)) }, h('span', { html: icon('volume', 16) }), 'Послушать'), h('button.btn.sm', { onclick: () => speak(label(w), { slow: true }) }, h('span', { html: icon('turtle', 16) }), 'Медленно'), picBtn),
      facts.length ? h('div.wd-facts', facts.map(([k, v]) => h('div', h('small', k), h('b', v)))) : null,
      exBox, mnBox,
      h('div.wd-ladder', h('small', 'Лестница запоминания'), h('div.rungs', Array.from({ length: 6 }, (_, i) => h('i', { class: (info?.box ?? -1) >= i && info?.seen ? 'on' : '' })))),
      h('div.row.wrap', { style: { justifyContent: 'space-between' } }, enrich,
        h('div.row', h('button.btn.sm', { onclick: () => { const x = model.recordWord(w.id, false); x.box = 0; x.due = 0; model.save(); toast('Вернул в повторение'); d.close(); draw(); } }, 'Повторить'), h('button.btn.sm.primary', { onclick: () => { const x = model.recordWord(w.id, true); x.box = 4; x.due = Date.now() + 14 * 86400000; model.save(); toast('Отмечено: знаю'); d.close(); draw(); } }, 'Знаю'))));
    const d = drawer(box);
    if (getSettings().images && aiReady() && !vis.classList.contains('has-img')) { /* offer, don't auto-spend */ }
    return d;
  }
  return { async unmount() { await fadeOut(root.querySelectorAll('.page-body > *'), { each: 0.02, dur: 0.25 }); } };
}
