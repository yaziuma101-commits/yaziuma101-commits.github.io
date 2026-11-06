// 怪獣大決戦の「攻撃を受けた側の大きなリアクション」の規則（three.js・DOM・Web Audio に依存しない）。
// よろける → のけぞる → 吹き飛んで滑る → 倒れて地響きを立て、ゆっくり起き上がる。
// 強い当たりほど大きい。倒れている間・起き上がる間は動けない。
import { MAX_DT } from './kj-rules.js';

const f = Object.freeze;

/** 反応の段階（弱い順） */
export const REACT_LEVELS = f(['none', 'stagger', 'recoil', 'blown', 'down']);
/** 倒れたときの体の傾き（ラジアン。真横 π/2 の少し手前で地面に寝そべる） */
export const DOWN_TILT = 1.45;

/**
 * stun: よろけ・のけぞり・吹き飛びの長さ（秒）／ fall・ground・rise: 倒れる・寝ている・起き上がる（秒）
 * slide: 滑る距離の基準 ／ slideSec: 滑り終わるまで ／ tilt: 体の傾きの最大 ／ locked: その間は動けない
 */
export const REACT_DEFS = f({
  stagger: f({ stun: 0.45, slide: 0.8, slideSec: 0.3, tilt: 0.14, locked: false }),
  recoil: f({ stun: 0.9, slide: 3, slideSec: 0.5, tilt: 0.4, locked: true }),
  blown: f({ stun: 1.5, slide: 7, slideSec: 0.9, tilt: 0.65, locked: true }),
  down: f({
    fall: 0.7, ground: 0.9, rise: 1.3, slide: 8, slideSec: 0.9, tilt: DOWN_TILT, locked: true,
  }),
});

/** 倒れた体の下敷きになった建物へのダメージ */
export const DOWN_IMPACT_DAMAGE = 25;
/** 滑っている間に触れた建物へのダメージ（毎秒） */
export const SLIDE_CRASH_DPS = 40;
/** 当たった瞬間の画面の揺れ */
export const IMPACT_SHAKE = f({ stagger: 0.5, recoil: 0.9, blown: 1.4, down: 1.8 });
/** 倒れて地面に着いたときの揺れ */
export const LANDING_SHAKE = 2.2;

const GUARD_FULL = 0.9;
const GUARD_HALF = 0.5;
const WEAK_RECOIL_DAMAGE = 4;

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};
const stepDt = (dt) => {
  const d = Number(dt);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_DT) : 0;
};
const smooth = (k) => {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
};

export function reactRank(level) {
  const i = REACT_LEVELS.indexOf(level);
  return i < 0 ? 0 : i;
}

/**
 * 当たりの強さ → 反応の段階。
 * 伸び切ったパンチ・しっぽ、光線、大振り（smash）の直撃は倒れる。伸び切ったキックは吹き飛ぶ。チョップはのけぞる。
 * 途中で離した弱い当たりはよろける程度。踏ん張っていると段階が下がる（最低でもよろける）。
 */
export function reactionForHit({
  attack, damage = 0, full = false, guardP = 0,
} = {}) {
  const dmg = Number(damage);
  if (!(dmg > 0)) return 'none';
  let lv;
  if (attack === 'punch' || attack === 'tail') lv = full ? 'down' : (dmg >= WEAK_RECOIL_DAMAGE ? 'recoil' : 'stagger');
  else if (attack === 'kick') lv = full ? 'blown' : (dmg >= WEAK_RECOIL_DAMAGE ? 'recoil' : 'stagger');
  else if (attack === 'beam' || attack === 'smash') lv = 'down';
  else if (attack === 'chop') lv = 'recoil';
  else lv = 'stagger';
  const g = clamp01(guardP);
  const drop = g >= GUARD_FULL ? 2 : g >= GUARD_HALF ? 1 : 0;
  return REACT_LEVELS[Math.max(1, reactRank(lv) - drop)];
}

/** ダメージが大きいほど滑る距離が伸びる倍率（0.8〜1.4） */
export function impactScale(damage) {
  const d = Math.max(0, Number(damage) || 0);
  return Math.max(0.8, Math.min(1.4, 0.8 + d / 60));
}

export function slideDistance(level, damage) {
  const def = REACT_DEFS[level];
  return def ? def.slide * impactScale(damage) : 0;
}

/** 動けない時間の合計（秒） */
export function lockDuration(level) {
  const def = REACT_DEFS[level];
  if (!def) return 0;
  if (level === 'down') return def.fall + def.ground + def.rise;
  return def.locked ? def.stun : 0;
}

export function createReaction() {
  return {
    level: 'none', phase: 'idle', t: 0, slideT: 0, slideSec: 0, slideTotal: 0, slideDone: 0, dirX: 0, dirZ: 1,
  };
}

