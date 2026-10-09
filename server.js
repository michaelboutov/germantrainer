// Fluss — tiny Express server.
//  * serves the static front-end from /public
//  * (optional) proxies Gemini calls so the API key never reaches the browser
//
// Without GOOGLE_API_KEY the app still works as a pure static site: each player pastes their own
// key in Settings and the browser talks to Google directly (the Gemini API allows CORS).
'use strict';

try { require('dotenv').config(); } catch { /* dotenv is optional */ }
const express = require('express');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const SERVER_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const ACCESS_CODE = process.env.ACCESS_CODE || ''; // optional shared password protecting your key
const UPSTREAM = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const RATE_MAX = Number(process.env.RATE_LIMIT_PER_10MIN || 150);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 150000);

// Only generation models are reachable through the proxy (no tuning, files, live/bidi, ...).
const MODEL_RE = /^(gemini|nano-banana)[\w.\-]*$/;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---- tiny in-memory sliding-window rate limiter (per IP) -----------------------------------
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= RATE_MAX) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: { code: 429, status: 'RATE_LIMITED', message: 'Too many requests, slow down a little.' } });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}
setInterval(() => { // keep the map small
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 600000)) hits.delete(ip);
}, 60000).unref();

// ---- API -------------------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, serverKey: Boolean(SERVER_KEY), needsCode: Boolean(ACCESS_CODE) });
});

app.post('/api/gemini/:model', rateLimit, express.json({ limit: '16mb' }), async (req, res) => {
  const { model } = req.params;
  if (!SERVER_KEY) return res.status(503).json({ error: { code: 503, status: 'NO_SERVER_KEY', message: 'This server has no GOOGLE_API_KEY configured.' } });
  if (ACCESS_CODE && req.get('x-access-code') !== ACCESS_CODE) {
    return res.status(401).json({ error: { code: 401, status: 'BAD_ACCESS_CODE', message: 'Wrong or missing access code.' } });
  }
  if (!MODEL_RE.test(model)) return res.status(400).json({ error: { code: 400, status: 'BAD_MODEL', message: 'Model not allowed.' } });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const up = await fetch(`${UPSTREAM}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': SERVER_KEY },
      body: JSON.stringify(req.body),
      signal: ctl.signal,
    });
    const text = await up.text();
    res.status(up.status).type('application/json').send(text);
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    res.status(aborted ? 504 : 502).json({ error: { code: aborted ? 504 : 502, status: 'UPSTREAM_FAILED', message: aborted ? 'Gemini timed out.' : `Upstream error: ${err.message}` } });
  } finally {
    clearTimeout(timer);
  }
});

// ---- static ----------------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders(res, file) {
    if (file.includes(`${path.sep}vendor${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Unhandled error:', err && err.message);
  res.status(err && err.status ? err.status : 500).json({ error: { code: 500, status: 'SERVER_ERROR', message: 'Something broke.' } });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Fluss is listening on :${PORT}  (server key: ${SERVER_KEY ? 'yes' : 'no — players bring their own'}${ACCESS_CODE ? ', access code required' : ''})`);
  });
}

module.exports = app;
