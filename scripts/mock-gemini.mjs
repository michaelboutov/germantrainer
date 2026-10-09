// A tiny stand-in for the Gemini REST API, for offline development and tests.
//   node scripts/mock-gemini.mjs                       (listens on :9099)
//   GOOGLE_API_KEY=x GEMINI_BASE_URL=http://localhost:9099/v1beta npm start
// It mimics the response *shapes* (JSON text, WAV speech, PNG pictures, audioTranscription); the content is canned.
import http from 'node:http';
import zlib from 'node:zlib';

const PORT = Number(process.env.MOCK_PORT || 9099);

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w = 256, h = 256, seed = 1) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; const d = Math.hypot(x - w / 2, y - h / 2) / (w / 2);
    const inside = d < 0.62; raw[i] = inside ? 255 * (0.9 - 0.3 * d) : 255; raw[i + 1] = inside ? 255 * (0.55 + 0.25 * Math.sin(seed + d * 6)) : 255; raw[i + 2] = inside ? 255 * (0.5 + 0.3 * d) : 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds = 1.6, rate = 24000) {
  const n = Math.round(seconds * rate); const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const env = Math.min(1, i / 1500, (n - i) / 3000); const f = 200 + 50 * Math.sin(i / 7000); data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * f * i) / rate) * 8000 * env * (0.6 + 0.4 * Math.sin(i / 2500))), i * 2); }
  const head = Buffer.alloc(44); head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

let n = 0;
const POOL = [
  ['Ich gebe {dem|den|der} Mann einen Apfel.', 'Я даю мужчине яблоко.', 'geben + Dativ: dem Mann.'],
  ['Sie hilft {ihrem|ihren|ihre} Bruder bei den Hausaufgaben.', 'Она помогает своему брату с уроками.', 'helfen + Dativ.'],
  ['Wir danken {den|dem|die} Kindern für das Bild.', 'Мы благодарим детей за картину.', 'Dativ мн.ч.: den Kindern.'],
  ['Das Auto gehört {meinem|meinen|mein} Vater.', 'Машина принадлежит моему отцу.', 'gehören + Dativ.'],
  ['Der Kuchen schmeckt {mir|mich|ich} sehr gut.', 'Пирог мне очень нравится.', 'schmecken + Dativ.'],
  ['Ich schenke {meiner|meine|meinem} Mutter Blumen.', 'Я дарю маме цветы.', 'Mutter — женский род: meiner.'],
];
const WORDS = [
  { pos: 'noun', de: 'Kühlschrank', article: 'der', plural: 'Kühlschränke', ru: 'холодильник', emoji: '🧊', example: { de: 'Die Milch steht im Kühlschrank.', ru: 'Молоко стоит в холодильнике.' }, mnemo: 'Kühl + Schrank — «прохладный шкаф». Шкаф — der Schrank!' },
  { pos: 'noun', de: 'Bürgersteig', article: 'der', plural: 'Bürgersteige', ru: 'тротуар', emoji: '🚶', example: { de: 'Der Bürgersteig ist breit.', ru: 'Тротуар широкий.' }, mnemo: 'Бюргеры идут по штайгу — der.' },
  { pos: 'verb', de: 'aufwärmen', ru: 'разогревать', emoji: '♨️', example: { de: 'Ich wärme die Suppe auf.', ru: 'Я разогреваю суп.' }, mnemo: 'warm + auf — «довести до тёплого».', perfect: 'hat aufgewärmt' },
  { pos: 'adj', de: 'gemütlich', ru: 'уютный', emoji: '🛋️', example: { de: 'Das Café ist sehr gemütlich.', ru: 'Кафе очень уютное.' }, mnemo: 'Гем-мут-лих — «гем» как «дом», уют.' },
  { pos: 'noun', de: 'Wecker', article: 'der', plural: 'Wecker', ru: 'будильник', emoji: '⏰', example: { de: 'Der Wecker klingelt um sechs.', ru: 'Будильник звонит в шесть.' }, mnemo: 'Вэкер — «вэкать» = будить.' },
  { pos: 'noun', de: 'Briefkasten', article: 'der', plural: 'Briefkästen', ru: 'почтовый ящик', emoji: '📬', example: { de: 'Ich werfe den Brief in den Briefkasten.', ru: 'Я бросаю письмо в почтовый ящик.' }, mnemo: 'Brief + Kasten — «ящик для писем».' },
];

