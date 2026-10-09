// Proof-reads the sentence bank with Gemini: flags gaps where a "wrong" option is actually acceptable,
// German mistakes, and unfaithful Russian translations.
//   GOOGLE_API_KEY=… node scripts/qa-bank.mjs            (all skills)
//   GOOGLE_API_KEY=… node scripts/qa-bank.mjs a2.dativ   (one skill)
import { BANK } from '../public/js/content/sentences.js';
import { parseItem } from '../public/js/engine/builders.js';

const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!KEY) { console.error('Set GOOGLE_API_KEY'); process.exit(1); }
const MODEL = process.env.QA_MODEL || 'gemini-3.8-flash';
const only = process.argv[2];

const rows = [];
for (const [skill, list] of Object.entries(BANK)) {
  if (only && skill !== only) continue;
  list.forEach(([de, ru], i) => { const p = parseItem(de, ru); if (p) rows.push({ id: `${skill}#${i}`, sentence: de, ru, correct: p.alts[0], wrong: p.alts.slice(1) }); });
}
console.log(`Checking ${rows.length} sentences with ${MODEL}…`);

async function check(batch) {
  const prompt = `You are a meticulous German (Deutsch als Fremdsprache) examiner. Below are gap-fill items for A1–B1 learners.
Each item: a sentence with ONE gap written {correct|wrong1|wrong2}. The FIRST option must be the only grammatically correct choice in that sentence. The other options must be clearly WRONG (not acceptable alternatives).
For EVERY item check: (a) the first option makes a fully correct, natural German sentence; (b) NONE of the other options also gives a correct sentence (if one does, that is a defect: ambiguity); (c) the Russian translation matches the German meaning; (d) typos.
Report ONLY items with a real defect, one per line, EXACTLY in this format (no JSON, no markdown):
ISSUE <id> :: <what is wrong> :: <suggested fix>
If every item is fine, reply with the single word: NONE
ITEMS (one per line: id | sentence | russian):
${batch.map((r) => `${r.id} | ${r.sentence} | ${r.ru}`).join('\n')}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 8000, thinkingConfig: { thinkingLevel: 'medium' } } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || res.status);
  const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  return text.split('\n').map((l) => /^ISSUE\s+(\S+)\s*::\s*(.*?)\s*::\s*(.*)$/.exec(l.trim())).filter(Boolean).map((m) => ({ id: m[1], problem: m[2], fix: m[3] }));
}

const issues = [];
for (let i = 0; i < rows.length; i += 25) {
  const batch = rows.slice(i, i + 25);
  try { issues.push(...await check(batch)); } catch (e) { console.error('batch failed:', e.message); }
  process.stdout.write('.');
}
console.log(`\n${issues.length} issue(s)`);
for (const x of issues) console.log(`\n• ${x.id}\n  ${rows.find((r) => r.id === x.id)?.sentence ?? ''}\n  ✗ ${x.problem}\n  → ${x.fix}`);
