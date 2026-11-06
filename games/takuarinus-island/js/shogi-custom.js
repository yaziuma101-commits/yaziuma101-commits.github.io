// オリジナル駒の定義・点数・検証・ナスの生成（three.js・DOM・Web Audio に依存しない）。
// 定義 { name, cells:[{dx,dy}], rays:[{dx,dy}] }。dy が負で前進（持ち主から見た向き）。
import { createRng } from './mini-rng.js';

export const COST_STEP = 1;
export const COST_RAY = 3;
export const MAX_CUSTOM_COST = 12;
export const CELL_RANGE = 2;
export const DEFAULT_NAMES = Object.freeze(['褌', '髷', '尻', '屁', '芋', '鼻']);
export const NASU_NAME = 'ナス';

/** どこまでも進める 8 方向（前から時計回り） */
export const RAY_DIRS = Object.freeze(
  [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
    .map(([dx, dy]) => Object.freeze({ dx, dy })),
);

const key = (dx, dy) => `${dx},${dy}`;
const list = (a) => (Array.isArray(a) ? a : []);

function readVec(o) {
  if (!o || typeof o !== 'object') return null;
  const dx = Number(o.dx);
  const dy = Number(o.dy);
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) return null;
  return { dx: dx || 0, dy: dy || 0 };
}

export function isCellOk(v) {
  return !!v && Math.abs(v.dx) <= CELL_RANGE && Math.abs(v.dy) <= CELL_RANGE && !!(v.dx || v.dy);
}

export function isRayOk(v) {
  return !!v && Math.abs(v.dx) <= 1 && Math.abs(v.dy) <= 1 && !!(v.dx || v.dy);
}

/** ray が覆うマス（d×1 と d×2）の "dx,dy" の集合 */
export function coveredCells(rays) {
  const s = new Set();
  for (const r of list(rays)) {
    const v = readVec(r);
    if (!isRayOk(v)) continue;
    s.add(key(v.dx, v.dy));
    s.add(key(2 * v.dx, 2 * v.dy));
  }
  return s;
}

/** 重複・範囲外・ray に覆われたマスを除いた定義 */
export function normalizeCustomDef(def) {
  const d = def && typeof def === 'object' ? def : {};
  const rays = [];
  const rs = new Set();
  for (const r of list(d.rays)) {
    const v = readVec(r);
    if (!isRayOk(v)) continue;
    const k = key(v.dx, v.dy);
    if (rs.has(k)) continue;
    rs.add(k);
    rays.push({ dx: v.dx, dy: v.dy });
  }
  const cov = coveredCells(rays);
  const cells = [];
  const cs = new Set();
  for (const c of list(d.cells)) {
    const v = readVec(c);
    if (!isCellOk(v)) continue;
    const k = key(v.dx, v.dy);
    if (cs.has(k) || cov.has(k)) continue;
    cs.add(k);
    cells.push({ dx: v.dx, dy: v.dy });
  }
  return { name: typeof d.name === 'string' ? d.name : '', cells, rays };
}

/** 点数（マス 1 点、ray 3 点。覆われたマス・重複は数えない） */
export function customCost(def) {
  const n = normalizeCustomDef(def);
  return n.cells.length * COST_STEP + n.rays.length * COST_RAY;
}

export function validateCustomMoves(def) {
  const errors = [];
  if (!def || typeof def !== 'object') {
    return { ok: false, cost: 0, errors: ['定義が無い'] };
  }
  if (list(def.cells).some((c) => !isCellOk(readVec(c)))) errors.push('5×5 の外か中心のマスがある');
  if (list(def.rays).some((r) => !isRayOk(readVec(r)))) errors.push('どこまでも進める方向が不正');
  const n = normalizeCustomDef(def);
  const cost = n.cells.length * COST_STEP + n.rays.length * COST_RAY;
  if (!n.cells.length && !n.rays.length) errors.push('進めるマスを1つ以上選んでね');
  if (cost > MAX_CUSTOM_COST) errors.push(`点数オーバー（${cost} / ${MAX_CUSTOM_COST}）`);
  return { ok: errors.length === 0, cost, errors };
}

/** 名前は漢字1〜2文字だけ */
export function validateCustomName(name) {
  return typeof name === 'string' && /^\p{Script=Han}{1,2}$/u.test(name);
}

export function validateCustomDef(def) {
  const m = validateCustomMoves(def);
  const errors = [...m.errors];
  if (!validateCustomName(def && def.name)) errors.unshift('名前は漢字1〜2文字にしてね');
  return { ok: errors.length === 0, cost: m.cost, errors };
}

/** 5×5 のマスを1つ切り替える（ray に覆われたマスは変えない） */
export function toggleCell(def, dx, dy) {
  const n = normalizeCustomDef(def);
  const v = { dx: dx || 0, dy: dy || 0 };
  if (!isCellOk(v)) return n;
  const k = key(v.dx, v.dy);
  if (coveredCells(n.rays).has(k)) return n;
  const has = n.cells.some((c) => key(c.dx, c.dy) === k);
  return { ...n, cells: has ? n.cells.filter((c) => key(c.dx, c.dy) !== k) : [...n.cells, v] };
}

/** どこまでも進める方向を1つ切り替える */
export function toggleRay(def, dx, dy) {
  const n = normalizeCustomDef(def);
  const v = { dx: dx || 0, dy: dy || 0 };
  if (!isRayOk(v)) return n;
  const k = key(v.dx, v.dy);
  const has = n.rays.some((r) => key(r.dx, r.dy) === k);
  return normalizeCustomDef({ ...n, rays: has ? n.rays.filter((r) => key(r.dx, r.dy) !== k) : [...n.rays, v] });
}

/** おなすくんの駒「ナス」。同じ種なら同じ動き。点数は 3〜10 */
export function generateNasuDef(seed) {
  const rng = createRng(seed);
  const target = 3 + rng.int(8);
  const rays = [];
  if (rng.chance(0.4)) {
    const d = rng.pick(RAY_DIRS);
    rays.push({ dx: d.dx, dy: d.dy });
  }
  let cost = rays.length * COST_RAY;
  const cov = coveredCells(rays);
  const cells = [];
  const fw = rng.pick([[0, -1], [-1, -1], [1, -1]]);
  const fk = key(fw[0], fw[1]);
  if (!cov.has(fk)) {
    cells.push({ dx: fw[0], dy: fw[1] });
    cost += COST_STEP;
  }
  const cand = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const k = key(dx, dy);
      if (cov.has(k) || k === fk) continue;
      const far = Math.max(Math.abs(dx), Math.abs(dy)) === 2 ? 0.6 : 0;
      cand.push({ dx: dx || 0, dy: dy || 0, w: rng.next() + far + (dy > 0 ? 0.2 : 0) });
    }
  }
  cand.sort((a, b) => a.w - b.w);
  for (const c of cand) {
    if (cost >= target) break;
    cells.push({ dx: c.dx, dy: c.dy });
    cost += COST_STEP;
  }
  return { name: NASU_NAME, cells, rays };
}