function textAnswer(prompt) {
  const task = /TASK:\s*(\w+)/.exec(prompt)?.[1];
  switch (task) {
    case 'explain_mistake': return JSON.stringify({ why: 'После глагола helfen всегда нужен Dativ: «dem Mann», а не «den Mann». Ты выбрал форму Akkusativ — она подходит для видеть, покупать, но не для помогать.', rule: 'helfen, danken, gehören, gefallen — всегда с Dativ.', tip: 'Запомни: «кому?» → dem / der / dem / den(+n).', example: { de: 'Ich helfe dem Kind.', ru: 'Я помогаю ребёнку.' } });
    case 'generate_items': { const items = []; for (let i = 0; i < 6; i++) { const p = POOL[(n + i) % POOL.length]; items.push({ de: p[0].replace('.', ` (${n + i}).`).replace(/ \(\d+\)\./, '.'), ru: p[1], note: p[2] }); } n += 3; return JSON.stringify({ items: items.map((it, i) => ({ ...it, de: it.de.replace('Ich ', i % 2 ? 'Ich ' : 'Heute ') })) }); }
    case 'generate_words': return JSON.stringify({ words: WORDS });
    case 'coach_report': return JSON.stringify({ headline: 'Dativ — твоя точка роста', praise: 'Ты стабильно решаешь задания по порядку слов.', insights: ['Чаще всего ты путаешь den и dem.', 'Артикли женского рода даются легче, чем мужского.'], focus: [{ skill: 'a2.dativ', why: 'самая частая ошибка' }, { skill: 'a2.wechsel', why: 'Wo? / Wohin?' }], tip: 'Читай вслух предложения с dem/der — на слух ошибки слышнее.' });
    case 'chat_start': return JSON.stringify({ reply: { de: 'Guten Tag! Was möchten Sie trinken?', ru: 'Добрый день! Что бы Вы хотели выпить?' }, suggestions: ['Ich möchte einen Kaffee, bitte.', 'Haben Sie Tee?', 'Was empfehlen Sie?'] });
    case 'chat_turn': return JSON.stringify({ reply: { de: 'Sehr gern! Möchten Sie auch ein Stück Kuchen?', ru: 'С удовольствием! Хотите ещё кусочек пирога?' }, correction: /mir/.test(prompt) ? { needed: false } : { needed: true, corrected: 'Ich möchte einen Kaffee, bitte.', explanation: 'Kaffee — мужской род, в Akkusativ: einen Kaffee.', skill: 'a1.akkusativ', wrong: 'ein Kaffee', right: 'einen Kaffee' }, suggestions: ['Ja, gern.', 'Nein, danke.', 'Was kostet das?'] });
    case 'ask_tutor': return 'Короткое правило: после **mit** всегда Dativ.\n\n• mit **dem** Bus\n• mit **der** Freundin\n\nМнемоника: aus-bei-mit-nach-seit-von-zu.';
    default: return 'ok';
  }
}

const server = http.createServer((req, res) => {
  const m = /\/models\/([^:]+):generateContent/.exec(req.url);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end(); }
  if (!m || req.method !== 'POST') { res.writeHead(404); return res.end('{}'); }
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    const model = m[1]; const j = JSON.parse(body || '{}');
    const prompt = (j.contents || []).flatMap((c) => c.parts || []).map((p) => p.text || '').join('\n');
    const send = (parts) => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] })); };
    const delay = Number(process.env.MOCK_DELAY || 350);
    if (/FORCE_402/.test(prompt)) { res.writeHead(402, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 402, status: 'RESOURCE_EXHAUSTED', message: 'Your prepayment credits are depleted.' } })); }
    setTimeout(() => {
      if (/transcribe/.test(model)) return send([{ audioTranscription: { text: 'Ich möchte einen Kaffee bitte' } }]);
      if (/tts/.test(model)) return send([{ inlineData: { mimeType: 'audio/wav', data: wav(1.4).toString('base64') } }]);
      if (/image|banana/.test(model)) return send([{ inlineData: { mimeType: 'image/png', data: png(256, 256, prompt.length).toString('base64') } }]);
      send([{ thought: true, text: 'thinking…' }, { text: textAnswer(prompt) }]);
    }, delay);
  });
});
server.listen(PORT, () => console.log(`mock Gemini listening on :${PORT}`));
