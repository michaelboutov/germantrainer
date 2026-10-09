// The AI tutor layer. Everything that needs Gemini lives here, always with a graceful "no AI" path.
//   explainMistake  — a personal explanation of exactly why YOUR answer was wrong
//   moreSentences   — fresh practice sentences for a rule, aimed at YOUR confusions (same format as the bank)
//   newWords        — invents new vocabulary on a topic you choose, skipping what you know
//   coach           — reads your mistake memory and writes a plan
//   chatTurn        — a conversation partner that also corrects you (and logs those corrections)
//   askTutor        — free-form questions about German
//   wordPicture     — a Nano Banana illustration per word (cached)
import { genJSON, genText, genImage, aiReady } from './gemini.js';
import { media } from './store.js';
import { hash, uid } from './util.js';
import { SKILLS, SKILL } from './content/skills.js';
import { WORDS } from './content/lexicon.js';
import { state, mastery, status, topConfusions, overview, save, skillState } from './engine/model.js';
import { parseItem, itemsOf, allWords } from './engine/builders.js';
import { norm } from './engine/check.js';

const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const SYS = 'You are the AI engine of "Fluss", a German trainer for a Russian-speaking learner (level A2, revising A1, peeking at B1). Be precise: wrong German is worse than no answer. Write Russian explanations in a warm, informal tone and address the learner as "ты" (never "вы"). Reply with JSON only when asked for JSON.';

// ── explain a mistake ───────────────────────────────────────────────────────────────────────
const explainCache = new Map();
export async function explainMistake({ ex, given, expected }) {
  const sk = SKILL[ex.skill];
  const sentence = ex.sentence || ex.full || ex.prompt || '';
  const key = hash([ex.skill, sentence, given, expected].join('|'));
  if (explainCache.has(key)) return explainCache.get(key);
  const conf = topConfusions(4).map((c) => `${c.pair} (${c.n}×)`).join(', ') || 'none yet';
  const prompt = `TASK: explain_mistake
Exercise type: ${ex.type}
Sentence / prompt: ${sentence}
Russian meaning: ${ex.ru || '-'}
The learner answered: "${given}"
Correct answer: "${expected}"
Rule being practised: ${sk ? `${sk.title} — ${plain(sk.rule)}` : ex.tag}
This learner's most frequent confusions so far: ${conf}

Explain in simple, friendly Russian (max 70 words total) WHY the answer is wrong and how to get it right next time. Be concrete about THIS sentence.
Return JSON: {"why":"…","rule":"the rule in one short Russian sentence","tip":"a memorable trick/mnemonic in Russian","example":{"de":"a new short German example using the same rule","ru":"translation"}}`;
  const out = await genJSON({ system: SYS, prompt, temperature: 0.6, maxOutputTokens: 700, validate: (o) => { if (!o.why) throw new Error('bad'); return o; } });
  explainCache.set(key, out);
  return out;
}

// ── more practice sentences (the bank format) ───────────────────────────────────────────────
let lastGen = 0;
const lastBySkill = new Map();
export const canGenerateNow = () => aiReady() && Date.now() - lastGen > 8000;
/**
 * Budget guard for background generation: at most one batch per rule per 15 minutes (2 when the rule has almost run
 * out of material), and never beyond 48 AI sentences per rule — so a streak of mistakes can't burn API calls.
 */
export function mayGenerateFor(skillId, urgent = false) {
  if (!canGenerateNow()) return false;
  if ((state.aiBank[skillId]?.length || 0) >= 48) return false;
  return Date.now() - (lastBySkill.get(skillId) || 0) > (urgent ? 2 : 15) * 60000;
}
export function validItem(o, existing = new Set()) {
  if (!o || typeof o.de !== 'string' || typeof o.ru !== 'string') return null;
  if (/[<>]/.test(o.de + o.ru + (o.note || ''))) return null; // model output is data: never let markup in
  const p = parseItem(o.de.trim(), o.ru.trim(), (o.note || '').trim().slice(0, 220));
  if (!p) return null;
  if (p.full.split(/\s+/).length > 18 || p.full.length < 8) return null;
  if (!/[.?!]$/.test(p.full)) return null;
  if (p.alts.some((a) => a.length > 40)) return null;
  if (existing.has(norm(p.full))) return null;
  return p;
}
/**
 * Second opinion: a stricter pass that throws out gap items where a "wrong" option is actually acceptable,
 * the German is unnatural, or the translation is off. Returns the items that survive.
 */
