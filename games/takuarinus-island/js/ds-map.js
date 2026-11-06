// 真っ暗ソウルの屋敷の間取り（three.js・DOM・Web Audio に依存しない）。
// 単位はメートル。y が上で、床は xz 平面。
const f = Object.freeze;

const R = (id, x1, x2, z1, z2, material) => f({
  id, x1, x2, z1, z2, material,
});

/** 部屋の矩形（境界の判定はこの順に行う） */
export const ROOMS = f([
  R('corridor', -12, 12, -2, 2, 'wood'),
  R('study', -12, -4, 2, 10, 'carpet'),
  R('kids', -3, 5, 2, 10, 'carpet'),
  R('kitchen', 6, 12, 2, 10, 'tile'),
  R('basement', -6, 6, -12, -2, 'concrete'),
]);

export const ROOM_LABELS = f({
  corridor: '廊下', study: '書斎', kids: '子ども部屋', kitchen: '台所', basement: '地下室',
});

/** 各部屋と廊下の間の戸口（幅2）。z はその壁の位置 */
export const DOORS = f([
  f({ id: 'study', room: 'study', x: -8, z: 2, width: 2 }),
  f({ id: 'kids', room: 'kids', x: 0, z: 2, width: 2 }),
  f({ id: 'kitchen', room: 'kitchen', x: 9, z: 2, width: 2 }),
  f({ id: 'basement', room: 'basement', x: 0, z: -2, width: 2 }),
]);

/** 家具（通れない矩形）。h は高さ、kind は見た目 */
const O = (id, kind, x1, x2, z1, z2, h) => f({
  id, kind, x1, x2, z1, z2, h,
});
export const OBSTACLES = f([
  O('study-shelf', 'shelf', -11, -5, 9.4, 10, 2.2),
  O('study-desk', 'desk', -7, -5.5, 6, 7, 0.8),
  O('study-safe', 'safe', -12, -11.4, 5.5, 6.5, 0.9),
  O('kids-bed', 'bed', 2.5, 4.8, 7, 10, 0.6),
  O('kids-chest', 'chest', -2.8, -1.8, 9, 10, 0.7),
  O('kitchen-counter', 'counter', 11.3, 12, 3, 9.5, 0.95),
  O('kitchen-table', 'table', 7, 8.5, 6, 7.2, 0.8),
  O('cellar-rack-w', 'rack', -6, -5.4, -11, -4, 2),
  O('cellar-rack-e', 'rack', 5.4, 6, -11, -4, 2),
  O('hall-clock', 'clock', 4, 4.6, -2, -1.6, 2),
  O('kids-wardrobe', 'wardrobe', -2.9, -2.3, 2.2, 3.6, 2),
  O('kitchen-cupboard', 'cupboard', 6.1, 6.6, 7.9, 9.7, 2),
  O('cellar-crates', 'crates', -5.3, -4.2, -11.5, -10.4, 0.9),
]);

export const PLAYER_RADIUS = 0.35;
export const PLAYER_START = f({ x: -10, z: 0 });
/** ろうそく（休憩所）は2か所 */
export const CANDLES = f([
  f({ id: 'candle-hall', x: -10, z: 0.8 }),
  f({ id: 'candle-cellar', x: 0, z: -4 }),
]);
export const FUSE_PANEL = f({ x: 11, z: 0 });
export const SAFE_POS = f({ x: -11, z: 6 });
export const BASEMENT_DOOR = f({ x: 0, z: -2 });
export const EXIT_POS = f({ x: 0, z: -11 });
export const EXIT_RADIUS = 1.5;
export const BOSS_CENTER = f({ x: 0, z: -7 });

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** 位置の部屋 id（外・壁は null） */
export function roomAt(x, z) {
  if (!fin(x) || !fin(z)) return null;
  for (const r of ROOMS) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r.id;
  }
  return null;
}

/** 床の材質（外は null） */
export function materialAt(x, z) {
  const id = roomAt(x, z);
  const r = id ? ROOMS.find((q) => q.id === id) : null;
  return r ? r.material : null;
}

export function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

/**
 * 半径 r の体がそこに立てるか。部屋の中（壁から r 離れる）か戸口の中で、家具に重ならない。
 * basementOpen が false なら地下室の戸口は通れない。obstacles:false で家具を無視（カメラ用）
 */
export function isWalkable(x, z, { r = PLAYER_RADIUS, basementOpen = true, obstacles = true } = {}) {
  if (!fin(x) || !fin(z)) return false;
  let inside = false;
  for (const room of ROOMS) {
    if (x >= room.x1 + r && x <= room.x2 - r && z >= room.z1 + r && z <= room.z2 - r) {
      inside = true;
      break;
    }
  }
  if (!inside) {
    for (const d of DOORS) {
      if (d.id === 'basement' && !basementOpen) continue;
      if (Math.abs(x - d.x) <= d.width / 2 - r && Math.abs(z - d.z) <= r + 0.05) {
        inside = true;
        break;
      }
    }
  }
  if (!inside) return false;
  if (obstacles) {
    for (const o of OBSTACLES) {
      if (x > o.x1 - r && x < o.x2 + r && z > o.z1 - r && z < o.z2 + r) return false;
    }
  }
  return true;
}

/** from から to へ動く。壁に当たれば軸ごとに滑る。新しい {x,z} を返す */
export function slideMove(from, to, opts = {}) {
  const fx = from && fin(from.x) ? from.x : 0;
  const fz = from && fin(from.z) ? from.z : 0;
  if (!to || !fin(to.x) || !fin(to.z)) return { x: fx, z: fz };
  if (isWalkable(to.x, to.z, opts)) return { x: to.x, z: to.z };
  if (isWalkable(to.x, fz, opts)) return { x: to.x, z: fz };
  if (isWalkable(fx, to.z, opts)) return { x: fx, z: to.z };
  return { x: fx, z: fz };
}
