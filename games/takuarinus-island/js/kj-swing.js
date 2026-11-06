// 怪獣大決戦の「大振りの攻撃」の姿勢の規則（three.js・DOM・Web Audio に依存しない）。
// 押している時間で決まる進み具合 p（kj-rules.js）を、大きな構え → 振り抜きの軌道に写す。
// パンチは肩を大きく引いて体をひねってから振り抜く。キックは片足を大きく振り上げる。
// しっぽは腰から体ごと大きく回す。振り抜いて離したあとは、体が流れて少しよろける。
import { HIT_MIN_P, MAX_DT } from './kj-rules.js';

const f = Object.freeze;

/** 姿勢の値の名前（lean: 前後の傾き、twist: ひねり、sink: 沈み、lunge: 踏み込み、arm: 腕、leg: 脚） */
export const POSE_KEYS = f(['lean', 'twist', 'sink', 'lunge', 'arm', 'leg']);

/** 構え（引き切る）が終わる進み具合。ここから振り抜きに入る */
export const WINDUP_END = f({ punch: 0.4, kick: 0.3, tail: 0.4 });

/** 構え切った姿勢と、振り抜いた姿勢（ラジアンとワールド単位） */
export const SWING_SHAPES = f({
  punch: f({
    windup: f({ lean: -0.18, twist: 0.95, sink: 1.0, lunge: -0.8, arm: 1.5, leg: 0 }),
    strike: f({ lean: 0.4, twist: -1.2, sink: 0.6, lunge: 4.5, arm: -2.7, leg: -0.3 }),
  }),
  kick: f({
    windup: f({ lean: -0.12, twist: 0.35, sink: 1.2, lunge: -0.5, arm: 0.3, leg: 0.45 }),
    strike: f({ lean: -0.45, twist: -0.25, sink: 0.3, lunge: 2.8, arm: 0.7, leg: -2.5 }),
  }),
  tail: f({
    windup: f({ lean: 0.1, twist: 1.3, sink: 1.1, lunge: -0.4, arm: 0.5, leg: 0 }),
    strike: f({ lean: 0.22, twist: -3.3, sink: 0.7, lunge: 1.2, arm: 0.9, leg: 0.2 }),
  }),
});

/** 振り抜いた後に体が流れる長さ（秒） */
export const FOLLOW_SEC = f({ punch: 1.1, kick: 1.3, tail: 1.5 });
/** 体が流れる大きさ（強さ 1 のとき） */
export const FOLLOW_SHAPES = f({
  punch: f({ lean: 0.3, twist: -0.45, sink: 0.7, lunge: 1.6 }),
  kick: f({ lean: -0.25, twist: 0.3, sink: 0.9, lunge: 1.0 }),
  tail: f({ lean: 0.2, twist: -0.8, sink: 0.8, lunge: 0.8 }),
});
/** よろける揺れの数（半往復の数） */
export const FOLLOW_WOBBLES = 2.5;
const FOLLOW_ATTACK = 0.12;

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};
const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

export function zeroPose() {
  return {
    lean: 0, twist: 0, sink: 0, lunge: 0, arm: 0, leg: 0,
  };
}

/** 2つの姿勢を足す */
export function combinePose(a, b) {
  const out = zeroPose();
  for (const k of POSE_KEYS) out[k] = (Number(a && a[k]) || 0) + (Number(b && b[k]) || 0);
  return out;
}

/** 押している間の軌道（構え → 振り抜き） */
function forwardPose(kind, p, hasArm, hasLeg) {
  const sh = SWING_SHAPES[kind];
  const W = WINDUP_END[kind];
  const q = clamp01(p);
  const wind = smooth(q / W);
  const s = smooth((q - W) / (1 - W));
  const out = zeroPose();
  for (const k of POSE_KEYS) out[k] = sh.windup[k] * wind * (1 - s) + sh.strike[k] * s;
  if (kind === 'tail') out.sink += 0.8 * Math.sin(Math.PI * s);
  // 骨が見つからないときは、体全体の傾きとひねりで補う
  if (kind === 'punch' && !hasArm) {
    out.lean += 0.15 * s;
    out.twist -= 0.2 * s;
  }
  if (kind === 'kick' && !hasLeg) {
    out.lean -= 0.12 * s;
    out.lunge += 0.6 * s;
  }
  return out;
}

/**
 * 進み具合 p → 姿勢。returning は離して戻っている途中、releasedAt は離したときの進み具合。
 * 振り抜きに入ってから離したときは、離した姿勢から（構えを通らずに）戻る。
 */
export function swingPose(kind, p, {
  returning = false, releasedAt = null, hasArm = true, hasLeg = true,
} = {}) {
  if (!SWING_SHAPES[kind]) return zeroPose();
  const q = clamp01(p);
  const rel = Number(releasedAt);
  if (returning && Number.isFinite(rel) && rel > WINDUP_END[kind] && q < rel) {
    const base = forwardPose(kind, rel, hasArm, hasLeg);
    const k = smooth(q / rel);
    const out = zeroPose();
    for (const key of POSE_KEYS) out[key] = base[key] * k;
    return out;
  }
  return forwardPose(kind, q, hasArm, hasLeg);
}

/** 離したときの進み具合 → 体が流れる強さ（当たる前に離したら 0） */
export function followStrength(p) {
  const q = clamp01(p);
  return q < HIT_MIN_P ? 0 : q;
}

export function createFollow() {
  return {
    kind: null, t: 0, dur: 0, strength: 0,
  };
}

export function followActive(state) {
  return !!state && !!FOLLOW_SHAPES[state.kind] && state.t < state.dur && state.strength > 0;
}

/** 振り抜いた後の流れを始める（強さ 0 なら何もしない） */
export function startFollow(state, kind, strength) {
  const s = clamp01(strength);
  if (!FOLLOW_SHAPES[kind] || !(s > 0)) return state && typeof state === 'object' ? state : createFollow();
  return {
    kind, t: 0, dur: FOLLOW_SEC[kind], strength: s,
  };
}

/** 1フレーム進める（dt は MAX_DT に丸める） */
export function stepFollow(state, dt) {
  if (!followActive(state)) return createFollow();
  const n = Number(dt);
  const d = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_DT) : 0;
  const t = state.t + d;
  if (t >= state.dur) return createFollow();
  return { ...state, t };
}

/** 体が流れてよろける分の姿勢（最初は 0 から立ち上がり、揺れながら 0 に戻る） */
export function followPose(state) {
  const out = zeroPose();
  if (!followActive(state)) return out;
  const sh = FOLLOW_SHAPES[state.kind];
  const k = clamp01(state.t / state.dur);
  const env = smooth(k / FOLLOW_ATTACK) * (1 - k) * (1 - k) * state.strength;
  const w = Math.PI * FOLLOW_WOBBLES * k;
  out.lean = sh.lean * env * Math.cos(w);
  out.twist = sh.twist * env * Math.cos(w * 0.8);
  out.sink = sh.sink * env * Math.abs(Math.sin(w));
  out.lunge = sh.lunge * state.strength * Math.sin(Math.PI * k);
  return out;
}