export async function verifySentences(items) {
  if (!items.length) return items;
  const prompt = `TASK: verify_items
You are a meticulous German examiner. Each item is a gap-fill sentence: {correct|wrong1|wrong2} — the FIRST option must be the ONLY grammatical choice in that sentence; the others must be clearly wrong (never acceptable alternatives, also not in a different but valid reading, e.g. singular vs plural, another tense, another meaning).
Check each item: (a) first option gives a fully correct, natural sentence; (b) NO other option also yields a correct sentence; (c) the Russian matches the German.
Report ONLY defective items, one per line, exactly: BAD <number> :: <reason>
If all items are fine reply exactly: NONE
ITEMS:
${items.map((it, i) => `${i + 1}. ${it.de}  |  ${it.ru}`).join('\n')}`;
  try {
    const text = await genText({ system: SYS, prompt, temperature: 0, maxOutputTokens: 2500, thinking: 'low' });
    const bad = new Set([...text.matchAll(/BAD\s+(\d+)/g)].map((m) => Number(m[1]) - 1));
    return items.filter((_, i) => !bad.has(i));
  } catch { return items; } // if the check itself fails, don't block — the items already passed local validation
}

/**
 * Ask Gemini for new sentences for a rule. Stored in the AI bank and used by the picker like built-in lines.
 * `focus` = confusion pairs to aim at, e.g. ["den→dem"].
 */
export async function moreSentences(skillId, { n = 8, focus = [] } = {}) {
  const sk = SKILL[skillId];
  if (!sk) throw new Error('unknown skill');
  lastGen = Date.now(); lastBySkill.set(skillId, Date.now());
  const have = itemsOf(skillId); const seen = new Set(have.map((i) => norm(i.full)));
  const confs = focus.length ? focus : topConfusions(12).filter((c) => c.skill === skillId).map((c) => c.pair).slice(0, 4);
  const sample = have.slice(-6).map((i) => i.de).join('\n');
  const prompt = `TASK: generate_items
Write ${n} NEW German practice sentences for this grammar rule — "${sk.title}" (${sk.lvl.toUpperCase()}): ${plain(sk.rule)}
Format of each sentence: exactly ONE gap written as {correct|wrong1|wrong2}. The FIRST option is the only correct one; the others are realistic mistakes a Russian-speaking learner makes (they must be clearly WRONG in that sentence, never acceptable alternatives). Options may be several words long when the rule is about word order.
Examples of the format:
${sample}
Rules: ${sk.lvl === 'b1' ? 'B1' : 'A1–A2'} vocabulary, everyday topics, 5–13 words, natural German, vary subjects/verbs/topics, end with . ? or !. Add the Russian translation ("ru") and a one-sentence Russian explanation of why the answer is right ("note").
${confs.length ? `This learner keeps confusing: ${confs.join(', ')} — make at least half of the sentences train exactly these.` : ''}
Do not repeat these sentences: ${have.slice(-8).map((i) => i.full).join(' / ')}
Return JSON: {"items":[{"de":"…{…|…|…}…","ru":"…","note":"…"}]}`;
  const raw = await genJSON({ system: SYS, prompt, temperature: 1, maxOutputTokens: 4000, validate: (o) => { if (!Array.isArray(o.items)) throw new Error('bad'); return o; } });
  const bank = (state.aiBank[skillId] ||= []);
  const fresh = [];
  for (const o of raw.items) {
    const p = validItem(o, seen);
    if (!p) continue;
    seen.add(norm(p.full));
    fresh.push(p);
  }
  let added = 0;
  for (const p of await verifySentences(fresh)) {
    bank.push({ id: hash(p.full), de: p.de, ru: p.ru, note: p.note, t: Date.now() });
    added++;
  }
  if (bank.length > 60) bank.splice(0, bank.length - 60);
  save();
  return added;
}

