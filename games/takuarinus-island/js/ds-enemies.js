// 真っ暗ソウルの懐中電灯の光の円錐（three.js・DOM・Web Audio に依存しない）。
// 敵と戦う仕組み（影・ひっかき猫・巨大な手・燭台で殴る・ソウル）はなくした。敵は ds-stalker-ai.js の1体だけで、
// この光の円錐で「照らされたか」を判定する。yaw=0 は +z を向き、前方は (sin yaw, cos yaw)。

export const LIGHT_RANGE = 9;
export const LIGHT_HALF_ANGLE = 0.45;

const EPS = 1e-9;

/** 対象が範囲内かつ前方の角度内か */
export function inCone(from, target, range, halfAngle) {
  if (!from || !target) return false;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  if (!Number.isFinite(d) || d > range) return false;
  if (d < 1e-6) return true;
  const yaw = Number(from.yaw) || 0;
  const dot = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d;
  return dot >= Math.cos(halfAngle) - EPS;
}

/** 懐中電灯の光の円錐に入っているか（消灯中は常に false） */
export function inLightCone(player, target) {
  if (!player || !player.lightOn) return false;
  const scale = Number.isFinite(player.lightScale) && player.lightScale > 0 ? player.lightScale : 1;
  return inCone(player, target, LIGHT_RANGE * scale, LIGHT_HALF_ANGLE);
}

