// レースのコース（three.js・DOM に依存しない）
// 角を丸めた長方形の周回コース。スタートは下の直線（z = -60）で +x 向きに走る。
const f = Object.freeze;

const HALF_X = 100;
const HALF_Z = 60;
const CORNER_R = 30;
const STEP = 20;
const ARC_SEG = 5;
const ROAD_HALF = 9;
const FENCE_HALF = 16;
const GATE_COUNT = 8;

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function buildCourse() {
  const pts = [];
  const corners = [];
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / STEP - 1e-9));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push({ x: r6(x0 + (x1 - x0) * t), z: r6(z0 + (z1 - z0) * t) });
    }
  };
  const arc = (cx, cz, a0, a1) => {
    const from = pts.length;
    for (let i = 0; i < ARC_SEG; i++) {
      const a = a0 + ((a1 - a0) * i) / ARC_SEG;
      pts.push({ x: r6(cx + CORNER_R * Math.cos(a)), z: r6(cz + CORNER_R * Math.sin(a)) });
    }
    corners.push(f({ from, to: pts.length }));
  };
  const ax = HALF_X - CORNER_R;
  const bz = HALF_Z - CORNER_R;
  const P = Math.PI;
  line(0, -HALF_Z, ax, -HALF_Z);
  arc(ax, -bz, -P / 2, 0);
  line(HALF_X, -bz, HALF_X, bz);
  arc(ax, bz, 0, P / 2);
  line(ax, HALF_Z, -ax, HALF_Z);
  arc(-ax, bz, P / 2, P);
  line(-HALF_X, bz, -HALF_X, -bz);
  arc(-ax, -bz, P, (3 * P) / 2);
  line(-ax, -HALF_Z, 0, -HALF_Z);
  return { pts, corners };
}

function tangentAt(pts, i) {
  const n = pts.length;
  const a = pts[(i - 1 + n) % n];
  const b = pts[(i + 1) % n];
  const tx = b.x - a.x;
  const tz = b.z - a.z;
  const l = Math.hypot(tx, tz) || 1;
  return { dx: tx / l, dz: tz / l };
}

function buildGates(pts) {
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const L = cum[n - 1] + dist(pts[n - 1], pts[0]);
  const idx = [0];
  for (let k = 1; k < GATE_COUNT; k++) {
    const target = (k * L) / GATE_COUNT;
    let best = -1;
    let bestD = Infinity;
    for (let i = 1; i < n; i++) {
      const d = Math.abs(cum[i] - target);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best > idx[idx.length - 1]) idx.push(best);
  }
  return idx.map((i) => {
    const t = tangentAt(pts, i);
    return f({ x: pts[i].x, z: pts[i].z, dx: t.dx, dz: t.dz, halfWidth: FENCE_HALF + 2 });
  });
}

const course = buildCourse();

export const TRACK = f({
  waypoints: f(course.pts.map((p) => f(p))),
  roadHalfWidth: ROAD_HALF,
  fenceHalfWidth: FENCE_HALF,
  playerStart: f({ x: -14, z: -HALF_Z + 3.5, heading: Math.PI / 2 }),
  rivalStart: f({ x: -14, z: -HALF_Z - 3.5, heading: Math.PI / 2 }),
  gates: f(buildGates(course.pts)),
  boostPads: f([
    f({ x: HALF_X, z: 0, radius: 3.5 }),
    f({ x: 20, z: HALF_Z, radius: 3.5 }),
    f({ x: -HALF_X, z: 0, radius: 3.5 }),
  ]),
  corners: f(course.corners),
  bounds: f({
    minX: -HALF_X - FENCE_HALF, maxX: HALF_X + FENCE_HALF,
    minZ: -HALF_Z - FENCE_HALF, maxZ: HALF_Z + FENCE_HALF,
  }),
});

/** 中心線（閉ループ）への最近点 */
export function nearestOnCenterline(track, x, z) {
  const w = track.waypoints;
  const n = w.length;
  let best = null;
  let arcAcc = 0;
  for (let i = 0; i < n; i++) {
    const a = w[i];
    const b = w[(i + 1) % n];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    const len = Math.sqrt(len2);
    let t = len2 > 0 ? ((x - a.x) * ex + (z - a.z) * ez) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + ex * t;
    const pz = a.z + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.dist) {
      best = {
        dist: d,
        arc: arcAcc + len * t,
        x: px,
        z: pz,
        tx: len > 0 ? ex / len : 1,
        tz: len > 0 ? ez / len : 0,
        segIndex: i,
      };
    }
    arcAcc += len;
  }
  return best;
}

/** 'road' | 'boost' | 'grass' | 'out' */
export function surfaceAt(track, x, z) {
  const d = nearestOnCenterline(track, x, z).dist;
  if (d <= track.roadHalfWidth) {
    for (const p of track.boostPads) {
      if (Math.hypot(x - p.x, z - p.z) <= p.radius) return 'boost';
    }
    return 'road';
  }
  if (d <= track.fenceHalfWidth) return 'grass';
  return 'out';
}

/** 柵の外に出た kart を柵の位置まで押し戻し、減速させる（新しい kart を返す） */
export function clampToFence(track, kart) {
  const n = nearestOnCenterline(track, kart.x, kart.z);
  if (!(n.dist > track.fenceHalfWidth)) return { ...kart };
  const nx = (kart.x - n.x) / n.dist;
  const nz = (kart.z - n.z) / n.dist;
  return {
    ...kart,
    x: n.x + nx * track.fenceHalfWidth,
    z: n.z + nz * track.fenceHalfWidth,
    speed: kart.speed * 0.5,
  };
}
