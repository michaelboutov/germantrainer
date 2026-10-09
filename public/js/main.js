import { $ } from './util.js';
import { getSettings, probeBackend, backendMode, describeError, AiError, aiReady } from './gemini.js';
import { Scene3D } from './scene3d.js';
import { narrator } from './voice.js';
import * as model from './engine/model.js';
import { PALETTES } from './content/skills.js';
import { toast, wipe } from './ui/kit.js';
import { openSettings } from './ui/settings.js';
import { openRule } from './ui/rule.js';
import { openTutor } from './ui/tutor.js';
import * as home from './ui/home.js';
import * as session from './ui/session.js';
import * as summary from './ui/summary.js';
import * as map from './ui/map.js';
import * as words from './ui/words.js';
import * as chat from './ui/chat.js';
import * as mistakes from './ui/mistakes.js';

const screens = { home, session, summary, map, words, chat, mistakes };

export const app = {
  root: $('#app'),
  scene: null,
  narrator,
  session: null,
  cur: null,
  _token: 0,
  mic: null,

  /** Tween the whole UI + 3D scene to a new palette (three colours). */
  setPalette(pal) {
    const r = document.documentElement.style;
    r.setProperty('--c1', pal[0]); r.setProperty('--c2', pal[1]); r.setProperty('--c3', pal[2]);
    this.scene?.setPalette(pal);
  },
  async go(name, params = {}) {
    const token = ++this._token;
    const prev = this.cur;
    if (prev?.inst) { try { await prev.inst.unmount?.(); } catch (e) { console.error(e); } }
    if (token !== this._token) return;
    this.root.replaceChildren();
    this.scene?.anchor('orb', null);
    this.cur = { name, params };
    document.body.dataset.screen = name;
    const inst = await screens[name].mount(this, params);
    if (token === this._token) this.cur.inst = inst;
  },
  refresh() { if (this.cur) this.go(this.cur.name, this.cur.params); },
  /** Start a practice round with a circular colour wipe from the pressed button. */
  async startSession(opts = {}, origin = null) {
    const cs = getComputedStyle(document.documentElement);
    const w = wipe(origin, cs.getPropertyValue('--c1').trim() || '#8b7bff', cs.getPropertyValue('--c2').trim() || '#35e0c2');
    await w.cover;
    await this.go('session', opts);
    await w.reveal();
  },
  toast,
  openSettings(o) { return openSettings(this, o); },
  openRule(id) { return openRule(this, id); },
  askTutor(q, ctx) { return openTutor(this, q, ctx); },
  describeError,
  onSettingsChanged() {
    this.narrator.setMuted(!!getSettings().muted);
    this.scene?.setQuality(getSettings().quality);
    if (this.cur?.name === 'home') this.refresh();
  },
  /** Gate for AI-only features. */
  requireAI(why = 'Эта функция работает с Gemini.') {
    if (aiReady()) return true;
    toast(`${why} Подключи ключ в настройках.`, { kind: 'warn', ms: 7000, action: 'Настроить', onAction: () => this.openSettings({ focus: 'key' }) });
    return false;
  },
};

async function boot() {
  const s = getSettings();
  app.scene = new Scene3D($('#gl'));
  if (!app.scene.ok) document.body.classList.add('no-gl');
  app.scene.setQuality(s.quality);
  app.scene.setLevelSource(() => app.narrator.level);
  app.narrator.setMuted(!!s.muted);
  await Promise.all([probeBackend(), model.load()]);
  addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r instanceof AiError && r.kind === 'aborted') return; console.error(r); });
  addEventListener('pointerdown', () => app.narrator.unlock(), { once: true, capture: true });
  window.fluss = app; // handy for debugging / tests
  await app.go('home');
}
boot();
