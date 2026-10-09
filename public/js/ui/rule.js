// The rule card: what the rule says, a mnemonic, examples — and a way to practise it right now.
import { h, esc } from '../util.js';
import { icon } from '../icons.js';
import { SKILL, LEVELS, palOf } from '../content/skills.js';
import { itemsOf } from '../engine/builders.js';
import * as model from '../engine/model.js';
import { modal, ring, sigil, toast } from './kit.js';
import { speak } from '../voice.js';
import { moreSentences, canGenerateNow } from '../ai.js';
import { aiReady, describeError } from '../gemini.js';

export function openRule(app, skillId) {
  const sk = SKILL[skillId]; if (!sk) return null;
  const pal = palOf(skillId); const p = model.skillState(skillId).n ? model.mastery(skillId) : 0; const st = model.status(skillId);
  const stName = { locked: 'пока закрыто', new: 'новое', learning: 'учим', practiced: 'почти освоено', mastered: 'освоено', review: 'пора повторить' }[st];
  const ex = () => itemsOf(skillId).filter((i) => i.src !== 'ai').slice(0, 4).concat(itemsOf(skillId).filter((i) => i.src === 'ai').slice(-2));
  const exBox = h('div.rule-ex');
  const drawEx = () => { exBox.replaceChildren(...ex().map((i) => h('div.rule-ex-row', h('div.rx-de.story', { html: esc(i.de).replace(/\{([^}|]+)[^}]*\}/, '<mark>$1</mark>') }), h('div.rx-ru', i.ru), h('button.speak-btn', { 'aria-label': 'Послушать', html: icon('volume', 16), onclick: () => speak(i.full) })))); };
  drawEx();
  const more = h('button.btn', { disabled: !aiReady(), title: aiReady() ? '' : 'Нужен ключ Gemini', onclick: async () => {
    if (!canGenerateNow()) { toast('Подожди секунду…'); return; }
    more.disabled = true; app.scene.setThinking(true);
    try { const n = await moreSentences(skillId, { n: 6 }); drawEx(); toast(n ? `Gemini добавил ${n} примеров` : 'Новых примеров не нашлось'); } catch (e) { toast(describeError(e), { kind: 'err' }); }
    app.scene.setThinking(false); more.disabled = false;
  } }, h('span', { html: icon('sparkles', 16) }), 'Ещё примеры от ИИ');
  const body = h('div.col.rule', { style: { gap: '16px' } },
    h('div.rule-head', h('span.sig', { style: { color: pal[0] }, html: sigil(skillId, 54) }),
      h('div', h('div.eyebrow', `${LEVELS[sk.lvl].name} · ${sk.de}`), h('h2', sk.title)),
      h('div.rule-ring', ring(p, { size: 52, stroke: 6, label: `${Math.round(p * 100)}`, color: pal[0] }), h('small', stName))),
    h('div.rule-core', { html: sk.rule }),
    h('ul.rule-points', sk.points.map((pt) => h('li', { html: pt }))),
    h('div.rule-mnemo', h('span', { html: icon('bulb', 18) }), h('div', sk.mnemo)),
    h('div.eyebrow', 'Примеры'), exBox,
    h('div.row', { style: { flexWrap: 'wrap', justifyContent: 'flex-end' } }, more,
      h('button.btn.primary', { disabled: st === 'locked', onclick: (e) => { box.close(); setTimeout(() => app.startSession({ mode: 'skill', skillId }, e.currentTarget), 350); } }, h('span', { html: icon('play', 16) }), st === 'locked' ? 'Закрыто' : 'Тренировать')));
  const box = modal(body, { wide: true });
  return box;
}
