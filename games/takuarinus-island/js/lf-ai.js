// ムキムキヌスの AI。乱数は makeRng(seed) だけを使い、同じ種・同じ状況の列なら同じ動き。
import { makeRng } from './lf-rng.js';

const L = (name, think, guard, normal, special, cooldown) => Object.freeze({
  name, think, guard, normal, special, cooldown,
});

export const AI_LEVELS = Object.freeze({
  1: L('よわい', 0.5, 0.2, 0.35, 0.10, 5),
  2: L('ふつう', 0.35, 0.45, 0.5, 0.22, 3.5),
  3: L('つよい', 0.22, 0.7, 0.65, 0.40, 2),
});
export const DEFAULT_AI_LEVEL = 2;
export const AI_FAR = 4;
/** 跳んできた相手に昇天拳で応じる距離 */
export const AI_ANTI_AIR_RANGE = 2.2;

export function normalizeAiLevel(lv) {
  const n = Number(lv);
  return Number.isInteger(n) && Object.prototype.hasOwnProperty.call(AI_LEVELS, n) ? n : DEFAULT_AI_LEVEL;
}

/** 強さの保存（既存ゲームの難度保存と同じく、専用のキーに JSON で置く） */
export const LF_SAVE_KEY = 'takuarinus-lever-fighter-v1';

/** 保存データ（文字列か {level}）→ {level}。壊れていれば ふつう */
export function parseLfSave(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const ok = v && typeof v === 'object' && !Array.isArray(v);
  return { level: ok ? normalizeAiLevel(v.level) : DEFAULT_AI_LEVEL };
}

export function serializeLfSave(save) {
  return JSON.stringify({ v: 1, level: normalizeAiLevel(save && save.level) });
}

/** 試合前の強さの3択（結果パネルと同じ形）。index はいま選ばれている位置 */
export function aiLevelChoices(level) {
  const lv = normalizeAiLevel(level);
  return {
    title: '相手の強さ',
    lines: ['ムキムキヌスの強さを選べ。'],
    choices: [1, 2, 3].map((n) => ({ id: n, label: AI_LEVELS[n].name })),
    index: lv - 1,
  };
}

/** AI の意図 → キー状態 {left,right,up,down}。facing は相手の向き（+1: 右向き） */
export function intentToKeys(intent, facing = 1, { lowGuard = false } = {}) {
  const k = {
    left: false, right: false, up: false, down: false,
  };
  if (!intent) return k;
  const fwd = facing >= 0 ? 'right' : 'left';
  const back = facing >= 0 ? 'left' : 'right';
  if (intent.guard) {
    k[back] = true;
    if (lowGuard) k.down = true;
    return k;
  }
  if (intent.move > 0) k[fwd] = true;
  else if (intent.move < 0) k[back] = true;
  if (intent.crouch) k.down = true;
  if (intent.jump) k.up = true;
  return k;
}

/** AI の通常技 → 技表の id（空中ならジャンプ攻撃）。無ければ null */
export function aiAttackId(intent, airborne = false) {
  const a = intent && intent.attack;
  if (!a) return null;
  const punch = a === 'punch';
  if (airborne) return punch ? 'jumpPunch' : 'jumpKick';
  if (a === 'crouchKick') return 'crouchKick';
  return punch ? 'punch' : 'kick';
}

export function createAi({ seed = 1, level } = {}) {
  return {
    level: normalizeAiLevel(level), rng: makeRng(seed), timer: 0, cooldown: 0, move: 0, guard: false,
  };
}

/** ctx: {dist, foeAttacking, foeAirborne}。move の +1 が相手の方向 */
export function stepAi(ai, ctx = {}, dt = 0) {
  const P = AI_LEVELS[ai.level] || AI_LEVELS[DEFAULT_AI_LEVEL];
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  ai.timer -= d;
  ai.cooldown = Math.max(0, ai.cooldown - d);
  const out = {
    move: ai.move, guard: ai.guard, crouch: false, jump: false, attack: null, special: null,
  };
  if (ai.timer > 0) return out;
  ai.timer = P.think;
  const r = ai.rng;
  const dist = Math.abs(Number(ctx.dist) || 0);
  const far = dist > AI_FAR;
  ai.guard = !!ctx.foeAttacking && dist < 2 && r() < P.guard;
  let special = null;
  if (ai.cooldown <= 0 && !ai.guard) {
    if (ctx.foeAirborne && dist < AI_ANTI_AIR_RANGE && r() < Math.min(0.9, P.special * 2.2)) {
      // 跳んできた相手には対空の昇天拳
      special = 'rising';
    } else {
      const list = ['wave'];
      if (!far) list.push('whirl');
      if (!far && (ctx.foeAirborne || dist < 1.5)) list.push('rising');
      if (r() < P.special) special = list[Math.min(list.length - 1, Math.floor(r() * list.length))];
    }
    if (special) ai.cooldown = P.cooldown;
  }
  let attack = null;
  let move;
  if (far) {
    move = r() < 0.75 ? 1 : 0;
  } else {
    const x = r();
    move = x < 0.45 ? 1 : x < 0.75 ? 0 : -1;
    if (!special && !ai.guard && dist < 1.8 && r() < P.normal) {
      const y = r();
      attack = y < 0.45 ? 'punch' : y < 0.8 ? 'kick' : 'crouchKick';
      move = 0;
    }
  }
  if (ai.guard) move = 0;
  ai.move = move;
  out.move = move;
  out.guard = ai.guard;
  out.attack = attack;
  out.special = special;
  out.crouch = attack === 'crouchKick';
  out.jump = !far && !attack && !special && !ai.guard && r() < 0.04;
  return out;
}
