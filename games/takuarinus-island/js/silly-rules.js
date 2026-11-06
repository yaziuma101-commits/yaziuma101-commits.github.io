// おふざけの規則（three.js・DOM・Web Audio に依存しない）。
// おふざけ度・ハブの出来事の間隔・効果音の差し替え・演出の確率。乱数は必ず引数で受け取る。
import { pick } from './seeded-rng.js';

const f = Object.freeze;

export const DEFAULT_SILLY_LEVEL = 2;
export const SILLY_LEVEL_MAX = 3;
export const SILLY_STORAGE_KEY = 'takuarinus-silly-v1';

/** null/undefined/''/NaN は既定 2。数値化して四捨五入し 0〜3 に丸める */
export function normalizeSillyLevel(x) {
  if (x === null || x === undefined || x === '') return DEFAULT_SILLY_LEVEL;
  const n = Number(x);
  if (!Number.isFinite(n)) return DEFAULT_SILLY_LEVEL;
  return Math.max(0, Math.min(SILLY_LEVEL_MAX, Math.round(n)));
}

/** 保存データ（{level} かその JSON 文字列）→ おふざけ度。壊れていれば既定 */
export function loadSillyLevel(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = null; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return normalizeSillyLevel(v.level);
  return DEFAULT_SILLY_LEVEL;
}

export function serializeSilly(level) {
  return { level: normalizeSillyLevel(level) };
}

// ---- ハブの出来事 ----
export const HUB_EVENTS = f(['tofu-rain', 'mohifry-parade', 'buddy-handstand', 'giant-mohawk']);
export const EVENT_DURATION = f([3, 6]);
export const EVENT_INTERVAL = f({ 1: f([60, 90]), 2: f([30, 60]), 3: f([20, 40]) });

/** 出来事の持続（3〜6 秒） */
export function eventDuration(rng) {
  const [lo, hi] = EVENT_DURATION;
  return lo + rng() * (hi - lo);
}

/** 次の出来事までの秒数。level 0 は Infinity */
export function nextEventDelay(level, rng) {
  const lv = normalizeSillyLevel(level);
  if (lv === 0) return Infinity;
  const [lo, hi] = EVENT_INTERVAL[lv];
  return lo + rng() * (hi - lo);
}

/** 直前と同じ出来事は返さない */
export function pickHubEvent(rng, lastId) {
  const list = HUB_EVENTS.filter((e) => e !== lastId);
  return pick(rng, list.length ? list : HUB_EVENTS);
}

/** tick(dt,{blocked}) で出来事 ID か null。1 回の tick で最大 1 つ */
export function createEventScheduler({ level = DEFAULT_SILLY_LEVEL, rng } = {}) {
  let lv = normalizeSillyLevel(level);
  let elapsed = 0;
  let delay = nextEventDelay(lv, rng);
  let last = null;
  return {
    tick(dt, { blocked = false } = {}) {
      if (blocked || lv === 0) return null;
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      elapsed += d;
      if (elapsed < delay) return null;
      elapsed = 0;
      delay = nextEventDelay(lv, rng);
      last = pickHubEvent(rng, last);
      return last;
    },
    setLevel(n) {
      lv = normalizeSillyLevel(n);
      elapsed = 0;
      delay = nextEventDelay(lv, rng);
    },
    get level() { return lv; },
    get elapsed() { return elapsed; },
    get delay() { return delay; },
  };
}

// ---- 効果音 ----
export const SILLY_SFX = f(['boing', 'slideUp', 'slideDown', 'duck', 'zuko', 'crowdWow', 'crowdAww', 'cowbell', 'trumpetFail']);

/** audio.js に実在する効果音名 → 差し替え先 */
export const SWAPPABLE_SFX = f({
  land: f(['boing', 'duck', 'zuko']),
  talk: f(['duck', 'slideUp', 'cowbell']),
  confirm: f(['cowbell', 'slideUp', 'crowdWow']),
  hit: f(['zuko', 'crowdAww', 'trumpetFail', 'slideDown']),
  jump: f(['boing', 'slideUp']),
  push: f(['duck', 'boing']),
});

