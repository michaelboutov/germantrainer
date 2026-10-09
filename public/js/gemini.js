// Gemini transport. Three backends behind one interface:
//   server — our Express proxy holds the key (nothing to enter)
//   byok   — your own key, sent from the browser straight to Google (CORS is allowed)
//   demo   — offline: built-in content only, no AI calls (handled by callers via isDemo())
import { BASE_URL, DEFAULT_SETTINGS, SETTINGS_KEY, TEXT_FALLBACKS, IMAGE_FALLBACKS, TTS_FALLBACKS, STT_MODELS } from './config.js';
import { base64ToBlob, base64ToBytes, bytesToBase64, sleep } from './util.js';
import { isPcmMime, parseRate, pcmToWav, wavDuration } from './audio.js';

// ---- settings ------------------------------------------------------------------------------
let settings = { ...DEFAULT_SETTINGS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private mode */ }
export const getSettings = () => settings;
export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  return settings;
}

// ---- backend detection ---------------------------------------------------------------------
const backend = { checked: false, serverKey: false, needsCode: false };
export async function probeBackend() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      backend.serverKey = !!j.serverKey;
      backend.needsCode = !!j.needsCode;
    }
  } catch { /* static hosting: no server */ }
  backend.checked = true;
  return { ...backend };
}
export const backendInfo = () => ({ ...backend });
// A sandboxed host (e.g. a hosted preview) can pin the app to offline mode, because it cannot reach Google.
const FORCED_DEMO = typeof window !== 'undefined' && !!window.FLUSS_CONFIG?.demoOnly;
export const demoOnly = () => FORCED_DEMO;
export function backendMode() {
  if (FORCED_DEMO || settings.demo) return 'demo';
  if (settings.apiKey) return 'byok';
  if (backend.serverKey && (!backend.needsCode || settings.accessCode)) return 'server';
  return 'none';
}
export const isDemo = () => backendMode() === 'demo';
/** True when a real AI call can be made right now. */
export const aiReady = () => ['byok', 'server'].includes(backendMode());

// ---- errors --------------------------------------------------------------------------------
export class AiError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AiError';
    this.kind = kind; // billing | auth | access | rate | blocked | model | network | bad | empty | none | aborted
    Object.assign(this, extra);
  }
}
function classify(status, body) {
  const e = body?.error || {};
  const msg = e.message || '';
  const st = e.status || '';
  if (st === 'NO_SERVER_KEY') return 'none';
  if (st === 'BAD_ACCESS_CODE') return 'access';
  if (status === 402 || /prepayment|billing|credits?\b.*(deplet|exhaust)/i.test(msg)) return 'billing';
  if (status === 401 || status === 403 || /API key (not valid|expired|invalid)|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg + st)) return 'auth';
  if (status === 429 || st === 'RESOURCE_EXHAUSTED') return 'rate';
  if (status === 404) return 'model';
  if (status === 0 || status >= 500) return 'network';
  return 'bad';
}
function retryDelay(body) {
  const d = body?.error?.details?.find?.((x) => x.retryDelay)?.retryDelay;
  const n = d ? parseFloat(d) : 0;
  return Number.isFinite(n) ? n : 0;
}

// ---- raw call ------------------------------------------------------------------------------
async function rawGenerate(model, body, signal) {
  const mode = backendMode();
  const headers = { 'content-type': 'application/json' };
  let url;
  if (mode === 'byok') { url = `${BASE_URL}/models/${model}:generateContent`; headers['x-goog-api-key'] = settings.apiKey; }
  else if (mode === 'server') { url = `api/gemini/${model}`; if (settings.accessCode) headers['x-access-code'] = settings.accessCode; }
  else throw new AiError('none', 'No API key configured.');

  let res;
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
  catch (e) {
    if (e.name === 'AbortError') throw new AiError('aborted', 'Cancelled');
    throw new AiError('network', e.message || 'Network error');
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new AiError(classify(res.status, json), json?.error?.message || text.slice(0, 240) || `HTTP ${res.status}`, { status: res.status, retryAfter: retryDelay(json) });
  if (!json) throw new AiError('bad', 'Unreadable response from the AI service.');
  return json;
}

/** generateContent with retries for rate limits / transient network errors. */
export async function generate(model, body, { signal, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await rawGenerate(model, body, signal); }
    catch (e) {
      last = e;
      if (!(e instanceof AiError) || e.kind === 'aborted') throw e;
      const retryable = e.kind === 'network' || (e.kind === 'rate' && (e.retryAfter || 3) <= 25);
      if (!retryable || i === tries - 1) throw e;
      await sleep(e.kind === 'rate' ? Math.max(1500, (e.retryAfter || 3) * 1000) : 1200 * (i + 1));
    }
  }
  throw last;
}

