// モヒカンタッチタッチの規則（three.js・DOM・Web Audio に依存しない）。
// x 軸を2人で共有する。手 'L' は −x 側から、'R' は +x 側から。lean -1 は −x へ傾く。
import { INTERRUPT_KINDS } from './touch-interrupt.js';

export const MATCH_SECONDS = 60;
export const WIN_POINTS = 10;
export const REACH_SECONDS = 0.35;
export const HIT_AT_RATIO = 3 / 7;
export const STAGGER_SECONDS = 0.5;
export const GAP = 1.6;
export const BASE_REACH = 1.7;
export const FORWARD_REACH_BONUS = 0.4;
export const FORWARD_CLOSE = 0.3;
export const LEAN_OFFSET = 0.6;
export const HAND_LATERAL = 0.2;
export const HIT_RADIUS = 0.45;
export const VERT_RADIUS = 0.4;
export const STAND_HEIGHT = 1.0;
export const CROUCH_HEIGHT = 0.3;
export const HAND_HEIGHT = 1.0;
export const FORWARD_HAND_HEIGHT = 0.65;
export const INTERRUPT_MAX = 2;
export const WHO = Object.freeze(['hero', 'rival']);

const EPS = 1e-9;
const MOD_DEFAULTS = Object.freeze({
  reachBonus: 0, reachSeconds: REACH_SECONDS, accuracy: 1, hitScale: 1,
  touchPoints: 1, // 1タッチの点（持ち込みで 2）
  forgive: 0, // 相手のタッチを帳消しにできる残り回数（持ち込みで 1）
});

function cleanMods(m) {
  const o = { ...MOD_DEFAULTS };
  if (m && typeof m === 'object') {
    for (const k of Object.keys(MOD_DEFAULTS)) {
      if (m[k] === undefined || m[k] === null) continue;
      const v = Number(m[k]);
      if (Number.isFinite(v)) o[k] = v;
    }
  }
  if (!(o.reachSeconds > 0)) o.reachSeconds = REACH_SECONDS;
  if (!(o.accuracy > 0)) o.accuracy = 1;
  if (!(o.hitScale > 0)) o.hitScale = 1;
  o.touchPoints = o.touchPoints >= 1 ? Math.floor(o.touchPoints) : 1;
  o.forgive = o.forgive > 0 ? Math.floor(o.forgive) : 0;
  return o;
}

export function createFighter(mods = {}) {
  return {
    lean: 0, crouch: false, forward: false, reach: null, stagger: 0, mods: cleanMods(mods),
  };
}

export function createMatch({ hero, rival } = {}) {
  return {
    time: 0,
    score: { hero: 0, rival: 0 },
    fighters: { hero: createFighter(hero), rival: createFighter(rival) },
    over: false,
    endReason: null,
    result: null,
    winner: null,
    interrupt: null,
    referee: { punched: false },
    events: [],
  };
}

export function opponentOf(who) {
  return who === 'hero' ? 'rival' : 'hero';
}

function fighterOf(match, who) {
  return match && match.fighters && WHO.includes(who) ? match.fighters[who] : null;
}

/** 姿勢を変える。手を伸ばしている間は前のめりだけ変えられる（避けられない） */
export function setPosture(match, who, p = {}) {
  if (!match || match.over || match.interrupt) return false;
  const f = fighterOf(match, who);
  if (!f || f.stagger > 0) return false;
  const q = p && typeof p === 'object' ? p : {};
  const dodges = q.lean !== undefined || q.crouch !== undefined;
  if (f.reach && dodges) return false;
  if (q.lean !== undefined) f.lean = Math.sign(Number(q.lean)) || 0;
  if (q.crouch !== undefined) f.crouch = !!q.crouch;
  if (q.forward !== undefined) f.forward = !!q.forward;
  return true;
}

export function startReach(match, who, hand) {
  if (!match || match.over || match.interrupt) return false;
  if (hand !== 'L' && hand !== 'R') return false;
  const f = fighterOf(match, who);
  if (!f || f.reach || f.stagger > 0) return false;
  f.reach = { hand, t: 0, resolved: false };
  return true;
}

