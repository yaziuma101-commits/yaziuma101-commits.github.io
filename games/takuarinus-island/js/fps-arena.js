// FPS番長の射撃場（円形アリーナ）の地形と一人称の移動の規則（three.js・DOM に依存しない）
// 座標は {x,y,z}、単位はメートル、Y が上。カメラの前方は (-sin yaw, -cos yaw)。
export const ARENA_RADIUS = 20;
export const PLAYER_EYE = 1.6;
export const PLAYER_RADIUS = 0.4;
export const WALK_SPEED = 5;
export const RUN_SPEED = 9;
export const JUMP_SPEED = 7.5;
export const GRAVITY = 20;
export const TURN_SPEED = 2; // 矢印キー ←→ の視点の回転（rad/s）
export const MAX_PITCH = (80 * Math.PI) / 180;
export const BOSS_RADIUS = 0.5;
export const BOSS_HEIGHT = 2.2;

const f = Object.freeze;

function block(kind, cx, cz, w, d, h) {
  return f({
    kind,
    min: f({ x: cx - w / 2, y: 0, z: cz - d / 2 }),
    max: f({ x: cx + w / 2, y: h, z: cz + d / 2 }),
  });
}

// 箱・柱・壁（柱も AABB の角柱）。高さ 2.2m 以上は立っていても隠れられる。低い壁は視線の下
export const OBSTACLES = f([
  block('box', -6, -4, 2, 2, 2.4),
  block('box', 6, -5, 2, 2, 2.4),
  block('box', 5, 11, 2, 2, 2.4),
  block('box', -4, 10, 1.6, 1.6, 1.2),
  block('pillar', -2.5, -8, 1.2, 1.2, 4),
  block('pillar', -10, 5, 1.2, 1.2, 4),
  block('pillar', 10, 5, 1.2, 1.2, 4),
  block('wall', 0, 3, 6, 0.6, 1.0),
  block('wall', -9, -10, 0.6, 4, 1.0),
  block('wall', 9, -10, 0.6, 4, 1.0),
  block('wall', 13, -3, 0.8, 5, 2.6),
  block('wall', -13, -2, 0.8, 5, 2.6),
]);

export const PLAYER_SPAWN = f({ x: 0, z: 15 });
export const BOSS_SPAWN = f({ x: 0, z: -14 });

/** 中心から ARENA_RADIUS - r を超える位置を円周上に戻す */
export function clampToArena(pos, r) {
  const lim = ARENA_RADIUS - r;
  const d = Math.hypot(pos.x, pos.z);
  if (!(d > lim)) return { x: pos.x, z: pos.z };
  const k = lim / d;
  return { x: pos.x * k, z: pos.z * k };
}

/** XZ 平面で半径 r の円が AABB にめり込んだら、最も近い面の外へ押し出す */
export function resolveObstacles(pos, r, obstacles = OBSTACLES) {
  let { x, z } = pos;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const o of obstacles) {
      const cx = Math.max(o.min.x, Math.min(x, o.max.x));
      const cz = Math.max(o.min.z, Math.min(z, o.max.z));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // 中心が箱の内側: 一番近い面の外へ
        const faces = [
          [x - o.min.x, 'x', o.min.x - r],
          [o.max.x - x, 'x', o.max.x + r],
          [z - o.min.z, 'z', o.min.z - r],
          [o.max.z - z, 'z', o.max.z + r],
        ];
        faces.sort((a, b) => a[0] - b[0]);
        if (faces[0][1] === 'x') x = faces[0][2];
        else z = faces[0][2];
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

/** 番長の体を移動の当たり判定用の AABB にする */
export function bossBox(pos, r = BOSS_RADIUS, h = BOSS_HEIGHT) {
  return {
    kind: 'boss',
    min: { x: pos.x - r, y: 0, z: pos.z - r },
    max: { x: pos.x + r, y: h, z: pos.z + r },
  };
}

export function clampPitch(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp1 = (v) => Math.max(-1, Math.min(1, num(v)));

export function createFpsPlayer(spawn = PLAYER_SPAWN) {
  return {
    x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: num(spawn.yaw), pitch: 0, moving: false,
  };
}

/**
 * 1フレーム進めた新しい主人公を返す（引数は変更しない）。
 * inp: {forward, strafe (-1..1), dash, jump, turn (-1..1: 矢印キー), lookYaw, lookPitch (rad: マウス)}
 */
export function stepFpsPlayer(p, inp = {}, dt = 0, obstacles = OBSTACLES) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const i = inp || {};
  const yaw = wrapAngle(num(p.yaw) + clamp1(i.turn) * TURN_SPEED * h + num(i.lookYaw));
  const pitch = clampPitch(num(p.pitch) + num(i.lookPitch));

  const fwd = clamp1(i.forward);
  const str = clamp1(i.strafe);
  let mx = -Math.sin(yaw) * fwd + Math.cos(yaw) * str;
  let mz = -Math.cos(yaw) * fwd - Math.sin(yaw) * str;
  const len = Math.hypot(mx, mz);
  const moving = len > 1e-9;
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed = i.dash ? RUN_SPEED : WALK_SPEED;

  let y = num(p.y);
  let vy = num(p.vy);
  if (i.jump && y <= 0) vy = JUMP_SPEED;
  vy -= GRAVITY * h;
  y += vy * h;
  if (y <= 0) {
    y = 0;
    vy = 0;
  }

  // 足元より高い障害物だけが行く手を阻む（低い壁はジャンプで越えられる）
  const blocking = obstacles.filter((o) => o.max.y > y);
  const to = { x: num(p.x) + mx * speed * h, z: num(p.z) + mz * speed * h };
  const pos = clampToArena(resolveObstacles(to, PLAYER_RADIUS, blocking), PLAYER_RADIUS);

  return {
    ...p, x: pos.x, z: pos.z, y, vy, yaw, pitch, moving,
  };
}