export const SFX_SWAP_PROB = f([0, 0.15, 1 / 3, 0.5]);

const swapListeners = new Set();

/** 効果音が差し替わったときに (原音, 鳴らす音) で呼ぶ関数を登録する。解除する関数を返す */
export function onSfxSwap(fn) {
  if (typeof fn !== 'function') return () => {};
  swapListeners.add(fn);
  return () => swapListeners.delete(fn);
}

function notifySwap(name, out) {
  for (const fn of swapListeners) {
    try { fn(name, out); } catch { /* 握りつぶす */ }
  }
}

/** 鳴らす音の名前を決める。対象外と level 0 は原音で、乱数も消費しない */
export function decideSfx(name, level, rng) {
  if (!Object.prototype.hasOwnProperty.call(SWAPPABLE_SFX, name)) return name;
  const list = SWAPPABLE_SFX[name];
  const p = SFX_SWAP_PROB[normalizeSillyLevel(level)] || 0;
  if (!(p > 0) || !list.length) return name;
  if (!(rng() < p)) return name;
  const out = pick(rng, list) ?? name;
  if (out !== name) notifySwap(name, out);
  return out;
}

// ---- 演出 ----
export const FX_BASE = f({ text: 0.7, shake: 0.5, squash: 0.6, spin: 0.08 });
export const FX_LEVEL_MUL = f([0, 0.5, 1, 1.5]);

export function fxChance(kind, level) {
  const base = FX_BASE[kind] ?? 0;
  return Math.min(1, base * FX_LEVEL_MUL[normalizeSillyLevel(level)]);
}

export function rollFx(kind, level, rng) {
  const c = fxChance(kind, level);
  return c > 0 && rng() < c;
}

export const ONOMATOPOEIA = f(['ドーン！', 'ズコー', 'ぬ゛', 'ボヨーン', 'ペチャ', 'キラーン']);

export function pickOnomatopoeia(rng) {
  return pick(rng, ONOMATOPOEIA);
}

export const TEXT_TIME = 1;
export const SQUASH_TIME = 0.4;
export const SPIN_TIME = 0.8;

/** むにゅっ（Y 縮み・XZ 伸びのバネ）。t は開始からの秒 */
export function squashScale(t, amp = 0.3) {
  if (!(t >= 0) || t >= SQUASH_TIME) return { y: 1, xz: 1 };
  const k = t / SQUASH_TIME;
  const a = amp * Math.cos(k * Math.PI * 3) * (1 - k);
  return { y: 1 - a, xz: 1 + a * 0.5 };
}

/** カメラ一回転の角度（0.8 秒で 2π、なめらかに） */
export function spinAngle(t) {
  const k = Math.max(0, Math.min(1, (Number.isFinite(t) ? t : 0) / SPIN_TIME));
  const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
  return Math.PI * 2 * e;
}

// ---- ハブの出来事の段取りと動き（描画は silly-fx.js） ----
const TAU = Math.PI * 2;
export const TOFU_COUNT = f([3, 6]);
export const PARADE_SIZE = 6;
export const TOFU_GRAVITY = 20;
export const TOFU_BOUNCE = 0.45;
/** 着地のたびに地面にぺたっと止まる時間（秒） */
export const TOFU_REST = 0.06;
export const HANDSTAND_FLIP_TIME = 0.4;

/** 出来事を止める条件（会話中・ポーズ中・移動中・ボス戦中） */
export function hubEventBlocked({
  talking = false, paused = false, leaving = false, boss = false,
} = {}) {
  return !!(talking || paused || leaving || boss);
}

