// Home: one big button. Press it and the trainer picks what you need next.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { SKILL, PALETTES, SKILLS, palOf } from '../content/skills.js';
import * as model from '../engine/model.js';
import { weakestSkills } from '../engine/picker.js';
import { saveSettings, getSettings, backendMode, aiReady, backendInfo } from '../gemini.js';
import { VoiceInput } from '../mic.js';
import { revealWords, fadeOut, magnetic, ring, toast, sigil } from './kit.js';
import { shell } from './shell.js';

const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'Gute Nacht' : hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Guten Tag' : 'Guten Abend'; };

export async function mount(app) {
  const ov = model.overview();
  const first = ov.answered === 0;
  const s = getSettings();
  const g = window.gsap;
  const { header, bottom } = shell(app, 'home');
  let mic = null;

  const slot = h('div.planet-slot');
  const letters = [...'Fluss'].map((c) => h('span.ltr', c));
  const blob = h('div.blob');
  const h1 = h('h1.display.title-h1', { 'aria-label': 'Fluss' }, letters, blob);
  const sub = h('p.light-h.title-sub', `${greeting()}.`);
  const lead = h('p.title-lead', first
    ? 'Тренажёр немецкого A1–A2: перетаскивай, собирай, слушай, говори. Он запоминает твои ошибки и сам подбирает следующее задание.'
    : 'Просто нажми — я подберу задания под твой уровень, ошибки и слова, которые пора повторить.');

  const go = (e) => app.startSession({ mode: 'flow' }, e?.currentTarget);
  const begin = h('button.btn.primary.lg', { onclick: go }, h('span', { html: icon('play', 16) }), first ? 'Los geht’s' : 'Weiter üben');
  const vocab = h('button.btn.lg', { onclick: (e) => app.startSession({ mode: 'vocab' }, e.currentTarget) }, h('span', { html: icon('cards', 18) }), 'Слова');
  const talk = h('button.btn.lg', { onclick: () => app.go('chat') }, h('span', { html: icon('chat', 18) }), 'Разговор');
  magnetic(begin);

  // — notices
  const notes = [];
  if (backendMode() === 'none') {
    notes.push(h('div.glass.notice', h('span', { html: icon('key', 18) }), h('span', 'Подключи Gemini — будут объяснения, новые слова, голос и картинки.'),
      h('button.btn.sm', { onclick: () => app.openSettings({ focus: 'key' }) }, 'Ключ'), h('button.btn.sm.primary', { onclick: () => { saveSettings({ demo: true }); app.refresh(); } }, 'Без ИИ')));
  }
  if (first) {
    const seg = h('div.seg', [['a1', 'Начинаю с A1'], ['a2', 'Я на A2'], ['a2plus', 'A2+ (уверенно)']].map(([id, name]) => h('button', { class: s.level === id ? 'on' : '', onclick: (e) => { saveSettings({ level: id }); model.reset(); model.save(); [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); toast('Стартовый уровень выбран'); } }, name)));
    notes.push(h('div.glass.notice.level', h('span', 'С какого уровня начнём?'), seg));
  }

  // — today strip
  const goal = s.dailyGoal || 20; const done = ov.today.n;
  const focus = weakestSkills(1)[0];
  const strip = h('div.today',
    h('div.t-item', ring(Math.min(1, done / goal), { size: 44, stroke: 5, label: '' }), h('div', h('b', done >= goal ? 'Цель дня ✓' : `${done}/${goal}`), h('small', done >= goal ? `${done} заданий сегодня` : 'заданий сегодня'))),
    h('div.t-item', h('span.t-ic.fire', { html: icon('flame', 22) }), h('div', h('b', ov.streak || 0), h('small', 'дней подряд'))),
    focus ? h('button.t-item.focus', { onclick: (e) => app.startSession({ mode: 'skill', skillId: focus.id }, e.currentTarget) }, h('span.t-ic', { style: { color: palOf(focus.id)[0] }, html: icon('target', 22) }), h('div', h('b', focus.title), h('small', first ? 'с этого можно начать' : 'сегодняшний фокус'))) : null);

  const hero = h('section.title-hero', h1, sub, lead, h('div.cta', begin, vocab, talk), ...notes, first ? null : strip);

  // — ask pill
  const input = h('input', { placeholder: 'Спроси что угодно про немецкий — «почему dem, а не den?»', maxlength: 240, onkeydown: (e) => { if (e.key === 'Enter') submit(); } });
  const mbtn = h('button.micbtn', { 'aria-label': 'Голосом', title: 'Сказать голосом', html: icon('mic', 20), onclick: toggleMic });
  const goBtn = h('button.go', { 'aria-label': 'Спросить', html: icon('send', 18), onclick: submit });
  const foot = h('footer.title-foot', h('div.ask', input, mbtn, goBtn));
  function submit() { const q = input.value.trim(); if (!q) { input.focus(); return; } input.value = ''; app.askTutor(q); }
  function toggleMic() {
    if (mic?.state === 'listening') { mic.stop(); return; }
    if (!VoiceInput.available) { toast('Голосовой ввод не поддерживается этим браузером.', { kind: 'warn' }); return; }
    mic = new VoiceInput('ru-RU'); app.mic = mic;
    mic.on('state', (st) => mbtn.classList.toggle('live', st === 'listening'));
    mic.on('interim', (t) => { input.value = t; });
    mic.on('final', (t) => { if (t) { input.value = t; setTimeout(() => { if (input.value.trim() === t.trim()) submit(); }, 900); } });
    mic.on('error', () => toast('Не получилось включить микрофон.', { kind: 'err' }));
    mic.start();
  }

  // — thumbs: the rules that need you most
  const thumbs = h('aside.thumbs');
  weakestSkills(5).forEach((sk) => {
    const pal = PALETTES[sk.pal]; const p = model.mastery(sk.id);
    thumbs.append(h('button.thumb', { 'data-tip': `${sk.title} · ${Math.round(p * 100)}%`, style: { '--p1': pal[0], background: `linear-gradient(135deg, color-mix(in srgb, ${pal[0]} 35%, #fff), color-mix(in srgb, ${pal[1]} 40%, #fff))`, color: `color-mix(in srgb, ${pal[0]} 70%, #1c1208)` }, onclick: (e) => app.startSession({ mode: 'skill', skillId: sk.id }, e.currentTarget), html: sigil(sk.id, 28) }));
  });
  const credit = h('div.credit', 'fluss ', h('span', 'Deutsch'));

  const root = h('section.screen.title', header, hero, foot, thumbs, credit, slot, bottom);
  app.root.append(root);

  // — 3D + palette: the planet rises, colours drift through the rules
  app.scene.anchor('orb', slot, { fill: 0.8 });
  const pals = Object.values(PALETTES); let i = 0;
  app.setPalette(pals[0]);
  const cycle = setInterval(() => { i = (i + 1) % pals.length; app.setPalette(pals[i]); app.scene.pulse(0.45); }, 5200);

  if (g) {
    const mid = 2;
    const tl = g.timeline({ delay: 0.15 });
    tl.from(letters, { yPercent: 118, rotate: 7, filter: 'blur(22px)', duration: 1.2, stagger: 0.07, ease: 'expo.out' })
      .fromTo(blob, { opacity: 0, scale: 0.15 }, { opacity: 0.95, scale: 1.1, duration: 0.9, ease: 'power3.out' }, '-=0.55')
      .to(letters.slice(0, mid), { x: '-0.16em', duration: 0.9, ease: 'expo.out' }, '<')
      .to(letters.slice(mid), { x: '0.16em', duration: 0.9, ease: 'expo.out' }, '<')
      .add(() => app.scene.pulse(1.8), '-=0.2')
      .to(blob, { opacity: 0, scale: 2.2, filter: 'blur(40px)', duration: 0.9, ease: 'power2.in' }, '+=0.15')
      .to(letters, { x: 0, duration: 1.3, ease: 'elastic.out(1, 0.55)' }, '<0.05');
    revealWords(sub, { delay: 1.1, each: 0.07 });
    g.from([lead, ...root.querySelectorAll('.cta > *, .notice, .today')], { opacity: 0, y: 24, filter: 'blur(10px)', stagger: 0.08, delay: 1.3, duration: 0.9, ease: 'power3.out', clearProps: 'filter,transform' });
    g.from([...header.children, ...foot.children, credit, ...thumbs.children], { opacity: 0, y: 16, stagger: 0.04, delay: 0.5, duration: 0.8, ease: 'power3.out', clearProps: 'transform' });
  }
  return {
    async unmount() {
      clearInterval(cycle); mic?.cancel?.();
      await fadeOut(root.querySelectorAll('.title-hero > *, .top > *, .ask, .thumbs'), { each: 0.012, dur: 0.28 });
    },
  };
}
