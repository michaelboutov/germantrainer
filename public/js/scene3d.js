// The one WebGL canvas behind the whole app:
//  - a fluid aurora background shader tinted by the current palette (it melts from rule to rule),
//  - the "Fluss-Kugel": a planet of dots that dances to the narrator's voice, swells on right answers, thinks while the AI works,
//  - a cloud of floating German letters (ä ö ü ß · der die das …) drifting in depth, scattering on a hit,
//  - bursts of particles and a shock-wave ring when you level up.
// DOM elements can "anchor" the orb: it glides into their rectangle, so layout changes are animated for free.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, prefersReducedMotion } from './util.js';

const FOV = 38;
const CAM_Z = 16;
const TAN = Math.tan((FOV * Math.PI) / 360);

const MOODS = {
  calm:   { tint: '#ffffff', energy: 1.0, speed: 1.0, bloom: 0.55 },
  joyful: { tint: '#ffe9b0', energy: 1.3, speed: 1.3, bloom: 0.75 },
  wonder: { tint: '#c8f0ff', energy: 1.15, speed: 1.1, bloom: 0.7 },
  tense:  { tint: '#b9a6c8', energy: 0.8, speed: 1.5, bloom: 0.45 },
  oops:   { tint: '#ffb3a6', energy: 0.9, speed: 0.8, bloom: 0.5 },
  focus:  { tint: '#e8f0ff', energy: 0.95, speed: 0.9, bloom: 0.5 },
};

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){ const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m; return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }`;

const BG_FRAG = `
precision highp float; varying vec2 vUv; uniform float uTime; uniform vec2 uRes; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec2 uPointer; uniform float uEnergy; uniform float uFlash;
${NOISE}
float fbm(vec3 p){ float a=.5; float s=0.; for(int i=0;i<4;i++){ s+=a*snoise(p); p*=2.02; a*=.5; } return s; }
void main(){
  vec2 p=(vUv-.5)*vec2(uRes.x/uRes.y,1.)*2.;
  float t=uTime*.05;
  float n1=fbm(vec3(p*.6+uPointer*.12,t)); float n2=fbm(vec3(p*.9-vec2(t*1.2,-t),t*.7+4.)); float n3=snoise(vec3(p*.4,t*.5+9.));
  vec3 cream=vec3(.968,.955,.935);
  vec3 a=mix(uC1,vec3(1.),.5); vec3 b=mix(uC2,vec3(1.),.56); vec3 c=mix(uC3,vec3(1.),.42);
  vec3 col=cream;
  float bottom=smoothstep(-1.1,1.0,-p.y);
  col=mix(col,c,bottom*.55*smoothstep(-.3,.8,n3+.25));
  col=mix(col,a,smoothstep(-.15,.7,n1)*.62*smoothstep(2.2,.0,length(p-vec2(-.8,.45))));
  col=mix(col,b,smoothstep(-.1,.75,n2)*.55*smoothstep(2.3,.0,length(p-vec2(.9,-.15))));
  col=mix(col,vec3(1.),smoothstep(.9,-.2,length(p-vec2(0.,.55)))*.28);
  col*=mix(.9,1.,clamp(uEnergy,0.,1.));
  col=mix(col,col*vec3(1.04,1.0,.96)+vec3(.05,.045,.02),clamp(uFlash,0.,1.)*.6);
  gl_FragColor=vec4(max(col,0.),1.);
}`;
const BG_SHOW_FRAG = `
precision highp float; varying vec2 vUv; uniform sampler2D uTex;
void main(){ vec3 c=texture2D(uTex,vUv).rgb; c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)*.012; gl_FragColor=vec4(max(c,0.),1.); }`;

const PLANET_VERT = `
uniform float uTime; uniform float uLevel; uniform float uThink; uniform float uScale; uniform float uPx; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
attribute float aRand; attribute float aSize; varying float vA; varying vec3 vCol;
${NOISE}
void main(){
  vec3 p=normalize(position);
  float sp=.07*(1.+uThink*2.5);
  float n=snoise(p*2.0+vec3(uTime*sp,0.,uTime*.05)); float n2=snoise(p*5.2-vec3(uTime*.1));
  float d=(n*.05+n2*.02)*(1.+uLevel*3.)+uLevel*.04;
  vec3 pos=p*(1.006+d+aRand*.014);
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=aSize*(1.+uLevel*1.1+(n2*.5+.5)*.7)*uPx*uScale/-mv.z;
  float dens=smoothstep(-.5,.5,n+n2*.4);
  vA=dens*(.5+aRand*.5);
  vec3 deep=mix(uC1,uC2,smoothstep(-.5,.55,n)); deep*=.82;
  vCol=mix(deep,vec3(1.,.97,.9),smoothstep(.8,1.,aRand)*.9);
}`;
const TRAIL_VERT = `
uniform float uTime; uniform float uLevel; uniform float uThink; uniform float uScale; uniform float uPx;
attribute float aT; attribute float aRand; attribute float aSize; varying float vA;
void main(){
  float t=fract(aT+uTime*.02*(1.+uThink*3.));
  float ang=mix(-.5,3.7,t);
  float spread=(1.-t*.55);
  float rad=1.5+.5*sin(t*3.14159)+(aRand-.5)*.55*spread+uLevel*.12;
  vec3 pos=vec3(cos(ang)*rad*1.12,sin(ang)*rad*.58+.18+(aRand-.5)*.3*spread,(fract(aRand*7.31)-.5)*.7*spread);
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=aSize*(1.+uLevel*.8)*uPx*uScale/-mv.z;
  vA=smoothstep(0.,.1,t)*smoothstep(1.,.55,t)*(.35+aRand*.65);
}`;
const DOT_FRAG = `
precision highp float; uniform vec3 uTint; varying float vA;
#ifdef PLANET
varying vec3 vCol;
#endif
void main(){
  float r=length(gl_PointCoord-.5); float a=smoothstep(.5,.12,r);
  #ifdef PLANET
  vec3 col=vCol;
  #else
  vec3 col=uTint;
  #endif
  gl_FragColor=vec4(col,a*vA); if(gl_FragColor.a<.015) discard;
}`;
const SHELL_VERT = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const SHELL_FRAG = `
precision highp float; uniform vec3 uBody; uniform vec3 uRim; uniform float uLevel; varying vec3 vN; varying vec3 vV;
void main(){ vec3 N=normalize(vN); vec3 V=normalize(vV); float f=pow(1.-max(dot(N,V),0.),2.3);
  vec3 col=mix(uBody,uRim,f)*(.92+.08*N.y+uLevel*.12);
  gl_FragColor=vec4(col,mix(.6,.97,f)); }`;

function makeSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLYPHS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü', 'der', 'die', 'das', 'ich', 'du', 'wir', '?', '!', 'ein', 'und', 'dem', 'den'];
function glyphTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = text.length === 1 ? 190 : text.length === 2 ? 130 : 104;
  g.font = `800 ${size}px "Inter Tight", "Inter", system-ui, sans-serif`;
  g.fillText(text, 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function disposeTree(o) {
  o.traverse((n) => { n.geometry?.dispose?.(); const m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
}

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.anchors = { orb: null };
    this.levelFn = () => 0;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerS = new THREE.Vector2(0, 0);
    this.t = 0;
    this.thinking = 0; this.thinkingT = 0;
    this.flash = 0; this._pulse = 0;
    this.quality = 'high';
    this.reduced = prefersReducedMotion();
    const mk = (a, b, c) => [new THREE.Color(a), new THREE.Color(b), new THREE.Color(c)];
    this.palette = { cur: mk('#8b7bff', '#35e0c2', '#e0b3ff'), tgt: mk('#8b7bff', '#35e0c2', '#e0b3ff') };
    this.mood = { ...MOODS.calm, k: { ...MOODS.calm } };
    this.frames = []; this.slow = 0;
    this.particles = []; this.rings = [];
    try { this._init(); this.ok = true; } catch (e) { console.warn('WebGL unavailable, using CSS fallback', e); this.ok = false; canvas.style.display = 'none'; }
  }

  _init() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setClearColor(0xf7f2ea, 1);
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    this.sprite = makeSprite();
    const scene = this.scene = new THREE.Scene();
    const cam = this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    cam.position.set(0, 0, CAM_Z);

    // aurora background: painted into a small render target (it is soft anyway), then stretched over the screen
    this.bgU = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uPointer: { value: new THREE.Vector2() }, uEnergy: { value: 1 }, uFlash: { value: 0 } };
    const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,1.,1.); }';
    this.bgRT = new THREE.WebGLRenderTarget(320, 200, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.bgScene = new THREE.Scene(); this.bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bgGen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: this.bgU, vertexShader: VERT, fragmentShader: BG_FRAG, depthTest: false, depthWrite: false }));
    bgGen.frustumCulled = false; this.bgScene.add(bgGen);
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uTex: { value: this.bgRT.texture } }, vertexShader: VERT, fragmentShader: BG_SHOW_FRAG, depthTest: false, depthWrite: false }));
    bg.frustumCulled = false; bg.renderOrder = -100; scene.add(bg);
    this.frameN = 0;

    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    this.key = new THREE.DirectionalLight(0xffffff, 2.4); this.key.position.set(4, 6, 8); scene.add(this.key);

    // the planet (shell + dots + sparkling arc)
    this.orbU = { uTime: { value: 0 }, uLevel: { value: 0 }, uThink: { value: 0 }, uScale: { value: 1 }, uPx: { value: 400 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() } };
    this.orb = new THREE.Group();
    this.shellU = { uBody: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uLevel: this.orbU.uLevel };
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 24), new THREE.ShaderMaterial({ uniforms: this.shellU, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: true }));
    shell.renderOrder = 1;
    const N = 12000; const pp = new Float32Array(N * 3); const pr = new Float32Array(N); const ps = new Float32Array(N);
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2; const rad = Math.sqrt(1 - y * y); const th = i * 2.399963; pp.set([Math.cos(th) * rad, y, Math.sin(th) * rad], i * 3); pr[i] = Math.random(); ps[i] = 1.6 + Math.random() * 2.6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aRand', new THREE.BufferAttribute(pr, 1)); pg.setAttribute('aSize', new THREE.BufferAttribute(ps, 1));
    const dots = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: this.orbU, vertexShader: PLANET_VERT, fragmentShader: DOT_FRAG, defines: { PLANET: 1 }, transparent: true, depthWrite: false }));
    dots.renderOrder = 2; dots.frustumCulled = false;
    const M = 4200; const tp = new Float32Array(M * 3); const tT = new Float32Array(M); const tR = new Float32Array(M); const tS = new Float32Array(M);
    for (let i = 0; i < M; i++) { tT[i] = Math.random(); tR[i] = Math.random(); tS[i] = 1.0 + Math.pow(Math.random(), 3) * 4.5; }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aT', new THREE.BufferAttribute(tT, 1)); tg.setAttribute('aRand', new THREE.BufferAttribute(tR, 1)); tg.setAttribute('aSize', new THREE.BufferAttribute(tS, 1));
    this.trailU = { ...this.orbU, uTint: { value: new THREE.Color(1, 0.93, 0.78) } };
    const trail = new THREE.Points(tg, new THREE.ShaderMaterial({ uniforms: this.trailU, vertexShader: TRAIL_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    trail.renderOrder = 3; trail.frustumCulled = false;
    this.orbDots = dots; this.orbShellMesh = shell; this.orbTrail = trail;
    this.orb.add(trail, shell, dots);
    this.orb.position.set(3.2, 0.2, 0);
    this.orbScale = 1.2;
    scene.add(this.orb);

    // floating German letters
    this.glyphTex = GLYPHS.map(glyphTexture);
    this.glyphs = []; this.glyphGroup = new THREE.Group(); scene.add(this.glyphGroup);
    this._spawnGlyphs(26);
    // ambient dust
    const n = 220; const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 34, (Math.random() - 0.5) * 20, -6 + Math.random() * 12], i * 3);
    this.dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.06, map: this.sprite, transparent: true, opacity: 0.4, depthWrite: false, color: 0x8a7a6a }));
    this.dust.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); scene.add(this.dust);

    // post
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.6, 1.15);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());

    this._onPointer = (e) => { this.pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)); };
    addEventListener('pointermove', this._onPointer, { passive: true });
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(document.documentElement);
    this.resize();
    this.setPalette(['#8b7bff', '#35e0c2', '#e0b3ff'], true);
    this.clock = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
    document.addEventListener('visibilitychange', () => { this.clock = performance.now(); });
  }

  _spawnGlyphs(n) {
    for (const g of this.glyphs) { this.glyphGroup.remove(g.s); g.s.material.dispose(); }
    this.glyphs = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glyphTex[i % this.glyphTex.length], transparent: true, depthWrite: false, opacity: 0, color: 0xffffff });
      const s = new THREE.Sprite(mat);
      const z = -9 + Math.random() * 11; const depth = (z + 9) / 11;
      const size = (0.9 + Math.random() * 1.7) * (0.8 + depth * 0.6);
      s.scale.set(size, size, 1);
      s.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 17, z);
      mat.rotation = (Math.random() - 0.5) * 0.7;
      this.glyphGroup.add(s);
      this.glyphs.push({ s, size, base: 0.12 + depth * 0.16, vy: 0.08 + Math.random() * 0.22, ph: Math.random() * 6.28, sway: 0.2 + Math.random() * 0.5, vx: 0, vyk: 0, ci: i % 3, rot: (Math.random() - 0.5) * 0.12, pop: 0 });
    }
  }

  // ---- public API ------------------------------------------------------------------------
  resize() {
    if (!this.renderer) return;
    const w = innerWidth; const h = innerHeight;
    const dpr = this.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.bgU.uRes.value.set(w, h);
    this.orbU.uPx.value = h * dpr * 0.5 / TAN * 0.0075;
    const k = this.quality === 'high' ? 0.3 : 0.2;
    this.bgRT.setSize(Math.max(160, Math.round(w * k)), Math.max(100, Math.round(h * k)));
  }
  setQuality(q) {
    this.quality = q === 'auto' ? 'high' : q; this.autoQ = q === 'auto'; this.resize();
    if (this.glyphs) { const want = this.quality === 'low' ? 12 : 26; if (this.glyphs.length !== want) this._spawnGlyphs(want); }
  }
  setLevelSource(fn) { this.levelFn = fn || (() => 0); }
  setPalette(pal, snap = false) {
    pal.forEach((c, i) => this.palette.tgt[i].set(c));
    if (snap) pal.forEach((c, i) => this.palette.cur[i].set(c));
  }
  setMood(name, hold = 0) {
    const m = MOODS[name] || MOODS.calm; this.mood.tint = m.tint; this.mood.tgt = m;
    clearTimeout(this._moodT);
    if (hold) this._moodT = setTimeout(() => this.setMood('calm'), hold);
  }
  setThinking(on) { this.thinkingT = on ? 1 : 0; }
  /** Anchor the orb to a DOM element (pass null to release it back to the default spot). */
  anchor(kind, el, opts = {}) { this.anchors[kind] = el ? { el, ...opts } : null; }
  pulse(strength = 1) { this._pulse = Math.max(this._pulse || 0, strength); this.flash = Math.max(this.flash, strength * 0.5); }
  /** Letters pop and drift outward — a joyful reaction to a right answer (or a shiver on a wrong one). */
  scatter(power = 1) {
    for (const g of this.glyphs) {
      const a = Math.random() * 6.28; g.vx += Math.cos(a) * 3.2 * power; g.vyk += Math.sin(a) * 3.2 * power; g.pop = 1;
    }
  }
  burst(color = '#ffffff', n = 90, origin = null) {
    if (!this.ok) return;
    const pos = new Float32Array(n * 3); const vel = [];
    const o = origin || this.orb.position;
    for (let i = 0; i < n; i++) {
      pos.set([o.x, o.y, o.z + 1], i * 3);
      const a = Math.random() * 6.283; const b = Math.acos(2 * Math.random() - 1); const s = 2 + Math.random() * 4.5;
      vel.push(Math.sin(b) * Math.cos(a) * s, Math.sin(b) * Math.sin(a) * s, Math.cos(b) * s);
    }
    const p = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.16, map: this.sprite, transparent: true, depthWrite: false, color: new THREE.Color(color) }));
    p.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(p); this.particles.push({ p, vel, life: 0 });
  }
  /** A shock-wave ring from the orb (level-up, rule mastered). */
  ring(color = '#ffffff') {
    if (!this.ok) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(this.orb.position); m.position.z += 0.5;
    this.scene.add(m); this.rings.push({ m, life: 0 });
  }
  /** Screen-space point (px) → world position on the orb plane, for bursts from a button. */
  worldAt(x, y) {
    const hh = TAN * CAM_Z; const hw = hh * (innerWidth / innerHeight);
    return new THREE.Vector3(((x / innerWidth) * 2 - 1) * hw, -((y / innerHeight) * 2 - 1) * hh, 0);
  }

  destroy() {
    cancelAnimationFrame(this._raf); removeEventListener('pointermove', this._onPointer); this._ro?.disconnect();
    this.renderer?.dispose();
  }

  // ---- internals -------------------------------------------------------------------------
  _anchorTarget(a) {
    if (!a?.el || !a.el.isConnected) return null;
    const r = a.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const hh = TAN * CAM_Z; const hw = hh * (innerWidth / innerHeight);
    const nx = ((r.left + r.width / 2) / innerWidth) * 2 - 1; const ny = -(((r.top + r.height / 2) / innerHeight) * 2 - 1);
    return { x: nx * hw, y: ny * hh, size: (r.height / innerHeight) * 2 * hh };
  }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    if (!this.ok) return;
    const dtRaw = Math.min(0.05, (now - this.clock) / 1000); this.clock = now;
    const dt = this.reduced ? dtRaw * 0.45 : dtRaw;
    this.t += dt;
    this._adaptQuality(dtRaw);
    const t = this.t; const level = clamp(this.levelFn() || 0, 0, 1);

    const mood = this.mood; const k = mood.k;
    if (mood.tgt) { for (const key of ['energy', 'speed', 'bloom']) k[key] += (mood.tgt[key] - k[key]) * Math.min(1, dtRaw * 2.2); }
    const tintC = new THREE.Color(mood.tint || '#ffffff');
    const pc = this.palette.cur; const pt = this.palette.tgt;
    pc.forEach((c, i) => c.lerp(pt[i], Math.min(1, dtRaw * 2.4)));
    const eff = pc.map((c) => c.clone().lerp(tintC, 0.16));
    this.flash *= Math.pow(0.04, dtRaw);
    this.bgU.uTime.value = t; this.bgU.uC1.value.copy(eff[0]); this.bgU.uC2.value.copy(eff[1]); this.bgU.uC3.value.copy(eff[2]); this.bgU.uEnergy.value = 0.55 + 0.45 * k.energy; this.bgU.uFlash.value = this.flash;
    this.pointerS.lerp(this.reduced ? new THREE.Vector2() : this.pointer, Math.min(1, dtRaw * 3));
    this.bgU.uPointer.value.copy(this.pointerS);
    this.bloom.strength = this.quality === 'low' ? 0 : k.bloom;
    this.key.color.copy(eff[2]).lerp(new THREE.Color('#ffffff'), 0.5);

    const kc = 1 - Math.exp(-dtRaw * 3);
    this.camera.position.x += (this.pointerS.x * 0.55 - this.camera.position.x) * kc;
    this.camera.position.y += (this.pointerS.y * 0.35 - this.camera.position.y) * kc;
    this.camera.lookAt(0, 0, 0);

    this.thinking += (this.thinkingT - this.thinking) * Math.min(1, dtRaw * 3);
    this._pulse = (this._pulse || 0) * Math.pow(0.02, dtRaw);

    const U = this.orbU;
    U.uTime.value = t * k.speed; U.uLevel.value = clamp(level + this._pulse * 0.5, 0, 1.4); U.uThink.value = this.thinking;
    U.uC1.value.copy(eff[0]); U.uC2.value.copy(eff[1]); U.uC3.value.copy(eff[2]);
    const tg = this._anchorTarget(this.anchors.orb);
    const def = { x: 3.4, y: 0.3, s: 1.2 };
    const tx = tg ? tg.x : def.x; const ty = tg ? tg.y : def.y; const ts = tg ? (tg.size / 2) * (this.anchors.orb.fill ?? 0.78) : def.s;
    const kf = 1 - Math.exp(-dtRaw * 5.2); // time-based easing: same feel at 60 fps and at 12 fps
    this.orb.position.x += (tx - this.orb.position.x) * kf; this.orb.position.y += (ty - this.orb.position.y) * kf;
    const sc0 = this.orb.scale.x + (ts - this.orb.scale.x) * kf; this.orb.scale.setScalar(sc0);
    this.orb.visible = !(this.anchors.orb?.hidden);
    U.uScale.value = this.orb.scale.x;
    this.orbTrail.visible = this.orb.scale.x > 0.7;
    this.orbDots.rotation.y += dt * 0.12 * k.speed * (1 + this.thinking * 2.5); this.orbDots.rotation.x = Math.sin(t * 0.2) * 0.15;
    this.orb.rotation.z = -0.12;
    const sc = 1 + level * 0.05 + this._pulse * 0.04 + this.thinking * 0.015 * Math.sin(t * 7);
    this.orbShellMesh.scale.setScalar(sc * 0.985); this.orbDots.scale.setScalar(sc);
    this.shellU.uBody.value.copy(eff[0]).lerp(new THREE.Color('#ffd9c4'), 0.5);
    this.shellU.uRim.value.copy(eff[2]).lerp(new THREE.Color('#ffffff'), 0.78);
    this.trailU.uTint.value.copy(eff[2]).lerp(new THREE.Color('#fff4d6'), 0.7);

    // letters
    for (const g of this.glyphs) {
      const s = g.s;
      s.position.y += (g.vy * k.speed + g.vyk) * dt; s.position.x += (Math.sin(t * 0.3 + g.ph) * g.sway * 0.3 + g.vx) * dt;
      g.vx *= Math.pow(0.12, dt); g.vyk *= Math.pow(0.12, dt); g.pop *= Math.pow(0.05, dt);
      if (s.position.y > 9.5) { s.position.y = -9.5; s.position.x = (Math.random() - 0.5) * 30; }
      if (s.position.x > 16) s.position.x = -16; else if (s.position.x < -16) s.position.x = 16;
      s.material.rotation += g.rot * dt;
      const c = eff[g.ci]; s.material.color.copy(c).multiplyScalar(0.62);
      s.material.opacity += ((g.base + g.pop * 0.25 + level * 0.06) - s.material.opacity) * Math.min(1, dtRaw * 3);
      const pop = 1 + g.pop * 0.35; s.scale.set(g.size * pop, g.size * pop, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]; q.life += dt; const a = q.p.geometry.attributes.position;
      for (let j = 0; j < a.count; j++) { a.setXYZ(j, a.getX(j) + q.vel[j * 3] * dt, a.getY(j) + q.vel[j * 3 + 1] * dt, a.getZ(j) + q.vel[j * 3 + 2] * dt); q.vel[j * 3] *= 0.97; q.vel[j * 3 + 1] *= 0.97; q.vel[j * 3 + 2] *= 0.97; }
      a.needsUpdate = true; q.p.material.opacity = Math.max(0, 1 - q.life / 1.4);
      if (q.life > 1.4) { this.scene.remove(q.p); q.p.geometry.dispose(); q.p.material.dispose(); this.particles.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life += dt; const u = r.life / 1.6;
      r.m.scale.setScalar(1 + u * 9 * this.orb.scale.x); r.m.material.opacity = Math.max(0, 0.85 * (1 - u));
      if (u >= 1) { this.scene.remove(r.m); disposeTree(r.m); this.rings.splice(i, 1); }
    }
    const da = this.dust.geometry.attributes.position;
    for (let i = 0; i < da.count; i += 1) { let y = da.getY(i) + dt * 0.12 * k.speed; if (y > 10) y = -10; da.setY(i, y); da.setX(i, da.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.02); }
    da.needsUpdate = true; this.dust.material.color.copy(eff[2]).lerp(new THREE.Color('#ffffff'), 0.4);

    if ((this.frameN++ & 1) === 0) { this.renderer.setRenderTarget(this.bgRT); this.renderer.render(this.bgScene, this.bgCam); this.renderer.setRenderTarget(null); }
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera); else this.composer.render();
  }

  _adaptQuality(dt) {
    if (!this.autoQ) return;
    this.frames.push(dt); if (this.frames.length < 90) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length; this.frames = [];
    if (avg > 0.045) { this.slow++; if (this.slow >= 2) { this.quality = this.quality === 'high' ? 'medium' : 'low'; this.slow = 0; this.resize(); if (this.quality === 'low') this._spawnGlyphs(12); } } else this.slow = 0;
  }
}
