// Exercise builders: turn sentence-bank lines and vocabulary into concrete exercises.
// Every builder returns a plain object that the UI components in ui/ex/*.js know how to render:
//
//   { id, key, skill, type, tier, ask, tag, rule?, note?, full?, say?, hideText?, hideRu?, src, ...payload }
//
//   types: choice · type · order · bucket · match · table · errorhunt · flash · picture · speak
//
// `key` is the memory key (sentence or word) used for spaced repetition and "come back to my mistakes".
import { BANK, MEANING_SKILLS } from '../content/sentences.js';
import { SKILL } from '../content/skills.js';
import {
  NOUNS, VERBS, ADJECTIVES, PHRASES, WORD_BY_ID, MODALS, POSSESSIVE, REFLEXIVE, PRON, PRON_KEYS,
  conjugate, participle, participleParts, auxOf, isSeparable, label, ARTICLE_COLOR,
} from '../content/lexicon.js';
import { shuffle, pick, sample, hash, uid } from '../util.js';
import { norm } from './check.js';
import { state, itemInfo, wordInfo, dueItems } from './model.js';

const A = ['der', 'die', 'das'];
const ART_BINS = A.map((a) => ({ id: a, label: a, color: ARTICLE_COLOR[a] }));
const ASK = {
  choice: 'Выбери подходящее слово', type: 'Впиши пропущенное слово', order: 'Собери предложение', errorhunt: 'Найди ошибку в предложении',
  table: 'Перетащи формы в таблицу', bucket: 'Раздели по группам', match: 'Найди пары', dictation: 'Послушай и запиши', listenOrder: 'Послушай и собери предложение',
  morph: 'Собери слово из частей', speak: 'Скажи вслух',
};

const base = (skill, type, tier, extra) => ({ id: uid(), skill, type, tier, tag: skill, src: 'gen', ...extra });

// ───────────────────────────── the sentence bank ─────────────────────────────────────────────
const MOVABLE = new Set(['heute', 'gestern', 'morgen', 'jetzt', 'oft', 'manchmal', 'immer', 'meistens', 'abends', 'morgens', 'nachmittags', 'jeden', 'jede', 'jedes',
  'schon', 'dann', 'danach', 'auch', 'gern', 'gerne', 'noch', 'bald', 'leider', 'bitte', 'zuerst', 'später', 'früh', 'spät', 'nie', 'selten', 'wieder', 'sehr']);

export function parseItem(de, ru = '', note = '') {
  const m = /\{([^{}]+)\}/.exec(de);
  if (!m) return null;
  const alts = m[1].split('|').map((s) => s.trim()).filter(Boolean);
  if (alts.length < 2 || new Set(alts.map(norm)).size !== alts.length) return null;
  const before = de.slice(0, m.index); const after = de.slice(m.index + m[0].length);
  if (/\{|\}/.test(before + after)) return null;
  return { de, ru, note: note || '', alts, correct: alts[0], before, after, full: `${before}${alts[0]}${after}`.replace(/\s+/g, ' ').trim() };
}

