// 見下ろし型けん玉の規則（three.js・DOM・Web Audio に依存しない）。元の状態は変えず新しい状態を返す。
import { hashUnit } from './kendama-tricks.js';
import { heightPoints } from './kendama-height-points.js';

export const MATCH_SEC = 90;
export const GRAVITY = 9.8;
export const ARENA = 12;
export const MOVE_SPEED = 5;
export const CHARGE_FULL_SEC = 1.2;
export const MIN_HEIGHT = 2;
export const MAX_HEIGHT = 16;
export const CATCH_RADIUS = 0.9;
export const TACKLE_RANGE = 1.6;
export const KNOCK_SPEED = 14;
export const STUN_SEC = 0.9;
export const TACKLE_COOLDOWN = 1.5;
export const BLOCK_Y = 5;
export const CAMERA_Y = 22;
export const AI_LEVELS = Object.freeze({
  1: Object.freeze({ tackle: 0.15, charge: 0.3, speed: 0.6, acc: 0.6 }),
  2: Object.freeze({ tackle: 0.3, charge: 0.5, speed: 0.8, acc: 0.78 }),
  3: Object.freeze({ tackle: 0.5, charge: 0.7, speed: 1, acc: 0.92 }),
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
export const otherOf = (who) => (who === 'hero' ? 'ally' : 'hero');

export function heightFromCharge(c) {
  return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * clamp(fin(c), 0, 1);
}
export function flightTime(h) {
  return 2 * Math.sqrt((2 * Math.max(0, h)) / GRAVITY);
}
export function ballHeight(h, t) {
  const v = Math.sqrt(2 * GRAVITY * Math.max(0, h));
  return Math.max(0, v * t - 0.5 * GRAVITY * t * t);
}
/** 画面をふさぐ秒数。高いほど長く、自分の玉ほど長い */
export function blockSec(h, own = true) {
  if (!(h > BLOCK_Y)) return 0;
  return 2 * Math.sqrt((2 * (h - BLOCK_Y)) / GRAVITY) * (own ? 1 : 0.5);
}
/** 高さの段階で得点（低い 1・中くらい 3・高い 6・とても高い 10。kendama-height-points.js） */
export function catchPoints(h) {
  return heightPoints(fin(h));
}

function createPlayer(pos) {
  return {
    x: pos.x, z: pos.z, vx: 0, vz: 0, stun: 0, cool: 0, charge: 0, charging: false, ball: null, launches: 0,
  };
}

export function createTopGame({
  seed = 0, strength = 2, catchRadius = CATCH_RADIUS, chargeRate = 1,
  heroPos = { x: -3, z: 0 }, allyPos = { x: 3, z: 0 },
} = {}) {
  return {
    seed: Math.floor(fin(Number(seed))),
    strength: clamp(Math.round(fin(Number(strength), 2)), 1, 3),
    time: 0,
    tick: 0,
    catchRadius,
    chargeRate,
    players: { hero: createPlayer(heroPos), ally: createPlayer(allyPos) },
    scores: { hero: 0, ally: 0 },
    events: [],
  };
}

const copyGame = (g) => ({
  ...g,
  players: { hero: { ...g.players.hero }, ally: { ...g.players.ally } },
  scores: { ...g.scores },
  events: [],
});

export function isFinished(g) {
  return !g || g.time >= MATCH_SEC;
}

/** 体当たり。届かない・待ち時間中・気絶中なら何も変えない */
export function tackle(game, who) {
  const a = game.players[who];
  const b = game.players[otherOf(who)];
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (a.cool > 0 || a.stun > 0 || d > TACKLE_RANGE) return game;
  const g = copyGame(game);
  const nx = d > 1e-6 ? (b.x - a.x) / d : 1;
  const nz = d > 1e-6 ? (b.z - a.z) / d : 0;
  const t = g.players[otherOf(who)];
  t.vx = nx * KNOCK_SPEED;
  t.vz = nz * KNOCK_SPEED;
  t.stun = STUN_SEC;
  t.charging = false;
  t.charge = 0;
  g.players[who].cool = TACKLE_COOLDOWN;
  g.events = [{ type: 'tackle', who }];
  return g;
}

function stepPlayer(p, inp, dt, rate, events, who) {
  p.stun = Math.max(0, p.stun - dt);
  p.cool = Math.max(0, p.cool - dt);
  if (p.stun > 0) {
    const k = Math.max(0, 1 - dt * 3);
    p.vx *= k;
    p.vz *= k;
  } else {
    let mx = fin(inp.mx);
    let mz = fin(inp.mz);
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    p.vx = mx * MOVE_SPEED;
    p.vz = mz * MOVE_SPEED;
  }
  p.x = clamp(p.x + p.vx * dt, -ARENA, ARENA);
  p.z = clamp(p.z + p.vz * dt, -ARENA, ARENA);
  if (!p.ball && p.stun <= 0) {
    if (inp.charging) {
      p.charging = true;
      p.charge = Math.min(1, p.charge + (dt * rate) / CHARGE_FULL_SEC);
    } else if (p.charging) {
      const h = heightFromCharge(p.charge);
      p.ball = { x: p.x, z: p.z, h, t: 0, total: flightTime(h) };
      p.charging = false;
      p.charge = 0;
      p.launches += 1;
      events.push({ type: 'launch', who, h });
    }
  }
  if (p.ball) p.ball = { ...p.ball, t: p.ball.t + dt };
}

/** 相手の入力（種から決まる） */
export function aiInput(game) {
  const lv = AI_LEVELS[game.strength] || AI_LEVELS[2];
  const a = game.players.ally;
  const h = game.players.hero;
  const r = (k, n = game.tick) => hashUnit(game.seed, 'kt-ai', n, k);
  const inp = { mx: 0, mz: 0, charging: false, tackle: false };
  const toward = (x, z, sp) => {
    const dx = x - a.x;
    const dz = z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.15) { inp.mx = (dx / d) * sp; inp.mz = (dz / d) * sp; }
  };
  if (a.ball) {
    const miss = hashUnit(game.seed, 'kt-miss', a.launches, 0) > lv.acc;
    toward(a.ball.x + (miss ? 2.2 : 0), a.ball.z, lv.speed);
  } else {
    const target = clamp(lv.charge + (hashUnit(game.seed, 'kt-plan', a.launches, 0) - 0.5) * 0.4, 0.1, 1);
    if (a.charging) inp.charging = a.charge < target;
    else inp.charging = r(1) < 0.04;
    if (h.ball) toward(h.x, h.z, lv.speed);
  }
  const d = Math.hypot(h.x - a.x, h.z - a.z);
  if (d <= TACKLE_RANGE && (h.ball || a.ball) && r(2) < lv.tackle * 0.15) inp.tackle = true;
  return inp;
}

/** 1フレーム進める。inputs.ally を省くと AI が動かす */
export function stepGame(game, dt, inputs = {}) {
  if (isFinished(game)) return game;
  const h = clamp(fin(dt), 0, 0.1);
  const hi = inputs.hero || {};
  const ai = inputs.ally || aiInput(game);
  let g = game;
  const events = [];
  for (const [who, inp] of [['hero', hi], ['ally', ai]]) {
    if (inp.tackle) {
      const n = tackle(g, who);
      if (n !== g) { events.push(...n.events); g = n; }
    }
  }
  g = copyGame(g);
  for (const [who, inp] of [['hero', hi], ['ally', ai]]) {
    stepPlayer(g.players[who], inp, h, who === 'hero' ? fin(g.chargeRate, 1) : 1, events, who);
  }
  for (const who of ['hero', 'ally']) {
    const p = g.players[who];
    if (p.ball && p.ball.t >= p.ball.total) {
      const d = Math.hypot(p.x - p.ball.x, p.z - p.ball.z);
      if (d <= g.catchRadius) {
        const pts = catchPoints(p.ball.h);
        g.scores[who] += pts;
        events.push({ type: 'catch', who, points: pts, h: p.ball.h });
      } else events.push({ type: 'miss', who });
      p.ball = null;
    }
  }
  g.time = Math.min(MATCH_SEC, g.time + h);
  g.tick += 1;
  g.events = events;
  return g;
}

/** viewer の画面がふさがる割合（0〜1） */
export function screenBlock(game, viewer = 'hero') {
  let c = 0;
  for (const who of ['hero', 'ally']) {
    const b = game.players[who].ball;
    if (!b) continue;
    const y = ballHeight(b.h, b.t);
    if (y > BLOCK_Y) c = Math.max(c, ((y - BLOCK_Y) / (MAX_HEIGHT - BLOCK_Y)) * (who === viewer ? 1 : 0.5));
  }
  return clamp(c, 0, 1);
}

export function topResult(game) {
  if (!isFinished(game)) return null;
  const { hero, ally } = game.scores;
  return hero > ally ? 'win' : hero < ally ? 'lose' : 'draw';
}
