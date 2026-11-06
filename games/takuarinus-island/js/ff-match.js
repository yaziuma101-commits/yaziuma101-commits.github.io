// 「ファイルを見つけろ」の5回戦の進行・提出判定・得点。three.js・DOM に依存しない。
import { hashSeed } from './ff-rng.js';
import { generateTree, removeDecoy } from './ff-tree.js';
import { planAi } from './ff-ai.js';

export const ROUNDS = 5;
export const WRONG_PENALTY_SEC = 10;

export function scoreForSolve(sec) {
  const s = Number(sec);
  const v = Math.round(1000 - (Number.isFinite(s) ? s : 0) * 7);
  return Math.max(100, Math.min(1000, v));
}

export function roundSeed(seed, i) {
  return hashSeed(seed, 'round', i);
}

function makeRound(m, index, startedAt) {
  const seed = roundSeed(m.seed, index);
  let tree = generateTree(seed);
  const rd = Math.max(0, Math.floor(Number(m.effects.removeDecoys) || 0));
  for (let k = 0; k < rd; k++) tree = removeDecoy(tree, hashSeed(seed, 'rd', k));
  const mul = Number(m.effects.aiDelayMul);
  const ai = planAi(tree, m.aiLevel, seed, Number.isFinite(mul) && mul > 0 ? mul : 1);
  return {
    index, seed, tree, ai, startedAt, lockedUntil: 0, wrong: 0, over: false, winner: null,
  };
}

export function createMatch({
  seed, aiLevel = 2, rounds = ROUNDS, effects = {},
} = {}) {
  const m = {
    seed,
    aiLevel,
    rounds,
    roundIndex: 0,
    phase: 'playing',
    scores: { player: 0, ai: 0 },
    results: [],
    effects: effects && typeof effects === 'object' ? effects : {},
    round: null,
  };
  m.round = makeRound(m, 0, 0);
  return m;
}

function endRound(m, winner, points) {
  const r = m.round;
  r.over = true;
  r.winner = winner;
  m.scores[winner] += points;
  m.results.push({
    index: r.index, winner, points, wrong: r.wrong,
  });
  m.phase = m.roundIndex >= m.rounds - 1 ? 'finished' : 'roundOver';
}

export function tick(m, t) {
  if (m.phase !== 'playing') return false;
  const r = m.round;
  if (t >= r.startedAt + r.ai.finishAt) {
    endRound(m, 'ai', scoreForSolve(r.ai.finishAt));
    return true;
  }
  return false;
}

export function submit(m, nodeId, t) {
  tick(m, t);
  const r = m.round;
  if (r.over || m.phase !== 'playing') return { result: 'over', points: 0 };
  const n = r.tree.nodes[nodeId];
  if (!n || n.kind !== 'file') return { result: 'invalid', points: 0 };
  if (t < r.lockedUntil) return { result: 'locked', points: 0 };
  if (nodeId !== r.tree.targetId) {
    const pen = Number(m.effects.penaltySec);
    r.lockedUntil = t + (Number.isFinite(pen) && pen >= 0 ? pen : WRONG_PENALTY_SEC);
    r.wrong++;
    return { result: 'wrong', points: 0 };
  }
  const mul = Number(m.effects.scoreMul);
  const points = Math.round(scoreForSolve(t - r.startedAt) * (Number.isFinite(mul) && mul > 0 ? mul : 1));
  endRound(m, 'player', points);
  return { result: 'correct', points };
}

/** 外れの待ちの残り秒数（待っていない・回が終わっていれば 0） */
export function lockRemaining(m, t) {
  if (!m || !m.round || m.round.over || m.phase !== 'playing') return 0;
  return Math.max(0, m.round.lockedUntil - t);
}

/** この回が始まってからの秒数 */
export function elapsedOf(m, t) {
  if (!m || !m.round) return 0;
  return Math.max(0, t - m.round.startedAt);
}

export function nextRound(m, t) {
  if (m.phase !== 'roundOver') return false;
  m.roundIndex++;
  m.round = makeRound(m, m.roundIndex, t);
  m.phase = 'playing';
  return true;
}

export function matchResult(m) {
  if (m.phase !== 'finished') return null;
  const { player, ai } = m.scores;
  return player > ai ? 'win' : player < ai ? 'lose' : 'draw';
}
