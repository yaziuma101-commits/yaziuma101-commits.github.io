// レバガチャファイターヌスの技表と、当たり・ガード・体力・K.O. の規則。
// three.js・DOM・Web Audio に依存しない。入力は変更せず新しいオブジェクトを返す。

export const AIR_HIT_LIMIT = 1.0;
export const PROJECTILE_HIT_RADIUS = 0.7;
export const PROJECTILE_CLEAR_HEIGHT = 1.05;
/** 必殺技（近接）が当たる高さの上限（普通の技は AIR_HIT_LIMIT） */
export const SPECIAL_AIR_LIMIT = 1.8;
/** 飛び道具どうしが相殺する距離 */
export const PROJECTILE_CLASH_DIST = 0.6;
export const SPECIAL_IDS = Object.freeze(['wave', 'rising', 'whirl']);

const A = (o) => Object.freeze(o);

export const ATTACKS = Object.freeze({
  punch: A({
    id: 'punch', startup: 0.08, active: 0.08, recovery: 0.18, damage: 6, chip: 1, hitstun: 0.30, blockstun: 0.18, reach: 1.1, height: 'mid', pushback: 0.25, kind: 'punch',
  }),
  kick: A({
    id: 'kick', startup: 0.14, active: 0.10, recovery: 0.28, damage: 9, chip: 1.5, hitstun: 0.40, blockstun: 0.22, reach: 1.5, height: 'mid', pushback: 0.4, kind: 'kick',
  }),
  crouchPunch: A({
    id: 'crouchPunch', startup: 0.08, active: 0.08, recovery: 0.20, damage: 5, chip: 1, hitstun: 0.28, blockstun: 0.16, reach: 1.0, height: 'mid', pushback: 0.2, kind: 'punch',
  }),
  crouchKick: A({
    id: 'crouchKick', startup: 0.12, active: 0.10, recovery: 0.30, damage: 7, chip: 1, hitstun: 0.35, blockstun: 0.20, reach: 1.5, height: 'low', pushback: 0.3, kind: 'kick',
  }),
  jumpPunch: A({
    id: 'jumpPunch', startup: 0.06, active: 0.20, recovery: null, damage: 7, chip: 1, hitstun: 0.32, blockstun: 0.18, reach: 1.0, height: 'high', pushback: 0.25, air: true, kind: 'punch',
  }),
  jumpKick: A({
    id: 'jumpKick', startup: 0.08, active: 0.22, recovery: null, damage: 8, chip: 1.5, hitstun: 0.36, blockstun: 0.20, reach: 1.2, height: 'high', pushback: 0.3, air: true, kind: 'kick',
  }),
  wave: A({
    id: 'wave', startup: 0.35, active: 0, recovery: 0.40, damage: 18, chip: 4, hitstun: 0.45, blockstun: 0.30, reach: 0, height: 'mid', pushback: 0.5, projectile: true, speed: 6, special: true, kind: 'punch',
  }),
  rising: A({
    id: 'rising', startup: 0.05, active: 0.20, recovery: 0.50, damage: 24, chip: 5, hitstun: 0.60, blockstun: 0.30, reach: 1.6, height: 'mid', pushback: 0.5, antiAir: true, invulnerable: true, special: true, kind: 'punch',
  }),
  whirl: A({
    id: 'whirl', startup: 0.20, active: 0.40, recovery: 0.50, damage: 20, chip: 5, hitstun: 0.50, blockstun: 0.30, reach: 1.9, height: 'mid', pushback: 0.6, advance: 2.5, projectilePass: 0.35, special: true, kind: 'kick',
  }),
});

export function createFighter({
  id = 'p', x = 0, facing = 1, maxHp = 100,
} = {}) {
  return {
    id, x, y: 0, facing: facing >= 0 ? 1 : -1, hp: maxHp, maxHp, guarding: false, crouching: false, stun: 0, stunKind: null, down: false, ko: false, action: null,
  };
}

/** J=パンチ、K=キック。空中・しゃがみで振り分ける */
export function attackIdFor({ button, crouching = false, airborne = false } = {}) {
  const kick = button === 'K';
  if (airborne) return kick ? 'jumpKick' : 'jumpPunch';
  if (crouching) return kick ? 'crouchKick' : 'crouchPunch';
  return kick ? 'kick' : 'punch';
}

/** 行動の段階（startup | active | recovery | done）。着地まで続く技は recovery のまま */
export function attackPhase(attackId, t) {
  const a = ATTACKS[attackId];
  if (!a) return 'done';
  const s = a.startup;
  const e = s + (a.active || 0);
  if (t < s) return 'startup';
  if (t < e) return 'active';
  if (a.recovery == null) return 'recovery';
  return t < e + a.recovery ? 'recovery' : 'done';
}

