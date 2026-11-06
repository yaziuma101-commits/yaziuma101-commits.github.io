// とうふアリヌスの探索計画と進み具合。three.js・DOM に依存しない。
import { makeRng, hashSeed } from './ff-rng.js';

const BASE = Object.freeze({ 1: 90, 2: 60, 3: 38 });

export function planAi(tree, level, seed, delayMul = 1) {
  const lv = Math.min(3, Math.max(1, Math.round(Number(level) || 1)));
  const targetDepth = tree && tree.targetDepth === 4 ? 4 : 3;
  const r = makeRng(hashSeed(seed, 'ai', lv)).next();
  const mul = Number.isFinite(delayMul) && delayMul > 0 ? delayMul : 1;
  const finishAt = BASE[lv] * (0.85 + 0.3 * r) * (targetDepth === 4 ? 1.15 : 1) * mul;
  return { level: lv, finishAt, targetDepth };
}

export function aiProgress(plan, t) {
  const maxDepth = plan.targetDepth;
  if (t >= plan.finishAt) return { depth: maxDepth, maxDepth, done: true };
  const raw = Math.floor((Math.max(0, t) / plan.finishAt) * (maxDepth + 1));
  return { depth: Math.min(maxDepth, Math.max(1, raw)), maxDepth, done: false };
}

export function aiStatusText(plan, t) {
  const p = aiProgress(plan, t);
  return p.done ? 'とうふアリヌス：見つけた！' : `とうふアリヌス：探索中… ${p.depth}/${p.maxDepth}階層`;
}
