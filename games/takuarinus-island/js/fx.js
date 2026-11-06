// 粒子の演出（three.quarks の薄いラッパ。描画専用）。
// ゲームの規則のモジュールからは import しない。three.quarks は動的 import し、
// 読み込めなければ何もしない（公開関数はすべて例外を外へ出さない）。
import { PALETTE } from './palette.js';

export const PARTICLE_TEXTURE_SIZE = 4;
/** 同時に出せる短い系（バースト）の数 */
export const MAX_BURSTS = 16;

// N64 風に数を控えめに。max は系ごとの最大粒子数
export const FX_PRESETS = Object.freeze({
  stars: Object.freeze({
    max: 10, rate: 10, life: [0.7, 0.9], speed: [0, 0], size: [0.24, 0.32],
    colors: ['signStripe', 'checkerLight'], radius: 0.55, ring: true, spin: 4, gravity: 0, additive: false,
  }),
  sparks: Object.freeze({
    max: 12, duration: 0.06, rate: 160, life: [0.18, 0.35], speed: [2.5, 5], size: [0.09, 0.15],
    colors: ['road', 'gunBody'], radius: 0.1, gravity: 9, additive: true,
  }),
  boost: Object.freeze({
    max: 30, duration: 0.25, rate: 110, life: [0.4, 0.7], speed: [2, 4], size: [0.18, 0.3],
    colors: ['goggleLens', 'sun'], radius: 1.2, gravity: -6, additive: true,
  }),
  splash: Object.freeze({
    max: 16, duration: 0.05, rate: 300, life: [0.3, 0.55], speed: [2, 4.5], size: [0.1, 0.18],
    colors: ['gunTank', 'uiPanel'], radius: 0.15, gravity: 9, additive: false,
  }),
  confetti: Object.freeze({
    max: 30, duration: 0.08, rate: 400, life: [1.4, 2], speed: [3, 6], size: [0.14, 0.22],
    colors: ['mohicanRed', 'mohicanYellow'], radius: 0.3, gravity: 3, additive: false,
  }),
  firework: Object.freeze({
    max: 40, duration: 0.05, rate: 900, life: [0.9, 1.3], speed: [5, 7], size: [0.22, 0.32],
    colors: ['mohicanRed', 'signStripe'], radius: 0.2, gravity: 2.5, additive: true,
  }),
});

/** 花火の色の組（順番に使う） */
export const FIREWORK_COLORS = Object.freeze([
  Object.freeze(['mohicanRed', 'signStripe']),
  Object.freeze(['mohicanGreen', 'checkerLight']),
  Object.freeze(['mohicanYellow', 'uiAccent']),
  Object.freeze(['goggleLens', 'mohicanPurple']),
]);

/** エンディングで花火を打ち上げる間隔（秒） */
export const FIREWORK_INTERVAL = 0.8;

/** n 発目の花火の位置（島の上空。毎回同じ結果になる） */
export function fireworkSpot(n) {
  const i = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  const a = i * 2.39996;
  const r = 4 + ((i * 7) % 5);
  return { x: Math.cos(a) * r, y: 10 + ((i * 3) % 4), z: Math.sin(a) * r };
}

