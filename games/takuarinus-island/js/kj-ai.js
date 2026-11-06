// メガネ星人の行動の規則（three.js・DOM・Web Audio に依存しない）。
// 乱数は種から作る（同じ種・同じ強さなら同じ行動）。
// 攻撃の間合い（いつ攻撃するか）は強さで決まり、近くで何を出すか（チョップか光線か）を乱数で決める。
import { CHOP_RANGE, MAX_DT } from './kj-rules.js';

const f = Object.freeze;

export const ENEMY_MAX_HP = f({ 1: 120, 2: 160, 3: 200 });
export const ENEMY_SPEED = f({ 1: 2.5, 2: 3, 3: 3.5 });
export const GLASSES_OFF_SPEED = 1.3;
export const STOP_DIST = CHOP_RANGE - 2;
export const RECOVER_SEC = 0.9;
/** 予備動作の長さ（光線は必ず 1 秒以上：見てから踏ん張る・横へよけられる） */
export const WINDUP_SEC = f({
  chop: f({ 1: 1.2, 2: 1.0, 3: 0.8 }),
  beam: f({ 1: 1.8, 2: 1.5, 3: 1.2 }),
  smash: f({ 1: 1.4, 2: 1.2, 3: 1.0 }),
});
export const ENEMY_DAMAGE = f({
  chop: f({ 1: 8, 2: 10, 3: 12 }),
  beam: f({ 1: 12, 2: 15, 3: 18 }),
  smash: f({ 1: 20, 2: 24, 3: 28 }),
});
/** 次に攻撃を考えるまでの間（秒）。怪獣らしくゆったり。強いほど短い */
export const COOLDOWN_SEC = f({ 1: 3.5, 2: 3.2, 3: 2.9 });
/** 近くで攻撃するのは、立ち止まる距離のすぐ手前まで来てから（境目で迷わないよう半端な値） */
export const ATTACK_DIST = STOP_DIST + 0.44;
/** 遠くから光線を撃てる距離（40 の手前） */
export const FAR_BEAM_RANGE = 39.99;
const EPS = 1e-9;

/** mulberry32 相当。状態は e.rng に持つ */
function nextRandom(e) {
  const t = (e.rng + 0x6D2B79F5) >>> 0;
  e.rng = t;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

function clampLevel(lv) {
  const n = Math.round(Number(lv));
  return Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 1;
}

/** power: 高難易度の強さ（体力・歩く速さを掛け、攻撃の間を割る）。ふだんは 1 */
export function createEnemy({ seed = 0, level = 1, power = 1 } = {}) {
  const lv = clampLevel(level);
  const pw = Number.isFinite(power) && power > 0 ? power : 1;
  const n = Number(seed);
  const s = Number.isFinite(n) ? Math.floor(n) >>> 0 : 0;
  return {
    seed: s,
    level: lv,
    hp: Math.round(ENEMY_MAX_HP[lv] * pw),
    maxHp: Math.round(ENEMY_MAX_HP[lv] * pw),
    power: pw,
    glassesOff: false,
    phase: 'approach',
    t: 0,
    cooldown: COOLDOWN_SEC[lv] / pw,
    attack: null,
    windupDur: 0,
    recoverDur: RECOVER_SEC,
    // 遠くから光線を撃てるか（撃ったら、次は近づいて攻撃するまで撃たない）
    farReady: true,
    rng: s,
  };
}

/** 1 フレームぶん動かす（e を直接更新）。{advance, events} */
export function stepEnemy(e, dt, dist) {
  const events = [];
  if (!e || e.hp <= 0) return { advance: 0, events };
  const raw = Number(dt);
  const d = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DT) : 0;
  const dn = Number(dist);
  const dd = Number.isFinite(dn) ? Math.max(0, dn) : Infinity;

  if (e.phase === 'windup') {
    e.t += d;
    if (e.t >= e.windupDur - EPS) {
      events.push({ type: 'strike', attack: e.attack, damage: ENEMY_DAMAGE[e.attack][e.level] });
      // 攻撃のあとは、どの攻撃でも同じ長さだけ構え直す
      e.recoverDur = RECOVER_SEC + Math.max(0, WINDUP_SEC.beam[e.level] - e.windupDur);
      e.phase = 'recover';
      e.t = 0;
    }
    return { advance: 0, events };
  }
  if (e.phase === 'recover') {
    e.t += d;
    if (e.t >= (Number(e.recoverDur) || RECOVER_SEC) - EPS) {
      e.phase = 'approach';
      e.t = 0;
      e.attack = null;
      e.cooldown = COOLDOWN_SEC[e.level] / (e.power || 1);
    }
    return { advance: 0, events };
  }

  const speed = ENEMY_SPEED[e.level] * (e.power || 1) * (e.glassesOff ? GLASSES_OFF_SPEED : 1);
  const advance = Math.min(speed * d, Math.max(0, dd - STOP_DIST));
  e.cooldown -= d;
  if (e.cooldown <= EPS) {
    let attack = null;
    let near = false;
    if (dd <= ATTACK_DIST) {
      near = true;
      attack = e.glassesOff ? 'smash' : (nextRandom(e) < 0.3 ? 'beam' : 'chop');
    } else if (!e.glassesOff && e.farReady && dd <= FAR_BEAM_RANGE) {
      attack = 'beam';
    }
    if (!attack) {
      // 攻撃できないうちは近づき続け、毎フレーム考え直す
      e.cooldown = 0;
    } else {
      e.phase = 'windup';
      e.t = 0;
      e.attack = attack;
      e.windupDur = WINDUP_SEC[attack][e.level];
      e.farReady = near;
      events.push({ type: 'windup', attack, duration: e.windupDur });
    }
  }
  return { advance, events };
}

/** ダメージ。体力が半分以下を初めて跨いだときだけ glassesOffNow */
export function damageEnemy(e, amount) {
  if (!e) return { dealt: 0, glassesOffNow: false, defeated: false };
  const n = Number(amount);
  const want = Number.isFinite(n) && n > 0 ? n : 0;
  const dealt = Math.min(want, Math.max(0, e.hp));
  e.hp = Math.max(0, e.hp - dealt);
  let glassesOffNow = false;
  if (!e.glassesOff && e.hp <= e.maxHp * 0.5) {
    e.glassesOff = true;
    glassesOffNow = true;
  }
  return { dealt, glassesOffNow, defeated: e.hp <= 0 };
}

/** 溜め中なら攻撃を中断して隙を作る。中断したら true */
export function staggerEnemy(e) {
  if (!e || e.phase !== 'windup') return false;
  e.phase = 'recover';
  e.t = 0;
  e.attack = null;
  e.recoverDur = RECOVER_SEC;
  return true;
}