export function touchJudge(attacker, defender, hand) {
  const am = attacker.mods || MOD_DEFAULTS;
  const dm = defender.mods || MOD_DEFAULTS;
  const reach = BASE_REACH + am.reachBonus + (attacker.forward ? FORWARD_REACH_BONUS : 0);
  const dist = GAP - (defender.forward ? FORWARD_CLOSE : 0);
  if (reach < dist) return { hit: false, reason: 'out-of-reach' };
  const lean = defender.forward ? 0 : defender.lean || 0;
  const crouch = defender.forward ? false : !!defender.crouch;
  const tipX = hand === 'L' ? -HAND_LATERAL : HAND_LATERAL;
  const cx = lean * LEAN_OFFSET;
  const radius = HIT_RADIUS * dm.hitScale * am.accuracy;
  if (Math.abs(tipX - cx) > radius + EPS) return { hit: false, reason: 'dodged' };
  const tipY = attacker.forward ? FORWARD_HAND_HEIGHT : HAND_HEIGHT;
  const cy = crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  const vr = VERT_RADIUS * dm.hitScale * am.accuracy;
  if (Math.abs(tipY - cy) > vr + EPS) return { hit: false, reason: 'dodged' };
  return { hit: true, reason: 'ok' };
}

function finish(match, reason, events) {
  const h = match.score.hero;
  const r = match.score.rival;
  match.over = true;
  match.endReason = reason;
  match.result = h > r ? 'win' : h < r ? 'lose' : 'draw';
  match.winner = h > r ? 'hero' : h < r ? 'rival' : null;
  match.interrupt = null;
  events.push({ type: 'end', reason, result: match.result });
}

/** 時間を進める。この step で起きたイベントの配列 */
export function step(match, dt) {
  if (!match || match.over) return [];
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (match.interrupt) {
    match.interrupt.remaining -= d;
    if (match.interrupt.remaining <= 0) match.interrupt = null;
    return [];
  }
  const events = [];
  match.time = Math.min(MATCH_SECONDS, match.time + d);
  for (const who of WHO) {
    const f = match.fighters[who];
    f.stagger = Math.max(0, f.stagger - d);
    if (f.reach) f.reach.t += d;
  }
  const hits = [];
  for (const who of WHO) {
    const f = match.fighters[who];
    const r = f.reach;
    if (!r || r.resolved) continue;
    if (r.t + EPS < f.mods.reachSeconds * HIT_AT_RATIO) continue;
    r.resolved = true;
    const target = opponentOf(who);
    const def = match.fighters[target];
    const j = touchJudge(f, def, r.hand);
    if (j.hit && def.stagger > 0) events.push({ type: 'whiff', by: who, hand: r.hand, reason: 'staggered' });
    else if (j.hit) hits.push({ by: who, target, hand: r.hand });
    else events.push({ type: 'whiff', by: who, hand: r.hand, reason: j.reason });
  }
  for (const h of hits) {
    const def = match.fighters[h.target];
    if (def.mods.forgive > 0) {
      // 持ち込みの「1回だけ帳消し」：点にならず、よろけもしない
      def.mods.forgive -= 1;
      def.reach = null;
      events.push({ type: 'forgiven', by: h.by, target: h.target, hand: h.hand });
      continue;
    }
    const points = match.fighters[h.by].mods.touchPoints;
    match.score[h.by] += points;
    def.stagger = STAGGER_SECONDS;
    def.lean = 0;
    def.crouch = false;
    def.forward = false;
    def.reach = null;
    events.push({
      type: 'touch', by: h.by, target: h.target, hand: h.hand, points,
    });
  }
  for (const who of WHO) {
    const f = match.fighters[who];
    if (f.reach && f.reach.t + EPS >= f.mods.reachSeconds) f.reach = null;
  }
  if (match.score.hero >= WIN_POINTS || match.score.rival >= WIN_POINTS) finish(match, 'points', events);
  else if (match.time >= MATCH_SECONDS) finish(match, 'time', events);
  return events;
}

export function startInterrupt(match, kind, seconds) {
  if (!match || match.over) return false;
  if (!INTERRUPT_KINDS.includes(kind)) return false;
  const s = Math.min(INTERRUPT_MAX, Number(seconds));
  if (!(s > 0)) return false;
  for (const who of WHO) match.fighters[who].reach = null;
  match.interrupt = { kind, remaining: s };
  return true;
}

export function canPunchReferee(match) {
  return !!match && match.over && match.result === 'lose' && !match.referee.punched;
}

export function punchReferee(match) {
  if (!canPunchReferee(match)) return false;
  match.result = 'uyamuya';
  match.winner = null;
  match.referee.punched = true;
  return true;
}

export function earnsReward(match) {
  return !!match && match.result === 'win';
}