// ── new vocabulary ──────────────────────────────────────────────────────────────────────────
export async function newWords({ topic = '', level = 'a2', n = 8 } = {}) {
  lastGen = Date.now();
  const known = allWords().filter((w) => w.kind !== 'p').map((w) => w.de);
  const pool = known.sort(() => Math.random() - 0.5).slice(0, 80).join(', ');
  const prompt = `TASK: generate_words
Invent ${n + 4} useful German words for a Russian-speaking ${level.toUpperCase()} learner${topic ? ` on the topic "${topic}"` : ' from everyday life'}.
Mostly nouns, plus a few verbs and adjectives. Pick words that are really useful and NOT in this list of known words: ${pool}
For each word give:
 pos: "noun" | "verb" | "adj";
 de: the lemma (nouns WITHOUT article, capitalised);
 article: "der" | "die" | "das" (nouns only);
 plural: plural form WITHOUT article (nouns), or "-" if there is no plural;
 ru: Russian translation (1–3 words);
 emoji: one fitting emoji or "";
 example: {"de": a simple A1–A2 sentence using the word, "ru": translation};
 mnemo: a short, playful Russian memory trick (how to remember the word — and its article!);
 perfect: (verbs only) e.g. "hat gemacht" / "ist gegangen".
Return JSON: {"words":[{…}]}`;
  const raw = await genJSON({ system: SYS, prompt, temperature: 1, maxOutputTokens: 5000, validate: (o) => { if (!Array.isArray(o.words)) throw new Error('bad'); return o; } });
  const have = new Set(allWords().map((w) => norm(w.de)));
  const out = [];
  for (const w of raw.words) {
    if (!w?.de || !w?.ru || have.has(norm(w.de))) continue;
    const pos = w.pos === 'verb' ? 'verb' : w.pos === 'adj' ? 'adj' : 'noun';
    if (pos === 'noun' && !['der', 'die', 'das'].includes(w.article)) continue;
    have.add(norm(w.de));
    out.push({
      id: `u:${hash(w.de)}`, kind: pos === 'noun' ? 'n' : pos === 'verb' ? 'v' : 'a', de: String(w.de).trim(), art: pos === 'noun' ? w.article : undefined,
      pl: pos === 'noun' && w.plural && w.plural !== '-' ? String(w.plural).trim() : null, ru: String(w.ru).trim(), emoji: (w.emoji || '').slice(0, 8) || null,
      topic: topic ? topic : 'KI', lvl: level, ex: w.example?.de ? { de: String(w.example.de), ru: String(w.example.ru || '') } : null, mnemo: w.mnemo ? String(w.mnemo) : '',
      perfect: w.perfect || '', ai: true, added: Date.now(),
    });
  }
  const picked = out.slice(0, n);
  state.userWords.push(...picked);
  save();
  return picked;
}

// ── make a word memorable ───────────────────────────────────────────────────────────────────
export async function enrichWord(word) {
  const prompt = `TASK: enrich_word
German word: ${word.kind === 'n' ? `${word.art} ${word.de}` : word.de} (${word.ru}).
Give: a simple A1–A2 example sentence using it with its Russian translation, and a short, playful Russian memory trick (association, sound-alike, or a rule${word.kind === 'n' ? ' that helps remember the article' : ''}).
Return JSON: {"example":{"de":"…","ru":"…"},"mnemo":"…"}`;
  const out = await genJSON({ system: SYS, prompt, temperature: 0.9, maxOutputTokens: 500, validate: (o) => { if (!o.example?.de || !o.mnemo) throw new Error('bad'); return o; } });
  const P = state.profile; (P.enrich ||= {})[word.id] = { ex: out.example, mnemo: out.mnemo };
  if (word.ai) { const w = state.userWords.find((x) => x.id === word.id); if (w) { w.ex = out.example; w.mnemo = out.mnemo; } }
  save();
  return out;
}

