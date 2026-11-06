// 絵画の館の配置と通行判定（three.js・DOM に依存しない）
import { gatePoint, HUB_WALK_RADIUS } from './hub.js';
import { ENTRANCE_PAINTINGS, DECOR_PAINTINGS } from './gallery-data.js';

// ---- ハブ側の入口（既存の門 -90°・30°・150° から離れた 210° の島の端） ----
export const GALLERY_ANGLE_DEG = 210;
export const GALLERY_DOOR = Object.freeze(gatePoint({ gateAngleDeg: GALLERY_ANGLE_DEG }, HUB_WALK_RADIUS));
export const GALLERY_DOOR_RANGE = 1.6;
export const GALLERY_HUB_SPAWN = Object.freeze(gatePoint({ gateAngleDeg: GALLERY_ANGLE_DEG }, 13.5));
export const GALLERY_CASTLE_RADIUS = 19.6;

// ---- 館の中（廊下は z 軸沿い、南端 z=28 がハブへの扉、北に円形の広間） ----
export const CORRIDOR_HALF_WIDTH = 3;
export const CORRIDOR_END_Z = 28;
export const HALL_CENTER = Object.freeze({ x: 0, z: -17 });
// 飾りの絵（42枚）が重ならずに並ぶ大きさ
export const HALL_RADIUS = 21;
export const CORRIDOR_START_Z = HALL_CENTER.z
  + Math.sqrt(HALL_RADIUS * HALL_RADIUS - CORRIDOR_HALF_WIDTH * CORRIDOR_HALF_WIDTH);
export const WALL_HEIGHT = 5;
export const PAINT_Y = 2.4;
export const PAINT_MAX_W = 2.6;
export const PAINT_MAX_H = 2.2;

const MARGIN = 0.5;
const HALL_WALK = HALL_RADIUS - 0.6;
const CX = CORRIDOR_HALF_WIDTH - MARGIN;
const CZ0 = CORRIDOR_START_Z - 0.1;
const CZ1 = CORRIDOR_END_Z - MARGIN;
const TOL = 1e-9;

export const GALLERY_EXIT_Z = CORRIDOR_END_Z - 0.8;
export const GALLERY_SPAWN = Object.freeze({ x: 0, z: 25.8 });
export const GALLERY_HALL_SPAWN = Object.freeze({ x: 0, z: -4 });

const LEFT_Z = [25, 20, 15, 10, 5];
const RIGHT_Z = [22.5, 17.5, 12.5, 7.5];
/** 廊下の入口（90°）の両脇でこれだけあける（絵の半分の幅ぶん） */
const DECOR_DOOR_MARGIN_DEG = 6.5;
/** 飾りの絵の角度（度）。廊下の入口を避けて、残りの壁に等間隔で並べる */
function decorAngles(n) {
  const half = (Math.asin(CORRIDOR_HALF_WIDTH / HALL_RADIUS) * 180) / Math.PI + DECOR_DOOR_MARGIN_DEG;
  const a0 = 90 + half;
  const a1 = 450 - half;
  if (n <= 1) return [((a0 + a1) / 2) % 360];
  const out = [];
  for (let i = 0; i < n; i++) out.push((a0 + ((a1 - a0) * i) / (n - 1)) % 360);
  return out;
}
export const DECOR_ANGLES_DEG = Object.freeze(decorAngles(DECOR_PAINTINGS.length));

/** 絵の置き場所 {id, enterable, x, z, rotY}。rotY は絵の正面（+z）が向く角度 */
export function paintingSlots() {
  const out = [];
  const wx = CORRIDOR_HALF_WIDTH - 0.06;
  let l = 0;
  let r = 0;
  ENTRANCE_PAINTINGS.forEach((p, i) => {
    if (i % 2 === 0) out.push({ id: p.id, enterable: true, x: -wx, z: LEFT_Z[l++ % LEFT_Z.length], rotY: Math.PI / 2 });
    else out.push({ id: p.id, enterable: true, x: wx, z: RIGHT_Z[r++ % RIGHT_Z.length], rotY: -Math.PI / 2 });
  });
  const rr = HALL_RADIUS - 0.06;
  DECOR_PAINTINGS.forEach((p, i) => {
    const a = (DECOR_ANGLES_DEG[i % DECOR_ANGLES_DEG.length] * Math.PI) / 180;
    out.push({
      id: p.id,
      enterable: false,
      x: HALL_CENTER.x + Math.cos(a) * rr,
      z: HALL_CENTER.z + Math.sin(a) * rr,
      rotY: Math.atan2(-Math.cos(a), -Math.sin(a)),
    });
  });
  return out;
}

function inCorridor(p) {
  return Math.abs(p.x) <= CX + TOL && p.z >= CZ0 - TOL && p.z <= CZ1 + TOL;
}
function inHall(p) {
  return Math.hypot(p.x - HALL_CENTER.x, p.z - HALL_CENTER.z) <= HALL_WALK + TOL;
}

export function isGalleryWalkable(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  return inCorridor(p) || inHall(p);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 壁に沿って滑る移動。結果は必ず歩ける場所（だめなら from のまま） */
export function clampGalleryMove(from, to) {
  const back = isGalleryWalkable(from) ? { x: from.x, z: from.z } : { ...GALLERY_SPAWN };
  if (!to || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return back;
  if (isGalleryWalkable(to)) return { x: to.x, z: to.z };
  const cands = [{ x: clamp(to.x, -CX, CX), z: clamp(to.z, CZ0, CZ1) }];
  const dx = to.x - HALL_CENTER.x;
  const dz = to.z - HALL_CENTER.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-9) {
    const k = (HALL_WALK - 1e-6) / d;
    cands.push({ x: HALL_CENTER.x + dx * k, z: HALL_CENTER.z + dz * k });
  }
  let best = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (!isGalleryWalkable(c)) continue;
    const e = Math.hypot(c.x - to.x, c.z - to.z);
    if (e < bestD) {
      best = c;
      bestD = e;
    }
  }
  return best || back;
}

/** カメラを壁の内側に寄せる */
export function clampGalleryCam(p) {
  if (p.z > CORRIDOR_START_Z + 0.1) {
    return { x: clamp(p.x, -CORRIDOR_HALF_WIDTH + 0.3, CORRIDOR_HALF_WIDTH - 0.3), z: Math.min(p.z, CORRIDOR_END_Z - 0.2) };
  }
  const dx = p.x - HALL_CENTER.x;
  const dz = p.z - HALL_CENTER.z;
  const d = Math.hypot(dx, dz);
  const R = HALL_RADIUS - 0.4;
  if (d <= R) return { x: p.x, z: p.z };
  return { x: HALL_CENTER.x + (dx / d) * R, z: HALL_CENTER.z + (dz / d) * R };
}

export function isGalleryExit(p) {
  return !!p && p.z >= GALLERY_EXIT_Z;
}
