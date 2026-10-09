// Karte: every rule as a card with its own colour world, a mastery ring and a lock until its prerequisites are getting there.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { SKILLS, SKILL, LEVELS, PALETTES, palOf } from '../content/skills.js';
import * as model from '../engine/model.js';
import { ring, sigil, fadeOut, stagger } from './kit.js';
import { spotlight } from '../util.js';
import { shell } from './shell.js';
import { weakestSkills } from '../engine/picker.js';
import { progressPanel } from './progress.js';

const STATUS = { locked: ['закрыто', 'lock'], new: ['новое', 'sparkles'], learning: ['учим', 'brain'], practiced: ['почти освоено', 'target'], mastered: ['освоено', 'check'], review: ['пора повторить', 'refresh'] };

export async function mount(app) {
  const { header, bottom } = shell(app, 'map');
  const ov = model.overview();
  const levels = ['a1', 'a2', 'b1'].map((lvl) => {
    const list = SKILLS.filter((s) => s.lvl === lvl);
    const avg = list.reduce((a, s) => a + (model.skillState(s.id).n ? model.mastery(s.id) : 0), 0) / list.length;
    const done = list.filter((s) => model.isMastered(s.id)).length;
    const cards = list.map((s) => {
      const st = model.status(s.id); const p = model.mastery(s.id); const pal = PALETTES[s.pal];
      const [stName, stIc] = STATUS[st];
      const locked = st === 'locked';
      const need = locked ? s.req.filter((r) => !model.isMastered(r) && model.mastery(r) < (s.lvl === 'b1' ? 0.6 : 0.5)).map((r) => SKILL[r]?.title).filter(Boolean) : [];
      const card = h('button.skill-card.' + st, { style: { '--p1': pal[0], '--p2': pal[1], '--p3': pal[2] }, onclick: () => app.openRule(s.id), 'aria-label': s.title },
        h('div.sc-top', h('span.sc-sig', { html: sigil(s.id, 46) }), ring(model.skillState(s.id).n ? p : 0, { size: 46, stroke: 5, label: locked || !model.skillState(s.id).n ? '' : `${Math.round(p * 100)}`, color: pal[0] })),
        h('div.sc-title', s.title), h('div.sc-de', s.de),
        h('div.sc-foot', h('span.sc-status', h('span', { html: icon(stIc, 14) }), stName), model.skillState(s.id).n ? h('span.sc-n', `${model.skillState(s.id).n} отв.`) : null),
        locked && need.length ? h('div.sc-need', `сначала: ${need.slice(0, 2).join(', ')}`) : null);
      spotlight(card);
      return card;
    });
    return { lvl, list, avg, done, cards };
  });

  const focus = weakestSkills(3);
  const sections = levels.map((L) => h('section.map-sec', h('div.section-h', h('h2', LEVELS[L.lvl].name), h('div', h('b', LEVELS[L.lvl].title), h('small', ` · ${LEVELS[L.lvl].sub}`)), h('div.grow'), h('div.sec-prog', ring(L.avg, { size: 44, stroke: 5, label: '', color: 'var(--c1)' }), h('small', `${L.done}/${L.list.length} освоено`))),
    h('div.skill-grid', L.cards)));
  const root = h('section.screen.page', header,
    h('div.page-body',
      h('div', h('div.eyebrow', 'Karte'), h('h1.display.page-title', 'Правила'), h('p.page-sub', 'Всё, что знает тренажёр. Нажми на карточку — прочитай правило и потренируйся. Новые правила открываются сами, когда ты уверенно освоил предыдущие.')),
      progressPanel(),
      focus.length ? h('div.glass.focus-card', h('span', { html: icon('target', 22) }), h('div.grow', h('b', 'Сейчас важнее всего: '), focus.map((s, i) => [i ? ', ' : '', h('a.fc-link', { onclick: (e) => app.startSession({ mode: 'skill', skillId: s.id }, e.currentTarget) }, s.title)])), h('button.btn.sm.primary', { onclick: (e) => app.startSession({ mode: 'flow' }, e.currentTarget) }, 'Умный раунд')) : null,
      ...sections),
    bottom);
  app.root.append(root);
  app.setPalette(PALETTES.calm);
  stagger(root.querySelectorAll('.skill-card'), { each: 0.025, dur: 0.6, y: 20, blur: 6, delay: 0.1 });
  return { async unmount() { await fadeOut(root.querySelectorAll('.page-body > *'), { each: 0.02, dur: 0.25 }); } };
}
