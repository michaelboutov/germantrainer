// Fehler: what you got wrong, the pairs you keep confusing, and a coach that reads it all and writes a plan.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { SKILL, titleOf, palOf, PALETTES } from '../content/skills.js';
import * as model from '../engine/model.js';
import { coach } from '../ai.js';
import { aiReady, describeError } from '../gemini.js';
import { fadeOut, stagger, magnetic, toast } from './kit.js';
import { shell } from './shell.js';

const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'только что'; if (m < 60) return `${m} мин назад`; const hr = Math.round(m / 60); if (hr < 24) return `${hr} ч назад`; return `${Math.round(hr / 24)} дн назад`; };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function mount(app) {
  const { header, bottom } = shell(app, 'mistakes');
  app.setPalette(PALETTES.rose);
  const ms = model.state.mistakes;
  const conf = model.topConfusions(10);
  const bySkill = {};
  ms.forEach((m) => { bySkill[m.skill] = (bySkill[m.skill] || 0) + 1; });
  const ranked = Object.entries(bySkill).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = ranked[0]?.[1] || 1;

  const coachBox = h('div.coach');
  const askCoach = h('button.btn.lg', { onclick: runCoach }, h('span', { html: icon('sparkles', 18) }), 'Анализ от тренера');
  async function runCoach() {
    if (!app.requireAI('Анализирует ошибки Gemini.')) return;
    askCoach.disabled = true; coachBox.replaceChildren(h('div.glass.coach-card', h('div.shimmer'), h('div.shimmer', { style: { width: '80%' } }), h('div.shimmer', { style: { width: '60%' } }))); app.scene.setThinking(true);
    try {
      const c = await coach();
      coachBox.replaceChildren(h('div.glass.coach-card',
        h('div.eyebrow', 'Тренер'), h('h2', c.headline), c.praise ? h('p.praise', `👍 ${c.praise}`) : null,
        c.insights?.length ? h('ul', c.insights.map((i) => h('li', i))) : null,
        c.focus?.length ? h('div', h('div.eyebrow', { style: { margin: '6px 0 8px' } }, 'Сфокусируйся на'), h('div.chips', c.focus.map((f) => h('button.chip.sel-chip', { onclick: (e) => app.startSession({ mode: 'skill', skillId: f.skill }, e.currentTarget) }, h('b', SKILL[f.skill].title), h('small', ` · ${f.why}`))))) : null,
        c.tip ? h('div.coach-tip', h('span', { html: icon('bulb', 18) }), c.tip) : null));
      stagger(coachBox.querySelectorAll('.coach-card > *'), { each: 0.06, dur: 0.5 });
    } catch (e) { coachBox.replaceChildren(h('p.muted', describeError(e))); }
    app.scene.setThinking(false); askCoach.disabled = false;
  }
  const drill = h('button.btn.primary.lg', { onclick: (e) => app.startSession({ mode: 'mistakes' }, e.currentTarget) }, h('span', { html: icon('refresh', 18) }), 'Тренировать ошибки');
  magnetic(drill);

  const body = [];
  if (!ms.length) {
    body.push(h('div.glass.empty-ai', h('span', { html: icon('check', 28) }), h('div', h('b', 'Пока ошибок нет'), h('p.muted', 'Занимайся — и я начну запоминать, на чём ты спотыкаешься. Эти данные потом попадают в задания и в анализ тренера.')), h('button.btn.primary', { onclick: (e) => app.startSession({ mode: 'flow' }, e.currentTarget) }, 'Начать')));
  } else {
    body.push(h('div.row.wrap', drill, askCoach), coachBox);
    if (conf.length) body.push(h('section.mist-sec', h('div.eyebrow', 'Что ты чаще всего путаешь'),
      h('div.conf-cloud', conf.map((c, i) => { const [a, b] = c.pair.split('→'); return h('button.conf', { style: { '--s': 1 + Math.min(1.4, c.n / (conf[0].n || 1)) * 0.5 }, title: `${c.n}×`, onclick: (e) => c.skill && SKILL[c.skill] ? app.openRule(c.skill) : null }, h('span.cf-a', a), h('span.cf-ar', '→'), h('b.cf-b', b), h('small', `×${c.n}`)); }))));
    body.push(h('section.mist-sec', h('div.eyebrow', 'По правилам'),
      h('div.bars', ranked.map(([id, n]) => h('button.bar-row', { onclick: () => SKILL[id] && app.openRule(id) }, h('span.bl', titleOf(id)), h('span.bt', h('i', { style: { width: `${(n / max) * 100}%`, background: palOf(id)[0] } })), h('b', n))))));
    body.push(h('section.mist-sec', h('div.eyebrow', 'Последние ошибки'),
      h('div.mist-list', [...ms].reverse().slice(0, 30).map((m) => h('div.mist-row', h('div.mr-top', h('span.mr-skill', { style: { '--c': palOf(m.skill)[0] } }, titleOf(m.skill)), h('small', ago(m.t))),
        m.prompt ? h('div.mr-p.story', m.prompt) : null, h('div.mr-d', m.given && m.given !== '—' ? h('span.given', m.given) : null, h('span', '→ '), h('b', m.expected)))))));
  }
  const root = h('section.screen.page', header, h('div.page-body',
    h('div', h('div.eyebrow', 'Fehler'), h('h1.display.page-title', 'Ошибки'), h('p.page-sub', 'Каждая ошибка попадает сюда. Тренажёр возвращает их в задания в других формах, а тренер ищет закономерности.')), ...body), bottom);
  app.root.append(root);
  stagger(root.querySelectorAll('.mist-sec, .glass'), { each: 0.08, dur: 0.6, delay: 0.1 });
  return { async unmount() { await fadeOut(root.querySelectorAll('.page-body > *'), { each: 0.02, dur: 0.25 }); } };
}
