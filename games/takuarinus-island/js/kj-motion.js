// 怪獣大決戦の「怪獣らしい動き」の規則（three.js・DOM・Web Audio に依存しない）。
// 重い足取り（一歩ごとに体が左右に揺れ、持ち上がってから足を下ろす）・呼吸・首振り・
// 両腕を胸の前で曲げて爪を構える・時々頭を上げて咆哮する。
// ヌスとメガネ星人で同じ規則を使う。値は角度（ラジアン）とワールド単位。
import { STRIDE, MAX_DT } from './kj-rules.js';
import { DOWN_TILT } from './kj-react.js';

const f = Object.freeze;

/** 歩き：roll 左右の傾き、sway 左右の揺れ、bob 持ち上がり、lean 前のめり、headYaw 首、armSwing 腕の振り */
export const GAIT = f({
  roll: 0.075, sway: 0.6, bob: 0.55, lean: 0.06, headYaw: 0.1, armSwing: 0.2,
});
/** 待機：呼吸の周期と大きさ、首振りの周期と大きさ */
export const IDLE = f({
  breathSec: 3.4, bob: 0.18, lean: 0.035, headSec: 6.2, headYaw: 0.28, headUp: 0.07,
});
/** 爪の構え：腕を前へ・内へ寄せ、肘を曲げる */
export const CLAW = f({ armFwd: 0.9, armIn: 0.32, elbow: 1.0 });
/** 咆哮：rise で頭を上げ、hold の間吠え、settle で戻る */
export const ROAR = f({
  rise: 0.45, hold: 1.25, settle: 0.6, headUp: 0.65, lean: -0.18, armsOut: 0.85, armFwd: 0.35, elbow: 0.7, tremble: 0.05,
});
export const ROAR_SEC = ROAR.rise + ROAR.hold + ROAR.settle;
/** 咆哮の間隔（秒） */
export const ROAR_INTERVAL = f({ min: 9, max: 15 });
/** 動きの重みが目標へ近づく速さ（1秒あたり） */
export const WEIGHT_RATES = f({ gait: 3, idle: 2, claw: 5 });
/** 攻撃を受けたときの手足（腕を投げ出し、頭がのけぞる） */
export const REACT_LIMBS = f({
  armsOut: 0.8, armFwd: -0.35, headUp: 0.45, headUpDown: 0.2,
});

const z0 = (v) => v + 0;
const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};
const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const stepDt = (dt) => {
  const d = Number(dt);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_DT) : 0;
};

/** 歩いた距離 → 歩きの位相（一歩 STRIDE ごとに π。足が着く瞬間は sin=0） */
export function gaitPhase(walked) {
  const w = Number(walked);
  return (Math.PI * (Number.isFinite(w) && w > 0 ? w : 0)) / STRIDE;
}

/** 重い足取り。足が着く瞬間に持ち上がりは 0、一歩の真ん中で最大。左右の傾きは一歩ごとに入れ替わる */
export function gaitPose(walked, weight) {
  const w = clamp01(weight);
  const s = Math.sin(gaitPhase(walked));
  return {
    roll: z0(GAIT.roll * s * w),
    sway: z0(GAIT.sway * s * w),
    bob: z0(GAIT.bob * Math.abs(s) * w),
    lean: z0(GAIT.lean * w),
    headYaw: z0(-GAIT.headYaw * s * w),
    armSwing: z0(GAIT.armSwing * s * w),
  };
}

/** 呼吸と首振り（止まっていても動いている）。offset で二体の動きをずらす */
export function idlePose(t, weight, offset = 0) {
  const w = clamp01(weight);
  const tt = Number(t) || 0;
  const o = Number(offset) || 0;
  const br = Math.sin((2 * Math.PI * tt) / IDLE.breathSec + o);
  const hy = 0.7 * Math.sin((2 * Math.PI * tt) / IDLE.headSec + o * 1.3)
    + 0.3 * Math.sin((2 * Math.PI * tt) / (IDLE.headSec * 0.41) + o);
  return {
    bob: z0(IDLE.bob * 0.5 * (1 + br) * w),
    lean: z0(IDLE.lean * br * w),
    headYaw: z0(IDLE.headYaw * hy * w),
    headUp: z0(IDLE.headUp * 0.5 * (1 + br) * w),
  };
}

/** 両腕を胸の前で軽く曲げて爪を構える */
export function clawPose(weight) {
  const w = clamp01(weight);
  return { armFwd: z0(CLAW.armFwd * w), armIn: z0(CLAW.armIn * w), elbow: z0(CLAW.elbow * w) };
}

// ---- 咆哮 ----
export function createRoar() {
  return { active: false, t: 0 };
}

export function isRoaring(state) {
  return !!state && !!state.active;
}

/** 咆哮を始める（delay 秒待ってから）。もう吠えていれば同じ state を返す */
export function startRoar(state, delay = 0) {
  if (isRoaring(state)) return state;
  const dl = Number(delay);
  return { active: true, t: -(Number.isFinite(dl) && dl > 0 ? dl : 0) };
}

export function stepRoar(state, dt) {
  if (!isRoaring(state)) return createRoar();
  const t = state.t + stepDt(dt);
  if (t >= ROAR_SEC) return createRoar();
  return { active: true, t };
}

