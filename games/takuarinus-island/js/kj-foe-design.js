// メガネ星人（前かがみの大怪獣の姿）のデザインと動きの規則（three.js・DOM・Web Audio に依存しない）。
// 寸法は体の高さ H に対する比。組み立ては kj-foe-model.js、場面は kj-scene.js。
// 太い脚・長いしっぽ・背中のとげ・大きな爪・うろこ。顔には大きな丸いレンズ（メガネ）が2つ並ぶ。
import { STRIDE } from './kj-rules.js';

const f = Object.freeze;

/** 体の高さ（ワールド単位） */
export const FOE_HEIGHT = 30;

/**
 * 体の寸法。hipY: 腰の高さ、hunch: 前かがみの角度、torso: 胴（腰からの位置と半径）、
 * neck: 首の付け根、head: 頭の半径、lens: レンズ（頭からの位置と半径）、shoulder: 肩、
 * armX / elbowX: 爪を構える腕の角度、thighX / kneeX: 少し曲げた脚の角度
 */
export const FOE_BODY = f({
  hipY: 0.355,
  hipX: 0.11,
  legR: 0.07,
  thigh: 0.16,
  shin: 0.16,
  thighX: -0.25,
  kneeX: 0.4,
  foot: f({
    len: 0.14, w: 0.12, h: 0.04, claw: 0.05,
  }),
  hunch: 0.38,
  torso: f({
    y: 0.2, z: 0, rx: 0.17, ry: 0.28, rz: 0.15,
  }),
  spikes: 9,
  neck: f({ y: 0.47, z: 0.09 }),
  head: f({ rx: 0.1, ry: 0.085, rz: 0.12 }),
  jawMax: 0.6,
  lens: f({
    x: 0.052, y: 0.06, z: 0.15, r: 0.042,
  }),
  shoulder: f({ x: 0.16, y: 0.33, z: 0.07 }),
  upperArm: 0.13,
  foreArm: 0.12,
  armR: 0.035,
  claw: 0.065,
  armX: -0.45,
  elbowX: -0.9,
  armOut: 0.18,
});

/** レンズが割れて凶暴になったときの、構えの変わり方 */
export const FOE_RAGE = f({ hunch: 0.12, jaw: 0.3, armOut: 0.15 });

/** しっぽの形（kj-tail.js の tailDims にそのまま渡せる。太くて長い） */
export const FOE_TAIL_SHAPE = f({
  hipY: 0.33, back: 0.12, length: 1.0, r0: 0.1, r1: 0.018, taper: 0.82, droop: -0.38, bend: 0.06,
});

/** 一歩の長さと、脚の振り */
export const FOE_STRIDE = STRIDE;
export const LEG_SWING = f({ hip: 0.38, knee: 0.55 });
/** 攻撃を出したあと、振り抜いた姿勢から戻る秒数 */
export const STRIKE_SEC = 0.6;
/** 光線を撃った瞬間にレンズが強く光る秒数 */
export const BEAM_FLASH_SEC = 0.35;
/** 割れたレンズの破片の数（1枚あたり）と、地面に残る秒数 */
export const SHARDS_PER_LENS = 7;
export const SHARD_LIFE = 8;

/** うろこの色（palette のキー） */
export const SCALE_TONES = f(['kjFoeHide', 'kjFoeScale', 'kjFoeHideDark']);
/** メガネ星人の体で使う色（palette のキー） */
export const FOE_PALETTE_KEYS = f([
  'kjFoeHide', 'kjFoeHideDark', 'kjFoeScale', 'kjFoeScaleLine', 'kjFoeBelly', 'kjFoeBellyLine',
  'kjFoeSpike', 'kjFoeClaw', 'kjFoeMouth', 'kjFoeLensRim', 'kjFoeLens', 'kjFoeLensGlow', 'kjFoeEye', 'kjFoeShard',
]);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp01 = (v) => Math.max(0, Math.min(1, num(v)));
const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const z0 = (v) => num(v) + 0;

