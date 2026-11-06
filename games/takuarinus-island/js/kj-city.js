// 怪獣大決戦のミニチュア市街地（建物の配置・破壊・被害額）。three.js・DOM に依存しない。
import { inReach } from './kj-rules.js';

const f = Object.freeze;

export const ARENA_RADIUS = 80;
export const PLAYER_START = f({ x: 0, z: -30 });
export const ENEMY_START = f({ x: 0, z: 30 });
export const CLEAR_RADIUS = 12;
export const MIN_GAP = 8;
export const BODY_DAMAGE_PER_SEC = 10;
/** 大通り（x=0 に沿う）の半分の幅。建物は大通りの上に置かない */
export const ROAD_HALF = 6;

export const BUILDING_TYPES = f({
  house: f({ hp: 12, value: 800, radius: 5 }),
  office: f({ hp: 30, value: 5000, radius: 7 }),
  water: f({ hp: 20, value: 1500, radius: 4 }),
  pole: f({ hp: 4, value: 100, radius: 1.5 }),
});

/** 置く順番と数（大きいものから） */
const CITY_PLAN = f([['office', 7], ['water', 2], ['house', 12], ['pole', 10]]);
const TRIES = 200;

function mulberry32(seed) {
  let t = (Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 0) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

export function createBuilding({
  id, type, x, z,
}) {
  const def = BUILDING_TYPES[type] || BUILDING_TYPES.house;
  return {
    id, type, x, z, hp: def.hp, maxHp: def.hp, value: def.value, radius: def.radius, collapsed: false,
  };
}

/** 種で再現できる街 */
export function createCity(seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (const [type, count] of CITY_PLAN) {
    const r = BUILDING_TYPES[type].radius;
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < TRIES; k++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * (ARENA_RADIUS - r);
        const x = round2(Math.cos(a) * rr);
        const z = round2(Math.sin(a) * rr);
        if (Math.hypot(x, z) > ARENA_RADIUS) continue;
        if (Math.abs(x) < ROAD_HALF + r * 0.5) continue;
        if ([PLAYER_START, ENEMY_START].some((s) => Math.hypot(x - s.x, z - s.z) < CLEAR_RADIUS + r)) continue;
        if (out.some((b) => Math.hypot(b.x - x, b.z - z) < Math.max(MIN_GAP, b.radius + r))) continue;
        out.push(createBuilding({
          id: `${type}-${i}`, type, x, z,
        }));
        break;
      }
    }
  }
  return out;
}

/** 建物にダメージ。崩れた瞬間だけ value を返す（崩れ済みには何も起きない）。元の建物は変えない */
export function damageBuilding(b, dmg) {
  if (!b || b.collapsed) return { building: b, collapsedNow: false, value: 0 };
  const n = Number(dmg);
  const hp = Math.max(0, b.hp - (Number.isFinite(n) && n > 0 ? n : 0));
  const collapsed = hp <= 0;
  return { building: { ...b, hp, collapsed }, collapsedNow: collapsed, value: collapsed ? b.value : 0 };
}

export function buildingsInReach(buildings, kind, ox, oz, heading) {
  const list = Array.isArray(buildings) ? buildings : [];
  return list.filter((b) => b && !b.collapsed && inReach(kind, ox, oz, heading, b.x, b.z, b.radius));
}

/** 崩れた建物の価値の合計（万円） */
export function totalDamage(buildings) {
  let sum = 0;
  for (const b of Array.isArray(buildings) ? buildings : []) if (b && b.collapsed) sum += b.value;
  return sum;
}
