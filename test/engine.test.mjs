// The engine: content is valid, every builder yields a renderable exercise, and the picker really adapts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../public/js/content/sentences.js';
import { SKILLS, SKILL } from '../public/js/content/skills.js';
import { parseItem, buildFor, itemsOf, buildWord, buildWordMatch, buildPictureMatch, allWords } from '../public/js/engine/builders.js';
import * as M from '../public/js/engine/model.js';
import { Session } from '../public/js/engine/picker.js';
import { compareTyped } from '../public/js/engine/check.js';
import { shuffle } from '../public/js/util.js';

const CTX = { voiceOk: true, speakOk: true, recentKeys: new Set() };

test('every skill has a rule, and every bank line parses', () => {
  for (const s of SKILLS) { assert.ok(s.rule && s.points.length && s.mnemo, s.id); for (const r of s.req) assert.ok(SKILL[r], `${s.id} requires unknown ${r}`); }
  for (const [id, rows] of Object.entries(BANK)) {
    assert.ok(SKILL[id], `bank for unknown skill ${id}`);
    assert.ok(rows.length >= 6, `${id} has only ${rows.length} lines`);
    for (const [de, ru] of rows) {
      const p = parseItem(de, ru);
      assert.ok(p, `unparseable: ${de}`);
      assert.ok(ru && ru.length > 3, `no translation: ${de}`);
      assert.ok(p.alts.length >= 2 && p.alts.length <= 4, `${de}: ${p.alts.length} options`);
      assert.ok(/[.?!]$/.test(p.full), `no end punctuation: ${p.full}`);
    }
  }
  for (const s of SKILLS) assert.ok(BANK[s.id]?.length, `no sentences for ${s.id}`);
});

function validate(ex) {
  assert.ok(ex && ex.type && ex.skill && ex.id, 'missing basics ' + JSON.stringify(ex)?.slice(0, 120));
  assert.ok([1, 2, 3].includes(ex.tier), 'tier');
  switch (ex.type) {
    case 'choice': assert.ok(ex.options.length >= 2 && ex.options.includes(ex.answer), 'choice answer in options'); assert.equal(new Set(ex.options).size, ex.options.length, 'distinct options'); break;
    case 'type': assert.ok(ex.answers.length && ex.answers[0], 'type answers'); break;
    case 'order': {
      const need = ex.answers[0].slice(ex.given.length).map((s) => s.toLowerCase()).sort();
      const have = ex.pool.map((s) => s.toLowerCase());
      for (const t of need) { const i = have.indexOf(t); assert.ok(i >= 0, `order token "${t}" missing from pool of ${ex.full}`); have.splice(i, 1); }
      break;
    }
    case 'bucket': { const ids = new Set(ex.bins.map((b) => b.id)); assert.ok(ex.cards.length >= 4); for (const c of ex.cards) assert.ok(ids.has(c.bin), 'card bin ' + c.bin); break; }
    case 'match': assert.ok(ex.pairs.length >= 3); assert.equal(new Set(ex.pairs.map((p) => p.l)).size, ex.pairs.length); break;
    case 'table': {
      const pool = [...ex.pool]; const need = ex.rows.flatMap((r) => r.cells).filter((c) => typeof c === 'string');
      for (const c of need) { const i = pool.indexOf(c); assert.ok(i >= 0, `table cell "${c}" missing from pool in ${ex.title}`); pool.splice(i, 1); }
      break;
    }
    case 'errorhunt': assert.ok(ex.tokens.length && ex.fixes.includes(ex.fix) && ex.span[1] < ex.tokens.length); break;
    case 'picture': assert.ok(ex.options.includes(ex.answer)); break;
    case 'flash': assert.ok(ex.word?.de); break;
    case 'speak': assert.ok(ex.text); break;
    default: assert.fail('unknown type ' + ex.type);
  }
}

