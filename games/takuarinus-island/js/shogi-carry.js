// スーパー将棋への持ち込み効果の純粋な関数（three.js・DOM に依存しない）。
import { pieceAt, withPosition } from './shogi-rules.js';
import { DEFAULT_UNDO_LIMIT } from './shogi-session.js';

/** 持ち駒を増やす */
export function addToHand(state, side, type, n = 1) {
  const k = Math.floor(Number(n));
  if (!(k > 0) || (side !== 'b' && side !== 'w')) return state;
  const hands = { b: { ...state.hands.b }, w: { ...state.hands.w } };
  hands[side][type] = (hands[side][type] || 0) + k;
  return withPosition(state, { hands });
}

/** side の相手の駒（玉以外）を盤から押し流す。持ち駒にはならず、手番も変えない */
export function washAwayPiece(state, side, x, y) {
  const p = pieceAt(state, x, y);
  if (!p) throw new Error('そこに駒が無い');
  if (p.side === side) throw new Error('自分の駒は押し流せない');
  if (p.type === 'K') throw new Error('玉は押し流せない');
  const board = state.board.slice();
  board[y * 9 + x] = null;
  return withPosition(state, { board });
}

/** アイテム ID → 将棋での効果（item-table.js の ID） */
export const SHOGI_CARRY = Object.freeze({
  movebox: Object.freeze({ kind: 'hand', side: 'b', type: 'P', n: 2 }),
  turbokart: Object.freeze({ kind: 'ai', plies: 3, level: 'easy', budgetMs: 100 }),
  watergun: Object.freeze({ kind: 'wash', uses: 1 }),
  dekamohawk: Object.freeze({ kind: 'undo', undoLimit: 5 }),
  agemohawk: Object.freeze({ kind: 'gold-random' }),
  nasukoma: Object.freeze({ kind: 'hand', side: 'b', type: 'C0', n: 1 }),
});

/** 持ち込みの params（item-table の params をマージしたもの）→ アイテム ID。無ければ null */
export function shogiCarryId(params) {
  const p = params && typeof params === 'object' ? params : {};
  let id = null;
  if (typeof p.shogiCarry === 'string') id = p.shogiCarry;
  else if (typeof p.itemId === 'string') id = p.itemId;
  return id && Object.prototype.hasOwnProperty.call(SHOGI_CARRY, id) ? id : null;
}

/**
 * 対局1回ぶんの持ち込みの計画。rng は () => [0,1)（揚げモヒカンの金の行き先に使う）。
 * { itemId, hands:{b:{},w:{}}, undoLimit, washUses, aiPlies, aiLevel, aiBudgetMs, goldTo }
 */
export function shogiCarryPlan(params, rng = Math.random) {
  const plan = {
    itemId: null,
    hands: { b: {}, w: {} },
    undoLimit: DEFAULT_UNDO_LIMIT,
    washUses: 0,
    aiPlies: 0,
    aiLevel: null,
    aiBudgetMs: null,
    goldTo: null,
    aiFirst: false,
  };
  // 新しいアイテムの効果（以前は表示だけで効いていなかった）。どの持ち込みの品でも読む
  const p = params && typeof params === 'object' ? params : {};
  const extra = Number.isFinite(p.extraMatta) && p.extraMatta > 0 ? Math.floor(p.extraMatta) : 0;
  plan.undoLimit += extra; // 待ったが増える
  if (p.swapSides === true) plan.aiFirst = true; // 先手と後手が入れ替わる（おなすくんが先に指す）
  const add = (side, type, n) => {
    plan.hands[side][type] = (plan.hands[side][type] || 0) + n;
  };
  // 高難易度: 相手の持ち駒に金（持ち込みの品とは別に効く）
  if (Number.isFinite(p.hardFoeGold) && p.hardFoeGold > 0) add('w', 'G', Math.floor(p.hardFoeGold));
  const id = shogiCarryId(params);
  if (!id) return plan;
  plan.itemId = id;
  const e = SHOGI_CARRY[id];
  if (e.kind === 'hand') add(e.side, e.type, e.n);
  else if (e.kind === 'ai') {
    plan.aiPlies = e.plies;
    plan.aiLevel = e.level;
    plan.aiBudgetMs = e.budgetMs;
  } else if (e.kind === 'wash') plan.washUses = e.uses;
  else if (e.kind === 'undo') plan.undoLimit = e.undoLimit + extra;
  else if (e.kind === 'gold-random') {
    const g = params && params.goldTo;
    let to = g === 'b' || g === 'w' ? g : null;
    if (!to) {
      const r = typeof rng === 'function' ? Number(rng()) : 0;
      to = r < 0.5 ? 'b' : 'w';
    }
    plan.goldTo = to;
    add(to, 'G', 1);
  }
  return plan;
}

/** 計画の持ち駒を局面に足す */
export function applyShogiCarry(state, plan) {
  let s = state;
  if (!plan || !plan.hands) return s;
  for (const side of ['b', 'w']) {
    for (const [type, n] of Object.entries(plan.hands[side] || {})) s = addToHand(s, side, type, n);
  }
  return s;
}

/** 相手の手番の AI の設定。ターボカートなら相手の最初の数手だけ弱く・短く */
export function shogiAiOptions(plan, plies, level) {
  const idx = Math.floor((Number(plies) || 0) / 2);
  if (plan && plan.aiPlies > idx) {
    return { level: plan.aiLevel || 'easy', budgetMs: plan.aiBudgetMs || 100 };
  }
  return { level, budgetMs: undefined };
}

/** side が水鉄砲で押し流せる駒（相手の玉以外）の座標 */
export function washTargets(state, side) {
  const out = [];
  if (!state || !state.board) return out;
  for (let i = 0; i < 81; i++) {
    const p = state.board[i];
    if (!p || p.side === side || p.type === 'K') continue;
    const x = i % 9;
    out.push({ x, y: (i - x) / 9 });
  }
  return out;
}