/** 出来事の段取り。未知の id は null。乱数は rng だけを使う */
export function planHubEvent(id, rng, { buddyCount = 0 } = {}) {
  if (!HUB_EVENTS.includes(id)) return null;
  const duration = eventDuration(rng);
  if (id === 'tofu-rain') {
    const [lo, hi] = TOFU_COUNT;
    const n = Math.min(hi, lo + Math.floor(rng() * (hi - lo + 1)));
    const drops = [];
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const r = 1.5 + rng() * 4;
      drops.push({
        dx: Math.cos(a) * r,
        dz: Math.sin(a) * r,
        delay: rng() * Math.min(1.2, duration * 0.3),
        height: 8 + rng() * 4,
        spin: rng() * TAU,
      });
    }
    return { id, duration, drops };
  }
  if (id === 'mohifry-parade') {
    const gap = 0.9;
    return {
      id, duration, count: PARADE_SIZE, side: rng() < 0.5 ? -1 : 1, offset: 4 + rng() * 2, gap, span: 8 + PARADE_SIZE * gap,
    };
  }
  if (id === 'buddy-handstand') {
    const n = Math.floor(Number(buddyCount));
    return { id, duration, buddy: n > 0 ? Math.min(n - 1, Math.floor(rng() * n)) : null };
  }
  return {
    id, duration, angle: (rng() - 0.5) * 1.4, dist: 5 + rng() * 2, height: 4 + rng() * 2,
  };
}

/** とうふの高さ（落ちて数回跳ねる）。t は落ち始めからの秒 */
export function tofuDropY(t, height = 10) {
  const h = Math.max(0, Number(height) || 0);
  if (!(t > 0)) return h;
  const g = TOFU_GRAVITY;
  const t0 = Math.sqrt((2 * h) / g);
  if (t < t0) return Math.max(0, h - 0.5 * g * t * t);
  let rest = t - t0;
  let v = g * t0 * TOFU_BOUNCE;
  while (v > 0.4) {
    if (rest < TOFU_REST) return 0;
    rest -= TOFU_REST;
    const T = (2 * v) / g;
    if (rest < T) return Math.max(0, v * rest - 0.5 * g * rest * rest);
    rest -= T;
    v *= TOFU_BOUNCE;
  }
  return 0;
}

/** 終わり際に縮んで消える倍率（1→0） */
export function fadeOutScale(t, duration, out = 0.5) {
  if (!(t < duration)) return 0;
  if (!(t > 0)) return 1;
  return Math.max(0, Math.min(1, (duration - t) / out));
}

/** 行列の先頭の位置（-span → +span） */
export function paradeOffset(t, duration, span) {
  const k = duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 1;
  return -span + 2 * span * k;
}

/** 逆立ち：flip（0→π→0）、lift（足元を持ち上げる割合 0〜1）、spin（回る角度） */
export function handstandPose(t, duration) {
  if (!(t > 0) || !(t < duration)) return { flip: 0, lift: 0, spin: 0 };
  const k = Math.min(1, t / HANDSTAND_FLIP_TIME, (duration - t) / HANDSTAND_FLIP_TIME);
  const e = k * k * (3 - 2 * k);
  const flip = Math.PI * e;
  return { flip, lift: (1 - Math.cos(flip)) / 2, spin: t * 7 * e };
}

/** 巨大モヒカンの伸び（0 → 少し行き過ぎて 1 → 0） */
export function giantMohawkRise(t, duration) {
  if (!(t > 0) || !(t < duration)) return 0;
  const up = Math.min(0.6, duration / 3);
  const down = Math.min(0.5, duration / 3);
  if (t < up) {
    const k = t / up - 1;
    const c1 = 1.70158;
    return Math.max(0, 1 + (c1 + 1) * k * k * k + c1 * k * k);
  }
  if (t > duration - down) {
    const k = (duration - t) / down;
    return k * k;
  }
  return 1 + 0.05 * Math.sin((t - up) * 8);
}