export function isGuarding(f, heldDir) {
  if (!f) return false;
  return (heldDir === 'B' || heldDir === 'DB') && (f.y || 0) <= 0 && f.stunKind !== 'hit' && !f.down && f.action == null;
}

function isInvulnerable(f) {
  const act = f && f.action;
  if (!act || !ATTACKS[act.id] || !ATTACKS[act.id].invulnerable) return false;
  const a = ATTACKS[act.id];
  return act.t < a.startup + a.active;
}

function canBlock(def, a) {
  return !!def.guarding && def.stunKind !== 'hit' && (a.height !== 'low' || !!def.crouching);
}

function impact(def, a, sign) {
  if (canBlock(def, a)) {
    const hp = def.hp > 1 ? Math.max(1, def.hp - a.chip) : def.hp;
    const out = {
      ...def, hp, stun: a.blockstun, stunKind: 'block', x: def.x + sign * a.pushback * 0.6,
    };
    return {
      outcome: 'block', damage: def.hp - hp, hitstop: a.special ? 0.09 : 0.05, defender: out,
    };
  }
  const hp = Math.max(0, def.hp - a.damage);
  const out = {
    ...def, hp, stun: a.hitstun, stunKind: 'hit', action: null, guarding: false, x: def.x + sign * a.pushback,
  };
  let hitstop = a.special ? 0.2 : 0.08;
  if (hp <= 0) {
    out.ko = true;
    out.down = true;
    hitstop = 0.45;
  }
  return {
    outcome: 'hit', damage: def.hp - hp, hitstop, defender: out,
  };
}

export function resolveAttack(attacker, defender, attackId) {
  const a = ATTACKS[attackId];
  const atk = { ...attacker };
  const def = { ...defender };
  const miss = {
    outcome: 'miss', damage: 0, hitstop: 0, attacker: atk, defender: def,
  };
  if (!a || a.projectile) return miss;
  const sign = atk.facing >= 0 ? 1 : -1;
  const d = (def.x - atk.x) * sign;
  const back = a.special ? -0.4 : -0.2;
  if (!(d >= back && d <= a.reach)) return miss;
  if (def.down || def.ko || isInvulnerable(def)) return miss;
  const limit = a.special ? SPECIAL_AIR_LIMIT : AIR_HIT_LIMIT;
  if ((def.y || 0) > limit && !a.antiAir && !a.air) return miss;
  return { ...impact(def, a, sign), attacker: atk };
}

export function createProjectile({ ownerId, x, facing }) {
  return {
    ownerId, x, y: 1.0, facing: facing >= 0 ? 1 : -1, speed: ATTACKS.wave.speed, alive: true,
  };
}

export function stepProjectile(p, dt) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return { ...p, x: p.x + p.facing * p.speed * d };
}

/** 旋風脚の出始めのように、飛び道具をすり抜けている最中か */
export function passesProjectile(f) {
  const act = f && f.action;
  if (!act) return false;
  const a = ATTACKS[act.id];
  return !!a && a.projectilePass > 0 && act.t < a.projectilePass;
}

/** 攻撃中の必殺技（近接）が前から来た飛び道具を打ち消すか（普通の技は打ち消さない） */
export function clearsProjectile(def, p) {
  const act = def && def.action;
  if (!act || !p) return false;
  const a = ATTACKS[act.id];
  if (!a || !a.special || a.projectile || attackPhase(act.id, act.t) !== 'active') return false;
  if (passesProjectile(def) || isInvulnerable(def)) return false;
  const d = (p.x - def.x) * (def.facing >= 0 ? 1 : -1);
  return d >= -0.2 && d <= a.reach;
}

export function resolveProjectileHit(p, defender) {
  const def = { ...defender };
  const miss = {
    outcome: 'miss', damage: 0, hitstop: 0, defender: def,
  };
  if (def.down || def.ko || isInvulnerable(def) || passesProjectile(def)) return miss;
  if ((def.y || 0) < PROJECTILE_CLEAR_HEIGHT && clearsProjectile(def, p)) {
    return {
      outcome: 'cancel', damage: 0, hitstop: 0.05, defender: def,
    };
  }
  if (Math.abs(def.x - p.x) > PROJECTILE_HIT_RADIUS || (def.y || 0) >= PROJECTILE_CLEAR_HEIGHT) return miss;
  return impact(def, ATTACKS.wave, p.facing >= 0 ? 1 : -1);
}

