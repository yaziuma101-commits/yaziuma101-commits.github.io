// 真っ暗ソウルの敵（屋敷を歩き回る1体だけ）の動きと、見つかる・聞こえるの規則。
// three.js・DOM・Web Audio に依存しない。yaw=0 は +z を向き、前方は (sin yaw, cos yaw)。
// 状態: 徘徊（patrol）→ 気配（investigate）→ 追跡（chase）→ 見失う（lost）→ 徘徊
import { roomAt, DOORS, PLAYER_START } from './ds-map.js';
import { makeRng, rngInt } from './ds-rng.js';
import { inCone, inLightCone } from './ds-enemies.js';

const f = Object.freeze;

/** 屋敷にいる敵の数 */
export const STALKER_COUNT = 1;
export const STALKER_STATES = f(['patrol', 'investigate', 'chase', 'lost']);

/** 強さ3段階（歩く速さ・気配へ向かう速さ・追う速さ・目のよさ・耳のよさ） */
export const STALKER_LEVELS = f({
  1: f({ patrol: 0.85, investigate: 1.25, chase: 2.4, senses: 0.75, hearing: 0.8 }),
  2: f({ patrol: 1.0, investigate: 1.5, chase: 2.8, senses: 1, hearing: 1 }),
  3: f({ patrol: 1.15, investigate: 1.75, chase: 3.2, senses: 1.3, hearing: 1.2 }),
});

export const VISION_RANGE = 9;
export const VISION_HALF_ANGLE = 0.8;
/** これより近いと、明かりを消して止まっていても気づかれる */
export const TOUCH_RANGE = 0.9;
/** 明かりを消して動いているとき、視界の中で見つかる距離 */
export const DARK_SEE_RANGE = f({ run: 4.5, walk: 2.4, crouch: 1.1 });
/** 足音が聞こえる距離 */
export const NOISE_RADIUS = f({ run: 9, walk: 3.2, crouch: 0.6 });
/** 壁越しの音は小さく聞こえる */
export const WALL_MUFFLE = 0.55;
export const CHASE_KEEP = 11;
export const CHASE_DARK_KEEP = 2.5;
export const LOSE_TIME = 2;
export const LOOK_TIME = 2.5;
export const SEARCH_TIME = 3.5;
export const CATCH_RADIUS = 0.8;
/** 隠れるところを見られたとき、隠れ場所から引きずり出す距離 */
export const CATCH_HIDDEN_RADIUS = 1.3;
export const ALERT_DECAY = 0.5;
export const ALERT_MAX = 1.5;
export const TURN_RATE = 4;
export const ARRIVE = 0.35;
export const WAIT_RANGE = f([1, 2.6]);
/** 捕まえたあと、ろうそくからこれだけ離れた所へ戻る */
export const RESPAWN_MIN_DIST = 9;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const dtOf = (dt) => (fin(dt) && dt > 0 ? dt : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function stalkerLevel(level) {
  const n = Math.round(Number(level));
  return STALKER_LEVELS[Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 2];
}

function crossesDoor(x, z, r1, r2, basementOpen) {
  if (r1 !== 'corridor' && r2 !== 'corridor') return false;
  const other = r1 === 'corridor' ? r2 : r1;
  return DOORS.some((d) => d.room === other && (d.id !== 'basement' || basementOpen)
    && Math.abs(z - d.z) <= 0.25 && Math.abs(x - d.x) <= d.width / 2);
}

/** a から b へまっすぐ行けるか（見通せるか）。部屋の間は戸口でしか通れない */
export function clearPath(a, b, { basementOpen = true } = {}) {
  if (!a || !b || !fin(a.x) || !fin(a.z) || !fin(b.x) || !fin(b.z)) return false;
  let prev = roomAt(a.x, a.z);
  if (!prev) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= n; i++) {
    const x = a.x + (dx * i) / n;
    const z = a.z + (dz * i) / n;
    const r = roomAt(x, z);
    if (!r) return false;
    if (r !== prev && !crossesDoor((x + px) / 2, (z + pz) / 2, prev, r, basementOpen)) return false;
    prev = r;
    px = x;
    pz = z;
  }
  return true;
}

