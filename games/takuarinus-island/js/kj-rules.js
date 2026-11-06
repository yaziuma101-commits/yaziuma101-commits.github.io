// 怪獣大決戦の操作の規則（three.js・DOM・Web Audio に依存しない）。
// 座標系：向き h の前方は (sin h, cos h)、右は (cos h, -sin h)。h=0 で +z が前。
const f = Object.freeze;

/** すべての step 関数は dt をこの値に丸める（カクついたフレームで急に進まない） */
export const MAX_DT = 0.1;

export const ACTION_DEFS = f({
  punch: f({ fullSec: 1.6, returnSec: 1.0, base: 12 }),
  kick: f({ fullSec: 2.0, returnSec: 1.2, base: 16 }),
  tail: f({ fullSec: 2.4, returnSec: 1.2, base: 10 }),
  guard: f({ fullSec: 0.8, returnSec: 0.6 }),
  beam: f({ fullSec: 3.0 }),
});

export const HIT_MIN_P = 0.5;
export const FULL_P = 0.95;
export const WEAK_RATIO = 0.3;

export const BEAM = f({
  MIN_CHARGE: 0.15, DMG_MIN: 8, DMG_MAX: 48, COOLDOWN: 4.0, HALF_WIDTH: 3,
});
export const GUARD_REDUCE = 0.7;

export const REACH = f({
  punch: f({ range: 16, half: 0.7 }),
  kick: f({ range: 18, half: 0.7 }),
  tail: f({ radius: 20 }),
  body: f({ radius: 8 }),
});

/** メガネ星人の近接の射程（kj-ai.js もここから使う） */
export const CHOP_RANGE = 14;

export const WALK_SPEED = 4;
export const TURN_RATE = 0.9;
export const STRIDE = 6;
export const TITLE_SEC = 8;
export const PLAYER_BASE_HP = 100;

export const MOD_LIMITS = f({
  hpBonus: f([0, 60]),
  punchPower: f([1, 1.5]),
  kickPower: f([1, 1.5]),
  tailPower: f([1, 1.5]),
  beamChargeRate: f([1, 1.6]),
  walkSpeed: f([0.6, 1.2]),
});

export const DEFAULT_MODS = f({
  hpBonus: 0, punchPower: 1, kickPower: 1, tailPower: 1, beamChargeRate: 1, walkSpeed: 1,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 0;
};
const stepDt = (dt) => {
  const d = Number(dt);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_DT) : 0;
};
const modsOf = (m) => (m && typeof m === 'object' ? m : DEFAULT_MODS);
const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

/** 既定値に重ねて範囲内に丸めた mods。未知のキーは無視 */
export function makeMods(partial) {
  const out = { ...DEFAULT_MODS };
  if (partial && typeof partial === 'object') {
    for (const k of Object.keys(MOD_LIMITS)) {
      const v = partial[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const [lo, hi] = MOD_LIMITS[k];
        out[k] = clamp(v, lo, hi);
      }
    }
  }
  return out;
}

export function playerMaxHp(mods) {
  return PLAYER_BASE_HP + num(modsOf(mods).hpBonus, 0);
}

function fullSecOf(kind, mods) {
  if (kind === 'beam') return ACTION_DEFS.beam.fullSec / (num(modsOf(mods).beamChargeRate, 1) || 1);
  const d = ACTION_DEFS[kind];
  return d ? d.fullSec : 0;
}

/** 押している秒数 → 進み具合 0〜1（線形） */
export function actionProgress(kind, heldSec, mods) {
  const full = fullSecOf(kind, mods);
  if (!(full > 0)) return 0;
  const h = Number(heldSec);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return clamp01(h / full);
}

/** 1 フレームぶん進める。押している間は進み、離すと今の位置から戻る */
export function stepProgress(kind, p, pressed, dt, mods) {
  const d = stepDt(dt);
  const cur = clamp01(p);
  const full = fullSecOf(kind, mods);
  if (pressed) return full > 0 ? Math.min(1, cur + d / full) : cur;
  const def = ACTION_DEFS[kind];
  if (!def || !(def.returnSec > 0)) return 0;
  return Math.max(0, cur - d / def.returnSec);
}

export function createMelee() {
  return { p: 0, pressed: false, spent: false };
}

/** 近接の当たりの強さ */
export function meleeDamage(kind, p, mods) {
  const def = ACTION_DEFS[kind];
  if (!def || !(def.base > 0)) return 0;
  const full = Math.round(def.base * num(modsOf(mods)[`${kind}Power`], 1));
  const q = clamp01(p);
  if (q < HIT_MIN_P) return 0;
  if (q < FULL_P) return Math.max(1, Math.round(full * WEAK_RATIO * q));
  return full;
}

/** 近接の1フレーム。新しい state と hit（null か {damage, full}）を返す */
export function stepMelee(state, kind, pressed, dt, mods) {
  const s = state && typeof state === 'object' ? state : createMelee();
  const prevP = clamp01(s.p);
  const down = !!pressed;
  let spent = !!s.spent;
  let hit = null;
  const p = stepProgress(kind, prevP, down, dt, mods);
  if (down) {
    if (!spent && p >= FULL_P) {
      hit = { damage: meleeDamage(kind, p, mods), full: true };
      spent = true;
    }
  } else if (s.pressed) {
    if (!spent && prevP >= HIT_MIN_P) {
      hit = { damage: meleeDamage(kind, prevP, mods), full: false };
      spent = true;
    }
  }
  if (p <= 0) spent = false;
  return { state: { p, pressed: down, spent }, hit };
}

