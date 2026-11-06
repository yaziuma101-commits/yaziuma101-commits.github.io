// 主人公のふざけたポーズ（three.js・DOM・Web Audio に依存しない）。
// 主人公の効果音がふざけた音に差し替わったとき、約 0.6 秒だけ骨を回してポーズをとる。
// 角度は hero-model.js の骨の軸に合わせる（swing: 正で骨の先が前へ、out: 正で体の外へ開く）。
import { pick } from './seeded-rng.js';

const TAU = Math.PI * 2;

export const SILLY_POSE_TIME = 0.6;
/** zuko: がに股で両手を上げてズコー / handstand: 一瞬だけ逆立ち / spin: その場でくるっと一回転 / flail: 両手両足をばたばた */
export const SILLY_POSES = Object.freeze(['zuko', 'handstand', 'spin', 'flail']);
/** 主人公が出す効果音（これが差し替わったときだけポーズをとる） */
export const HERO_SFX = Object.freeze(['jump', 'land', 'hit', 'push', 'talk', 'confirm']);

export function isHeroSfx(name) {
  return HERO_SFX.includes(name);
}

/** 原音 original が played に差し替わったか（主人公の音のときだけ真） */
export function shouldPose(original, played) {
  return isHeroSfx(original) && typeof played === 'string' && played.length > 0 && played !== original;
}

/** ポーズを1つ選ぶ（直前と同じものは選ばない） */
export function pickSillyPose(rng, lastId = null) {
  const list = SILLY_POSES.filter((p) => p !== lastId);
  return pick(rng, list.length ? list : SILLY_POSES);
}

const RAMP = 0.1;
function envelope(t, T) {
  const k = Math.max(0, Math.min(1, t / RAMP, (T - t) / RAMP));
  return k * k * (3 - 2 * k);
}
function easeInOut(k) {
  const x = Math.max(0, Math.min(1, k));
  return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
}

/**
 * 時刻 t（開始からの秒）のポーズ。範囲外・未知の id は null。
 * {id, t, weight(0〜1), body:{flip, spin, hop}, joints:{spine, L:{thigh,shin,arm,forearm,thighOut,armOut}, R:{…}}}
 */
export function sillyPoseFrame(id, t, duration = SILLY_POSE_TIME) {
  if (!SILLY_POSES.includes(id) || !(t >= 0) || !(t < duration)) return null;
  const w = envelope(t, duration);
  const body = { flip: 0, spin: 0, hop: 0 };
  const L = {};
  const R = {};
  let spine = 0;
  if (id === 'zuko') {
    for (const s of [L, R]) {
      Object.assign(s, {
        thigh: 0.45, shin: -0.9, thighOut: 0.6, arm: 0.3, armOut: 2.5, forearm: 0.25,
      });
    }
    spine = -0.2;
  } else if (id === 'handstand') {
    body.flip = Math.PI * w;
    for (const s of [L, R]) {
      Object.assign(s, {
        thigh: 0, shin: -0.1, thighOut: 0.35, arm: 3.0, armOut: 0.2, forearm: 0,
      });
    }
  } else if (id === 'spin') {
    body.spin = TAU * easeInOut(t / duration);
    Object.assign(L, {
      thigh: 0.7, shin: -0.9, thighOut: 0.1, arm: 0, armOut: 1.5, forearm: 0,
    });
    Object.assign(R, {
      thigh: 0, shin: -0.05, thighOut: 0, arm: 0, armOut: 1.5, forearm: 0,
    });
  } else {
    const ph = t * 38;
    const a = Math.sin(ph);
    const b = Math.sin(ph + 1.3);
    Object.assign(L, {
      thigh: b * 0.8, shin: -0.5, thighOut: 0.2, arm: a * 1.3, armOut: 1.1 + 0.6 * Math.sin(ph * 1.3), forearm: 0.6,
    });
    Object.assign(R, {
      thigh: -b * 0.8, shin: -0.5, thighOut: 0.2, arm: -a * 1.3, armOut: 1.1 - 0.6 * Math.sin(ph * 1.3), forearm: 0.6,
    });
    body.hop = 0.12 * Math.abs(Math.sin(ph * 0.5)) * w;
  }
  return {
    id, t, weight: w, body, joints: { spine, L, R },
  };
}
