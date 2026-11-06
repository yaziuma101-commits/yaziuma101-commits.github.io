// FPS番長の当たり判定（three.js・DOM に依存しない）
// 座標は {x,y,z}、単位はメートル、Y が上。dir は正規化済みの方向。
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function distSqToSegment(p, a, b) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const len2 = dot(ab, ab);
  let t = len2 > 1e-12 ? dot(ap, ab) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = ap.x - ab.x * t;
  const dy = ap.y - ab.y * t;
  const dz = ap.z - ab.z * t;
  return dx * dx + dy * dy + dz * dz;
}

/** 始点が球の外側のとき、最初に当たる距離（後ろ向きや外れは null） */
function raySphere(o, d, c, r) {
  const oc = sub(o, c);
  const b = dot(oc, d);
  const cc = dot(oc, oc) - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

/** 光線とカプセル（線分 a-b から距離 r の領域）。最初に当たる距離、外れは null、内部なら 0 */
export function rayCapsule(origin, dir, capsule, maxDist = Infinity) {
  const { a, b, r } = capsule;
  if (distSqToSegment(origin, a, b) <= r * r) return maxDist >= 0 ? 0 : null;
  let best = Infinity;
  const ba = sub(b, a);
  const oa = sub(origin, a);
  const baba = dot(ba, ba);
  const bard = dot(ba, dir);
  const baoa = dot(ba, oa);
  const rdoa = dot(dir, oa);
  const oaoa = dot(oa, oa);
  const A = baba - bard * bard;
  if (baba > 1e-12 && A > 1e-12) {
    // 側面（円柱部分）
    const B = baba * rdoa - baoa * bard;
    const C = baba * oaoa - baoa * baoa - r * r * baba;
    const h = B * B - A * C;
    if (h >= 0) {
      const t = (-B - Math.sqrt(h)) / A;
      const y = baoa + t * bard;
      if (t >= 0 && y > 0 && y < baba) best = t;
    }
  }
  // 両端の半球
  for (const c of [a, b]) {
    const t = raySphere(origin, dir, c, r);
    if (t !== null && t < best) best = t;
  }
  if (!Number.isFinite(best) || best > maxDist) return null;
  return best;
}

/** 光線と AABB（スラブ法）。戻り値は rayCapsule と同じ規則 */
export function rayBox(origin, dir, box, maxDist = Infinity) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const k of ['x', 'y', 'z']) {
    const o = origin[k];
    const d = dir[k];
    const lo = box.min[k];
    const hi = box.max[k];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = tmin < 0 ? 0 : tmin;
  return t <= maxDist ? t : null;
}

/** 番長と箱のうち最も近いもの。同距離なら箱を優先（水を止める） */
export function raycastWorld(origin, dir, { capsule, boxes } = {}, maxDist = Infinity) {
  let kind = 'none';
  let best = Infinity;
  if (capsule) {
    const t = rayCapsule(origin, dir, capsule, maxDist);
    if (t !== null) {
      kind = 'boss';
      best = t;
    }
  }
  for (const bx of boxes || []) {
    const t = rayBox(origin, dir, bx, maxDist);
    if (t !== null && t <= best) {
      kind = 'box';
      best = t;
    }
  }
  return { kind, t: kind === 'none' ? null : best };
}

/** from→to の線分が箱に遮られなければ true（to より先の箱は無視） */
export function hasLineOfSight(from, to, boxes) {
  const v = sub(to, from);
  const dist = Math.hypot(v.x, v.y, v.z);
  if (dist < 1e-9) return true;
  const d = { x: v.x / dist, y: v.y / dist, z: v.z / dist };
  for (const bx of boxes || []) {
    if (rayBox(from, d, bx, dist) !== null) return false;
  }
  return true;
}
