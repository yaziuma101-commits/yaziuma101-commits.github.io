// デカ頭アリヌスの AI（three.js・DOM に依存しない）。match は読むだけで書き換えない。
import { createRng } from './mini-rng.js';

export const TOUCH_AI_LEVELS = Object.freeze(['easy', 'normal', 'hard']);
export const DEFAULT_LEVEL = 'normal';
export const TOUCH_AI_PARAMS = Object.freeze({
  easy: Object.freeze({
    interval: 0.9, reachChance: 0.25, dodgeChance: 0.3, feintChance: 0.1,
  }),
  normal: Object.freeze({
    interval: 0.6, reachChance: 0.38, dodgeChance: 0.55, feintChance: 0.15,
  }),
  hard: Object.freeze({
    interval: 0.35, reachChance: 0.5, dodgeChance: 0.8, feintChance: 0.2,
  }),
});

export function createTouchAI({ seed = 0, level } = {}) {
  const lv = level === undefined || level === null ? DEFAULT_LEVEL : level;
  if (!Object.prototype.hasOwnProperty.call(TOUCH_AI_PARAMS, lv)) throw new RangeError(`未知の強さ: ${lv}`);
  const P = TOUCH_AI_PARAMS[lv];
  const rng = createRng(seed);
  let timer = 0;
  return {
    level: lv,
    params: P,
    think(match, dt) {
      timer += Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (timer + 1e-9 < P.interval) return { type: 'idle' };
      timer -= P.interval;
      if (timer >= P.interval) timer = 0;
      const hero = match && match.fighters ? match.fighters.hero : null;
      const r = hero ? hero.reach : null;
      if (r && !r.resolved && rng.chance(P.dodgeChance)) {
        return { type: 'dodge', posture: { lean: r.hand === 'L' ? 1 : -1, crouch: false, forward: false } };
      }
      if (rng.chance(P.reachChance)) {
        const hand = rng.chance(0.5) ? 'L' : 'R';
        const forward = rng.chance(0.5);
        return { type: 'attack', hand, posture: { lean: 0, crouch: false, forward } };
      }
      if (rng.chance(P.feintChance)) {
        return { type: 'feint', posture: { lean: rng.chance(0.5) ? 1 : -1, crouch: false, forward: false } };
      }
      return { type: 'idle' };
    },
  };
}
