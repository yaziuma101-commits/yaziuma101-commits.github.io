// FPS番長の攻撃の規則（three.js・DOM に依存しない）。状態は不変に扱う
import { hasLineOfSight } from './fps-geometry.js';
import {
  ARENA_RADIUS, OBSTACLES, BOSS_SPAWN, BOSS_RADIUS, PLAYER_EYE, clampToArena, resolveObstacles,
} from './fps-arena.js';

/** 番長の目の高さ（水の玉はここから飛ぶ） */
export const BOSS_EYE = 1.7;
export const ORB_RADIUS = 0.4;
export const ORB_LIFE = 8;
/** 主人公の当たり判定のカプセル（足元からの高さ） */
export const PLAYER_HIT_RADIUS = 0.35;
export const PLAYER_HIT_BOTTOM = 0.2;
export const PLAYER_HIT_TOP = 1.6;
export const WAYPOINT_REACH = 0.6;
const WAYPOINT_CLEAR = 0.6;

const PATTERNS = Object.freeze({
  1: Object.freeze({ count: 1, spreadDeg: 0, interval: 2.4, orbSpeed: 6, moveSpeed: 2.0 }),
  2: Object.freeze({ count: 3, spreadDeg: 18, interval: 2.0, orbSpeed: 7, moveSpeed: 3.0 }),
  3: Object.freeze({ count: 1, spreadDeg: 0, interval: 0.7, orbSpeed: 8, moveSpeed: 5.5 }),
});

/** 体力から段階: 20以上=1、10〜19=2、10未満=3 */
export function bossStage(hp) {
  if (hp >= 20) return 1;
  if (hp >= 10) return 2;
  return 3;
}

export function stagePattern(stage) {
  return { ...(PATTERNS[stage] || PATTERNS[1]) };
}

/** 「パワーアップ！」を出す時間（秒） */
export const POWERUP_TIME = 1.0;

/** 体力が prevHp → hp になったとき段階が上がったら新しい段階、上がらなければ 0 */
export function stageUp(prevHp, hp) {
  if (!Number.isFinite(prevHp) || !Number.isFinite(hp)) return 0;
  const a = bossStage(prevHp);
  const b = bossStage(hp);
  return b > a ? b : 0;
}

/** 段階3は走り回る */
export function bossRuns(hp) {
  return bossStage(hp) >= 3;
}

/** 段階が上がったときの表示 */
export function stageAnnounce(stage) {
  const sub = stage >= 3 ? '走り回って連射してくるぞ！' : stage === 2 ? '3方向に撃ってくるぞ！' : '';
  return { title: 'パワーアップ！', sub };
}

function rotY(v, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

/** 撃つ方向。count=3 は [左, 中央, 右]。y 成分は保つ */
export function fireDirections(stage, aimDir) {
  const p = stagePattern(stage);
  const aim = { x: aimDir.x, y: aimDir.y, z: aimDir.z };
  if (p.count < 3 || !(p.spreadDeg > 0)) return [aim];
  const r = (p.spreadDeg * Math.PI) / 180;
  return [rotY(aim, r), aim, rotY(aim, -r)];
}

/** 高難易度: 狙いの左右にも撃ち足す（弾幕を厚くする） */
export function hardSpread(dirs, deg = 24) {
  const r = (deg * Math.PI) / 180;
  const out = [...dirs];
  for (const d of dirs) out.push(rotY(d, r * 1.5), rotY(d, -r * 1.5));
  return out;
}

export function createAttackState() {
  return { cooldown: 1.0 };
}

/** 1 tick 分の攻撃。見えているときだけ撃つ */
export function tickAttack(state, dt, {
  hp, bossEye, playerEye, boxes,
} = {}) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let cooldown = Math.max(0, (state && Number.isFinite(state.cooldown) ? state.cooldown : 0) - h);
  if (cooldown <= 1e-9) cooldown = 0;
  if (cooldown > 0 || !bossEye || !playerEye || !hasLineOfSight(bossEye, playerEye, boxes || [])) {
    return { state: { cooldown }, fire: null };
  }
  const v = { x: playerEye.x - bossEye.x, y: playerEye.y - bossEye.y, z: playerEye.z - bossEye.z };
  const len = Math.hypot(v.x, v.y, v.z);
  const aim = len > 1e-9 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: -1 };
  const stage = bossStage(hp);
  const p = stagePattern(stage);
  return {
    state: { cooldown: p.interval },
    fire: { stage, directions: fireDirections(stage, aim), speed: p.orbSpeed },
  };
}

// ---- 番長の歩き回り ----
function distXZToBox(p, o) {
  const dx = Math.max(o.min.x - p.x, 0, p.x - o.max.x);
  const dz = Math.max(o.min.z - p.z, 0, p.z - o.max.z);
  return Math.hypot(dx, dz);
}

