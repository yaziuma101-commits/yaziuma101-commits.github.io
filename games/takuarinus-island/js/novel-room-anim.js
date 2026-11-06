// 小説の3D勉強部屋の動き（three.js・DOM・Web Audio に依存しない）。元の状態は変えない。
export const POSE_DURATIONS = Object.freeze({
  flip: 0.5, buzz: 0.45, think: 1.5, joy: 1.6, sad: 1.6,
});

const IDLE = Object.freeze({
  jump: 0, armRaise: 0, slam: 0, flip: 0, tilt: 0, droop: 0,
});

export function createPose() {
  return { kind: null, t0: 0 };
}

export function triggerPose(state, kind, now) {
  if (!Object.prototype.hasOwnProperty.call(POSE_DURATIONS, kind)) return state;
  return { ...(state || createPose()), kind, t0: Number.isFinite(now) ? now : 0 };
}

/** その時刻の動きの量（0〜1 くらい） */
export function samplePose(state, now) {
  if (!state || !state.kind) return { ...IDLE };
  const p = (now - state.t0) / POSE_DURATIONS[state.kind];
  if (!(p >= 0) || p >= 1) return { ...IDLE };
  const o = { ...IDLE };
  const bell = Math.sin(p * Math.PI);
  if (state.kind === 'joy') {
    o.jump = 0.6 * Math.abs(Math.sin(p * Math.PI * 3));
    o.armRaise = bell;
  } else if (state.kind === 'sad') {
    o.droop = Math.sin(Math.min(1, p * 3) * (Math.PI / 2)) * (p > 0.85 ? (1 - p) / 0.15 : 1);
  } else if (state.kind === 'buzz') {
    o.slam = bell;
  } else if (state.kind === 'flip') {
    o.flip = p;
  } else if (state.kind === 'think') {
    o.tilt = bell;
  }
  return o;
}

export function poseActive(state, now) {
  return !!state && !!state.kind && now - state.t0 < POSE_DURATIONS[state.kind] && now >= state.t0;
}
