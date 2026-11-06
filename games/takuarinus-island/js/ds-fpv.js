// 真っ暗ソウルの一人称視点の規則（three.js・DOM・Web Audio に依存しない）。
// 目の高さ・しゃがみ・歩く揺れ・見る向き・懐中電灯の向き・足音の大きさ・使わないキー。
const f = Object.freeze;

/** 目の高さ（m） */
export const EYE_HEIGHT = 1.6;
/** しゃがんだときの目の高さ */
export const CROUCH_EYE = 1.0;
/** 力尽きたときの目の高さ */
export const DEAD_EYE = 0.35;
/** 歩く・走る・しゃがむの速さ（m/秒） */
export const FPV_SPEED = f({ walk: 2.4, run: 4.4, crouch: 1.1 });
/** 歩く揺れの大きさ（m）。揺れは小さく */
export const BOB_AMP = f({ walk: 0.03, run: 0.045, crouch: 0.018 });
/** 視界が1回上下するあいだに進む距離（m） */
export const BOB_STRIDE = 1.5;
/** 足音の大きさの倍率 */
export const FOOTSTEP_GAIN = f({ walk: 1, run: 1.9, crouch: 0.35 });
/** 遊んでいる間は使わないキー（殴る・回避はなくした） */
export const BLOCKED_KEYS = f(['KeyJ', 'Space']);
/** 走るキー（しゃがんでいる間は効かない） */
export const RUN_KEYS = f(['ShiftLeft', 'ShiftRight']);
/** しゃがむキー（押している間しゃがむ） */
export const CROUCH_KEYS = f(['KeyC']);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** 'crouch' | 'run' | 'walk'（しゃがみが優先） */
export function stanceOf({ running = false, crouch = false } = {}) {
  if (crouch) return 'crouch';
  return running ? 'run' : 'walk';
}

export function moveSpeed(s = {}) {
  return FPV_SPEED[stanceOf(s)];
}

export function footstepGain(s = {}) {
  return FOOTSTEP_GAIN[stanceOf(s)];
}

export function createView() {
  return {
    eye: EYE_HEIGHT, crouch: false, dead: false, phase: 0, k: 0, bob: 0, amp: BOB_AMP.walk,
  };
}

/** 1フレーム進める。moved はこのフレームに動いた距離 */
export function stepView(v, {
  moved = 0, dt = 0, crouch = false, dead = false, running = false,
} = {}) {
  const d = fin(dt) && dt > 0 ? dt : 0;
  const m = fin(moved) && moved > 0 ? moved : 0;
  v.dead = !!dead;
  v.crouch = !!crouch && !v.dead;
  const target = v.dead ? DEAD_EYE : v.crouch ? CROUCH_EYE : EYE_HEIGHT;
  v.eye += (target - v.eye) * Math.min(1, d * 10);
  v.amp = BOB_AMP[stanceOf({ running, crouch: v.crouch })];
  const moving = m > 1e-4 && !v.dead;
  v.k += ((moving ? 1 : 0) - v.k) * Math.min(1, d * 8);
  if (moving) v.phase += (m / BOB_STRIDE) * Math.PI * 2;
  v.bob = Math.sin(v.phase) * v.amp * v.k;
  return v;
}

/** 見る向き（yaw=0 は +z、pitch が正なら下を向く）。長さ 1 */
export function lookDir(yaw, pitch) {
  const y = fin(yaw) ? yaw : 0;
  const p = fin(pitch) ? pitch : 0;
  return { x: Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
}

/** 右の向き（水平） */
export function rightDir(yaw) {
  const y = fin(yaw) ? yaw : 0;
  return { x: -Math.cos(y), y: 0, z: Math.sin(y) };
}

/** 懐中電灯：目の少し右下から、見ている方向を照らす */
export function flashlightPose(eye, yaw, pitch, { reach = 6 } = {}) {
  const e = eye || { x: 0, y: EYE_HEIGHT, z: 0 };
  const dir = lookDir(yaw, pitch);
  const r = rightDir(yaw);
  return {
    pos: {
      x: e.x + r.x * 0.18 + dir.x * 0.1,
      y: e.y - 0.22,
      z: e.z + r.z * 0.18 + dir.z * 0.1,
    },
    target: { x: e.x + dir.x * reach, y: e.y + dir.y * reach, z: e.z + dir.z * reach },
  };
}

/**
 * 入力を包む。active() の間は BLOCKED_KEYS を無視し、crouching() の間は走るキーも無視する。
 * ほかの関数・値はそのまま元の入力に渡す。
 */
export function wrapInput(input, { active = () => true, crouching = () => false } = {}) {
  if (!input || typeof input !== 'object') return input;
  const allow = (code) => {
    if (!active()) return true;
    if (BLOCKED_KEYS.includes(code)) return false;
    if (crouching() && RUN_KEYS.includes(code)) return false;
    return true;
  };
  const filt = (fn) => (...codes) => {
    const ok = codes.filter(allow);
    return ok.length ? !!fn.apply(input, ok) : false;
  };
  return new Proxy(input, {
    get(t, k) {
      if ((k === 'isDown' || k === 'wasPressed') && typeof t[k] === 'function') return filt(t[k]);
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