/** 倒れている（倒れていく・寝ている・起き上がる）途中か */
export function reactDown(state) {
  const p = state && state.phase;
  return p === 'fall' || p === 'ground' || p === 'rise';
}

/** 動けない状態か（よろけだけは動ける） */
export function reactLocked(state) {
  if (!state || state.phase === 'idle') return false;
  const def = REACT_DEFS[state.level];
  return !!def && !!def.locked;
}

/**
 * 反応を始める。dir は吹き飛ぶ向き（攻撃した側から離れる向き）。
 * 倒れている間は新しい反応を受けない。進行中の反応より弱い反応は無視する。無視したときは同じ state を返す
 */
export function startReaction(state, {
  level, dirX = 0, dirZ = 0, damage = 0,
} = {}) {
  const s = state && typeof state === 'object' ? state : createReaction();
  const def = REACT_DEFS[level];
  if (!def) return s;
  if (reactDown(s)) return s;
  if (s.phase !== 'idle' && reactRank(level) < reactRank(s.level)) return s;
  let dx = Number(dirX) || 0;
  let dz = Number(dirZ) || 0;
  const len = Math.hypot(dx, dz);
  if (len > 1e-9) {
    dx /= len;
    dz /= len;
  } else {
    dx = 0;
    dz = 1;
  }
  return {
    level,
    phase: level === 'down' ? 'fall' : 'stun',
    t: 0,
    slideT: 0,
    slideSec: def.slideSec,
    slideTotal: slideDistance(level, damage),
    slideDone: 0,
    dirX: dx,
    dirZ: dz,
  };
}

/** 1 フレーム進める。{state, slide（このフレームに滑る距離）, events（'landed' | 'rise' | 'end'）} */
export function stepReaction(state, dt) {
  const s = state && typeof state === 'object' ? state : createReaction();
  const def = REACT_DEFS[s.level];
  if (s.phase === 'idle' || !def) return { state: s, slide: 0, events: [] };
  const d = stepDt(dt);
  const events = [];
  const slideT = s.slideT + d;
  const k = s.slideSec > 0 ? Math.min(1, slideT / s.slideSec) : 1;
  const target = s.slideTotal * (1 - (1 - k) * (1 - k));
  const slide = Math.max(0, target - s.slideDone);
  let phase = s.phase;
  let t = s.t + d;
  for (let guard = 0; guard < 4; guard++) {
    if (phase === 'stun' && t >= def.stun) {
      phase = 'idle';
      t = 0;
      events.push('end');
    } else if (phase === 'fall' && t >= def.fall) {
      t -= def.fall;
      phase = 'ground';
      events.push('landed');
    } else if (phase === 'ground' && t >= def.ground) {
      t -= def.ground;
      phase = 'rise';
      events.push('rise');
    } else if (phase === 'rise' && t >= def.rise) {
      phase = 'idle';
      t = 0;
      events.push('end');
    } else {
      break;
    }
  }
  const next = phase === 'idle'
    ? { ...createReaction(), dirX: s.dirX, dirZ: s.dirZ }
    : {
      ...s, phase, t, slideT, slideDone: s.slideDone + slide,
    };
  return { state: next, slide, events };
}

/** 体の傾き（吹き飛ぶ向きへ倒れる角度）と、倒れているか */
export function reactionPose(state) {
  const s = state && typeof state === 'object' ? state : createReaction();
  const def = REACT_DEFS[s.level];
  if (!def || s.phase === 'idle') return { tilt: 0, down: false };
  if (s.phase === 'stun') {
    const k = clamp01(s.t / def.stun);
    const amt = k < 0.25 ? smooth(k / 0.25) : 1 - smooth((k - 0.25) / 0.75);
    return { tilt: def.tilt * amt, down: false };
  }
  if (s.phase === 'fall') {
    const k = clamp01(s.t / def.fall);
    return { tilt: DOWN_TILT * k * k, down: true };
  }
  if (s.phase === 'ground') {
    const b = Math.sin(Math.PI * clamp01(s.t / 0.3));
    return { tilt: DOWN_TILT - 0.08 * b, down: true };
  }
  return { tilt: DOWN_TILT * (1 - smooth(s.t / def.rise)), down: true };
}

/** 倒れた体の真ん中（足元から吹き飛ぶ向きへ体の長さの半分） */
export function fallFootprint(x, z, dirX, dirZ, length) {
  let dx = Number(dirX) || 0;
  let dz = Number(dirZ) || 0;
  const len = Math.hypot(dx, dz);
  if (len > 1e-9) {
    dx /= len;
    dz /= len;
  } else {
    dx = 0;
    dz = 1;
  }
  const h = Math.max(0, Number(length) || 0) / 2;
  return { x: (Number(x) || 0) + dx * h, z: (Number(z) || 0) + dz * h };
}
