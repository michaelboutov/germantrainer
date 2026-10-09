// The morphology engine must be right — wrong German in an exercise is worse than no exercise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, participle, participleParts, auxOf, VERBS, NOUNS, ADJECTIVES, MODALS } from '../public/js/content/lexicon.js';

const row = (inf) => Object.values(conjugate(inf)).slice(0, 6).join(' ');

test('regular present tense', () => {
  assert.equal(row('machen'), 'mache machst macht machen macht machen');
  assert.equal(row('wohnen'), 'wohne wohnst wohnt wohnen wohnt wohnen');
  assert.equal(row('lernen'), 'lerne lernst lernt lernen lernt lernen');
  assert.equal(row('arbeiten'), 'arbeite arbeitest arbeitet arbeiten arbeitet arbeiten');
  assert.equal(row('finden'), 'finde findest findet finden findet finden');
  assert.equal(row('tanzen'), 'tanze tanzt tanzt tanzen tanzt tanzen');
  assert.equal(row('reisen'), 'reise reist reist reisen reist reisen');
  assert.equal(row('öffnen'), 'öffne öffnest öffnet öffnen öffnet öffnen');
  assert.equal(row('kosten'), 'koste kostest kostet kosten kostet kosten');
  assert.equal(row('putzen'), 'putze putzt putzt putzen putzt putzen');
});

test('irregular present tense', () => {
  assert.equal(row('fahren'), 'fahre fährst fährt fahren fahrt fahren');
  assert.equal(row('lesen'), 'lese liest liest lesen lest lesen');
  assert.equal(row('essen'), 'esse isst isst essen esst essen');
  assert.equal(row('nehmen'), 'nehme nimmst nimmt nehmen nehmt nehmen');
  assert.equal(row('sprechen'), 'spreche sprichst spricht sprechen sprecht sprechen');
  assert.equal(row('werden'), 'werde wirst wird werden werdet werden');
  assert.equal(row('wissen'), 'weiß weißt weiß wissen wisst wissen');
  assert.equal(row('halten'), 'halte hältst hält halten haltet halten');
  assert.equal(row('helfen'), 'helfe hilfst hilft helfen helft helfen');
  assert.equal(row('gehen'), 'gehe gehst geht gehen geht gehen');
});

test('separable verbs conjugate from their base', () => {
  assert.equal(conjugate('aufstehen').sep, 'auf');
  assert.equal(conjugate('aufstehen').er, 'steht');
  assert.equal(conjugate('fernsehen').er, 'sieht');
  assert.equal(conjugate('einladen').er, 'lädt');
  assert.equal(conjugate('anfangen').du, 'fängst');
});

test('Partizip II', () => {
  const want = { machen: 'gemacht', arbeiten: 'gearbeitet', öffnen: 'geöffnet', besuchen: 'besucht', bezahlen: 'bezahlt', studieren: 'studiert',
    telefonieren: 'telefoniert', erklären: 'erklärt', lesen: 'gelesen', essen: 'gegessen', fahren: 'gefahren', gehen: 'gegangen', wissen: 'gewusst',
    verstehen: 'verstanden', vergessen: 'vergessen', aufstehen: 'aufgestanden', einkaufen: 'eingekauft', anrufen: 'angerufen',
    fernsehen: 'ferngesehen', aufräumen: 'aufgeräumt', anfangen: 'angefangen', einladen: 'eingeladen', mitnehmen: 'mitgenommen',
    abholen: 'abgeholt', aufwachen: 'aufgewacht', umziehen: 'umgezogen', anziehen: 'angezogen', ankommen: 'angekommen', denken: 'gedacht',
    bringen: 'gebracht', reisen: 'gereist', schwimmen: 'geschwommen', gefallen: 'gefallen', frühstücken: 'gefrühstückt', warten: 'gewartet' };
  for (const [inf, pp] of Object.entries(want)) assert.equal(participle(inf), pp, inf);
});

test('participle tiles always re-assemble into the participle', () => {
  for (const v of VERBS) assert.equal(participleParts(v.de).join(''), participle(v.de), v.de);
  assert.deepEqual(participleParts('machen'), ['ge', 'mach', 't']);
  assert.deepEqual(participleParts('aufstehen'), ['auf', 'ge', 'stand', 'en']);
  assert.deepEqual(participleParts('besuchen'), ['be', 'such', 't']);
  assert.deepEqual(participleParts('arbeiten'), ['ge', 'arbeit', 'et']);
});

test('auxiliary choice', () => {
  for (const v of ['gehen', 'fahren', 'kommen', 'bleiben', 'werden', 'aufstehen', 'ankommen', 'schwimmen', 'laufen']) assert.equal(auxOf(v), 'sein', v);
  for (const v of ['machen', 'lesen', 'essen', 'schlafen', 'sitzen', 'stehen', 'einkaufen', 'anrufen']) assert.equal(auxOf(v), 'haben', v);
});

test('lexicon is well-formed', () => {
  const ids = new Set();
  for (const n of NOUNS) {
    assert.ok(['der', 'die', 'das'].includes(n.art), n.de);
    assert.ok(!ids.has(n.id), 'duplicate ' + n.id); ids.add(n.id);
    assert.ok(n.ru, n.de);
  }
  for (const a of ADJECTIVES) assert.ok(a.comp && a.sup.startsWith('am '), a.de);
  for (const [k, m] of Object.entries(MODALS)) assert.equal(m.pres.length, 6, k);
  assert.ok(NOUNS.length > 150 && VERBS.length > 60);
});