/** 飛び道具どうしの相殺（持ち主が違い、十分近い） */
export function projectilesCollide(a, b) {
  return !!a && !!b && a.ownerId !== b.ownerId && Math.abs(a.x - b.x) < PROJECTILE_CLASH_DIST;
}

const isSpecialId = (id) => !!ATTACKS[id] && !!ATTACKS[id].special;

/**
 * 同じ瞬間の2つの打撃（a, b は {id, outcome}）。相打ちなら必殺技が勝つ。
 * 返り値 {a, b}: それぞれの結果を反映するか
 */
export function resolveClash(a, b) {
  const hitA = !!a && !!a.outcome && a.outcome !== 'miss';
  const hitB = !!b && !!b.outcome && b.outcome !== 'miss';
  if (hitA && hitB) {
    const sa = isSpecialId(a.id);
    const sb = isSpecialId(b.id);
    if (sa && !sb) return { a: true, b: false };
    if (sb && !sa) return { a: false, b: true };
    return { a: true, b: true };
  }
  return { a: hitA, b: hitB };
}

export function stepFighterTimers(f, dt) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const s = (f.stun || 0) - d;
  if (s <= 0) return { ...f, stun: 0, stunKind: null };
  return { ...f, stun: s };
}

/** 昇天モヒカン拳の最高到達点と、上昇中に前へ進む距離 */
export const RISING_PEAK = 1.8;
export const RISING_DRIFT = 0.5;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 体ごと動く必殺技か（昇天拳は上昇、旋風脚は前進） */
export function hasSpecialMotion(attackId) {
  return attackId === 'rising' || attackId === 'whirl';
}

/**
 * 必殺技の移動量（行動開始からの時刻 t 秒）。dx は前方向の累積距離、y は地面からの高さ（null は重力に任せる）。
 * 昇天拳：発生から攻撃の終わりまで上昇し、硬直のあいだに落ちて終わりに着地する。
 * 旋風脚：攻撃の間に advance だけ前進する。
 */
export function specialOffset(attackId, t) {
  const a = ATTACKS[attackId];
  const tt = Math.max(0, Number(t) || 0);
  if (attackId === 'whirl' && a) {
    return { dx: a.advance * clamp01((tt - a.startup) / a.active), y: null };
  }
  if (attackId === 'rising' && a) {
    const up = a.startup + a.active;
    if (tt < up) {
      const k = tt / up;
      return { dx: RISING_DRIFT * k, y: RISING_PEAK * (1 - (1 - k) * (1 - k)) };
    }
    const k = clamp01((tt - up) / a.recovery);
    return { dx: RISING_DRIFT, y: RISING_PEAK * (1 - k * k) };
  }
  return { dx: 0, y: null };
}

/** 攻撃の間ずっと当たりを調べる技か（体ごと動く必殺技。当たるかガードされたら終わり） */
export function checksWholeActive(attackId) {
  const a = ATTACKS[attackId];
  return !!a && !!a.special && !a.projectile && a.active > 0;
}

/** 当たったときに重ねて鳴らす効果音 [[名前, 遅れ秒]]。必殺技は重く重ねる */
export function impactSounds(attackId, outcome) {
  const a = ATTACKS[attackId];
  if (a && a.special) {
    if (outcome === 'hit') return [['lfKick', 0], ['lfPunch', 0.02]];
    if (outcome === 'block') return [['lfGuard', 0], ['lfKick', 0]];
    return [];
  }
  const s = impactSound(attackId, outcome);
  return s ? [[s, 0]] : [];
}

/** 当たったときの画面の揺れ {amp, dur} */
export function impactShake(attackId, outcome, ko = false) {
  const a = ATTACKS[attackId] || {};
  if (outcome === 'hit') {
    if (ko) return { amp: 0.16, dur: 0.45 };
    if (a.special) return { amp: 0.14, dur: 0.32 };
    if (a.kind === 'kick') return { amp: 0.09, dur: 0.18 };
    return { amp: 0.06, dur: 0.18 };
  }
  if (outcome === 'block') return a.special ? { amp: 0.06, dur: 0.18 } : { amp: 0.03, dur: 0.12 };
  return { amp: 0, dur: 0 };
}

/** 当たったときの効果音の名前（audio.js の LF の音）。空振りは null */
export function impactSound(attackId, outcome) {
  if (outcome === 'block') return 'lfGuard';
  if (outcome !== 'hit') return null;
  const a = ATTACKS[attackId];
  return a && a.kind === 'kick' ? 'lfKick' : 'lfPunch';
}
