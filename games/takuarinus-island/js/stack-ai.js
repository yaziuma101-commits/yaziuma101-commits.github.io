// モヒフライの1ターン（種ひとつで丸ごと決める。three.js・DOM に依存しない）。
import { createRng } from './mini-rng.js';
import { createTower, tickTower, dropBlock, topBlock } from './stack-rules.js';
import { resolveBlast, ANGLE_MIN, ANGLE_MAX } from './stack-blast.js';

const f = Object.freeze;
export const STACK_AI_PARAMS = f({
  easy: f({ errMax: 1.2, power: f([0.35, 0.85]), angleJitter: 20 }),
  normal: f({ errMax: 0.6, power: f([0.55, 0.9]), angleJitter: 10 }),
  hard: f({ errMax: 0.2, power: f([0.75, 0.95]), angleJitter: 4 }),
});

/**
 * 1ターンを丸ごと決め、演出の再生に使う内訳も返す。
 * drops: [{x, result}]（x は落とした位置。同じ x を順に dropBlock すれば同じ塔になる）
 * flights: resolveBlast の flights
 */
export function playStackAiTurnDetailed({
  seed = 0, level = 'normal', maxLevels = 10, baseWidth = 4, timeLimit = 20, powerBonus = 0, potWidthBonus = 0,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(STACK_AI_PARAMS, level)) throw new RangeError(`未知の強さ: ${level}`);
  const P = STACK_AI_PARAMS[level];
  const rng = createRng(seed);
  const tower = createTower({ baseWidth, maxLevels, timeLimit });
  const drops = [];
  while (!tower.over) {
    if (tickTower(tower, 1.4)) break;
    const x = topBlock(tower).x + rng.range(-P.errMax, P.errMax);
    const result = dropBlock(tower, x);
    drops.push({ x, result });
  }
  const power = rng.range(P.power[0], P.power[1]);
  const angleDeg = Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, 45 + rng.range(-P.angleJitter, P.angleJitter)));
  const b = resolveBlast({
    levels: tower.levels, power, angleDeg, rng, powerBonus, potWidthBonus,
  });
  return {
    levels: tower.levels,
    power,
    angleDeg,
    flown: b.flown,
    potBonus: b.potBonus,
    score: b.score,
    drops,
    flights: b.flights,
    baseWidth: tower.blocks[0].width,
    maxLevels: tower.maxLevels,
    timeLimit: tower.timeLimit,
  };
}

export function playStackAiTurn(opts = {}) {
  const d = playStackAiTurnDetailed(opts);
  return {
    levels: d.levels, power: d.power, angleDeg: d.angleDeg, flown: d.flown, potBonus: d.potBonus, score: d.score,
  };
}
