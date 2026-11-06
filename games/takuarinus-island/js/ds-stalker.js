// 真っ暗ソウルの敵の姿と歩き方（three.js・DOM・Web Audio に依存しない）。
// 背が高く痩せた人の姿：約 2.2m・長い腕・うつむいた頭（フードの奥で顔は見えない）。
// 漫画的な目や表情は持たない。ぎこちなく、ゆっくり、片足を引きずるように歩く。
const f = Object.freeze;

/** 体の寸法（m）。足元が原点、+z が正面 */
export const STALKER = f({
  hipY: 1.08,
  legLen: 1.04,
  hipHalf: 0.09,
  shoulderY: 1.8,
  shoulderHalf: 0.23,
  upperArm: 0.55,
  foreArm: 0.52,
  handLen: 0.2,
  neckY: 1.9,
  headR: 0.11,
  hoodTop: 0.38,
  headBow: 0.62,
  torsoR: 0.15,
  robeTop: 1.82,
  robeHem: 0.28,
  robeTopR: 0.16,
  robeHemR: 0.28,
});

/** 歩幅（1 周期で進む距離 m）。長くゆっくりした足取り */
export const STALKER_STRIDE = 1.6;
/** 首がぴくっと動く長さ（秒） */
export const TWITCH_TIME = 0.16;

const GAIT = f({ hip: 0.34, limp: 0.7, armHang: 0.06 });
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** うつむいた頭の、いちばん高いところ（m） */
export function stalkerTop(s = STALKER) {
  return s.neckY + s.hoodTop * Math.cos(s.headBow);
}

/** 腕を下ろしたときの指先の高さ（m） */
export function armReachY(s = STALKER) {
  return s.shoulderY - (s.upperArm + s.foreArm + s.handLen);
}

/** 腕の長さ（肩から指先まで） */
export function armLength(s = STALKER) {
  return s.upperArm + s.foreArm + s.handLen;
}

/** 首のぴくつき（たいていは 0。ときどき短く -1〜1 の向きに動く）。同じ t と seed なら同じ */
export function twitch(t, seed = 0) {
  const tt = fin(t) ? t : 0;
  const sd = fin(seed) ? seed : 0;
  const period = 3.1 + (Math.abs(Math.floor(sd)) % 5) * 0.41;
  const c = Math.floor(tt / period);
  const u = tt - c * period;
  if (u >= TWITCH_TIME) return 0;
  const hv = Math.sin((c + 1) * 12.9898 + sd * 78.233) * 43758.5453;
  const amp = (hv - Math.floor(hv)) * 2 - 1;
  return amp * Math.sin((u / TWITCH_TIME) * Math.PI);
}

/**
 * 歩き方の姿勢。phase は歩いた距離から決まる位相、k は歩いている度合い（0 立ち止まる〜1 歩く）、t は時間。
 * 角度はラジアン（hip・shoulder は前へ振れる量、elbow は負で前へ曲がる）
 */
export function stalkerPose({
  phase = 0, k = 0, t = 0, seed = 0,
} = {}) {
  const ph = fin(phase) ? phase : 0;
  const kk = clamp01(fin(k) ? k : 0);
  const tt = fin(t) ? t : 0;
  const sn = Math.sin(ph);
  // 膝を使わない硬い振り（往復の端で止まりがち）
  const stiff = Math.sign(sn) * Math.abs(sn) ** 0.55;
  const tw = twitch(tt, seed);
  return {
    hipL: GAIT.hip * stiff * kk,
    hipR: -GAIT.hip * GAIT.limp * stiff * kk,
    shoulderL: GAIT.armHang - 0.1 * stiff * kk,
    shoulderR: GAIT.armHang + 0.06 * stiff * kk,
    armOut: 0.07,
    elbowL: -0.16 - 0.06 * kk,
    elbowR: -0.24,
    sway: 0.07 * Math.cos(ph) * kk + 0.012 * Math.sin(tt * 0.7),
    bob: 0.035 * Math.abs(Math.cos(ph)) * kk,
    lean: 0.09 + 0.05 * kk,
    headBow: STALKER.headBow + 0.05 * Math.sin(tt * 0.45),
    headRoll: 0.14 + tw * 0.42,
    headYaw: tw * 0.35,
  };
}