// ---- 道筋（部屋と戸口の点。辺は見通せる近い点どうし） ----
const N = (id, x, z) => f({ id, x, z, room: roomAt(x, z) });
export const NAV_NODES = f([
  N('c-w', -10, 0), N('c-study', -8, 0), N('c-mid', -4, 0), N('c-kids', 0, 0), N('c-e', 5, 0),
  N('c-kitchen', 9, 0), N('c-panel', 11, 0),
  N('d-study', -8, 2), N('d-kids', 0, 2), N('d-kitchen', 9, 2), N('d-base', 0, -2),
  N('s-a', -8, 4), N('s-b', -10, 8), N('s-c', -5, 8.5), N('s-d', -10, 4),
  N('k-a', 0, 4), N('k-b', 1, 8), N('k-c', -1.5, 6.5), N('k-d', 3.5, 4),
  N('ki-a', 9, 4), N('ki-b', 10, 8.5), N('ki-c', 7.5, 4.5),
  N('b-in', 0, -3), N('b-a', 0, -6), N('b-b', -3, -9), N('b-c', 3, -9),
]);
const EDGE_MAX = 7;
export const NAV_EDGES = f((() => {
  const out = [];
  for (let i = 0; i < NAV_NODES.length; i++) {
    for (let j = i + 1; j < NAV_NODES.length; j++) {
      const a = NAV_NODES[i];
      const b = NAV_NODES[j];
      const len = dist(a, b);
      if (len <= EDGE_MAX && clearPath(a, b, { basementOpen: true })) {
        out.push(f({
          a: i, b: j, len, basement: a.room === 'basement' || b.room === 'basement',
        }));
      }
    }
  }
  return out;
})());

/** 次に向かう点（まっすぐ行けなければ道筋をたどる）。行けなければ null */
export function nextWaypoint(from, target, opts = {}) {
  const o = { basementOpen: !!opts.basementOpen };
  if (!from || !target) return null;
  if (clearPath(from, target, o)) return { x: target.x, z: target.z };
  const n = NAV_NODES.length;
  const D = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const node = NAV_NODES[i];
    if (node.room === 'basement' && !o.basementOpen) continue;
    if (clearPath(from, node, o)) D[i] = dist(from, node);
  }
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && D[i] < Infinity && (u < 0 || D[i] < D[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const e of NAV_EDGES) {
      if (e.basement && !o.basementOpen) continue;
      let v = -1;
      if (e.a === u) v = e.b;
      else if (e.b === u) v = e.a;
      if (v < 0 || done[v]) continue;
      const nd = D[u] + e.len;
      if (nd < D[v]) {
        D[v] = nd;
        prev[v] = u;
      }
    }
  }
  let best = -1;
  let bestCost = Infinity;
  for (let i = 0; i < n; i++) {
    if (D[i] === Infinity || !clearPath(NAV_NODES[i], target, o)) continue;
    const c = D[i] + dist(NAV_NODES[i], target);
    if (c < bestCost) {
      bestCost = c;
      best = i;
    }
  }
  if (best < 0) return null;
  const path = [];
  for (let u = best; u >= 0; u = prev[u]) path.unshift(u);
  for (let k = path.length - 1; k >= 0; k--) {
    const node = NAV_NODES[path[k]];
    if (clearPath(from, node, o)) return { x: node.x, z: node.z };
  }
  return { x: NAV_NODES[path[0]].x, z: NAV_NODES[path[0]].z };
}

// ---- 決まった巡回路 ----
const W = (x, z) => f({ x, z, room: roomAt(x, z) });
export const PATROL_ROUTE = f([
  W(-8, 4), W(-10, 8), W(-5, 8.5), W(-8, 0), W(-3, 0),
  W(0, 5), W(1, 8), W(-1.5, 6.5), W(3, 0),
  W(9, 4.5), W(10, 8.5), W(7.5, 4.5), W(6, 0),
  W(0, -6), W(-3, -9), W(3, -9), W(0, 0),
]);

