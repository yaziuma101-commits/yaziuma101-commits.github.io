// モヒカンタッチタッチ：審判を殴ったあとの乱闘（three.js・DOM・Web Audio に依存しない）。
// 土俵の上を自由に動き、パンチを3回当てた方が相手を気絶させて勝ち。元の状態は変えない。
import { hashUnit } from './kendama-tricks.js';

export const RING_RADIUS = 4.5;
export const MOVE_SPEED = 3.2;
export const AI_SPEED = 2.6;
export const PUNCH_REACH = 1.1;
export const PUNCH_COOLDOWN = 0.5;
export const AI_PUNCH_COOLDOWN = 0.9;
export const STAGGER_SEC = 0.6;
export const KO_HITS = 3;
/** 乱闘中の案内（審判のことは書かない） */
export const BRAWL_HINT = '乱闘だ！ WASD: 移動　J / K・左クリック: パンチ　3回当てて気絶させろ！';

const fighter = (x, z) => ({
  x, z, hits: 0, cooldown: 0, stagger: 0, ko: false,
});

export function createBrawl({ seed = 0 } = {}) {
  return {
    seed: Math.floor(Number(seed)) || 0,
    time: 0,
    tick: 0,
    hero: fighter(0, 1.5),
    rival: fighter(0, -1.5),
    events: [],
    winner: null,
  };
}

function clampRing(f) {
  const d = Math.hypot(f.x, f.z);
  if (d <= RING_RADIUS) return f;
  const k = RING_RADIUS / d;
  return { ...f, x: f.x * k, z: f.z * k };
}

function tryPunch(att, def, cd) {
  if (att.cooldown > 0 || att.stagger > 0 || att.ko) return { att, def, hit: false, swung: false };
  const a = { ...att, cooldown: cd };
  if (Math.hypot(att.x - def.x, att.z - def.z) > PUNCH_REACH) return { att: a, def, hit: false, swung: true };
  const hits = def.hits + 1;
  const ko = hits >= KO_HITS;
  const dx = def.x - att.x;
  const dz = def.z - att.z;
  const dl = Math.hypot(dx, dz) || 1;
  const d = clampRing({
    ...def, hits, ko, stagger: STAGGER_SEC, x: def.x + (dx / dl) * 0.6, z: def.z + (dz / dl) * 0.6,
  });
  return { att: a, def: d, hit: true, swung: true };
}

/** 1フレーム進める。input: {moveX, moveZ (-1..1), punch} */
export function stepBrawl(state, input = {}, dt = 0) {
  if (!state || state.winner) return state;
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const events = [];
  const cool = (f) => ({
    ...f, cooldown: Math.max(0, f.cooldown - h), stagger: Math.max(0, f.stagger - h),
  });
  let hero = cool(state.hero);
  let rival = cool(state.rival);

  if (hero.stagger <= 0) {
    let mx = Math.max(-1, Math.min(1, Number(input.moveX) || 0));
    let mz = Math.max(-1, Math.min(1, Number(input.moveZ) || 0));
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    hero = clampRing({ ...hero, x: hero.x + mx * MOVE_SPEED * h, z: hero.z + mz * MOVE_SPEED * h });
  }
  if (input.punch) {
    const r = tryPunch(hero, rival, PUNCH_COOLDOWN);
    hero = r.att; rival = r.def;
    if (r.hit) events.push('heroHit');
  }

  // 相手：追いかけて、届けば殴る（殴るかどうかは種で少し迷う）
  if (!rival.ko && rival.stagger <= 0) {
    const dx = hero.x - rival.x;
    const dz = hero.z - rival.z;
    const d = Math.hypot(dx, dz);
    if (d > PUNCH_REACH * 0.8) {
      const s = Math.min(d, AI_SPEED * h);
      rival = clampRing({ ...rival, x: rival.x + (dx / d) * s, z: rival.z + (dz / d) * s });
    }
    if (d <= PUNCH_REACH && rival.cooldown <= 0) {
      if (hashUnit(state.seed, 'brawl', state.tick) < 0.7) {
        const r = tryPunch(rival, hero, AI_PUNCH_COOLDOWN);
        rival = r.att; hero = r.def;
        if (r.hit) events.push('rivalHit');
      } else {
        rival = { ...rival, cooldown: 0.3 };
      }
    }
  }

  let winner = null;
  if (rival.ko) winner = 'hero';
  else if (hero.ko) winner = 'rival';
  if (winner) events.push('ko');
  return {
    ...state, time: state.time + h, tick: state.tick + 1, hero, rival, events, winner,
  };
}

/** 主人公から見た結果。続いていれば null */
export function brawlResult(state) {
  if (!state || !state.winner) return null;
  return state.winner === 'hero' ? 'win' : 'lose';
}
