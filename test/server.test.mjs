// Smoke tests for the Express proxy, run against the bundled mock Gemini server.   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const procs = [];
function run(args, env) {
  const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  procs.push(p); return p;
}
const up = async (url) => { for (let i = 0; i < 40; i++) { try { if ((await fetch(url)).status < 500) return; } catch { /* not yet */ } await sleep(100); } throw new Error(`${url} did not start`); };
const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hello' }] }] });
const post = (port, model, headers = {}) => fetch(`http://127.0.0.1:${port}/api/gemini/${model}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });

before(async () => {
  run(['scripts/mock-gemini.mjs'], { MOCK_PORT: '9191', MOCK_DELAY: '1' });
  run(['server.js'], { PORT: '3191', GOOGLE_API_KEY: 'test-key', GEMINI_BASE_URL: 'http://127.0.0.1:9191/v1beta', ACCESS_CODE: '' });
  run(['server.js'], { PORT: '3192', GOOGLE_API_KEY: 'test-key', GEMINI_BASE_URL: 'http://127.0.0.1:9191/v1beta', ACCESS_CODE: 'sesame' });
  run(['server.js'], { PORT: '3193', GOOGLE_API_KEY: '', GEMINI_API_KEY: '' });
  await Promise.all([up('http://127.0.0.1:9191/x'), up('http://127.0.0.1:3191/api/health'), up('http://127.0.0.1:3192/api/health'), up('http://127.0.0.1:3193/api/health')]);
});
after(async () => { for (const p of procs) p.kill(); await Promise.all(procs.map((p) => (p.exitCode === null ? once(p, 'exit') : null))); });

test('health reports the server key and access-code state', async () => {
  assert.deepEqual(await (await fetch('http://127.0.0.1:3191/api/health')).json(), { ok: true, serverKey: true, needsCode: false });
  assert.equal((await (await fetch('http://127.0.0.1:3192/api/health')).json()).needsCode, true);
  assert.equal((await (await fetch('http://127.0.0.1:3193/api/health')).json()).serverKey, false);
});

test('proxy forwards generateContent and filters thought parts client-side', async () => {
  const r = await post(3191, 'gemini-3.8-flash');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.candidates[0].content.parts.some((p) => p.text && !p.thought));
});

test('proxy serves TTS as WAV audio, images as PNG, and transcripts', async () => {
  const a = await (await post(3191, 'gemini-3.8-flash-tts')).json();
  assert.equal(a.candidates[0].content.parts[0].inlineData.mimeType, 'audio/wav');
  const t = await (await post(3191, 'gemini-3.5-transcribe')).json();
  assert.match(t.candidates[0].content.parts[0].audioTranscription.text, /Kaffee/);
  const i = await (await post(3191, 'gemini-nano-banana-2.1')).json();
  assert.equal(i.candidates[0].content.parts.find((p) => p.inlineData).inlineData.mimeType, 'image/png');
});

test('only generation models are reachable', async () => {
  assert.equal((await post(3191, 'tunedModels-evil')).status, 400);
});

test('access code is enforced when configured', async () => {
  assert.equal((await post(3192, 'gemini-3.8-flash')).status, 401);
  assert.equal((await post(3192, 'gemini-3.8-flash', { 'x-access-code': 'sesame' })).status, 200);
});

test('without a server key the proxy says so', async () => {
  const r = await post(3193, 'gemini-3.8-flash');
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.status, 'NO_SERVER_KEY');
});

test('upstream billing errors pass through untouched', async () => {
  const r = await fetch('http://127.0.0.1:3191/api/gemini/gemini-3.8-flash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'FORCE_402' }] }] }) });
  assert.equal(r.status, 402);
  assert.equal((await r.json()).error.status, 'RESOURCE_EXHAUSTED');
});

test('the static site never ships an API key', async () => {
  const html = await (await fetch('http://127.0.0.1:3191/')).text();
  assert.match(html, /Fluss/);
  for (const f of ['js/config.js', 'js/gemini.js', 'js/main.js']) {
    const src = await (await fetch(`http://127.0.0.1:3191/${f}`)).text();
    assert.doesNotMatch(src, /AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{30,}|test-key/);
  }
});