// ── the coach ───────────────────────────────────────────────────────────────────────────────
export async function coach() {
  const ov = overview();
  const weak = SKILLS.map((s) => ({ id: s.id, title: s.title, lvl: s.lvl, p: Math.round(mastery(s.id) * 100), n: skillState(s.id).n, status: status(s.id) }))
    .filter((s) => s.status !== 'locked').sort((a, b) => a.p - b.p).slice(0, 8);
  const recent = state.mistakes.slice(-14).map((m) => `${SKILL[m.skill]?.title || m.skill}: "${String(m.prompt || '').slice(0, 70)}" ты: ${m.given} → верно: ${m.expected}`);
  const data = { level: ov.level, streak: ov.streak, accuracy: ov.accuracy == null ? null : Math.round(ov.accuracy * 100), answered: ov.answered, mastered: ov.mastered, weakSkills: weak, confusions: topConfusions(6).map((c) => `${c.pair} ×${c.n}`), recentMistakes: recent };
  const prompt = `TASK: coach_report
You are the learner's personal German coach. Read this data and write a short, warm, concrete plan IN RUSSIAN.
DATA: ${JSON.stringify(data)}
Valid skill ids: ${SKILLS.map((s) => s.id).join(', ')}
Return JSON: {"headline":"≤ 60 chars, encouraging","praise":"one sentence about what is going well","insights":["2-3 specific observations about the mistakes (patterns, confusions)"],"focus":[{"skill":"<skill id>","why":"≤ 15 words"}],"tip":"one practical study tip for today"}
At most 3 focus items, the weakest-and-most-useful first.`;
  return genJSON({ system: SYS, prompt, temperature: 0.7, maxOutputTokens: 1200, validate: (o) => { if (!o.headline) throw new Error('bad'); o.focus = (o.focus || []).filter((f) => SKILL[f.skill]); return o; } });
}

// ── conversation ────────────────────────────────────────────────────────────────────────────
export const SCENARIOS = [
  { id: 'cafe', emoji: '☕', title: 'В кафе', brief: 'Ты в кафе в Берлине. Ты — официантка Lena, а пользователь — гость.', hint: 'Ты — гость, Lena — официантка' },
  { id: 'smalltalk', emoji: '👋', title: 'Знакомство', brief: 'Ты Lena, новая знакомая. Знакомишься, спрашиваешь о жизни, работе, хобби.', hint: 'Познакомься и расскажи о себе' },
  { id: 'doctor', emoji: '🩺', title: 'У врача', brief: 'Ты врач в приёмной. Спрашиваешь, что болит, как давно, даёшь простые советы.', hint: 'Ты — пациент, Lena — врач' },
  { id: 'flat', emoji: '🏠', title: 'Поиск квартиры', brief: 'Ты арендодатель. Показываешь квартиру и отвечаешь на вопросы о ней.', hint: 'Ты ищешь квартиру' },
  { id: 'station', emoji: '🚆', title: 'На вокзале', brief: 'Ты сотрудница справочной на вокзале. Помогаешь с билетами и маршрутом.', hint: 'Купи билет и узнай маршрут' },
  { id: 'free', emoji: '💬', title: 'Свободно', brief: 'Ты Lena, дружелюбный собеседник. Говорим на любую повседневную тему.', hint: 'Любая повседневная тема' },
];
export async function chatTurn({ scenario, history, userText }) {
  const hist = history.slice(-10).map((m) => `${m.role === 'user' ? 'Learner' : 'Lena'}: ${m.de || m.text}`).join('\n');
  const prompt = `TASK: chat_turn
Role-play. ${scenario.brief}
Speak ONLY simple German at A2 level (short sentences, common words, max 2 sentences, then ONE natural follow-up question). Stay in the scene.
Conversation so far:
${hist || '(start)'}
Learner's new message: "${userText}"

1) Reply as the character.
2) Check the learner's message for German mistakes (grammar, word order, articles, cases, spelling). If there is a real mistake, give the corrected sentence and a SHORT Russian explanation, and name the closest rule id from: ${SKILLS.map((s) => s.id).join(', ')}. Ignore missing capital letters/punctuation if the sentence is fine otherwise. If the message is correct, correction.needed = false.
3) Offer 3 short German answers the learner could say next (A2 level).
Return JSON: {"reply":{"de":"…","ru":"translation"},"correction":{"needed":true|false,"corrected":"…","explanation":"…","skill":"<rule id or null>","wrong":"the wrong word/phrase","right":"the right word/phrase"},"suggestions":["…","…","…"]}`;
  const out = await genJSON({ system: SYS, prompt, temperature: 0.9, maxOutputTokens: 1200, validate: (o) => { if (!o.reply?.de) throw new Error('bad'); return o; } });
  if (out.correction && !SKILL[out.correction.skill]) out.correction.skill = null;
  return out;
}
export async function chatStart(scenario) {
  const prompt = `TASK: chat_start
Role-play. ${scenario.brief}
Open the scene with ONE or TWO very simple German sentences at A2 level and a question. Return JSON: {"reply":{"de":"…","ru":"translation"},"suggestions":["…","…","…"]}`;
  return genJSON({ system: SYS, prompt, temperature: 0.9, maxOutputTokens: 600, validate: (o) => { if (!o.reply?.de) throw new Error('bad'); return o; } });
}

