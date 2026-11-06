// ハブの通行判定（x-z 平面）。ボスを足してもこのファイルは変更しない。
import { BOSSES } from './bosses.js';

export const HUB_WALK_RADIUS = 17;
export const GATE_HALF_WIDTH = 2;
export const GATE_OUTER_RADIUS = 20;
export const GATE_TRIGGER_RADIUS = 19;

const TOL = 1e-9;

/** 門が開いているか。implemented（勝負まで遊べる）か gateOpen（部屋まで入れる）なら通れる */
export function isGateOpen(boss) {
  return !!boss && (boss.implemented === true || boss.gateOpen === true);
}

function dirOf(boss) {
  const a = (boss.gateAngleDeg * Math.PI) / 180;
  return { ux: Math.cos(a), uz: Math.sin(a) };
}

export function gatePoint(boss, r) {
  const { ux, uz } = dirOf(boss);
  return { x: r * ux, z: r * uz };
}

// r: 門方向の成分、lat: 横ずれ（pos × u）
function corridorCoords(pos, boss) {
  const { ux, uz } = dirOf(boss);
  return { r: pos.x * ux + pos.z * uz, lat: pos.x * uz - pos.z * ux, ux, uz };
}

// 通路は [R-1, OUTER] × [-W, W] の長方形。奥の角は半径 OUTER で丸める
// （島の中心から OUTER より遠くへは出ない）。
function inCorridor(pos, boss) {
  const { r, lat } = corridorCoords(pos, boss);
  return (
    r >= HUB_WALK_RADIUS - 1 - TOL &&
    r <= GATE_OUTER_RADIUS + TOL &&
    Math.abs(lat) <= GATE_HALF_WIDTH + TOL &&
    Math.hypot(pos.x, pos.z) <= GATE_OUTER_RADIUS + TOL
  );
}

export function isWalkable(pos, bosses = BOSSES) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
  if (Math.hypot(pos.x, pos.z) <= HUB_WALK_RADIUS + TOL) return true;
  return bosses.some((b) => isGateOpen(b) && inCorridor(pos, b));
}

export function resolveHubMove(from, to, bosses = BOSSES) {
  if (isWalkable(to, bosses)) return { x: to.x, z: to.z };

  // 開いた門の通路内からの移動は、通路の長方形に押し込む
  for (const b of bosses) {
    if (!isGateOpen(b) || !inCorridor(from, b)) continue;
    const c = corridorCoords(to, b);
    const lat = Math.max(-GATE_HALF_WIDTH, Math.min(GATE_HALF_WIDTH, c.lat));
    const rMax = Math.sqrt(GATE_OUTER_RADIUS * GATE_OUTER_RADIUS - lat * lat);
    const r = Math.min(c.r, rMax);
    const p = { x: r * c.ux + lat * c.uz, z: r * c.uz - lat * c.ux };
    if (isWalkable(p, bosses)) return p;
  }

  // 外周に沿って滑る
  const d = Math.hypot(to.x, to.z);
  if (Number.isFinite(d) && d > 0) {
    const k = HUB_WALK_RADIUS / d;
    const p = { x: to.x * k, z: to.z * k };
    if (isWalkable(p, bosses)) return p;
  }
  if (isWalkable(from, bosses)) return { x: from.x, z: from.z };
  return { x: 0, z: 0 };
}

export function gateAt(pos, bosses = BOSSES) {
  for (const b of bosses) {
    if (!isGateOpen(b) || !inCorridor(pos, b)) continue;
    if (corridorCoords(pos, b).r >= GATE_TRIGGER_RADIUS) return b;
  }
  return null;
}