/** アリーナ内で障害物から離れた次の目的地。rand は 0〜1 を返す関数 */
export function pickWaypoint(rand = Math.random, obstacles = OBSTACLES) {
  const u = () => {
    const v = Number(rand());
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  };
  const lim = ARENA_RADIUS - 2.5;
  for (let i = 0; i < 30; i++) {
    const a = u() * Math.PI * 2;
    const r = Math.sqrt(u()) * lim;
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (obstacles.every((o) => distXZToBox(p, o) >= BOSS_RADIUS + WAYPOINT_CLEAR)) return p;
  }
  return { x: BOSS_SPAWN.x, z: BOSS_SPAWN.z };
}

/** 目的地へ speed で進む（行き過ぎない）。障害物は押し出しで滑って避け、外へは出ない */
export function stepBossMove(pos, target, speed, dt, obstacles = OBSTACLES) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const v = Number.isFinite(speed) && speed > 0 ? speed : 0;
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  const step = Math.min(d, v * h);
  const to = d > 1e-9 ? { x: pos.x + (dx / d) * step, z: pos.z + (dz / d) * step } : { x: pos.x, z: pos.z };
  const p = clampToArena(resolveObstacles(to, BOSS_RADIUS, obstacles), BOSS_RADIUS);
  return {
    x: p.x,
    z: p.z,
    arrived: Math.hypot(target.x - p.x, target.z - p.z) <= WAYPOINT_REACH,
    moved: Math.hypot(p.x - pos.x, p.z - pos.z),
  };
}

// ---- 水の玉（一定速度で直進・重力なし） ----
export function createOrb(pos, dir, speed) {
  const s = Number.isFinite(speed) ? speed : 0;
  return {
    x: pos.x, y: pos.y, z: pos.z, vx: dir.x * s, vy: dir.y * s, vz: dir.z * s, life: ORB_LIFE,
  };
}

export function stepOrb(o, dt) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return {
    ...o, x: o.x + o.vx * h, y: o.y + o.vy * h, z: o.z + o.vz * h, life: o.life - h,
  };
}

/** 寿命切れ・床の下・アリーナの外・障害物の中なら true（消す） */
export function orbGone(o, obstacles = OBSTACLES, arenaRadius = ARENA_RADIUS) {
  if (!(o.life > 0) || o.y < 0 || Math.hypot(o.x, o.z) > arenaRadius) return true;
  return obstacles.some((b) => o.x > b.min.x && o.x < b.max.x
    && o.y > b.min.y && o.y < b.max.y
    && o.z > b.min.z && o.z < b.max.z);
}

/** 玉の中心と主人公のカプセルの距離が 玉の半径+主人公の半径 未満なら命中。p.y は足元の高さ */
export function orbHitsPlayer(o, p) {
  const fy = Number.isFinite(p.y) ? p.y : 0;
  const cy = Math.max(fy + PLAYER_HIT_BOTTOM, Math.min(o.y, fy + PLAYER_HIT_TOP));
  const d = Math.hypot(o.x - p.x, o.y - cy, o.z - p.z);
  return d < ORB_RADIUS + PLAYER_HIT_RADIUS;
}

// ---- stepOrbs の引数・玉の形の違いを吸収する ----
const fin = Number.isFinite;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isPos = (v) => isObj(v) && fin(v.x) && fin(v.z);
const isCapsule = (v) => isObj(v) && isPos(v.a) && isPos(v.b);
const isBox = (v) => isObj(v) && isObj(v.min) && isObj(v.max);
const isBoxList = (a) => Array.isArray(a) && a.every(isBox);

const CAPSULE_KEYS = ['playerCapsule', 'capsule', 'hitbox', 'body'];
const PLAYER_KEYS = ['player', 'playerPos', 'pos', 'position', 'hero', 'target', 'feet', 'playerFeet'];
const EYE_KEYS = ['playerEye', 'eye'];

/** 主人公の当たり判定の線分 {a,b,r} */
function segFromCapsule(c) {
  return {
    a: { x: c.a.x, y: fin(c.a.y) ? c.a.y : 0, z: c.a.z },
    b: { x: c.b.x, y: fin(c.b.y) ? c.b.y : 0, z: c.b.z },
    r: fin(c.r) && c.r > 0 ? c.r : PLAYER_HIT_RADIUS,
  };
}

/** 位置（足元か目の高さ）から当たり判定の線分を作る */
function segFromPos(p, isEye) {
  const y = fin(p.y) ? p.y : 0;
  const feet = isEye || y > 1.5 ? Math.max(0, y - PLAYER_EYE) : y;
  return {
    a: { x: p.x, y: feet + PLAYER_HIT_BOTTOM, z: p.z },
    b: { x: p.x, y: feet + PLAYER_HIT_TOP, z: p.z },
    r: PLAYER_HIT_RADIUS,
  };
}

function playerFromObject(a) {
  for (const k of CAPSULE_KEYS) if (isCapsule(a[k])) return segFromCapsule(a[k]);
  for (const k of PLAYER_KEYS) {
    if (isCapsule(a[k])) return segFromCapsule(a[k]);
    if (isPos(a[k])) return segFromPos(a[k], false);
  }
  for (const k of EYE_KEYS) if (isPos(a[k])) return segFromPos(a[k], true);
  if (isCapsule(a)) return segFromCapsule(a);
  if (isPos(a) && !isBox(a)) return segFromPos(a, false);
  return null;
}

