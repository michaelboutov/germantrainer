// Model ids, voices and defaults. Everything here is overridable in Einstellungen.
// (Ids verified against the live Gemini API: gemini-3.8-flash, gemini-3.8-flash-tts, gemini-nano-banana-2.1,
//  gemini-3.5-transcribe.)

export const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const TEXT_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
];
export const TTS_MODELS = [
  { id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS' },
  { id: 'gemini-3.8-flash-lite-tts', label: 'Gemini 3.8 Flash Lite TTS' },
  { id: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS' },
];
export const IMAGE_MODELS = [
  { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1' },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2' },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro' },
];
// Tried in order if the chosen model is unavailable for this key.
export const IMAGE_FALLBACKS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
export const TTS_FALLBACKS = ['gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
export const TEXT_FALLBACKS = ['gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-2.5-flash'];
export const STT_MODELS = ['gemini-3.5-transcribe'];

export const VOICES = [
  { id: 'Kore', ru: 'Чёткий и ясный' },
  { id: 'Aoede', ru: 'Лёгкий, мелодичный' },
  { id: 'Sulafat', ru: 'Тёплый' },
  { id: 'Leda', ru: 'Молодой' },
  { id: 'Charon', ru: 'Глубокий и спокойный' },
  { id: 'Orus', ru: 'Уверенный' },
  { id: 'Puck', ru: 'Игривый' },
  { id: 'Fenrir', ru: 'Яркий, азартный' },
];

export const DEFAULT_SETTINGS = {
  apiKey: '',            // BYOK: stored only in this browser
  accessCode: '',        // for servers protected with ACCESS_CODE
  demo: false,           // offline mode: built-in content only, no AI calls
  textModel: TEXT_MODELS[0].id,
  ttsModel: TTS_MODELS[0].id,
  imageModel: IMAGE_MODELS[0].id,
  voice: 'Kore',
  autoSpeak: true,       // read German sentences aloud automatically
  slow: false,           // slower speech
  images: true,          // paint pictures for words (Nano Banana)
  sfx: true,             // little UI sounds
  quality: 'auto',       // 'auto' | 'low' | 'high'  (3D)
  roundSize: 10,         // tasks per round
  vocabShare: 0.25,      // share of word tasks in the mix
  dailyGoal: 20,         // tasks per day
  level: 'a2',           // 'a1' | 'a2' | 'a2plus' — where the adaptive engine starts
  muted: false,
};

export const SETTINGS_KEY = 'fluss.settings.v1';