export function createBeam() {
  return { charge: 0, cooldown: 0, pressed: false };
}

export function beamDamage(charge) {
  return Math.round(BEAM.DMG_MIN + (BEAM.DMG_MAX - BEAM.DMG_MIN) * clamp01(charge));
}

/** 光線の1フレーム。押すと溜まり、離すと撃つ。撃った後は撃てない時間がある */
export function stepBeam(state, pressed, dt, mods) {
  const s = state && typeof state === 'object' ? state : createBeam();
  const d = stepDt(dt);
  const down = !!pressed;
  if (s.cooldown > 0) {
    return { state: { charge: 0, cooldown: Math.max(0, s.cooldown - d), pressed: down }, fired: null };
  }
  if (down) {
    const rate = num(modsOf(mods).beamChargeRate, 1);
    const charge = Math.min(1, clamp01(s.charge) + (d * rate) / ACTION_DEFS.beam.fullSec);
    return { state: { charge, cooldown: 0, pressed: true }, fired: null };
  }
  if (s.pressed) {
    const c = clamp01(s.charge);
    if (c >= BEAM.MIN_CHARGE) {
      return {
        state: { charge: 0, cooldown: BEAM.COOLDOWN, pressed: false },
        fired: { charge: c, damage: beamDamage(c) },
      };
    }
  }
  return { state: { charge: 0, cooldown: 0, pressed: false }, fired: null };
}

export function guardFactor(p) {
  return 1 - GUARD_REDUCE * clamp01(p);
}

export function damageAfterGuard(dmg, guardP) {
  const n = Number(dmg);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n * guardFactor(guardP)));
}

/** 敵の攻撃が主人公に当たるか。lateral は攻撃者の右ベクトルへの射影 */
export function attackHits(attack, dist, lateral) {
  if (attack === 'chop' || attack === 'smash') return Number(dist) <= CHOP_RANGE;
  if (attack === 'beam') return Math.abs(Number(lateral)) < BEAM.HALF_WIDTH;
  return false;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** 届くか。punch/kick は前方の扇、tail/body は全方位。radius は相手の半径 */
export function inReach(kind, ox, oz, heading, tx, tz, radius = 0) {
  const r = Number(radius) || 0;
  const dx = tx - ox;
  const dz = tz - oz;
  const c = Math.hypot(dx, dz);
  if (kind === 'punch' || kind === 'kick') {
    const R = REACH[kind];
    if (c - r > R.range) return false;
    if (c <= r) return true;
    const diff = Math.abs(wrapAngle(Math.atan2(dx, dz) - heading));
    return diff <= R.half;
  }
  if (kind === 'tail' || kind === 'body') return c <= REACH[kind].radius + r;
  return false;
}

/** 歩行の1フレーム。input は {forward, strafe, turn}（各 -1〜1） */
export function stepWalk(pose, input, dt, mods) {
  const d = stepDt(dt);
  const p = pose && typeof pose === 'object' ? pose : { x: 0, z: 0, heading: 0 };
  const i = input && typeof input === 'object' ? input : {};
  let fw = clamp(num(i.forward, 0), -1, 1);
  let st = clamp(num(i.strafe, 0), -1, 1);
  const tr = clamp(num(i.turn, 0), -1, 1);
  const len = Math.hypot(fw, st);
  if (len > 1) {
    fw /= len;
    st /= len;
  }
  const speed = WALK_SPEED * num(modsOf(mods).walkSpeed, 1);
  const h = num(p.heading, 0);
  const step = speed * d;
  return {
    x: num(p.x, 0) + (Math.sin(h) * fw + Math.cos(h) * st) * step,
    z: num(p.z, 0) + (Math.cos(h) * fw - Math.sin(h) * st) * step,
    heading: h + TURN_RATE * tr * d,
  };
}

/** 歩いた距離の増えた分のうち、何歩ぶん（STRIDE ごと）跨いだか */
export function footstepCount(prevDist, newDist) {
  return Math.floor(newDist / STRIDE) - Math.floor(prevDist / STRIDE);
}

export function judge(playerHp, enemyHp) {
  if (enemyHp <= 0) return 'win';
  if (playerHp <= 0) return 'lose';
  return null;
}

/** 被害額（単位は万円）の表記 */
export function formatDamage(man) {
  const n = Math.max(0, Math.round(Number(man) || 0));
  if (n === 0) return '0円';
  const oku = Math.floor(n / 10000);
  const rest = n % 10000;
  if (oku > 0) return `${oku}億${rest > 0 ? `${rest}万` : ''}円`;
  return `${rest}万円`;
}

export function buildResult({
  outcome, timeSec, hpLeft, hpMax, damageMan,
} = {}) {
  const dm = Math.max(0, Math.round(Number(damageMan) || 0));
  let rank = 2;
  if (dm < 3000) rank = 0;
  else if (dm < 20000) rank = 1;
  return {
    outcome,
    timeSec: Math.round((Number(timeSec) || 0) * 10) / 10,
    hpLeft: Math.max(0, Number(hpLeft) || 0),
    hpMax,
    damageMan: dm,
    damageText: formatDamage(dm),
    rank,
  };
}

/** タイトル演出の進み具合 */
export function titleState(elapsed, skipped) {
  const e = Number(elapsed) || 0;
  return { done: e >= TITLE_SEC || !!skipped, progress: clamp01(e / TITLE_SEC) };
}
