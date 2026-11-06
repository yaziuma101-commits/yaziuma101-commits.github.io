// タッチタッチの保存項目（保存データ全体に対する純粋関数。元のオブジェクトは変えない）。
import { TOUCH_AI_LEVELS, DEFAULT_LEVEL } from './touch-ai.js';

const RESULTS = ['win', 'lose', 'draw'];
const cnt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

function base(save) {
  return save && typeof save === 'object' && !Array.isArray(save) ? save : {};
}
function tt(save) {
  const t = base(save).touchTouch;
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}

export function getRefereePunches(save) {
  return cnt(tt(save).punches);
}

export function refereeHasHelmet(save) {
  return getRefereePunches(save) >= 2;
}

export function recordTouchResult(save, result) {
  if (!RESULTS.includes(result)) throw new RangeError(`記録できない結果: ${result}`);
  const t = tt(save);
  return {
    ...base(save),
    touchTouch: {
      ...t,
      punches: cnt(t.punches),
      plays: cnt(t.plays) + 1,
      wins: cnt(t.wins) + (result === 'win' ? 1 : 0),
      last: result,
    },
  };
}

export function recordPunch(save) {
  const t = tt(save);
  return {
    ...base(save),
    touchTouch: {
      ...t, punches: cnt(t.punches) + 1, plays: cnt(t.plays), wins: cnt(t.wins), last: 'uyamuya',
    },
  };
}

export function getTouchLevel(save) {
  const lv = tt(save).level;
  return TOUCH_AI_LEVELS.includes(lv) ? lv : DEFAULT_LEVEL;
}

export function setTouchLevel(save, level) {
  if (!TOUCH_AI_LEVELS.includes(level)) throw new RangeError(`未知の強さ: ${level}`);
  return { ...base(save), touchTouch: { ...tt(save), level } };
}