/** 巡回路の点を使えるか（地下室は開いてから、電気が戻ったら明るい廊下は避ける） */
export function routeUsable(w, opts = {}) {
  if (!w) return false;
  if (w.room === 'basement' && !opts.basementOpen) return false;
  if (w.room === 'corridor' && opts.power) return false;
  return true;
}

function nextRouteIdx(i, opts) {
  const len = PATROL_ROUTE.length;
  for (let k = 1; k <= len; k++) {
    const j = (i + k) % len;
    if (routeUsable(PATROL_ROUTE[j], opts)) return j;
  }
  return i;
}

function nearestRouteIdx(p, opts) {
  let best = 0;
  let bd = Infinity;
  PATROL_ROUTE.forEach((w, i) => {
    if (!routeUsable(w, opts)) return;
    const d = dist(p, w);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ---- 見つかる・聞こえる ----
export function stanceOf(p) {
  if (p && p.crouch) return 'crouch';
  return p && p.running ? 'run' : 'walk';
}

/** 主人公の足音が届く距離（止まっている・隠れているなら 0） */
export function noiseRadius(p) {
  if (!p || p.hidden || !p.moving) return 0;
  const k = fin(p.noiseScale) && p.noiseScale > 0 ? p.noiseScale : 1;
  return NOISE_RADIUS[stanceOf(p)] * k;
}

/** 電気が戻ったあと、敵は明るい廊下の主人公には近寄らない */
function litCorridorBlocks(e, p, o) {
  return !!o.power && roomAt(p.x, p.z) === 'corridor' && roomAt(e.x, e.z) !== 'corridor';
}

/** 1秒あたりに見つかる度合い（0 なら見つからない） */
export function exposure(e, p, ctx = {}) {
  if (!e || !p) return 0;
  if (p.hidden) return p.seenHiding ? 10 : 0;
  const o = { basementOpen: !!ctx.basementOpen, power: !!ctx.power };
  if (litCorridorBlocks(e, p, o)) return 0;
  if (!clearPath(e, p, o)) return 0;
  const L = stalkerLevel(e.level);
  const d = dist(e, p);
  let x = 0;
  if (p.lightOn && inLightCone(p, e)) x = Math.max(x, 3);
  if (inCone(e, p, VISION_RANGE, VISION_HALF_ANGLE)) {
    if (p.lightOn) x = Math.max(x, 1.5 + 2.5 * Math.max(0, 1 - d / VISION_RANGE));
    else if (p.moving && d <= DARK_SEE_RANGE[stanceOf(p)]) x = Math.max(x, 2);
  }
  if (d <= TOUCH_RANGE) x = Math.max(x, 5);
  return x * L.senses;
}

/** 音が聞こえるか（壁越しは小さくなる） */
export function hearsNoise(e, src, radius, ctx = {}) {
  if (!e || !src || !(radius > 0)) return false;
  const L = stalkerLevel(e.level);
  const o = { basementOpen: !!ctx.basementOpen };
  const reach = radius * L.hearing * (clearPath(e, src, o) ? 1 : WALL_MUFFLE);
  return dist(e, src) <= reach;
}

function chaseKeeps(e, p, o) {
  if (p.hidden) return !!p.seenHiding;
  if (litCorridorBlocks(e, p, o)) return false;
  const d = dist(e, p);
  if (d > CHASE_KEEP) return false;
  if (!clearPath(e, p, o)) return false;
  return !!p.lightOn || !!p.moving || d <= CHASE_DARK_KEEP;
}

/** いま主人公が見えているか（隠れる瞬間に見られたかの判定に使う） */
export function seesPlayer(e, p, ctx = {}) {
  if (!e || !p) return false;
  const o = { basementOpen: !!ctx.basementOpen, power: !!ctx.power };
  const q = { ...p, hidden: false, seenHiding: false };
  if (e.state === 'chase') {
    if (chaseKeeps(e, q, o)) return true;
    // 追っている敵は、目の前で隠れるところも見ている
    return !litCorridorBlocks(e, q, o) && dist(e, q) <= CHASE_KEEP
      && inCone(e, q, VISION_RANGE, VISION_HALF_ANGLE) && clearPath(e, q, o);
  }
  return exposure(e, q, o) > 0;
}

// ---- 動き ----
function turnToward(a, b, max) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  if (Math.abs(d) <= max) return b;
  return a + Math.sign(d) * max;
}

function moveToward(e, target, speed, dt, o) {
  if (!target) return 'blocked';
  if (dist(e, target) <= ARRIVE) return 'arrived';
  if (o.power && e.state !== 'patrol' && roomAt(target.x, target.z) === 'corridor'
    && roomAt(e.x, e.z) !== 'corridor') return 'blocked';
  const wp = nextWaypoint(e, target, o);
  if (!wp) return 'blocked';
  const wx = wp.x - e.x;
  const wz = wp.z - e.z;
  const wd = Math.hypot(wx, wz);
  if (wd < 1e-6) return 'arrived';
  const step = Math.min(speed * dt, wd);
  e.x += (wx / wd) * step;
  e.z += (wz / wd) * step;
  e.moving = step > 0;
  e.yaw = turnToward(e.yaw, Math.atan2(wx, wz), TURN_RATE * dt);
  return dist(e, target) <= ARRIVE ? 'arrived' : 'moving';
}

function lookAround(e, d) {
  e.yaw += Math.sin(e.t * 1.3) * 1.2 * d;
}

function startChase(e, p) {
  e.state = 'chase';
  e.lastSeen = { x: p.x, z: p.z };
  e.loseT = 0;
  e.alert = 1;
}

function toLost(e) {
  e.state = 'lost';
  e.target = e.lastSeen ? { x: e.lastSeen.x, z: e.lastSeen.z } : { x: e.x, z: e.z };
  e.searchT = SEARCH_TIME;
  e.alert = 0;
  e.loseT = 0;
}

function toPatrol(e, o) {
  e.state = 'patrol';
  e.alert = 0;
  e.target = null;
  e.lastSeen = null;
  e.waitT = 0.5;
  e.routeIdx = nearestRouteIdx(e, o);
  if (!routeUsable(PATROL_ROUTE[e.routeIdx], o)) e.routeIdx = nextRouteIdx(e.routeIdx, o);
}

/** 敵を種で決まる遠い巡回路の点へ戻す（捕まえたあと・最初の配置） */
export function respawnStalker(e, avoid, rng = Math.random, ctx = {}) {
  if (!e) return e;
  const o = { basementOpen: !!ctx.basementOpen, power: !!ctx.power };
  const all = PATROL_ROUTE.map((w, i) => i).filter((i) => routeUsable(PATROL_ROUTE[i], o));
  const far = all.filter((i) => !avoid || dist(PATROL_ROUTE[i], avoid) >= RESPAWN_MIN_DIST);
  const pool = far.length ? far : (all.length ? all : [0]);
  const i = pool[rngInt(rng, pool.length)];
  Object.assign(e, {
    x: PATROL_ROUTE[i].x,
    z: PATROL_ROUTE[i].z,
    state: 'patrol',
    alert: 0,
    target: null,
    lastSeen: null,
    loseT: 0,
    lookT: 0,
    searchT: 0,
    waitT: 2 + rng() * 2,
    routeIdx: nextRouteIdx(i, o),
    moving: false,
  });
  return e;
}

/** 敵を1体作る。x,z を渡さなければ種で決まる、主人公の出発点から遠い場所に置く */
export function createStalker({
  seed = 1, level = 2, x, z, yaw = 0, state = 'patrol',
} = {}) {
  const lv = Math.max(1, Math.min(3, Math.round(Number(level)) || 2));
  const rng = makeRng(((Number(seed) >>> 0) ^ 0x2c1b3c6d) >>> 0);
  const e = {
    type: 'stalker',
    level: lv,
    x: 0,
    z: 0,
    yaw: fin(yaw) ? yaw : 0,
    state: 'patrol',
    routeIdx: 0,
    target: null,
    lastSeen: null,
    alert: 0,
    waitT: 0,
    loseT: 0,
    lookT: 0,
    searchT: 0,
    moving: false,
    t: 0,
  };
  if (fin(x) && fin(z)) {
    e.x = x;
    e.z = z;
    e.routeIdx = nextRouteIdx(nearestRouteIdx(e, {}), {});
  } else {
    respawnStalker(e, PLAYER_START, rng, {});
  }
  if (STALKER_STATES.includes(state)) e.state = state;
  return e;
}

/** 屋敷に置く敵（いつも1体） */
export function planStalkers(seed, level = 2) {
  return [createStalker({ seed, level })];
}

/**
 * 1ステップ進める。ctx = {player, power, basementOpen}。
 * player = {x,z,yaw,lightOn,lightScale,moving,running,crouch,hidden,seenHiding}
 * 返り値 {caught, spotted, heard, state}
 */
export function stepStalker(e, dt, ctx = {}, rng = Math.random) {
  const out = {
    caught: false, spotted: false, heard: false, state: e ? e.state : null,
  };
  if (!e) return out;
  const d = dtOf(dt);
  const p = ctx.player && fin(ctx.player.x) && fin(ctx.player.z) ? ctx.player : null;
  const o = { basementOpen: !!ctx.basementOpen, power: !!ctx.power };
  const L = stalkerLevel(e.level);
  e.t += d;
  e.moving = false;
  if (p && e.state !== 'chase') {
    const x = exposure(e, p, o);
    if (x > 0) e.alert = Math.min(ALERT_MAX, e.alert + x * d);
    else e.alert = Math.max(0, e.alert - ALERT_DECAY * d);
    if (e.alert >= 1) {
      startChase(e, p);
      out.spotted = true;
    } else {
      const r = noiseRadius(p);
      if (r > 0 && !litCorridorBlocks(e, p, o) && hearsNoise(e, p, r, o)) {
        e.state = 'investigate';
        e.target = { x: p.x, z: p.z };
        e.lookT = LOOK_TIME;
        out.heard = true;
      }
    }
  }
  switch (e.state) {
    case 'chase': {
      if (p && chaseKeeps(e, p, o)) {
        e.lastSeen = { x: p.x, z: p.z };
        e.loseT = 0;
      } else {
        e.loseT += d;
      }
      if (!e.lastSeen || e.loseT >= LOSE_TIME) {
        toLost(e);
        break;
      }
      moveToward(e, e.lastSeen, L.chase, d, o);
      if (p) {
        let reach = CATCH_RADIUS;
        if (p.hidden) reach = p.seenHiding ? CATCH_HIDDEN_RADIUS : -1;
        if (dist(e, p) <= reach) out.caught = true;
      }
      break;
    }
    case 'investigate': {
      const r = moveToward(e, e.target, L.investigate, d, o);
      if (r !== 'moving') {
        e.lookT -= d;
        lookAround(e, d);
        if (e.lookT <= 0) toPatrol(e, o);
      }
      break;
    }
    case 'lost': {
      const r = moveToward(e, e.target, L.investigate, d, o);
      if (r !== 'moving') {
        e.searchT -= d;
        lookAround(e, d);
        if (e.searchT <= 0) toPatrol(e, o);
      }
      break;
    }
    default: {
      e.state = 'patrol';
      if (e.waitT > 0) {
        e.waitT -= d;
        break;
      }
      if (!routeUsable(PATROL_ROUTE[e.routeIdx], o)) {
        e.routeIdx = nextRouteIdx(e.routeIdx, o);
        break;
      }
      const r = moveToward(e, PATROL_ROUTE[e.routeIdx], L.patrol, d, o);
      if (r !== 'moving') {
        e.waitT = WAIT_RANGE[0] + rng() * (WAIT_RANGE[1] - WAIT_RANGE[0]);
        e.routeIdx = nextRouteIdx(e.routeIdx, o);
      }
    }
  }
  out.state = e.state;
  return out;
}