/** Try the preferred model first, then fallbacks if it is unavailable for this key/region. */
async function withModels(models, run) {
  const list = [...new Set(models.filter(Boolean))];
  let last;
  for (const m of list) {
    try { return await run(m); }
    catch (e) {
      last = e;
      if (!(e instanceof AiError) || !['model'].includes(e.kind)) throw e;
    }
  }
  throw last;
}

function partsOf(json) {
  const c = json?.candidates?.[0];
  if (!c) {
    const br = json?.promptFeedback?.blockReason;
    throw new AiError(br ? 'blocked' : 'empty', br ? `Blocked: ${br}` : 'The AI returned nothing.');
  }
  const parts = (c.content?.parts || []).filter((p) => !p.thought);
  if (!parts.length) {
    const fr = c.finishReason || '';
    throw new AiError(/SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION|IMAGE_SAFETY/i.test(fr) ? 'blocked' : 'empty', fr ? `Finished: ${fr}` : 'The AI returned nothing.');
  }
  return parts;
}

// ---- text / JSON ---------------------------------------------------------------------------
export function cleanJSON(text) {
  const t = String(text).replace(/```(?:json)?/gi, '').trim();
  const a = t.search(/[{[]/);
  const open = t[a];
  const b = t.lastIndexOf(open === '[' ? ']' : '}');
  if (a < 0 || b <= a) return null;
  const body = t.slice(a, b + 1).replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(body); } catch { /* try a bit harder: strip control chars inside strings */ }
  try { return JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' ')); } catch { return null; }
}

export async function genJSON({ system, prompt, temperature = 0.9, maxOutputTokens = 8192, signal, validate, thinking = 'low', tries = 2 } = {}) {
  const s = getSettings();
  const mk = (withThinking) => ({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature, topP: 0.95, maxOutputTokens, responseMimeType: 'application/json',
      ...(withThinking && thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
  });
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await withModels([s.textModel, ...TEXT_FALLBACKS], async (model) => {
        let json;
        try { json = await generate(model, mk(true), { signal }); }
        catch (e) {
          if (e instanceof AiError && e.kind === 'bad' && /thinking/i.test(e.message)) json = await generate(model, mk(false), { signal });
          else throw e;
        }
        const text = partsOf(json).map((p) => p.text || '').join('');
        const obj = cleanJSON(text);
        if (!obj) throw new AiError('bad', 'The AI answered with malformed JSON.', { raw: text.slice(0, 400) });
        return validate ? validate(obj) : obj;
      });
    } catch (e) {
      lastErr = e;
      if (!(e instanceof AiError) || e.kind !== 'bad' || attempt === tries - 1) throw e;
    }
  }
  throw lastErr;
}

/** Plain-text generation (for short free-form answers). */
export async function genText({ system, prompt, temperature = 0.7, maxOutputTokens = 1200, signal, thinking = 'low' } = {}) {
  const s = getSettings();
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens, ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}) },
  };
  return withModels([s.textModel, ...TEXT_FALLBACKS], async (model) => {
    let json;
    try { json = await generate(model, body, { signal }); }
    catch (e) {
      if (e instanceof AiError && e.kind === 'bad' && /thinking/i.test(e.message)) { const b2 = { ...body, generationConfig: { temperature, maxOutputTokens } }; json = await generate(model, b2, { signal }); }
      else throw e;
    }
    return partsOf(json).map((p) => p.text || '').join('').trim();
  });
}

// ---- images (Nano Banana) ------------------------------------------------------------------
export async function genImage({ prompt, aspect = '1:1', signal, model } = {}) {
  const s = getSettings();
  const mk = (mods) => ({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: mods, imageConfig: { aspectRatio: aspect } },
  });
  return withModels([model || s.imageModel, ...IMAGE_FALLBACKS], async (m) => {
    let json;
    try { json = await generate(m, mk(['IMAGE']), { signal }); }
    catch (e) {
      if (e instanceof AiError && e.kind === 'bad' && /modalit/i.test(e.message)) json = await generate(m, mk(['TEXT', 'IMAGE']), { signal });
      else throw e;
    }
    const parts = partsOf(json);
    const img = parts.find((p) => (p.inlineData || p.inline_data)?.mimeType?.startsWith('image/'));
    if (!img) throw new AiError('blocked', (parts.find((p) => p.text)?.text || 'No image was produced.').slice(0, 200));
    const d = img.inlineData || img.inline_data;
    return { blob: base64ToBlob(d.data, d.mimeType), mime: d.mimeType, model: m };
  });
}

// ---- speech (Gemini TTS) -------------------------------------------------------------------
// NOTE: never prefix the text with a style directive ("Say clearly: …") — the model reads it aloud.
// The language is detected from the text itself; slow speech is done with playbackRate on the player.
export async function genSpeech({ text, voice, signal, model } = {}) {
  const s = getSettings();
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || s.voice } } },
    },
  };
  return withModels([model || s.ttsModel, ...TTS_FALLBACKS], async (m) => {
    const json = await generate(m, body, { signal });
    const part = partsOf(json).find((p) => (p.inlineData || p.inline_data)?.data);
    if (!part) throw new AiError('empty', 'No audio was produced.');
    const d = part.inlineData || part.inline_data;
    const bytes = base64ToBytes(d.data);
    if (isPcmMime(d.mimeType) || /^audio\/(x-)?l16/i.test(d.mimeType)) {
      const rate = parseRate(d.mimeType);
      return { blob: pcmToWav(bytes, rate), duration: bytes.length / (rate * 2), mime: 'audio/wav', model: m };
    }
    const blob = new Blob([bytes], { type: d.mimeType || 'audio/wav' });
    return { blob, duration: /wav/i.test(d.mimeType || '') ? wavDuration(bytes.length) : 0, mime: blob.type, model: m };
  });
}

// ---- speech → text -------------------------------------------------------------------------
// gemini-3.5-transcribe answers with parts[].audioTranscription.text; ordinary text models use parts[].text.
export async function transcribe(blob, langName = 'German', signal) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const body = {
    contents: [{ role: 'user', parts: [
      { text: `Transcribe this short ${langName} speech verbatim. Reply with the transcript only, no quotes, no commentary.` },
      { inlineData: { mimeType: (blob.type || 'audio/webm').split(';')[0], data: bytesToBase64(buf) } },
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 600 },
  };
  const s = getSettings();
  const json = await withModels([...STT_MODELS, s.textModel, ...TEXT_FALLBACKS], (m) => generate(m, body, { signal }));
  const out = (json.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.audioTranscription?.text || p.text || '').join(' ');
  return out.trim();
}

/** Human-friendly explanation for any error (Russian UI). */
export function describeError(e) {
  const k = e instanceof AiError ? e.kind : 'bad';
  switch (k) {
    case 'billing': return 'На ключе Google закончились кредиты. Пополните баланс в AI Studio — или работайте офлайн.';
    case 'auth': return 'Google не принял ключ. Проверьте его в настройках.';
    case 'access': return 'Неверный код доступа.';
    case 'rate': return 'Слишком много запросов — подождите несколько секунд.';
    case 'blocked': return 'Модель отклонила запрос по правилам безопасности.';
    case 'model': return 'Эта модель недоступна для вашего ключа.';
    case 'network': return 'Нет связи с сервисом ИИ.';
    case 'none': return 'Нужен API-ключ Gemini — добавьте его в настройках.';
    case 'empty': return 'ИИ вернул пустой ответ. Попробуйте ещё раз.';
    default: return 'Что-то пошло не так: ' + (e?.message || '').slice(0, 160);
  }
}
