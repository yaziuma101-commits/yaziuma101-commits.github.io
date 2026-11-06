// 積む段階の規則（three.js・DOM に依存しない）。
export const BASE_WIDTH = 4;
export const MIN_LEVELS = 8;
export const MAX_LEVELS = 12;
export const DEFAULT_LEVELS = 10;
export const TIME_LIMIT = 20;
export const MISS_OVERLAP_RATIO = 0.3;
export const PERFECT_EPS = 0.05;
export const SWING_RANGE = 3;

export function createTower({ baseWidth = BASE_WIDTH, maxLevels = DEFAULT_LEVELS, timeLimit = TIME_LIMIT } = {}) {
  const bw = Number(baseWidth) > 0 ? Number(baseWidth) : BASE_WIDTH;
  const n = Math.round(Number(maxLevels));
  const ml = Number.isFinite(n) ? Math.max(MIN_LEVELS, Math.min(MAX_LEVELS, n)) : DEFAULT_LEVELS;
  const tl = Number(timeLimit) > 0 ? Number(timeLimit) : TIME_LIMIT;
  return {
    blocks: [{ x: 0, width: bw }],
    levels: 0,
    misses: 0,
    elapsed: 0,
    maxLevels: ml,
    timeLimit: tl,
    over: false,
    endReason: null,
    fallen: [],
  };
}

export function topBlock(tower) {
  return tower.blocks[tower.blocks.length - 1];
}

function land(tower, block) {
  tower.blocks.push(block);
  tower.levels += 1;
  if (tower.levels >= tower.maxLevels) {
    tower.over = true;
    tower.endReason = 'full';
  }
}

export function dropBlock(tower, x) {
  if (!tower || tower.over) return null;
  const top = topBlock(tower);
  const dx = x - top.x;
  const w = top.width;
  if (Math.abs(dx) < PERFECT_EPS) {
    const block = { x: top.x, width: w };
    land(tower, block);
    return {
      landed: true, perfect: true, overlap: w, block: { ...block }, cut: null,
    };
  }
  const overlap = w - Math.abs(dx);
  const side = dx > 0 ? 'right' : 'left';
  if (overlap < w * MISS_OVERLAP_RATIO) {
    const cut = { side, width: w, x };
    tower.fallen.push(cut);
    tower.misses += 1;
    return {
      landed: false, perfect: false, overlap, block: null, cut,
    };
  }
  const lo = Math.max(top.x - w / 2, x - w / 2);
  const hi = Math.min(top.x + w / 2, x + w / 2);
  const block = { x: (lo + hi) / 2, width: overlap };
  const cut = dx > 0
    ? { side, width: w - overlap, x: (top.x + w / 2 + x + w / 2) / 2 }
    : { side, width: w - overlap, x: (x - w / 2 + top.x - w / 2) / 2 };
  tower.fallen.push(cut);
  land(tower, block);
  return {
    landed: true, perfect: false, overlap, block: { ...block }, cut,
  };
}

export function tickTower(tower, dt) {
  if (tower.over) return true;
  tower.elapsed += Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (tower.elapsed >= tower.timeLimit) {
    tower.over = true;
    tower.endReason = 'time';
  }
  return tower.over;
}

/** 三角波。t=0 で -range、右へ動いて range で折り返す */
export function movingX(t, speed, range = SWING_RANGE) {
  if (!(speed > 0) || !(range > 0)) return -range;
  const P = (4 * range) / speed;
  const ph = ((t % P) + P) % P;
  const half = P / 2;
  return ph < half ? -range + speed * ph : range - speed * (ph - half);
}

export function swingSpeed(levels, mult = 1) {
  return (3 + 0.25 * levels) * mult;
}

/** 積む段階の残り時間（秒、0 未満にならない） */
export function timeLeft(tower) {
  if (!tower) return 0;
  return Math.max(0, tower.timeLimit - tower.elapsed);
}

/**
 * index 番目に落とすブロックの揺れの開始時刻（movingX の t）。
 * 偶数番目は左端（-range）から右へ、奇数番目は右端（+range）から左へ動き出す。
 */
export function swingStartTime(index, speed, range = SWING_RANGE) {
  if (!(speed > 0) || !(range > 0)) return 0;
  const i = Math.floor(Math.abs(Number(index) || 0));
  return i % 2 ? (2 * range) / speed : 0;
}