function pickColors(colors) {
  if (!Array.isArray(colors) || colors.length < 2) return null;
  const c = [colors[0], colors[1]];
  return c.every((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(PALETTE, k)) ? c : null;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * three 0.160 は古い名前 updateRange を読むたびに警告を出す。three.quarks 0.11 は毎フレーム読むので、
 * エンディングだけで約37秒に7,240回出ていた（新しい three.quarks は three 0.165 以上が要る）。
 * 中身は同じ値（_updateRange）を返したまま、警告だけを出さない読み方に差し替える。
 */
export function quietLegacyUpdateRange(three) {
  let n = 0;
  for (const name of ['BufferAttribute', 'InterleavedBuffer']) {
    const C = three && three[name];
    const proto = C && C.prototype;
    if (!proto) continue;
    const d = Object.getOwnPropertyDescriptor(proto, 'updateRange');
    if (!d || typeof d.get !== 'function' || !d.configurable) continue;
    Object.defineProperty(proto, 'updateRange', {
      configurable: true,
      enumerable: d.enumerable,
      get() { return this._updateRange; },
    });
    n++;
  }
  return n;
}

async function defaultLoad(THREEarg) {
  const quarks = await import('three.quarks');
  const three = THREEarg || (await import('three'));
  try { quietLegacyUpdateRange(three); } catch { /* 警告が出るだけで粒子は動く */ }
  return { quarks, three };
}

const finitePos = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/**
 * load: () => Promise<{quarks, three}>（テスト用の差し替え）
 * warn: 失敗時の警告（1回だけ）
 */
export function createFx({ load = defaultLoad, warn = (...a) => console.warn(...a) } = {}) {
  let Q = null;
  let T = null;
  let batch = null;
  let scene = null;
  let enabled = false;
  let failed = false;
  let loading = null;
  let warned = false;
  let texture = null;
  const mats = new Map();
  const bursts = []; // { system, ttl }
  let loop = null; // { system, pivot, target, spin }

  function warnOnce(msg, err) {
    if (warned) return;
    warned = true;
    try { warn(msg, err); } catch { /* 握りつぶす */ }
  }

  function start(THREEarg) {
    if (loading) return loading;
    loading = (async () => {
      try {
        const mods = await load(THREEarg);
        const q = mods && mods.quarks;
        const t = mods && mods.three;
        const B = q && (q.BatchedRenderer || q.BatchedParticleRenderer);
        if (!t || typeof B !== 'function' || typeof q.ParticleSystem !== 'function') {
          throw new Error('three.quarks の中身が想定と違います');
        }
        Q = q;
        T = t;
        batch = new B();
        enabled = true;
        if (scene) scene.add(batch);
      } catch (err) {
        failed = true;
        enabled = false;
        Q = null;
        batch = null;
        warnOnce('粒子（three.quarks）を使わずに続けます:', err);
      }
      return enabled;
    })();
    return loading;
  }

  function getTexture() {
    if (texture) return texture;
    const n = PARTICLE_TEXTURE_SIZE;
    // N64 風の四角いドット: canvas で 4×4 の白を作る（canvas が無い環境では DataTexture）
    try {
      if (typeof document !== 'undefined' && typeof T.CanvasTexture === 'function') {
        const c = document.createElement('canvas');
        c.width = n;
        c.height = n;
        const g = c.getContext('2d');
        if (g) {
          g.fillStyle = PALETTE.uiPanel;
          g.fillRect(0, 0, n, n);
          texture = new T.CanvasTexture(c);
        }
      }
    } catch {
      texture = null;
    }
    if (!texture) {
      const data = new Uint8Array(n * n * 4).fill(255);
      texture = new T.DataTexture(data, n, n, T.RGBAFormat);
    }
    texture.magFilter = T.NearestFilter;
    texture.minFilter = T.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function materialFor(additive) {
    const key = additive ? 'add' : 'normal';
    if (!mats.has(key)) {
      mats.set(key, new T.MeshBasicMaterial({
        map: getTexture(),
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
      }));
    }
    return mats.get(key);
  }

  function makeSystem(p, looping, worldSpace) {
    const V4 = Q.Vector4 || T.Vector4;
    const V3 = Q.Vector3 || T.Vector3;
    const iv = (a) => (a[0] === a[1] ? new Q.ConstantValue(a[0]) : new Q.IntervalValue(a[0], a[1]));
    const [c0, c1] = p.colors.map((k) => hexToRgb(PALETTE[k] || PALETTE.uiPanel));
    const startColor = Q.ColorRange
      ? new Q.ColorRange(new V4(c0[0], c0[1], c0[2], 1), new V4(c1[0], c1[1], c1[2], 1))
      : new Q.ConstantColor(new V4(c0[0], c0[1], c0[2], 1));
    const shape = p.ring && Q.CircleEmitter
      ? new Q.CircleEmitter({ radius: p.radius, thickness: 0, arc: Math.PI * 2 })
      : new Q.SphereEmitter({ radius: p.radius, thickness: 1, arc: Math.PI * 2 });
    const system = new Q.ParticleSystem({
      duration: looping ? 1 : p.duration,
      looping,
      startLife: iv(p.life),
      startSpeed: iv(p.speed),
      startSize: iv(p.size),
      startColor,
      worldSpace,
      maxParticle: p.max,
      emissionOverTime: new Q.ConstantValue(p.rate),
      emissionBursts: [],
      shape,
      material: materialFor(p.additive),
      renderMode: Q.RenderMode && Q.RenderMode.BillBoard !== undefined ? Q.RenderMode.BillBoard : 0,
      renderOrder: 2,
    });
    try {
      if (Q.SizeOverLife && Q.PiecewiseBezier && Q.Bezier) {
        system.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(1, 0.95, 0.7, 0), 0]])));
      }
    } catch { /* 補助の動きが無くても続ける */ }
    try {
      if (p.gravity && Q.ApplyForce) {
        system.addBehavior(new Q.ApplyForce(new V3(0, p.gravity > 0 ? -1 : 1, 0), new Q.ConstantValue(Math.abs(p.gravity))));
      }
    } catch { /* 補助の動きが無くても続ける */ }
    return system;
  }

  function removeSystem(sys) {
    if (!sys) return;
    try { if (batch) batch.deleteSystem(sys); } catch { /* 握りつぶす */ }
    try { if (sys.emitter && sys.emitter.parent) sys.emitter.parent.remove(sys.emitter); } catch { /* 握りつぶす */ }
  }

  function stopLoop() {
    if (!loop) return;
    const l = loop;
    loop = null;
    removeSystem(l.system);
    try { if (l.pivot.parent) l.pivot.parent.remove(l.pivot); } catch { /* 握りつぶす */ }
  }

  function clearAll() {
    while (bursts.length) removeSystem(bursts.shift().system);
    stopLoop();
  }

  function disable(err) {
    warnOnce('粒子の描画を止めます:', err);
    try { clearAll(); } catch { /* 握りつぶす */ }
    try { if (batch && batch.parent) batch.parent.remove(batch); } catch { /* 握りつぶす */ }
    enabled = false;
    failed = true;
    batch = null;
  }

  let fireworkCount = 0;

  function burst(name, pos, colors) {
    if (!enabled || !batch || !scene || !finitePos(pos)) return false;
    try {
      const base = FX_PRESETS[name];
      const c = pickColors(colors);
      const p = c ? { ...base, colors: c } : base;
      while (bursts.length >= MAX_BURSTS) removeSystem(bursts.shift().system);
      const sys = makeSystem(p, false, true);
      sys.emitter.position.set(pos.x, pos.y, pos.z);
      batch.addSystem(sys);
      scene.add(sys.emitter);
      bursts.push({ system: sys, ttl: p.duration + p.life[1] + 0.15 });
      return true;
    } catch (err) {
      warnOnce('粒子を出せません:', err);
      return false;
    }
  }

  return {
    get enabled() { return enabled; },
    get failed() { return failed; },
    /** 読み込みの完了（成功なら true） */
    get ready() { return loading || Promise.resolve(false); },
    get burstCount() { return bursts.length; },
    get hasLoop() { return !!loop; },
    init(s, THREEarg) {
      try {
        if (scene !== s) clearAll();
        if (batch && batch.parent && batch.parent !== s) batch.parent.remove(batch);
        scene = s || null;
        if (batch && scene && batch.parent !== scene) scene.add(batch);
        if (!failed) start(THREEarg);
      } catch (err) {
        warnOnce('粒子の準備に失敗しました:', err);
      }
    },
    update(dt) {
      if (!enabled || !batch) return;
      const h = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      if (h <= 0) return;
      try {
        if (loop) loop.pivot.rotation.y += h * loop.spin;
        for (let i = bursts.length - 1; i >= 0; i--) {
          bursts[i].ttl -= h;
          if (bursts[i].ttl <= 0) {
            removeSystem(bursts[i].system);
            bursts.splice(i, 1);
          }
        }
        batch.update(h);
      } catch (err) {
        disable(err);
      }
    },
    /** 気絶の星（obj の上で回る）。obj が null なら止める。粒子で描けたら true */
    stars(obj) {
      if (!enabled || !batch) return false;
      try {
        if (loop && loop.target === obj && obj) return true;
        stopLoop();
        if (!obj || typeof obj.add !== 'function') return false;
        const p = FX_PRESETS.stars;
        const sys = makeSystem(p, true, false);
        const pivot = new T.Group();
        sys.emitter.rotation.x = -Math.PI / 2; // 輪を水平に寝かせる
        pivot.add(sys.emitter);
        obj.add(pivot);
        batch.addSystem(sys);
        loop = {
          system: sys, pivot, target: obj, spin: p.spin,
        };
        return true;
      } catch (err) {
        warnOnce('星を出せません:', err);
        return false;
      }
    },
    sparks: (pos) => burst('sparks', pos),
    boost: (pos) => burst('boost', pos),
    splash: (pos) => burst('splash', pos),
    /** 紙吹雪（colors はパレットのキー2つ。省略で既定） */
    confetti: (pos, colors) => burst('confetti', pos, colors),
    /** 花火（colors を省くと FIREWORK_COLORS を順番に使う） */
    firework(pos, colors) {
      const c = colors || FIREWORK_COLORS[fireworkCount % FIREWORK_COLORS.length];
      const ok = burst('firework', pos, c);
      if (ok) fireworkCount += 1;
      return ok;
    },
    dispose() {
      try {
        clearAll();
        if (batch && batch.parent) batch.parent.remove(batch);
      } catch { /* 握りつぶす */ }
      scene = null;
    },
  };
}

/** アプリ全体で使う1つの粒子係 */
export const fx = createFx();
