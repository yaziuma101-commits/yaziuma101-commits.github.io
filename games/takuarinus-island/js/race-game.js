// レース1回の進行（three.js・DOM に依存しない）
import { TRACK, surfaceAt, clampToFence } from './race-track.js';
import { createKart, stepKart } from './kart.js';
import {
  TOTAL_LAPS, createRacer, stepRacer, distanceToNextGate, rankRacers,
} from './race-rules.js';
import { createAIDriver } from './race-ai.js';
import {
  BRAWL, createRider, stepBrawl, syncRiders, isDriving, coastKart, playerPrompt,
} from './race-brawl.js';

export const COUNTDOWN_TIME = 3;
export const GO_TIME = 0.8;
export const MAX_STEP = 1 / 60;
// 依頼者の指摘（2026-11-04）: 番長のカートは速く、2台はすり抜けずにぶつかる
export const RIVAL_TOP_MUL = 1.08; // 番長のカートの最高速（自分のカートの何倍か）
export const KART_BUMP_DIST = 2.4; // 2台の中心がこれより近づいたら押し合う
export const BUMP_SPEED_KEEP = 0.8; // ぶつかったあとに残る速さ
const BUMP_COOLDOWN = 0.35; // 「ドン！」を出す間隔

/** 2台のカートを押し離す（重なった分を半分ずつ）。ぶつかったら true */
export function bumpKarts(race, h = 0) {
  const a = race.player.kart;
  const b = race.rival.kart;
  race.bumpCooldown = Math.max(0, (race.bumpCooldown || 0) - h);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d >= KART_BUMP_DIST) return false;
  const nx = d > 1e-6 ? dx / d : 1;
  const nz = d > 1e-6 ? dz / d : 0;
  const push = (KART_BUMP_DIST - d) / 2;
  // 押される向きに進んでいた方ほど減速する（追突した側が止まる）
  const va = Math.sin(a.heading) * a.speed * nx + Math.cos(a.heading) * a.speed * nz;
  const vb = Math.sin(b.heading) * b.speed * nx + Math.cos(b.heading) * b.speed * nz;
  const closing = va - vb > 0.5;
  race.player.kart = clampToFence(race.track, {
    ...a, x: a.x - nx * push, z: a.z - nz * push,
    speed: closing && va > 0 ? a.speed * BUMP_SPEED_KEEP : a.speed,
  });
  race.rival.kart = clampToFence(race.track, {
    ...b, x: b.x + nx * push, z: b.z + nz * push,
    speed: closing && vb < 0 ? b.speed * BUMP_SPEED_KEEP : b.speed,
  });
  if (closing && race.bumpCooldown <= 0) {
    race.bumpCooldown = BUMP_COOLDOWN;
    race.events.push('kart-bump');
  }
  return true;
}

const NO_INPUT = Object.freeze({ accel: false, brake: false, steer: 0, drift: false });
// 押した瞬間だけ効く入力（分割したステップの2つ目以降では消す）
const NO_EDGES = Object.freeze({ action: false, punch: false, board: false });

function entry(side, track) {
  const { racer, kart } = side;
  return {
    id: racer.id,
    lap: racer.lap,
    checkpoints: racer.checkpoints,
    distToNext: distanceToNextGate(racer, kart, track.gates),
    finished: racer.finished,
    finishTime: racer.finishTime,
  };
}

function refresh(race) {
  const ids = rankRacers([entry(race.player, race.track), entry(race.rival, race.track)]);
  race.playerRank = ids.indexOf('player') + 1;
  race.displayLap = Math.min(race.player.racer.lap + 1, race.totalLaps);
  race.prompt = race.phase === 'racing' ? playerPrompt(race) : null;
}

/** 周回は「カート」で数える。乗り手がいないカートは減速して止まる */
function moveSide(side, inp, h, surface, race) {
  const prev = { x: side.kart.x, z: side.kart.z };
  const r = side.rider;
  const k = isDriving(r)
    ? stepKart(side.kart, inp, h, surface)
    : coastKart(side.kart, h, r.state === 'driving' ? BRAWL.stunDecel : BRAWL.emptyDecel);
  side.kart = clampToFence(race.track, k);
  side.racer = stepRacer(side.racer, prev, { x: side.kart.x, z: side.kart.z },
    race.track.gates, race.time, race.totalLaps);
}

function stepOnce(race, driver, input, h) {
  const t = race.track;
  let ps = surfaceAt(t, race.player.kart.x, race.player.kart.z);
  if (ps === 'out') ps = 'grass';
  let rs = surfaceAt(t, race.rival.kart.x, race.rival.kart.z);
  if (rs === 'boost') rs = 'road'; // 敵は加速床の効果を受けない
  if (rs === 'out') rs = 'grass';
  const rin = driver.input(race.rival.kart, h);
  race.playerInput = input;
  race.rivalInput = rin;
  race.time += h;
  const ev = stepBrawl(race, { player: input }, h, t);
  for (const e of ev) race.events.push(e);
  moveSide(race.player, input, h, ps, race);
  moveSide(race.rival, rin, h, rs, race);
  bumpKarts(race, h);
  syncRiders(race);
  refresh(race);
  const pf = race.player.racer.finished;
  const rf = race.rival.racer.finished;
  if (pf || rf) {
    race.phase = 'finished';
    race.result = pf ? 'win' : 'lose';
    race.prompt = null;
  }
}

export function createRace({ track = TRACK, totalLaps = TOTAL_LAPS } = {}) {
  const driver = createAIDriver(track);
  const pk = createKart(track.playerStart);
  const rk = { ...createKart(track.rivalStart), topMul: RIVAL_TOP_MUL };
  const race = {
    track,
    totalLaps,
    phase: 'countdown',
    countdown: Math.ceil(COUNTDOWN_TIME),
    goTimer: 0,
    time: 0,
    elapsed: 0,
    player: { kart: pk, racer: createRacer('player'), rider: createRider('player', pk) },
    rival: { kart: rk, racer: createRacer('rival'), rider: createRider('rival', rk) },
    rivalCooldown: BRAWL.rivalJumpInterval,
    playerRank: 1,
    displayLap: 1,
    result: null,
    prompt: null,
    events: [],
    playerInput: NO_INPUT,
    rivalInput: NO_INPUT,
    update(input, dt) {
      race.events = [];
      if (race.phase === 'finished') return race;
      let left = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (race.phase === 'countdown') {
        const need = COUNTDOWN_TIME - race.elapsed;
        if (left < need) {
          race.elapsed += left;
          race.countdown = Math.max(1, Math.ceil(COUNTDOWN_TIME - race.elapsed));
          return race;
        }
        left -= need;
        race.elapsed = COUNTDOWN_TIME;
        race.phase = 'racing';
        race.countdown = 0;
        race.goTimer = GO_TIME;
      }
      race.goTimer = Math.max(0, race.goTimer - left);
      const inp = { ...NO_INPUT, ...(input || {}) };
      const rest = { ...inp, ...NO_EDGES };
      let first = true;
      while (left > 1e-9 && race.phase === 'racing') {
        const h = Math.min(MAX_STEP, left);
        left -= h;
        stepOnce(race, driver, first ? inp : rest, h);
        first = false;
      }
      return race;
    },
  };
  refresh(race);
  return race;
}