function mulberry32(seed) {
  let t = (Math.floor(num(seed)) >>> 0);
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 背中のとげ（首の下から腰へ並ぶ）。位置は腰を原点とした胴の背中側（-z）。
 * size はとげの長さ、tilt は外向きに立てる角度（rotation.x）。首の下と腰は小さく、背中の上の方が大きい
 */
export function foeSpikes(count = FOE_BODY.spikes) {
  const T = FOE_BODY.torso;
  const n = Math.max(1, Math.floor(num(count)) || 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const phi = 0.3 + k * 1.8;
    out.push({
      y: T.y + T.ry * 0.94 * Math.cos(phi),
      z: T.z - T.rz * 0.94 * Math.sin(phi),
      size: 0.04 + 0.075 * Math.sin(Math.PI * Math.min(1, (1 - k) * 0.85 + 0.15)),
      tilt: -phi,
    });
  }
  return out;
}

/** うろこの並び（0〜1 の位置と半径・色の番号）。種で再現できる。奇数段は半分ずらす */
export function scaleCells(seed, cols = 8, rows = 8) {
  const rng = mulberry32(seed);
  const c0 = Math.max(1, Math.floor(num(cols)) || 1);
  const r0 = Math.max(1, Math.floor(num(rows)) || 1);
  const out = [];
  for (let r = 0; r < r0; r++) {
    const off = r % 2 ? 0.5 : 0;
    for (let c = 0; c < c0; c++) {
      const v = rng();
      out.push({
        x: ((c + off) / c0) % 1,
        y: (r + 0.5) / r0,
        r: (0.62 + 0.12 * rng()) / c0,
        tone: v < 0.55 ? 0 : v < 0.85 ? 1 : 2,
      });
    }
  }
  return out;
}

function neutralPose() {
  return {
    armX: [0, 0], elbow: [0, 0], lean: 0, head: 0, jaw: 0, glow: 0,
  };
}

/**
 * 攻撃の予備動作と振り抜き（kj-ai.js の敵の状態から）。armX/elbow は [左腕, 右腕] の足し分。
 * チョップは右腕を振り上げてから振り下ろす。大振り（smash）は両腕を上げる。
 * 光線は顎を開いてレンズが光っていき（glow）、撃った瞬間に強く光る
 */
export function foeAttackPose(e) {
  const out = neutralPose();
  if (!e || typeof e !== 'object') return out;
  const t = Math.max(0, num(e.t));
  if (e.phase === 'windup') {
    const k = smooth(t / Math.max(1e-6, num(e.windupDur) || 1));
    if (e.attack === 'chop') {
      out.armX[1] = -2.3 * k;
      out.elbow[1] = 0.7 * k;
      out.lean = -0.18 * k;
      out.jaw = 0.3 * k;
    } else if (e.attack === 'smash') {
      out.armX = [-2.6 * k, -2.6 * k];
      out.elbow = [0.6 * k, 0.6 * k];
      out.lean = -0.3 * k;
      out.jaw = 0.8 * k;
    } else if (e.attack === 'beam') {
      out.glow = k;
      out.lean = -0.08 * k;
      out.jaw = 0.4 * k;
      out.armX = [0.3 * k, 0.3 * k];
    }
  } else if (e.phase === 'recover' && e.attack) {
    const k = 1 - smooth(t / STRIKE_SEC);
    if (e.attack === 'chop') {
      out.armX[1] = 0.6 * k;
      out.lean = 0.3 * k;
    } else if (e.attack === 'smash') {
      out.armX = [0.5 * k, 0.5 * k];
      out.lean = 0.4 * k;
      out.jaw = 0.6 * k;
    } else if (e.attack === 'beam') {
      out.glow = Math.max(0, 1 - t / BEAM_FLASH_SEC);
      out.jaw = 0.5 * k;
    }
  }
  return {
    armX: out.armX.map(z0),
    elbow: out.elbow.map(z0),
    lean: z0(out.lean),
    head: z0(out.head),
    jaw: z0(out.jaw),
    glow: z0(clamp01(out.glow)),
  };
}

/** レンズの状態：体力が半分を切ると割れて外れる（kj-ai.js の glassesOff）。割れたら光らない */
export function foeLensState(e) {
  const broken = !!(e && e.glassesOff);
  return { broken, glow: broken ? 0 : foeAttackPose(e).glow };
}

/** 割れたレンズの破片の飛び方（種で再現できる。前と上へ飛び散る） */
export function lensShards(seed, count = SHARDS_PER_LENS) {
  const rng = mulberry32(seed);
  const n = Math.max(0, Math.floor(num(count)));
  return Array.from({ length: n }, () => ({
    vx: (rng() * 2 - 1) * 5,
    vy: 4 + rng() * 7,
    vz: 1 + rng() * 5,
    spin: (rng() * 2 - 1) * 12,
    size: 0.25 + rng() * 0.5,
  }));
}

/** 歩いた距離 → 脚の振り（左右逆）。前へ出た脚はひざを曲げて持ち上げる */
export function foeLegSwing(walked, weight) {
  const w = clamp01(weight);
  const ph = (Math.PI * Math.max(0, num(walked))) / FOE_STRIDE;
  const s = Math.sin(ph);
  return {
    hips: [z0(LEG_SWING.hip * s * w), z0(-LEG_SWING.hip * s * w)],
    knees: [z0(LEG_SWING.knee * Math.max(0, s) * w), z0(LEG_SWING.knee * Math.max(0, -s) * w)],
  };
}
