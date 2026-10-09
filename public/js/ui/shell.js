// The header (wordmark · tabs · streak · level · settings) and the bottom nav for phones.
import { h } from '../util.js';
import { icon } from '../icons.js';
import * as model from '../engine/model.js';

export const TABS = [['home', 'Üben', 'home'], ['map', 'Karte', 'map'], ['words', 'Wörter', 'cards'], ['chat', 'Gespräch', 'chat'], ['mistakes', 'Fehler', 'notebook']];

export function shell(app, active) {
  const ov = model.overview();
  const go = (id) => { if (id !== active) app.go(id); };
  const tabs = h('nav.tabs', TABS.map(([id, name]) => h('button.tab' + (id === active ? '.on' : ''), { onclick: () => go(id) }, name)));
  const streak = h('div.pill.fire', { title: `Серия: ${ov.streak} дн. (рекорд ${ov.best || 0})` }, h('span', { html: icon('flame', 16) }), h('b', ov.streak));
  const xp = h('div.pill.xp', { title: `${ov.xp} XP` }, h('span', { html: icon('bolt', 16) }), h('b', `Lvl ${ov.level}`));
  const settings = h('button.icon-btn', { 'aria-label': 'Einstellungen', title: 'Настройки', html: icon('sliders', 20), onclick: () => app.openSettings() });
  // a small companion planet lives in the header; it spins up while the AI is thinking and dances when speech plays
  const orbChip = h('div.orb-chip', { title: 'Fluss-Kugel' });
  const header = h('header.top', h('button.wordmark', { onclick: () => go('home') }, h('i'), 'FLUSS'), tabs, h('div.top-spacer'), orbChip, streak, xp, settings);
  app.scene?.anchor('orb', orbChip, { fill: 0.98 });
  const bottom = h('nav.bottom-nav', TABS.map(([id, name, ic]) => h('button' + (id === active ? '.on' : ''), { onclick: () => go(id), 'aria-label': name }, h('span', { html: icon(ic, 22) }), h('small', name))));
  return { header, bottom };
}