/** 咆哮の強さ 0〜1（上げる → 吠える → 戻る） */
export function roarAmount(state) {
  if (!isRoaring(state)) return 0;
  const t = Number(state.t) || 0;
  if (t < 0) return 0;
  if (t < ROAR.rise) return smooth(t / ROAR.rise);
  if (t < ROAR.rise + ROAR.hold) return 1;
  return 1 - smooth((t - ROAR.rise - ROAR.hold) / ROAR.settle);
}

/** 咆哮の姿勢：頭を上げ、のけぞり、両腕を広げる。吠えている間は少し震える */
export function roarPose(state) {
  const a = roarAmount(state);
  const t = isRoaring(state) ? Number(state.t) || 0 : 0;
  return {
    amount: a,
    headUp: ROAR.headUp * a,
    lean: ROAR.lean * a,
    armsOut: ROAR.armsOut * a,
    armFwd: ROAR.armFwd * a,
    elbow: ROAR.elbow * a,
    tremble: z0(ROAR.tremble * a * Math.sin(t * 38)),
  };
}

// ---- 咆哮の間隔（種で再現できる） ----
function nextRand(seed) {
  const t = ((seed >>> 0) + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

export function roarInterval(r) {
  return ROAR_INTERVAL.min + (ROAR_INTERVAL.max - ROAR_INTERVAL.min) * clamp01(r);
}

export function createRoarTimer(seed) {
  const n = Number(seed);
  const s = (Number.isFinite(n) ? Math.floor(n) : 0) >>> 0;
  const [r, rng] = nextRand(s);
  return { rng, left: roarInterval(r) };
}

/** 時間が来たら roar:true。busy の間は時間が来ても待つ */
export function stepRoarTimer(state, dt, busy = false) {
  const s = state && typeof state === 'object' ? state : createRoarTimer(0);
  const left = s.left - stepDt(dt);
  if (left > 0) return { state: { rng: s.rng, left }, roar: false };
  if (busy) return { state: { rng: s.rng, left: 0 }, roar: false };
  const [r, rng] = nextRand(s.rng);
  return { state: { rng, left: roarInterval(r) }, roar: true };
}

// ---- 動きの重み ----
/** 目標の重み。gone（負けて退場）なら何もしない、locked（吹き飛び・ダウン）なら構えも歩きも止める */
export function motionTargets({
  moving = false, acting = false, locked = false, gone = false,
} = {}) {
  if (gone) return { gait: 0, idle: 0, claw: 0 };
  return {
    gait: moving && !locked ? 1 : 0,
    idle: locked ? 0 : 1,
    claw: acting || locked ? 0 : 1,
  };
}

export function approachWeight(cur, target, dt, rate) {
  const c = clamp01(cur);
  const g = clamp01(target);
  const step = stepDt(dt) * (Number(rate) > 0 ? Number(rate) : 1);
  if (c < g) return Math.min(g, c + step);
  if (c > g) return Math.max(g, c - step);
  return c;
}

/** 重みをゆっくり目標へ（急に切り替わらない） */
export function stepWeights(weights, targets, dt) {
  const w = weights && typeof weights === 'object' ? weights : {};
  const t = targets && typeof targets === 'object' ? targets : {};
  const out = {};
  for (const k of Object.keys(WEIGHT_RATES)) out[k] = approachWeight(w[k], t[k], dt, WEIGHT_RATES[k]);
  return out;
}

/** 攻撃を受けたときの手足（体の傾きの大きさに応じて腕を投げ出す） */
export function reactLimbPose(tilt, down = false) {
  const amount = clamp01(Math.abs(Number(tilt) || 0) / DOWN_TILT);
  return {
    amount,
    armsOut: REACT_LIMBS.armsOut * amount,
    armFwd: z0(REACT_LIMBS.armFwd * amount),
    headUp: (down ? REACT_LIMBS.headUpDown : REACT_LIMBS.headUp) * amount,
  };
}

/** 全部を重ねた姿勢 */
export function kaijuPose({
  walked = 0, t = 0, gait = 0, idle = 0, claw = 0, roar = null, react = null, offset = 0,
} = {}) {
  const g = gaitPose(walked, gait);
  const i = idlePose(t, idle, offset);
  const r = roarPose(roar);
  const k = reactLimbPose(react ? react.tilt : 0, react ? !!react.down : false);
  const c = clawPose(clamp01(claw) * (1 - r.amount) * (1 - k.amount));
  const swingW = clamp01(claw) * (1 - r.amount);
  return {
    roll: g.roll,
    sway: g.sway,
    bob: g.bob + i.bob,
    lean: g.lean + i.lean + r.lean,
    headYaw: z0((g.headYaw + i.headYaw) * (1 - r.amount) + r.tremble),
    headUp: i.headUp + r.headUp + k.headUp,
    armFwd: z0(c.armFwd + r.armFwd + k.armFwd),
    armIn: c.armIn,
    armsOut: r.armsOut + k.armsOut,
    elbow: c.elbow + r.elbow,
    armSwing: z0(g.armSwing * swingW),
  };
}