function hitsSeg(o, s) {
  const abx = s.b.x - s.a.x;
  const aby = s.b.y - s.a.y;
  const abz = s.b.z - s.a.z;
  const apx = o.x - s.a.x;
  const apy = o.y - s.a.y;
  const apz = o.z - s.a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-12 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const d = Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
  return d < ORB_RADIUS + s.r;
}

/** 玉の形の違い（vx/vy/vz・vel・dir+speed、life の省略）をそろえる。位置が無ければ null */
function normalizeOrb(o) {
  if (!isObj(o)) return null;
  let p = null;
  if (isPos(o)) p = o;
  else if (isPos(o.pos)) p = o.pos;
  else if (isPos(o.position)) p = o.position;
  if (!p) return null;
  let vx = o.vx;
  let vy = o.vy;
  let vz = o.vz;
  if (!fin(vx) && !fin(vy) && !fin(vz)) {
    const v = isObj(o.vel) ? o.vel : isObj(o.velocity) ? o.velocity : isObj(o.v) ? o.v : null;
    if (v) {
      vx = v.x; vy = v.y; vz = v.z;
    } else if (isObj(o.dir) || isObj(o.direction)) {
      const d = isObj(o.dir) ? o.dir : o.direction;
      const s = fin(o.speed) ? o.speed : 0;
      vx = (fin(d.x) ? d.x : 0) * s;
      vy = (fin(d.y) ? d.y : 0) * s;
      vz = (fin(d.z) ? d.z : 0) * s;
    }
  }
  return {
    ...o,
    x: p.x,
    y: fin(p.y) ? p.y : BOSS_EYE,
    z: p.z,
    vx: fin(vx) ? vx : 0,
    vy: fin(vy) ? vy : 0,
    vz: fin(vz) ? vz : 0,
    life: fin(o.life) ? o.life : ORB_LIFE,
  };
}

function parseOrbArgs(args) {
  let orbs = null;
  let rest = args.slice();
  const first = args[0];
  if (Array.isArray(first)) {
    orbs = first;
    rest = args.slice(1);
  } else if (isObj(first) && Array.isArray(first.orbs)) {
    orbs = first.orbs;
  } else {
    const idx = args.findIndex((a) => Array.isArray(a) && !(a.length > 0 && isBoxList(a)));
    if (idx >= 0) {
      orbs = args[idx];
      rest = args.filter((_, i) => i !== idx);
    }
  }
  let dt;
  let player = null;
  let obstacles = null;
  let arenaRadius;
  for (const a of rest) {
    if (typeof a === 'number') {
      if (dt === undefined && fin(a)) dt = a;
      continue;
    }
    if (Array.isArray(a)) {
      if (!obstacles && isBoxList(a)) obstacles = a;
      continue;
    }
    if (!isObj(a)) continue;
    if (!obstacles) {
      if (Array.isArray(a.obstacles)) obstacles = a.obstacles;
      else if (Array.isArray(a.boxes)) obstacles = a.boxes;
    }
    if (arenaRadius === undefined && fin(a.arenaRadius)) arenaRadius = a.arenaRadius;
    if (dt === undefined && fin(a.dt)) dt = a.dt;
    if (!player) player = playerFromObject(a);
  }
  return {
    orbs: orbs || [], dt, player, obstacles, arenaRadius,
  };
}

/**
 * 全部の玉を進める。命中した玉と消えた玉を取り除き、命中数を返す。
 * 主人公は {player, obstacles|boxes, arenaRadius}、位置そのもの {x,y,z}、カプセル {a,b,r} のどれでもよい。
 * 速い玉が1フレームで主人公をすり抜けないよう、短い区間に分けて調べる。
 */
export function stepOrbs(...args) {
  const parsed = parseOrbArgs(args);
  const { player } = parsed;
  const obstacles = parsed.obstacles || OBSTACLES;
  const arenaRadius = fin(parsed.arenaRadius) ? parsed.arenaRadius : ARENA_RADIUS;
  const h = fin(parsed.dt) && parsed.dt > 0 ? parsed.dt : 0;
  const out = [];
  let hits = 0;
  for (const raw of parsed.orbs) {
    const o = normalizeOrb(raw);
    if (!o) continue;
    if (player && hitsSeg(o, player)) {
      hits += 1;
      continue;
    }
    const speed = Math.hypot(o.vx, o.vy, o.vz);
    const steps = Math.max(1, Math.min(200, Math.ceil((speed * h) / 0.1)));
    const sub = h / steps;
    let n = o;
    let state = 'alive';
    for (let i = 0; i < steps; i++) {
      n = stepOrb(n, sub);
      if (player && hitsSeg(n, player)) {
        state = 'hit';
        break;
      }
      if (orbGone(n, obstacles, arenaRadius)) {
        state = 'gone';
        break;
      }
    }
    if (state === 'hit') {
      hits += 1;
      continue;
    }
    if (state === 'gone') continue;
    out.push(n);
  }
  return { orbs: out, hits, hit: hits > 0 };
}