test('every skill builds valid exercises at every tier', () => {
  M.reset();
  for (const s of SKILLS) for (const tier of [1, 2, 3]) for (let i = 0; i < 12; i++) {
    const ex = buildFor(s.id, tier, { ...CTX, recentKeys: new Set() });
    assert.ok(ex, `${s.id} tier ${tier}: nothing built`);
    try { validate(ex); } catch (e) { e.message = `${s.id} t${tier} ${ex.type}: ${e.message}`; throw e; }
  }
});

test('every word builds valid exercises at every tier', () => {
  M.reset();
  for (const w of shuffle(allWords()).slice(0, 220)) for (const tier of [1, 2, 3]) { const ex = buildWord(w, tier, CTX); assert.ok(ex, w.id); validate(ex); }
  validate(buildWordMatch(CTX)); validate(buildPictureMatch(CTX));
});

test('typed answers: forgiving about case and umlauts, strict about German', () => {
  assert.equal(compareTyped('dem', ['dem']).ok, true);
  assert.equal(compareTyped('Dem', ['dem']).ok, true);
  assert.equal(compareTyped('schoener', ['schöner']).note, 'umlaut');
  assert.equal(compareTyped('den', ['dem']).ok, false);
  assert.equal(compareTyped('krank bin', ['krank bin']).ok, true);
});

test('the picker adapts: a strong learner moves up and on, a weak one stays and retries', () => {
  M.reset();
  // strong learner answers everything right
  let s = new Session({ size: 400, ctx: CTX });
  const tiers = [];
  for (let i = 0; i < 400; i++) { const ex = s.next(); assert.ok(ex, 'session ran dry at ' + i); validate(ex); tiers.push(ex.tier); s.report(ex, { correct: true, score: 1 }); }
  const mastered = SKILLS.filter((x) => M.isMastered(x.id));
  assert.ok(mastered.length >= 10, `only ${mastered.length} skills mastered after 400 perfect answers`);
  const early = tiers.slice(0, 40).reduce((a, b) => a + b, 0) / 40; const late = tiers.slice(-40).reduce((a, b) => a + b, 0) / 40;
  assert.ok(late >= early, `difficulty should not fall for a perfect learner (${early} → ${late})`);
  assert.ok(M.overview().xp > 2000);

  // weak learner gets everything wrong
  M.reset();
  s = new Session({ size: 120, ctx: CTX });
  let retries = 0;
  for (let i = 0; i < 120; i++) { const ex = s.next(); assert.ok(ex); if (ex.retry) retries++; s.report(ex, { correct: false, score: 0, given: 'x', expected: 'y', errors: [{ given: 'x', expected: 'y' }] }); }
  assert.ok(retries > 10, `mistakes should come back (saw ${retries} retries)`);
  assert.equal(SKILLS.filter((x) => M.isMastered(x.id)).length, 0);
  assert.ok(M.state.mistakes.length > 50);
  assert.ok(M.topConfusions(1)[0].pair === 'x→y');
});

test('progression: new rules unlock only once their prerequisites are getting there', () => {
  M.reset();
  assert.equal(M.isUnlocked('a1.artikel'), true);
  assert.equal(M.isUnlocked('b1.passiv'), false);
  assert.equal(M.status('b1.passiv'), 'locked');
  M.skillState('a1.satzbau').p = 0.9; M.skillState('a1.fragen').p = 0.9;
  assert.equal(M.isUnlocked('a1.fragen'), true);
});

test('mistake mode brings your errors back', () => {
  M.reset();
  const s = new Session({ size: 6, ctx: CTX });
  const ex = buildFor('a2.dativ', 1, CTX);
  M.logMistake({ skill: ex.skill, kind: ex.type, key: ex.key, given: 'den', expected: 'dem', prompt: ex.sentence });
  const m = new Session({ mode: 'mistakes', size: 5, ctx: CTX });
  const first = m.next();
  assert.ok(first, 'a mistake session should have material');
});