// ── free questions ──────────────────────────────────────────────────────────────────────────
export async function askTutor(question, context = '') {
  const prompt = `TASK: ask_tutor
Learner's question (Russian, about German): ${question}
${context ? `Context: ${context}` : ''}
Answer in Russian, max 150 words. Be concrete: give the rule in one line, 2–3 German examples with translations, and one memory trick if useful. Use **bold** for key German forms. Use "• " for list lines. No headings.`;
  return genText({ system: SYS, prompt, temperature: 0.6, maxOutputTokens: 900 });
}
/** Tiny markdown (bold, bullets, line breaks) → safe HTML. */
export function md(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\n{2,}/).map((p) => {
    const lines = p.split('\n');
    if (lines.every((l) => /^\s*[•\-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[•\-*]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
  function inline(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }
}

// ── pictures ────────────────────────────────────────────────────────────────────────────────
const picUrls = new Map(); const picJobs = new Map();
async function shrink(blob, size = 512) {
  try {
    const bmp = await createImageBitmap(blob); const s = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || blob), 'image/jpeg', 0.82));
  } catch { return blob; }
}
export async function cachedPicture(word) {
  const k = `img/${word.id}`;
  if (picUrls.has(k)) return picUrls.get(k);
  const b = await media.get(k);
  if (!b) return null;
  const u = URL.createObjectURL(b); picUrls.set(k, u); return u;
}
/** Generate (once) a picture for a word with Nano Banana; resolves to an object URL, or null. */
export function wordPicture(word, { generate = true } = {}) {
  const k = `img/${word.id}`;
  if (picJobs.has(k)) return picJobs.get(k);
  const job = (async () => {
    const hit = await cachedPicture(word);
    if (hit || !generate || !aiReady()) return hit;
    const subject = word.kind === 'n' ? `"${word.ru}" (${word.art} ${word.de})` : `the idea of "${word.ru}" (${word.de})`;
    const r = await genImage({ prompt: `A single friendly flat vector illustration of ${subject}. Soft pastel colours, rounded shapes, centred composition, a plain pure white background, no text, no letters, no watermark.`, aspect: '1:1' });
    const small = await shrink(r.blob);
    await media.put(k, small);
    const u = URL.createObjectURL(small); picUrls.set(k, u); return u;
  })().catch((e) => { console.warn('picture failed', e?.message); picJobs.delete(k); return null; });
  picJobs.set(k, job);
  return job;
}

export const aiAvailable = aiReady;
export { uid, WORDS };
