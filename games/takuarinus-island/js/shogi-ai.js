// スーパー将棋の相手の AI（three.js・DOM に依存しない）。
// easy: 1 手読み＋ノイズ ／ normal: 2 手読み ／ hard: 2 手読み＋取り合いの延長（2 手）。alpha-beta。
import {
  legalMoves, applyMoveUnchecked, captureMoves, attackCounts, handEntries, opponent,
} from './shogi-rules.js';
import { customCost } from './shogi-custom.js';

export const PIECE_VALUES = Object.freeze({
  P: 1, L: 3, N: 3, S: 5, G: 6, B: 8, R: 10, K: 1000,
});
export const PROMOTE_BONUS = 2;
export const HAND_RATE = 0.9;
export const MATE_SCORE = 100000;
export const TIME_BUDGET_MS = 700;
export const AI_LEVELS = Object.freeze(['easy', 'normal', 'hard']);
const NODE_LIMIT = Object.freeze({ easy: 4000, normal: 60000, hard: 120000 });
const KING_GUARD = 0.12;
const KING_THREAT = 0.25;
const CHECK_BONUS = 0.4;
const NEIGH = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function mulberry32(seed) {
  let t = (Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 1) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const costCache = new WeakMap();
function customValues(customs) {
  if (!Array.isArray(customs)) return [2, 2];
  let v = costCache.get(customs);
  if (!v) {
    v = [0, 1].map((i) => 2 + customCost(customs[i]) * 0.6);
    costCache.set(customs, v);
  }
  return v;
}

export function pieceValue(type, promoted, customs) {
  if (type === 'C0') return customValues(customs)[0];
  if (type === 'C1') return customValues(customs)[1];
  return (PIECE_VALUES[type] || 0) + (promoted ? PROMOTE_BONUS : 0);
}

/** 評価（先手視点） */
export function evaluate(state) {
  const { board, customs } = state;
  let s = 0;
  const kings = { b: -1, w: -1 };
  for (let i = 0; i < 81; i++) {
    const p = board[i];
    if (!p) continue;
    const v = pieceValue(p.type, p.promoted, customs);
    s += p.side === 'b' ? v : -v;
    if (p.type === 'K') kings[p.side] = i;
  }
  for (const side of ['b', 'w']) {
    const sg = side === 'b' ? 1 : -1;
    for (const [t, n] of handEntries(state.hands[side])) s += sg * pieceValue(t, false, customs) * HAND_RATE * n;
  }
  const att = attackCounts(state);
  for (const side of ['b', 'w']) {
    const k = kings[side];
    if (k < 0) continue;
    const opp = opponent(side);
    const kx = k % 9;
    const ky = (k - kx) / 9;
    let safe = 0;
    for (const [dx, dy] of NEIGH) {
      const x = kx + dx;
      const y = ky + dy;
      if (x < 0 || x > 8 || y < 0 || y > 8) continue;
      const j = y * 9 + x;
      safe += Math.min(att[side][j], 3) * KING_GUARD - Math.min(att[opp][j], 3) * KING_THREAT;
    }
    s += (side === 'b' ? 1 : -1) * safe;
  }
  const tk = kings[state.turn];
  if (tk >= 0 && att[opponent(state.turn)][tk] > 0) s += state.turn === 'b' ? -CHECK_BONUS : CHECK_BONUS;
  return s;
}

const sideEval = (state) => (state.turn === 'b' ? evaluate(state) : -evaluate(state));

function ordered(state, moves) {
  return moves.map((m, i) => {
    let k = 0;
    if (!m.drop) {
      const t = state.board[m.to.y * 9 + m.to.x];
      if (t) k += 100 + pieceValue(t.type, t.promoted, state.customs) * 10;
    }
    if (m.promote) k += 50;
    return { m, k, i };
  }).sort((a, b) => b.k - a.k || a.i - b.i).map((o) => o.m);
}

function stop(c) {
  if (c.aborted) return true;
  c.nodes += 1;
  if (c.nodes > c.limit || ((c.nodes & 63) === 0 && now() > c.deadline)) c.aborted = true;
  return c.aborted;
}

function qsearch(state, alpha, beta, q, ply, c) {
  if (stop(c)) return 0;
  const stand = sideEval(state);
  if (q <= 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  let best = stand;
  for (const m of ordered(state, captureMoves(state))) {
    const t = state.board[m.to.y * 9 + m.to.x];
    if (t && t.type === 'K') return MATE_SCORE - ply;
    const v = -qsearch(applyMoveUnchecked(state, m), -beta, -alpha, q - 1, ply + 1, c);
    if (c.aborted) return best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(state, depth, alpha, beta, ply, c, quiet) {
  if (stop(c)) return 0;
  if (depth <= 0) return quiet > 0 ? qsearch(state, alpha, beta, quiet, ply, c) : sideEval(state);
  const moves = legalMoves(state);
  if (!moves.length) return -(MATE_SCORE - ply);
  let best = -Infinity;
  for (const m of ordered(state, moves)) {
    const v = -negamax(applyMoveUnchecked(state, m), depth - 1, -beta, -alpha, ply + 1, c, quiet);
    if (c.aborted) return best === -Infinity ? 0 : best;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** 合法手の1つを選ぶ。合法手が無ければ null */
export function chooseMove(state, { level = 'normal', seed = 1, budgetMs = TIME_BUDGET_MS } = {}) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const lv = AI_LEVELS.includes(level) ? level : 'normal';
  const rng = mulberry32(seed);
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : TIME_BUDGET_MS;
  const c = {
    nodes: 0, limit: NODE_LIMIT[lv], deadline: now() + budget, aborted: false,
  };
  const order = ordered(state, moves);
  let bestMove = order[0];
  let bestScore = -Infinity;
  if (lv === 'easy') {
    for (const m of order) {
      if (stop(c)) break;
      const v = -sideEval(applyMoveUnchecked(state, m)) + rng() * 3;
      if (v > bestScore) {
        bestScore = v;
        bestMove = m;
      }
    }
    return bestMove;
  }
  const quiet = lv === 'hard' ? 2 : 0;
  for (const m of order) {
    const child = applyMoveUnchecked(state, m);
    const noise = rng() * 0.01;
    const alpha = bestScore === -Infinity ? -Infinity : bestScore - 0.01;
    const raw = -negamax(child, 1, -Infinity, -alpha, 1, c, quiet);
    if (c.aborted) break;
    const v = raw + noise;
    if (v > bestScore) {
      bestScore = v;
      bestMove = m;
    }
  }
  return bestMove;
}