const parsedCache = new Map();
/** All sentence items for a skill: built-in bank + AI-written ones. */
export function itemsOf(skillId) {
  const out = [];
  (BANK[skillId] || []).forEach((row, i) => {
    const ck = `${skillId}#${i}`;
    if (!parsedCache.has(ck)) parsedCache.set(ck, parseItem(row[0], row[1], row[2]));
    const p = parsedCache.get(ck);
    if (p) out.push({ key: ck, skill: skillId, ...p, src: 'bank' });
  });
  for (const a of state.aiBank[skillId] || []) {
    const p = parseItem(a.de, a.ru, a.note);
    if (p) out.push({ key: `${skillId}@${a.id}`, skill: skillId, ...p, src: 'ai' });
  }
  return out;
}
export const allItemKeys = () => Object.keys(BANK).flatMap((s) => (BANK[s] || []).map((_, i) => `${s}#${i}`));
export function findItem(key) {
  const [skill] = key.split(/[#@]/);
  return itemsOf(skill).find((it) => it.key === key) || null;
}

const tokens = (s) => s.trim().split(/\s+/).filter(Boolean);
const stripP = (t) => t.replace(/[.,!?;:]/g, '');
const isPermutation = (alts) => { const k = (a) => tokens(a).map(norm).sort().join('|'); return alts.every((a) => k(a) === k(alts[0])); };
function canOrder(it) {
  const t = tokens(it.full);
  if (t.length < 3 || t.length > 12) return false;
  if (isPermutation(it.alts)) return true; // the words before the gap get locked in place
  // sentences with freely movable adverbs have several valid orders — don't ask those as "build it"
  return !t.some((w, i) => { const x = stripP(w); return i === 0 ? MOVABLE.has(x.toLowerCase()) : MOVABLE.has(x); });
}

function pickItem(skillId, ctx, pred = () => true, forceKey) {
  const list = itemsOf(skillId).filter(pred);
  if (forceKey) return list.find((i) => i.key === forceKey) || null;
  if (!list.length) return null;
  const due = new Set(dueItems());
  const scored = list.map((it) => {
    const inf = itemInfo(it.key);
    let s = Math.random() * 2 - (inf ? inf.seen * 0.6 : 0) + (due.has(it.key) ? 4 : 0) + (it.src === 'ai' ? 0.8 : 0);
    if (ctx.recentKeys?.has(it.key)) s -= 8;
    return [s, it];
  }).sort((a, b) => b[0] - a[0]);
  return scored[0][1];
}

const BLANK = '___';
function sentenceWithBlank(it) { return `${it.before}${BLANK}${it.after}`.replace(/\s+/g, ' ').trim(); }
const common = (it, tier, extra) => ({
  id: uid(), key: it.key, skill: it.skill, tier, tag: it.skill, src: it.src, rule: SKILL[it.skill]?.rule, note: it.note, full: it.full, ru: it.ru, showRu: MEANING_SKILLS.has(it.skill), ...extra,
});

export function fromItem(it, kind, ctx = {}) {
  const alts = it.alts;
  switch (kind) {
    case 'choice': {
      const options = shuffle(alts.slice(0, 4));
      return common(it, 1, { type: 'choice', ask: ASK.choice, sentence: sentenceWithBlank(it), options, answer: it.correct, say: it.full });
    }
    case 'type': {
      if (tokens(it.correct).length > 2) return null;
      return common(it, 3, { type: 'type', ask: ASK.type, sentence: sentenceWithBlank(it), answers: [it.correct], say: it.full, hint: it.ru });
    }
    case 'order': {
      if (!canOrder(it)) return null;
      const all = tokens(it.full);
      let given = [];
      if (isPermutation(alts)) { const pre = tokens(it.before); given = pre.length ? pre : []; }
      const rest = all.slice(given.length);
      const have = new Set(all.map((w) => norm(w)));
      const extra = alts.slice(1).filter((a) => tokens(a).length === 1 && !have.has(norm(a))).slice(0, 2);
      return common(it, 2, { type: 'order', ask: ASK.order, pool: shuffle([...rest, ...extra]), answers: [all], given, join: ' ', say: it.full, hint: given.length ? 'Первое слово уже стоит на месте' : '' });
    }
    case 'errorhunt': {
      const wrong = pick(alts.slice(1));
      const a = tokens(it.before).length;
      const bad = `${it.before}${wrong}${it.after}`.replace(/\s+/g, ' ').trim();
      const tk = tokens(bad);
      const fixes = shuffle(alts.filter((x) => x !== wrong).slice(0, 3));
      return common(it, 2, { type: 'errorhunt', ask: ASK.errorhunt, tokens: tk, span: [a, a + tokens(wrong).length - 1], fixes, fix: it.correct, wrongText: wrong, say: it.full });
    }
    case 'dictation': {
      if (!ctx.voiceOk || tokens(it.full).length > 9) return null;
      return common(it, 3, { type: 'type', mode: 'dictation', ask: ASK.dictation, answers: [it.full], say: it.full, hideText: true, strand: 'x.hoeren' });
    }
    case 'listenOrder': {
      if (!ctx.voiceOk) return null;
      const all = tokens(it.full);
      if (all.length < 3 || all.length > 10) return null;
      const have = new Set(all.map((w) => norm(w)));
      const extra = alts.slice(1).filter((a) => tokens(a).length === 1 && !have.has(norm(a))).slice(0, 1);
      return common(it, 3, { type: 'order', ask: ASK.listenOrder, pool: shuffle([...all, ...extra]), answers: [all], given: [], join: ' ', say: it.full, hideText: true, hideRu: true, strand: 'x.hoeren' });
    }
    default: return null;
  }
}

const KINDS = {
  1: [['choice', 4]],
  2: [['order', 3], ['errorhunt', 3], ['choice', 1]],
  3: [['type', 4], ['errorhunt', 1.5], ['dictation', 1.1], ['listenOrder', 1.1], ['order', 1]],
};

// ───────────────────────────── vocabulary helpers ────────────────────────────────────────────
export const allWords = () => [...NOUNS, ...VERBS, ...ADJECTIVES, ...PHRASES, ...state.userWords];
export const wordById = (id) => {
  const w = WORD_BY_ID[id] || state.userWords.find((x) => x.id === id) || null;
  const extra = w && state.profile?.enrich?.[id];
  return extra ? { ...w, ex: w.ex || extra.ex, mnemo: w.mnemo || extra.mnemo } : w;
};

/** Prefer words you know least — new ones and recently-missed ones. */
function pickWords(list, n, ctx = {}) {
  const now = Date.now();
  const scored = list.map((w) => {
    const info = wordInfo(w.id);
    let s = Math.random() * 1.6;
    if (!info || !info.seen) s += 1.5; else { s += (5 - info.box) * 0.7 + (info.due <= now ? 1.2 : -0.6) + info.wrong * 0.25; }
    if (ctx.recentKeys?.has(w.id)) s -= 6;
    return [s, w];
  }).sort((a, b) => b[0] - a[0]);
  return scored.slice(0, n).map((x) => x[1]);
}
const pickOne = (list, ctx) => pickWords(list, 1, ctx)[0];
const nounList = () => [...NOUNS, ...state.userWords.filter((w) => w.kind === 'n')];
const withPl = () => nounList().filter((n) => n.pl);
const card = (w) => ({ id: w.id, label: w.de, sub: w.ru, emoji: w.emoji });

// ───────────────────────────── morphology helpers ────────────────────────────────────────────
function umlaut(s) {
  return s.replace(/(au|a|o|u)([^aouäöüeiy]*)$/i, (m, v, rest) => ({ a: 'ä', o: 'ö', u: 'ü', au: 'äu', A: 'Ä', O: 'Ö', U: 'Ü', Au: 'Äu' }[v] || v) + rest);
}
function wrongPlurals(n, count = 2) {
  const sg = n.de; const endE = /e$/.test(sg); const um = umlaut(sg);
  const c = new Set();
  if (!endE) { c.add(`${sg}e`); c.add(`${sg}en`); if (um !== sg) { c.add(`${um}e`); c.add(`${um}er`); } c.add(`${sg}er`); }
  else { c.add(`${sg}n`); c.add(`${sg}s`); }
  c.add(`${sg}s`); c.add(sg); if (um !== sg) c.add(um);
  return shuffle([...c].filter((x) => x !== n.pl && !/ee$|ss$|nn$/.test(x) && x.length > 2)).slice(0, count);
}
function pluralClass(n) {
  const { de: sg, pl } = n;
  if (pl === sg || pl === umlaut(sg)) return 'none';
  if (/s$/.test(pl) && !/s$/.test(sg) && !/sse$/.test(pl) && !/ses$/.test(pl)) return 's';
  if (/n$/.test(pl) && !/n$/.test(sg)) return 'n';
  if (/er$/.test(pl) && !/er$/.test(sg)) return 'er';
  if (/e$/.test(pl) && !/e$/.test(sg)) return 'e';
  return 'none';
}
const PL_BINS = [{ id: 'e', label: '-e / ¨e', color: '#7b7bff' }, { id: 'n', label: '-(e)n', color: '#ff8a5c' }, { id: 'er', label: '-er / ¨er', color: '#22b58a' }, { id: 's', label: '-s', color: '#ff5d73' }, { id: 'none', label: '— / ¨', color: '#5aa9ff' }];
function wrongParticiples(inf, count = 2) {
  const pp = participle(inf); const stem = inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);
  const c = new Set([`ge${stem}t`, `ge${stem}en`, `${stem}t`, `ge${stem}et`, `${stem}en`]);
  if (pp.startsWith('ge')) c.add(pp.slice(2));
  if (!/^(ge|be|ver|er|ent|zer)/.test(pp)) c.add(`ge${pp}`);
  return shuffle([...c].filter((x) => x !== pp && x.length > 3)).slice(0, count);
}
const pronForms = (inf) => PRON_KEYS.map((k) => conjugate(inf)[k]);
const distractForms = (inf, n = 2) => {
  const f = conjugate(inf); const set = new Set(Object.values(f).filter((x) => typeof x === 'string'));
  const stem = inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1);
  const c = [`${stem}st`, `${stem}t`, `${stem}e`, `${stem}en`, `${stem}est`].filter((x) => !set.has(x));
  return shuffle(c).slice(0, n);
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ───────────────────────────── generators (non-sentence exercises) ───────────────────────────
const G = {
  // ── gender ──
  artBucket(ctx, sk = 'a1.artikel') {
    const pool = nounList();
    const per = { der: [], die: [], das: [] };
    pickWords(pool, 60, ctx).forEach((w) => { if (per[w.art].length < 2) per[w.art].push(w); });
    const cards = shuffle(Object.values(per).flat());
    if (cards.length < 5) return null;
    return base(sk, 'bucket', 1, { ask: 'Какой артикль у слова? Перетащи', bins: ART_BINS, cards: cards.map((w) => ({ ...card(w), bin: w.art })), tag: 'gender', key: cards[0].id });
  },
  artChoice(ctx, sk = 'a1.artikel') {
    const w = pickOne(nounList(), ctx);
    return base(sk, 'choice', 1, { ask: 'Какой артикль?', sentence: `___ ${w.de}`, big: true, ru: w.ru, emoji: w.emoji, options: A, answer: w.art, colors: ARTICLE_COLOR, full: `${w.art} ${w.de}`, say: `${w.art} ${w.de}`, tag: 'gender', key: w.id, word: w.id });
  },
  artType(ctx, sk = 'a1.artikel') {
    const w = pickOne(nounList(), ctx);
    return base(sk, 'type', 3, { ask: 'Впиши артикль', sentence: `___ ${w.de}`, big: true, ru: w.ru, emoji: w.emoji, answers: [w.art], full: `${w.art} ${w.de}`, say: `${w.art} ${w.de}`, tag: 'gender', key: w.id, word: w.id, hint: w.ru });
  },
  // ── plural ──
  pluralChoice(ctx) {
    const w = pickOne(withPl(), ctx); const wrong = wrongPlurals(w, 2);
    if (wrong.length < 2) return null;
    return base('a1.plural', 'choice', 1, { ask: 'Выбери множественное число', sentence: `${w.art} ${w.de} → die ___`, big: true, ru: w.ru, emoji: w.emoji, options: shuffle([w.pl, ...wrong]), answer: w.pl, full: `die ${w.pl}`, say: `die ${w.pl}`, tag: 'plural', key: w.id, word: w.id });
  },
  pluralType(ctx) {
    const w = pickOne(withPl(), ctx);
    return base('a1.plural', 'type', 3, { ask: 'Впиши множественное число', sentence: `${w.art} ${w.de} → die ___`, big: true, ru: w.ru, emoji: w.emoji, answers: [w.pl], full: `die ${w.pl}`, say: `die ${w.pl}`, tag: 'plural', key: w.id, word: w.id, hint: w.ru });
  },
  pluralBucket(ctx) {
    const pool = shuffle(pickWords(withPl(), 40, ctx));
    const seen = {}; const cards = [];
    for (const w of pool) { const c = pluralClass(w); if ((seen[c] || 0) < 2 && cards.length < 6) { seen[c] = (seen[c] || 0) + 1; cards.push({ ...card(w), sub: `${w.art} ${w.de} → die ${w.pl}`, label: w.pl, bin: c }); } }
    if (cards.length < 5) return null;
    return base('a1.plural', 'bucket', 2, { ask: 'Как образуется множественное число? Перетащи', bins: PL_BINS, cards: shuffle(cards), tag: 'plural', key: cards[0].id });
  },
  // ── verb tables ──
  tableConj(ctx, skill, filter) {
    const list = VERBS.filter((v) => !v.sep && filter(v));
    const v = pickOne(list, ctx);
    if (!v) return null;
    const forms = pronForms(v.de);
    return base(skill, 'table', 2, { ask: ASK.table, title: `${v.de}`, subtitle: v.ru, rows: PRON.map((p, i) => ({ label: p, cells: [forms[i]] })), pool: shuffle([...forms, ...distractForms(v.de, 2)]), tag: 'conj', key: v.id, word: v.id });
  },
  tableSeinHaben(ctx) {
    const inf = pick(['sein', 'haben']); const m = MODALS[inf]; const other = MODALS[inf === 'sein' ? 'haben' : 'sein'];
    return base('a1.sein-haben', 'table', 2, { ask: ASK.table, title: inf, subtitle: m.ru, rows: PRON.map((p, i) => ({ label: p, cells: [m.pres[i]] })), pool: shuffle([...m.pres, ...sample(other.pres.filter((x) => !m.pres.includes(x)), 2)]), tag: 'conj', key: `m:${inf}` });
  },
  typeSeinHaben() {
    const inf = pick(['sein', 'haben']); const i = Math.floor(Math.random() * 6); const m = MODALS[inf];
    return base('a1.sein-haben', 'type', 3, { ask: 'Впиши форму глагола', sentence: `${PRON[i]} ___ (${inf})`, big: true, answers: [m.pres[i]], tag: 'conj', key: `m:${inf}`, hint: m.ru });
  },
  choiceSeinHaben() {
    const inf = pick(['sein', 'haben']); const i = Math.floor(Math.random() * 6); const m = MODALS[inf]; const o = MODALS[inf === 'sein' ? 'haben' : 'sein'];
    const wrong = shuffle([o.pres[i], m.pres[(i + 1) % 6], m.pres[(i + 2) % 6]].filter((x) => x !== m.pres[i])).slice(0, 2);
    return base('a1.sein-haben', 'choice', 1, { ask: 'Выбери форму', sentence: `${PRON[i]} ___ (${inf})`, big: true, options: shuffle([m.pres[i], ...wrong]), answer: m.pres[i], tag: 'conj', key: `m:${inf}` });
  },
  typeConj(ctx, skill, filter, only) {
    const v = pickOne(VERBS.filter((x) => !x.sep && filter(x)), ctx);
    if (!v) return null;
    const idx = only ? pick(only) : Math.floor(Math.random() * 6);
    const f = pronForms(v.de);
    return base(skill, 'type', 3, { ask: 'Впиши форму глагола', sentence: `${PRON[idx]} ___ (${v.de})`, big: true, answers: [f[idx]], hint: v.ru, tag: 'conj', key: v.id, word: v.id, full: `${PRON[idx].split('/')[0]} ${f[idx]}`, say: `${PRON[idx].split('/')[0]} ${f[idx]}` });
  },
  choiceConjIrr(ctx) {
    const v = pickOne(VERBS.filter((x) => !x.sep && IRR.has(x.de)), ctx);
    const idx = pick([1, 2]); const f = pronForms(v.de); const stem = v.de.slice(0, -2);
    const regular = idx === 1 ? `${stem}st` : `${stem}t`;
    const other = f[idx === 1 ? 2 : 1];
    const opts = [...new Set([f[idx], regular, other])];
    if (opts.length < 3) return null;
    return base('a1.praesens-irr', 'choice', 1, { ask: 'Выбери правильную форму', sentence: `${PRON[idx]} ___ (${v.de})`, big: true, options: shuffle(opts), answer: f[idx], hint: v.ru, tag: 'conj', key: v.id, word: v.id });
  },
  tableModal(ctx) {
    const inf = pick(['können', 'müssen', 'wollen', 'dürfen', 'sollen', 'möchten']); const m = MODALS[inf];
    return base('a1.modal', 'table', 2, { ask: ASK.table, title: inf, subtitle: m.ru, rows: PRON.map((p, i) => ({ label: p, cells: [m.pres[i]] })), pool: shuffle([...m.pres, ...sample(Object.values(MODALS).flatMap((x) => x.pres).filter((x) => !m.pres.includes(x)), 2)]), tag: 'conj', key: `m:${inf}` });
  },
  typeModal() {
    const inf = pick(['können', 'müssen', 'wollen', 'dürfen', 'sollen']); const i = pick([0, 1, 2, 3, 4]); const m = MODALS[inf];
    return base('a1.modal', 'type', 3, { ask: 'Впиши форму модального глагола', sentence: `${PRON[i]} ___ (${inf}) das machen.`, answers: [m.pres[i]], hint: m.ru, tag: 'conj', key: `m:${inf}` });
  },
  tablePret() {
    const inf = pick(['sein', 'haben', 'können', 'müssen', 'wollen']); const m = MODALS[inf];
    return base('a2.praeteritum', 'table', 2, { ask: ASK.table, title: `${inf} · Präteritum`, subtitle: m.ru, rows: PRON.map((p, i) => ({ label: p, cells: [m.pret[i]] })), pool: shuffle([...m.pret, ...sample(Object.values(MODALS).filter((x) => x.pret).flatMap((x) => x.pret).filter((x) => !m.pret.includes(x)), 2)]), tag: 'conj', key: `m:${inf}:pret` });
  },
  typePret() {
    const inf = pick(['sein', 'haben', 'können', 'müssen', 'wollen', 'dürfen']); const i = pick([0, 1, 2, 3, 4, 5]); const m = MODALS[inf];
    return base('a2.praeteritum', 'type', 3, { ask: 'Впиши форму Präteritum', sentence: `Gestern: ${PRON[i]} ___ (${inf})`, answers: [m.pret[i]], hint: m.ru, tag: 'conj', key: `m:${inf}:pret` });
  },
  choicePret() {
    const inf = pick(['sein', 'haben', 'können', 'müssen', 'wollen', 'dürfen']); const i = pick([0, 1, 2, 3]); const m = MODALS[inf];
    const wrong = shuffle([m.pres[i], m.pret[(i + 1) % 6] === m.pret[i] ? m.pret[(i + 2) % 6] : m.pret[(i + 1) % 6], `${m.pret[i]}e`]).filter((x) => x !== m.pret[i]);
    return base('a2.praeteritum', 'choice', 1, { ask: 'Выбери форму Präteritum', sentence: `Gestern: ${PRON[i]} ___ (${inf})`, big: true, options: shuffle([m.pret[i], ...wrong.slice(0, 2)]), answer: m.pret[i], tag: 'conj', key: `m:${inf}:pret` });
  },
  tablePoss() {
    const rows = shuffle(POSSESSIVE).slice(0, 6);
    return base('a1.possessiv', 'table', 2, { ask: 'Какое притяжательное слово подходит? Перетащи', title: 'Possessivartikel', subtitle: 'владелец → слово', rows: rows.map(([p, f]) => ({ label: p, cells: [f] })), pool: shuffle([...rows.map((r) => r[1]), 'meine', 'deinen']), tag: 'possessiv', key: 'poss' });
  },
  tableRefl() {
    return base('a2.reflexiv', 'table', 2, { ask: 'Какое возвратное местоимение нужно? Перетащи', title: 'sich freuen', subtitle: 'ich freue …', rows: REFLEXIVE.map(([p, f]) => ({ label: p, cells: [f] })), pool: shuffle([...REFLEXIVE.map((r) => r[1]), 'mir', 'dir']), tag: 'reflexiv', key: 'refl' });
  },
  typeRefl() {
    const i = Math.floor(Math.random() * 6); const verb = pick([['freuen', 'auf den Urlaub'], ['waschen', ''], ['beeilen', ''], ['treffen', 'um acht']]);
    const f = conjugate(verb[0]); const pr = PRON_KEYS[i];
    const form = pr === 'wir' || pr === 'sie' ? verb[0] : f[pr];
    return base('a2.reflexiv', 'type', 3, { ask: 'Впиши возвратное местоимение', sentence: `${PRON[i].split('/')[0]} ${form} ___ ${verb[1]}`.trim() + '.', answers: [REFLEXIVE[i][1]], tag: 'reflexiv', key: 'refl', hint: `sich ${verb[0]}` });
  },
  // ── articles & cases ──
  artTable(ctx, skill, rows = ['Nominativ', 'Akkusativ', 'Dativ'], indef = false) {
    const DEF = { Nominativ: ['der', 'die', 'das', 'die'], Akkusativ: ['den', 'die', 'das', 'die'], Dativ: ['dem', 'der', 'dem', 'den'] };
    const IND = { Nominativ: ['ein', 'eine', 'ein', null], Akkusativ: ['einen', 'eine', 'ein', null], Dativ: ['einem', 'einer', 'einem', null] };
    const T = indef ? IND : DEF;
    const cols = indef ? ['ein … (m)', 'eine … (f)', 'ein … (n)', '— (Pl)'] : ['der (m)', 'die (f)', 'das (n)', 'die (Pl)'];
    const rs = rows.map((r) => ({ label: r, cells: T[r].map((c) => (c === null ? { fixed: '—' } : c)) }));
    const pool = rows.flatMap((r) => T[r]).filter(Boolean);
    return base(skill, 'table', 2, { ask: 'Заполни таблицу артиклей — перетаскивай', title: indef ? 'ein-Wörter' : 'Bestimmter Artikel', subtitle: rows.join(' · '), cols, rows: rs, pool: shuffle(pool), tag: 'artikel-table', key: `art:${rows.length}:${indef ? 'i' : 'd'}` });
  },
  pronTable(ctx, skill, kind = 'dat') {
    const DAT = [['ich', 'mir'], ['du', 'dir'], ['er', 'ihm'], ['sie', 'ihr'], ['es', 'ihm'], ['wir', 'uns'], ['ihr', 'euch'], ['sie (Pl)', 'ihnen']];
    const AKK = [['ich', 'mich'], ['du', 'dich'], ['er', 'ihn'], ['sie', 'sie'], ['es', 'es'], ['wir', 'uns'], ['ihr', 'euch'], ['sie (Pl)', 'sie']];
    const L = kind === 'dat' ? DAT : AKK; const rows = shuffle(L).slice(0, 6);
    return base(skill, 'table', 2, { ask: `Как это будет в ${kind === 'dat' ? 'Dativ' : 'Akkusativ'}? Перетащи`, title: kind === 'dat' ? 'Personalpronomen · Dativ' : 'Personalpronomen · Akkusativ', subtitle: 'Nominativ → ' + (kind === 'dat' ? 'Dativ' : 'Akkusativ'), rows: rows.map(([n, f]) => ({ label: n, cells: [f] })), pool: shuffle([...rows.map((r) => r[1]), kind === 'dat' ? 'mich' : 'mir']), tag: 'pronomen', key: `pron:${kind}` });
  },
  prepBucket(ctx, skill) {
    const DAT = ['aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu']; const AKK = ['für', 'durch', 'ohne', 'gegen', 'um'];
    const cards = shuffle([...sample(DAT, 3), ...sample(AKK, 3)]).map((p) => ({ id: p, label: p, bin: DAT.includes(p) ? 'dat' : 'akk' }));
    return base(skill, 'bucket', 1, { ask: 'Какой падеж требует предлог? Перетащи', bins: [{ id: 'dat', label: 'Dativ', color: '#a87bff' }, { id: 'akk', label: 'Akkusativ', color: '#ff7bd5' }], cards, tag: 'praeposition', key: 'prep' });
  },
  wechselBucket() {
    const W = [['liegen', 'лежать', 'dat'], ['legen', 'класть', 'akk'], ['stehen', 'стоять', 'dat'], ['stellen', 'ставить', 'akk'], ['sitzen', 'сидеть', 'dat'], ['setzen', 'сажать', 'akk'], ['gehen', 'идти', 'akk'], ['sein', 'находиться', 'dat'], ['hängen', 'висеть', 'dat'], ['hängen (tr.)', 'вешать', 'akk']];
    const cards = sample(W, 6).map(([l, s, b]) => ({ id: l, label: l, sub: s, bin: b }));
    return base('a2.wechsel', 'bucket', 1, { ask: 'Wo? или Wohin? Перетащи глагол', bins: [{ id: 'dat', label: 'Wo? → Dativ', color: '#a87bff' }, { id: 'akk', label: 'Wohin? → Akkusativ', color: '#ff7bd5' }], cards, tag: 'wechsel', key: 'wechsel' });
  },
  verbCaseBucket() {
    const D = [['helfen', 'помогать'], ['danken', 'благодарить'], ['gehören', 'принадлежать'], ['gefallen', 'нравиться'], ['schmecken', 'быть вкусным'], ['gratulieren', 'поздравлять']];
    const K = [['sehen', 'видеть'], ['kaufen', 'покупать'], ['brauchen', 'нуждаться'], ['suchen', 'искать'], ['besuchen', 'навещать'], ['lieben', 'любить']];
    const cards = shuffle([...sample(D, 3).map(([l, s]) => ({ id: l, label: l, sub: s, bin: 'dat' })), ...sample(K, 3).map(([l, s]) => ({ id: l, label: l, sub: s, bin: 'akk' }))]);
    return base('a2.dativ', 'bucket', 1, { ask: 'Dativ или Akkusativ? Перетащи глагол', bins: [{ id: 'dat', label: 'Dativ (кому?)', color: '#a87bff' }, { id: 'akk', label: 'Akkusativ (кого?)', color: '#ff7bd5' }], cards, tag: 'verb-kasus', key: 'verbcase' });
  },
  zeitBucket() {
    const AM = ['Montag', 'Freitag', 'Abend', 'Wochenende', '5. Mai', 'Nachmittag']; const UM = ['acht Uhr', 'halb neun', '20 Uhr', 'Mitternacht', 'Viertel nach drei']; const IM = ['Juli', 'Winter', 'Sommer', 'Oktober', 'Frühling', 'Januar'];
    const cards = shuffle([...sample(AM, 2), ...sample(UM, 2), ...sample(IM, 2)]).map((w) => ({ id: w, label: w, bin: AM.includes(w) ? 'am' : UM.includes(w) ? 'um' : 'im' }));
    return base('a1.praep-zeit', 'bucket', 1, { ask: 'am, um или im? Перетащи', bins: [{ id: 'am', label: 'am', color: '#ff8a5c' }, { id: 'um', label: 'um', color: '#5aa9ff' }, { id: 'im', label: 'im', color: '#22b58a' }], cards, tag: 'zeit', key: 'zeit' });
  },
  conjBucket(skill) {
    const MAIN = ['und', 'aber', 'oder', 'denn', 'sondern']; const SUB = ['weil', 'dass', 'wenn', 'ob', 'obwohl'];
    const cards = shuffle([...sample(MAIN, 3), ...sample(SUB, 3)]).map((w) => ({ id: w, label: w, bin: MAIN.includes(w) ? 'main' : 'sub' }));
    return base(skill, 'bucket', 1, { ask: 'Что происходит с глаголом? Перетащи союз', bins: [{ id: 'main', label: 'порядок как обычно', color: '#2ec4b6' }, { id: 'sub', label: 'глагол — в конец', color: '#ff6b8b' }], cards, tag: 'konjunktion', key: 'conjbucket' });
  },
  fragenMatch() {
    const Q = [['wer', 'кто'], ['was', 'что'], ['wo', 'где'], ['wohin', 'куда'], ['woher', 'откуда'], ['wann', 'когда'], ['warum', 'почему'], ['wie', 'как']];
    return base('a1.fragen', 'match', 1, { ask: ASK.match, pairs: sample(Q, 5).map(([l, r]) => ({ id: l, l, r })), tag: 'fragen', key: 'fragen' });
  },
  verbPrepMatch() {
    const P = [['warten', 'auf + Akk'], ['denken', 'an + Akk'], ['sich freuen (будущее)', 'auf + Akk'], ['sprechen', 'über + Akk'], ['träumen', 'von + Dat'], ['Angst haben', 'vor + Dat'], ['sich interessieren', 'für + Akk'], ['bitten', 'um + Akk'], ['gratulieren', 'zu + Dat'], ['sich erinnern', 'an + Akk']];
    return base('a2.verben-praep', 'match', 2, { ask: 'Какой предлог нужен? Соедини', pairs: sample(P, 5).map(([l, r], i) => ({ id: `${i}-${l}`, l, r })), tag: 'verb-praep', key: 'verbprep' });
  },
  impTable() {
    const I = { kommen: ['Komm', 'Kommt', 'Kommen Sie'], machen: ['Mach', 'Macht', 'Machen Sie'], lesen: ['Lies', 'Lest', 'Lesen Sie'], nehmen: ['Nimm', 'Nehmt', 'Nehmen Sie'], sprechen: ['Sprich', 'Sprecht', 'Sprechen Sie'], fahren: ['Fahr', 'Fahrt', 'Fahren Sie'], warten: ['Warte', 'Wartet', 'Warten Sie'], geben: ['Gib', 'Gebt', 'Geben Sie'], helfen: ['Hilf', 'Helft', 'Helfen Sie'], gehen: ['Geh', 'Geht', 'Gehen Sie'], sein: ['Sei', 'Seid', 'Seien Sie'] };
    const inf = pick(Object.keys(I)); const f = I[inf];
    return base('a1.imperativ', 'table', 2, { ask: 'Образуй Imperativ — перетащи формы', title: inf, subtitle: 'Imperativ', rows: [{ label: 'du', cells: [f[0]] }, { label: 'ihr', cells: [f[1]] }, { label: 'Sie', cells: [f[2]] }], pool: shuffle([...f, `${f[0]}st`, `${f[1]}en`]), tag: 'imperativ', key: `imp:${inf}` });
  },
  adjTable() {
    const rows = [{ label: 'Nominativ', cells: ['er', 'e', 'es', 'en'] }, { label: 'Akkusativ', cells: ['en', 'e', 'es', 'en'] }];
    return base('a2.adjektiv', 'table', 2, { ask: 'Какое окончание у прилагательного? Перетащи', title: 'ein groß… / eine groß… / ein groß…', subtitle: 'после ein / kein', cols: ['ein groß_ Hund (m)', 'eine groß_ Katze (f)', 'ein groß_ Haus (n)', 'keine groß_ Kinder (Pl)'], rows, pool: shuffle(rows.flatMap((r) => r.cells)), tag: 'adjektiv', key: 'adjtable' });
  },
  // ── perfekt ──
  perfMorph(ctx, skill, filter = () => true) {
    const v = pickOne(VERBS.filter((x) => filter(x)), ctx); if (!v) return null;
    const parts = participleParts(v.de);
    const more = shuffle(['ge', 'be', 'ver', 'er', 'ent', 't', 'et', 'en', 'auf', 'an', 'ein', 'ab', 'mit', 'ent'].filter((p) => !parts.includes(p))).slice(0, 2);
    return base(skill, 'order', 2, { ask: ASK.morph, big: true, prompt: `${v.de}`, ru: `Partizip II: ${v.ru}`, pool: shuffle([...parts, ...more]), answers: [parts], answerStrs: [participle(v.de)], given: [], join: '', full: participle(v.de), say: participle(v.de), tag: 'partizip', key: v.id, word: v.id, hint: `${auxOf(v.de)} + ${participle(v.de).length} букв` });
  },
  perfType(ctx, skill, filter = () => true) {
    const v = pickOne(VERBS.filter((x) => filter(x)), ctx); if (!v) return null;
    const idx = pick([0, 2, 3]); const aux = auxOf(v.de); const f = MODALS[aux].pres; const p = ['Ich', 'Du', 'Er', 'Wir', 'Ihr', 'Sie'][idx];
    return base(skill, 'type', 3, { ask: 'Впиши Partizip II', sentence: `${p} ${f[idx]} ___ (${v.de}).`, answers: [participle(v.de)], hint: v.ru, full: `${p} ${f[idx]} ${participle(v.de)}.`, say: `${p} ${f[idx]} ${participle(v.de)}.`, tag: 'partizip', key: v.id, word: v.id });
  },
  perfChoice(ctx, skill, filter = () => true) {
    const v = pickOne(VERBS.filter((x) => filter(x)), ctx); if (!v) return null;
    const wrong = wrongParticiples(v.de, 2); if (wrong.length < 2) return null;
    return base(skill, 'choice', 1, { ask: 'Выбери Partizip II', sentence: `${v.de} → ___`, big: true, ru: v.ru, options: shuffle([participle(v.de), ...wrong]), answer: participle(v.de), full: participle(v.de), say: participle(v.de), tag: 'partizip', key: v.id, word: v.id });
  },
  auxBucket(ctx, skill) {
    const sein = sample(VERBS.filter((v) => v.aux === 'sein' && !v.sep), 3); const haben = sample(VERBS.filter((v) => v.aux === 'haben' && !v.sep), 3);
    const cards = shuffle([...sein, ...haben]).map((v) => ({ id: v.id, label: v.de, sub: v.ru, bin: v.aux }));
    return base(skill, 'bucket', 1, { ask: 'haben или sein в Perfekt? Перетащи глагол', bins: [{ id: 'haben', label: 'haben', color: '#ffb347' }, { id: 'sein', label: 'sein', color: '#5aa9ff' }], cards, tag: 'hilfsverb', key: 'aux' });
  },
  partMatch(ctx, skill, filter = () => true) {
    const vs = sample(VERBS.filter((v) => !v.sep && filter(v)), 5);
    if (vs.length < 4) return null;
    return base(skill, 'match', 2, { ask: 'Найди Partizip II к глаголу', pairs: vs.map((v) => ({ id: v.id, l: v.de, r: participle(v.de) })), tag: 'partizip', key: 'partmatch' });
  },
  sepBucket(skill) {
    const SEP = VERBS.filter((v) => v.sep); const INS = VERBS.filter((v) => !v.sep && /^(be|ver|er|ent|zer)/.test(v.de) && v.de.length > 6);
    const cards = shuffle([...sample(SEP, 3).map((v) => ({ id: v.id, label: v.de, sub: v.ru, bin: 'sep' })), ...sample(INS, 3).map((v) => ({ id: v.id, label: v.de, sub: v.ru, bin: 'ins' }))]);
    return base(skill, 'bucket', 1, { ask: 'Приставка отделяется или нет? Перетащи глагол', bins: [{ id: 'sep', label: 'trennbar (auf|stehen)', color: '#5aa9ff' }, { id: 'ins', label: 'untrennbar (be|suchen)', color: '#ff6b8b' }], cards, tag: 'trennbar', key: 'sep' });
  },
  // ── comparison ──
  compType(ctx) {
    const a = pickOne(ADJECTIVES.filter((x) => x.de !== 'viel' && x.de !== 'gern'), ctx);
    const sup = Math.random() < 0.4;
    return base('a2.komparativ', 'type', 3, { ask: sup ? 'Впиши Superlativ' : 'Впиши Komparativ', sentence: sup ? `${a.de} → ${a.comp} → ___` : `${a.de} → ___`, big: true, answers: [sup ? a.sup : a.comp], hint: a.ru, full: sup ? a.sup : a.comp, say: sup ? a.sup : a.comp, tag: 'komparativ', key: a.id, word: a.id });
  },
  compChoice(ctx) {
    const a = pickOne(ADJECTIVES, ctx); const um = umlaut(a.de);
    const wrong = shuffle([...new Set([`${a.de}er`, `${um}er`, `mehr ${a.de}`, `${a.de}ere`])]).filter((x) => x !== a.comp).slice(0, 2);
    if (wrong.length < 2) return null;
    return base('a2.komparativ', 'choice', 1, { ask: 'Выбери Komparativ', sentence: `${a.de} → ___`, big: true, ru: a.ru, options: shuffle([a.comp, ...wrong]), answer: a.comp, full: a.comp, say: a.comp, tag: 'komparativ', key: a.id, word: a.id });
  },
  compMatch(ctx) {
    const xs = sample(ADJECTIVES, 5);
    return base('a2.komparativ', 'match', 2, { ask: 'Найди Komparativ к прилагательному', pairs: xs.map((a) => ({ id: a.id, l: a.de, r: a.comp })), tag: 'komparativ', key: 'compmatch' });
  },
};
const IRR = new Set(VERBS.filter((v) => ['fahren', 'schlafen', 'laufen', 'tragen', 'lesen', 'sehen', 'essen', 'geben', 'nehmen', 'sprechen', 'helfen', 'treffen', 'werden', 'wissen', 'waschen', 'halten', 'fallen', 'lassen', 'vergessen'].includes(v.de)).map((v) => v.de));
const regVerb = (v) => !IRR.has(v.de) && !['gehen', 'kommen', 'bleiben', 'finden'].includes(v.de) && v.lvl === 'a1';

// skill → which generators apply at which tier (w = weight)
const GENS = {
  'a1.artikel': [{ k: 'artBucket', t: 1, w: 4 }, { k: 'artChoice', t: 1, w: 3 }, { k: 'artType', t: 3, w: 3 }, { k: 'artBucket', t: 2, w: 2 }],
  'a1.sein-haben': [{ k: 'choiceSeinHaben', t: 1, w: 3 }, { k: 'tableSeinHaben', t: 2, w: 4 }, { k: 'typeSeinHaben', t: 3, w: 4 }],
  'a1.praesens': [{ k: 'tableConjReg', t: 2, w: 4 }, { k: 'typeConjReg', t: 3, w: 4 }, { k: 'tableConjReg', t: 1, w: 2 }],
  'a1.praesens-irr': [{ k: 'choiceConjIrr', t: 1, w: 4 }, { k: 'tableConjIrr', t: 2, w: 4 }, { k: 'typeConjIrr', t: 3, w: 4 }],
  'a1.fragen': [{ k: 'fragenMatch', t: 1, w: 3 }],
  'a1.akkusativ': [{ k: 'artTableAkk', t: 2, w: 4 }, { k: 'pronAkk', t: 2, w: 2 }],
  'a1.plural': [{ k: 'pluralChoice', t: 1, w: 4 }, { k: 'pluralBucket', t: 2, w: 3 }, { k: 'pluralType', t: 3, w: 4 }],
  'a1.possessiv': [{ k: 'tablePoss', t: 2, w: 3 }],
  'a1.modal': [{ k: 'tableModal', t: 2, w: 4 }, { k: 'typeModal', t: 3, w: 4 }],
  'a1.trennbar': [{ k: 'sepBucket1', t: 1, w: 3 }],
  'a1.imperativ': [{ k: 'impTable', t: 2, w: 3 }],
  'a1.praep-zeit': [{ k: 'zeitBucket', t: 1, w: 3 }],
  'a2.dativ': [{ k: 'verbCaseBucket', t: 1, w: 3 }, { k: 'artTableDat', t: 2, w: 4 }, { k: 'pronDat', t: 2, w: 3 }, { k: 'artTableInd', t: 2, w: 2 }],
  'a2.dativ-praep': [{ k: 'prepBucket1', t: 1, w: 4 }],
  'a2.akk-praep': [{ k: 'prepBucket2', t: 1, w: 4 }],
  'a2.wechsel': [{ k: 'wechselBucket', t: 1, w: 3 }],
  'a2.perfekt-haben': [{ k: 'perfChoiceH', t: 1, w: 3 }, { k: 'perfMorphH', t: 2, w: 4 }, { k: 'perfTypeH', t: 3, w: 4 }, { k: 'sepBucket2', t: 1, w: 2 }, { k: 'partMatchH', t: 2, w: 2 }],
  'a2.perfekt-sein': [{ k: 'auxBucket1', t: 1, w: 4 }, { k: 'perfMorphS', t: 2, w: 3 }, { k: 'perfTypeS', t: 3, w: 3 }, { k: 'partMatchS', t: 2, w: 2 }, { k: 'perfChoiceS', t: 1, w: 2 }],
  'a2.praeteritum': [{ k: 'choicePret', t: 1, w: 3 }, { k: 'tablePret', t: 2, w: 4 }, { k: 'typePret', t: 3, w: 4 }],
  'a2.weil-dass': [{ k: 'conjBucket1', t: 1, w: 3 }],
  'a2.konjunktionen': [{ k: 'conjBucket2', t: 1, w: 3 }],
  'a2.adjektiv': [{ k: 'adjTable', t: 2, w: 3 }],
  'a2.komparativ': [{ k: 'compChoice', t: 1, w: 3 }, { k: 'compMatch', t: 2, w: 3 }, { k: 'compType', t: 3, w: 4 }],
  'a2.reflexiv': [{ k: 'tableRefl', t: 2, w: 3 }, { k: 'typeRefl', t: 3, w: 3 }],
  'a2.verben-praep': [{ k: 'verbPrepMatch', t: 2, w: 3 }],
};
const GEN_FN = {
  artBucket: (c) => G.artBucket(c), artChoice: (c) => G.artChoice(c), artType: (c) => G.artType(c),
  choiceSeinHaben: () => G.choiceSeinHaben(), tableSeinHaben: (c) => G.tableSeinHaben(c), typeSeinHaben: () => G.typeSeinHaben(),
  tableConjReg: (c) => G.tableConj(c, 'a1.praesens', regVerb), typeConjReg: (c) => G.typeConj(c, 'a1.praesens', regVerb),
  tableConjIrr: (c) => G.tableConj(c, 'a1.praesens-irr', (v) => IRR.has(v.de)), typeConjIrr: (c) => G.typeConj(c, 'a1.praesens-irr', (v) => IRR.has(v.de), [1, 2]), choiceConjIrr: (c) => G.choiceConjIrr(c),
  fragenMatch: () => G.fragenMatch(),
  artTableAkk: (c) => G.artTable(c, 'a1.akkusativ', ['Nominativ', 'Akkusativ']), pronAkk: (c) => G.pronTable(c, 'a1.akkusativ', 'akk'),
  pluralChoice: (c) => G.pluralChoice(c), pluralBucket: (c) => G.pluralBucket(c), pluralType: (c) => G.pluralType(c),
  tablePoss: () => G.tablePoss(), tableModal: (c) => G.tableModal(c), typeModal: () => G.typeModal(),
  sepBucket1: () => G.sepBucket('a1.trennbar'), impTable: () => G.impTable(), zeitBucket: () => G.zeitBucket(),
  verbCaseBucket: () => G.verbCaseBucket(), artTableDat: (c) => G.artTable(c, 'a2.dativ', ['Nominativ', 'Akkusativ', 'Dativ']), pronDat: (c) => G.pronTable(c, 'a2.dativ', 'dat'), artTableInd: (c) => G.artTable(c, 'a2.dativ', ['Nominativ', 'Akkusativ', 'Dativ'], true),
  prepBucket1: (c) => G.prepBucket(c, 'a2.dativ-praep'), prepBucket2: (c) => G.prepBucket(c, 'a2.akk-praep'), wechselBucket: () => G.wechselBucket(),
  perfChoiceH: (c) => G.perfChoice(c, 'a2.perfekt-haben', (v) => v.aux === 'haben' && !v.sep && v.lvl === 'a1'), perfMorphH: (c) => G.perfMorph(c, 'a2.perfekt-haben', (v) => v.aux === 'haben'), perfTypeH: (c) => G.perfType(c, 'a2.perfekt-haben', (v) => v.aux === 'haben' && !v.sep),
  sepBucket2: () => G.sepBucket('a2.perfekt-haben'), partMatchH: (c) => G.partMatch(c, 'a2.perfekt-haben', (v) => v.aux === 'haben'),
  auxBucket1: (c) => G.auxBucket(c, 'a2.perfekt-sein'), perfMorphS: (c) => G.perfMorph(c, 'a2.perfekt-sein', (v) => v.aux === 'sein'), perfTypeS: (c) => G.perfType(c, 'a2.perfekt-sein', (v) => v.aux === 'sein' && !v.sep), partMatchS: (c) => G.partMatch(c, 'a2.perfekt-sein', (v) => v.aux === 'sein'), perfChoiceS: (c) => G.perfChoice(c, 'a2.perfekt-sein', (v) => v.aux === 'sein' && !v.sep),
  choicePret: () => G.choicePret(), tablePret: () => G.tablePret(), typePret: () => G.typePret(),
  conjBucket1: () => G.conjBucket('a2.weil-dass'), conjBucket2: () => G.conjBucket('a2.konjunktionen'), adjTable: () => G.adjTable(),
  compChoice: (c) => G.compChoice(c), compMatch: (c) => G.compMatch(c), compType: (c) => G.compType(c),
  tableRefl: () => G.tableRefl(), typeRefl: () => G.typeRefl(), verbPrepMatch: () => G.verbPrepMatch(),
};

function weighted(options) {
  const total = options.reduce((a, o) => a + o.w, 0);
  let r = Math.random() * total;
  for (const o of options) { r -= o.w; if (r <= 0) return o; }
  return options[options.length - 1];
}

/** Build one exercise for a skill at a difficulty tier (1 recognise · 2 assemble · 3 produce). */
export function buildFor(skillId, tier, ctx = {}) {
  const opts = [];
  if (itemsOf(skillId).length) for (const [kind, w] of KINDS[tier]) opts.push({ w, run: () => { const it = pickItem(skillId, ctx, (i) => feasible(i, kind, ctx)); return it ? fromItem(it, kind, ctx) : null; } });
  for (const g of GENS[skillId] || []) {
    const d = Math.abs(g.t - tier);
    if (d > 1) continue;
    opts.push({ w: (g.w || 3) * (d === 0 ? 1 : 0.25), run: () => GEN_FN[g.k]?.(ctx) });
  }
  let pool = opts.slice();
  while (pool.length) {
    const o = weighted(pool); pool = pool.filter((x) => x !== o);
    let ex = null;
    try { ex = o.run(); } catch (e) { console.warn('builder failed', e); }
    if (ex) return decorate(ex, skillId);
  }
  // nothing at this tier: try any tier (once — no ping-pong)
  if (ctx._fb) return null;
  for (const t of [2, 1, 3]) if (t !== tier) { const ex = buildFor(skillId, t, { ...ctx, _fb: true }); if (ex) return ex; }
  return null;
}
function feasible(it, kind, ctx) {
  if (kind === 'type') return tokens(it.correct).length <= 2;
  if (kind === 'order') return canOrder(it);
  if (kind === 'dictation') return ctx.voiceOk && tokens(it.full).length <= 9;
  if (kind === 'listenOrder') return ctx.voiceOk && tokens(it.full).length >= 3 && tokens(it.full).length <= 10;
  return true;
}
function decorate(ex, skillId) {
  ex.skill ||= skillId;
  ex.rule ||= SKILL[ex.skill]?.rule;
  ex.key ||= ex.id;
  return ex;
}

/** Rebuild an exercise for a known memory key (used to bring mistakes back). */
export function rebuildKey(key, tier, ctx = {}) {
  if (/^[nvapu]:/.test(key)) { const w = wordById(key); return w ? buildWord(w, tier, ctx) : null; }
  const it = findItem(key);
  if (!it) return null;
  const options = KINDS[tier].filter(([k]) => feasible(it, k, ctx)).map(([k, w]) => ({ k, w }));
  const kind = options.length ? weighted(options).k : 'choice';
  return decorate(fromItem(it, kind, ctx) || fromItem(it, 'choice', ctx), it.skill);
}

// ───────────────────────────── vocabulary exercises ──────────────────────────────────────────
const SK_W = 'x.wortschatz';
const wbase = (w, type, tier, extra) => ({ id: uid(), key: w.id, word: w.id, skill: SK_W, type, tier, tag: 'wortschatz', src: 'word', full: label(w), say: w.kind === 'p' ? w.de : label(w), ...extra });
const optLabel = (w) => label(w);

export function buildWord(w, tier, ctx = {}) {
  const same = allWords().filter((x) => x.kind === w.kind && x.id !== w.id);
  const nounish = w.kind === 'n';
  // wrong options: all different from each other and from the right one (two words may share a translation)
  const decoys = (n, fn = optLabel) => {
    const seen = new Set([fn(w)]); const out = [];
    for (const x of shuffle(same)) { const k = fn(x); if (!seen.has(k)) { seen.add(k); out.push(x); if (out.length >= n) break; } }
    return out;
  };
  if (w.kind === 'p') return buildPhrase(w, tier, ctx);
  switch (tier) {
    case 1: {
      const fs = Math.random();
      if (nounish && fs < 0.55 && decoys(3).length >= 3) {
        const ds = decoys(3);
        return wbase(w, 'picture', 1, { ask: 'Что на картинке?', emoji: w.emoji, ru: w.ru, options: shuffle([optLabel(w), ...ds.map(optLabel)]), answer: optLabel(w), hasImage: true });
      }
      return wbase(w, 'flash', 1, { ask: 'Запомни слово', word: w, strand: SK_W });
    }
    case 2: {
      const r = Math.random();
      if (r < 0.45 && decoys(3, (x) => x.ru).length >= 3) return wbase(w, 'choice', 2, { ask: 'Как по-русски?', sentence: optLabel(w), big: true, options: shuffle([w.ru, ...decoys(3, (x) => x.ru).map((x) => x.ru)]), answer: w.ru, emoji: w.emoji, say: label(w), speakFirst: true });
      if (decoys(3).length >= 3) return wbase(w, 'choice', 2, { ask: 'Как по-немецки?', sentence: w.ru, big: true, options: shuffle([optLabel(w), ...decoys(3).map(optLabel)]), answer: optLabel(w), emoji: w.emoji });
      return wbase(w, 'flash', 1, { ask: 'Запомни слово', word: w, strand: SK_W });
    }
    default: {
      const r = Math.random();
      if (r < 0.4 && ctx.voiceOk) return wbase(w, 'type', 3, { ask: 'Послушай и впиши слово', mode: 'dictation', answers: [label(w)], hideText: true, say: label(w), hint: w.ru, strand: 'x.hoeren' });
      if (r < 0.65 && label(w).length >= 4 && label(w).length <= 14 && !/ /.test(w.de)) {
        const letters = [...w.de];
        return wbase(w, 'order', 3, { ask: 'Собери слово по буквам', big: true, prompt: nounish ? `${w.art} …` : '', ru: w.ru, pool: shuffle([...letters, ...sample([...'aeiourstnmdlhkbgpz'].filter((c) => !letters.includes(c)), 2)]), answers: [letters], answerStrs: [w.de], given: [], join: '', emoji: w.emoji, caseless: true });
      }
      return wbase(w, 'type', 3, { ask: 'Впиши по-немецки' + (nounish ? ' (с артиклем)' : ''), sentence: `${w.ru}  →  ___`, big: true, answers: [label(w)], emoji: w.emoji, hint: nounish ? 'der / die / das + слово' : '' });
    }
  }
}

function buildPhrase(p, tier, ctx) {
  const all = tokens(p.de);
  if (tier >= 3 && ctx.speakOk && Math.random() < 0.5) return base('x.sprechen', 'speak', 3, { ask: ASK.speak, text: p.de, ru: p.ru, full: p.de, say: p.de, key: p.id, word: p.id, tag: 'sprechen', src: 'word', strand: 'x.sprechen' });
  if (tier >= 3 && ctx.voiceOk && all.length <= 9) return base('x.hoeren', 'type', 3, { ask: ASK.dictation, mode: 'dictation', answers: [p.de], hideText: true, say: p.de, full: p.de, key: p.id, word: p.id, tag: 'hoeren', src: 'word', ru: p.ru });
  if (tier === 2 && ctx.voiceOk && Math.random() < 0.4 && all.length <= 9) return base('x.hoeren', 'order', 2, { ask: ASK.listenOrder, pool: shuffle(all), answers: [all], given: [], join: ' ', say: p.de, full: p.de, hideText: true, hideRu: true, key: p.id, word: p.id, tag: 'hoeren', src: 'word', ru: p.ru });
  return wbase(p, 'order', Math.max(2, tier), { ask: 'Переведи — собери фразу', pool: shuffle(all), answers: [all], given: [], join: ' ', ru: p.ru, say: p.de, full: p.de, big: false });
}

/** First-contact vocabulary round: a match-up of 5 words (nice as a warm-up). */
export function buildWordMatch(ctx = {}) {
  const ws = pickWords([...nounList(), ...ADJECTIVES, ...VERBS.filter((v) => !v.sep)], 5, ctx);
  if (ws.length < 4) return null;
  return base(SK_W, 'match', 2, { ask: 'Найди пары: слово — перевод', pairs: ws.map((w) => ({ id: w.id, l: label(w), r: w.ru, emoji: w.emoji })), tag: 'wortschatz', key: ws[0].id, word: ws[0].id, src: 'word', words: ws.map((w) => w.id) });
}
export function buildPictureMatch(ctx = {}) {
  const ws = pickWords(nounList().filter((n) => n.emoji), 5, ctx);
  if (ws.length < 4) return null;
  return base(SK_W, 'match', 1, { ask: 'Соедини картинку со словом', pairs: ws.map((w) => ({ id: w.id, l: label(w), r: w.emoji, emoji: true })), tag: 'wortschatz', key: ws[0].id, word: ws[0].id, src: 'word', words: ws.map((w) => w.id), pictures: true });
}
export function buildArticleRound(ctx = {}) { return G.artBucket(ctx, SK_W); }

export const wordBox = (id) => wordInfo(id)?.box ?? 0;
export { pickWords, tokens as tokenize, G as GENERATORS, ASK };
