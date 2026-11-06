// カメラの上下の角度（three.js・DOM に依存しない）。
// pitch は「見下ろし」を正とするラジアン。見下ろし 60° 〜 見上げ 10° に制限する。
const D2R = Math.PI / 180;

export const PITCH_DOWN_MAX_DEG = 60;
export const PITCH_UP_MAX_DEG = 10;
export const PITCH_MAX = PITCH_DOWN_MAX_DEG * D2R;
export const PITCH_MIN = -PITCH_UP_MAX_DEG * D2R;
/** R/F を押している間の回転の速さ（ラジアン/秒） */
export const PITCH_KEY_SPEED = 1.2;
/** ドラッグ 1px あたりの回転（ラジアン） */
export const PITCH_DRAG_SPEED = 0.006;
/** カメラはこの高さより下がらない（地面にめり込まない） */
export const CAM_MIN_Y = 0.3;

/** 範囲に丸める。数でなければ 0（水平） */
export function clampPitch(p) {
  const v = Number.isFinite(p) ? p : 0;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, v));
}

/** 「後ろへ back、上へ up」のカメラ位置に相当する見下ろし角 */
export function pitchFromOffset(back, up) {
  return clampPitch(Math.atan2(Number(up) || 0, Number(back) || 0));
}

/**
 * 1フレーム分の角度を進める。
 * up（R）で見上げる、down（F）で見下ろす。dragY はドラッグの縦の量（下へ動かすと見下ろす）。
 */
export function stepPitch(pitch, {
  up = false, down = false, dragY = 0, dt = 0,
} = {}) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const drag = Number.isFinite(dragY) ? dragY : 0;
  const keys = (down ? 1 : 0) - (up ? 1 : 0);
  return clampPitch(clampPitch(pitch) + keys * PITCH_KEY_SPEED * d + drag * PITCH_DRAG_SPEED);
}

/**
 * 注視点 target のまわりを回るカメラの位置。yaw はカメラが注視点から見てどちら側にいるか
 * （x = sin(yaw), z = cos(yaw) の向き）。高さは minY より下がらない。
 */
export function orbitCameraPosition(target, yaw, pitch, dist, minY = CAM_MIN_Y) {
  const t = target || {};
  const tx = Number.isFinite(t.x) ? t.x : 0;
  const ty = Number.isFinite(t.y) ? t.y : 0;
  const tz = Number.isFinite(t.z) ? t.z : 0;
  const a = Number.isFinite(yaw) ? yaw : 0;
  const r = Number.isFinite(dist) && dist > 0 ? dist : 1;
  const p = clampPitch(pitch);
  const h = Math.cos(p) * r;
  const y = ty + Math.sin(p) * r;
  return {
    x: tx + Math.sin(a) * h,
    y: Math.max(Number.isFinite(minY) ? minY : CAM_MIN_Y, y),
    z: tz + Math.cos(a) * h,
  };
}
