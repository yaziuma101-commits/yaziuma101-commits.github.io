// 怪獣大決戦のカメラの規則（three.js・DOM・Web Audio に依存しない）。
// 二体を結ぶ線に対して横から見る（左にヌス、右にメガネ星人）。やや低い位置から見上げ、
// 二体が離れると引き、近づくと寄って、常に両方が画面に入る。カメラは主人公の向きには従わない。
// 座標：向き a のカメラは、二体の真ん中から (sin a, cos a) の方向へ back だけ離れた所にいる。
import { MAX_DT } from './kj-rules.js';

const f = Object.freeze;

/**
 * minBack / maxBack: 二体の真ん中からの距離の範囲、margin: 体の幅のぶんの余白、fill: 横の画角の使い方、
 * height / heightPerBack: カメラの高さ、lookY / lookYPerBack: 見る高さ（カメラより高い＝見上げる）、
 * outRate / inRate: 引く・寄る速さ、angleRate: 回り込む速さ、holdDist: これより近いと角度を保つ
 */
export const SIDE_CAM = f({
  minBack: 46,
  maxBack: 180,
  margin: 14,
  fill: 0.88,
  height: 6,
  heightPerBack: 0.03,
  lookY: 14,
  lookYPerBack: 0.02,
  outRate: 5,
  inRate: 2,
  posRate: 3.5,
  angleRate: 2.5,
  holdDist: 2,
  fallbackDist: 30,
  fov: 60,
  aspect: 4 / 3,
  fadeOpacity: 0.3,
  occludePad: 4,
});

const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const stepDt = (dt) => {
  const d = Number(dt);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_DT) : 0;
};
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** 縦と横の画角の半分（ラジアン） */
export function halfFovs({ fov = SIDE_CAM.fov, aspect = SIDE_CAM.aspect } = {}) {
  const v = (num(fov, SIDE_CAM.fov) * Math.PI) / 360;
  const asp = num(aspect, SIDE_CAM.aspect) > 0 ? num(aspect, SIDE_CAM.aspect) : SIDE_CAM.aspect;
  return { v, h: Math.atan(Math.tan(v) * asp) };
}

/** 二体の距離 → 両方が入るカメラの距離（離れるほど引く） */
export function requiredBack(dist, opts = {}) {
  const { h } = halfFovs(opts);
  const need = (Math.max(0, num(dist)) / 2 + SIDE_CAM.margin) / Math.tan(h * SIDE_CAM.fill);
  return Math.max(SIDE_CAM.minBack, Math.min(SIDE_CAM.maxBack, need));
}

/** 目標の向き・距離・真ん中。foe が無ければ主人公の前方に置いて考える */
export function sideCamTarget(hero, foe, opts = {}) {
  const hx = num(hero && hero.x);
  const hz = num(hero && hero.z);
  let fx;
  let fz;
  if (foe && Number.isFinite(Number(foe.x)) && Number.isFinite(Number(foe.z))) {
    fx = Number(foe.x);
    fz = Number(foe.z);
  } else {
    const hd = num(opts.heading);
    fx = hx + Math.sin(hd) * SIDE_CAM.fallbackDist;
    fz = hz + Math.cos(hd) * SIDE_CAM.fallbackDist;
  }
  const dx = fx - hx;
  const dz = fz - hz;
  const dist = Math.hypot(dx, dz);
  let ux;
  let uz;
  if (dist > 1e-6) {
    ux = dx / dist;
    uz = dz / dist;
  } else {
    const hd = num(opts.heading);
    ux = Math.sin(hd);
    uz = Math.cos(hd);
  }
  // カメラの右が「ヌス → メガネ星人」になる側から見る
  const nx = -uz;
  const nz = ux;
  return {
    angle: Math.atan2(nx, nz),
    back: requiredBack(dist, opts),
    mx: (hx + fx) / 2,
    mz: (hz + fz) / 2,
    dist,
  };
}

export function createSideCam() {
  return {
    ok: false, angle: 0, back: SIDE_CAM.minBack, mx: 0, mz: 0,
  };
}

/** 1フレーム進める。最初は目標へ一気に合わせ、そのあとはなめらかに追う */
export function stepSideCam(state, hero, foe, dt, opts = {}) {
  const tg = sideCamTarget(hero, foe, opts);
  const s = state && state.ok ? state : null;
  if (!s) {
    return {
      ok: true, angle: tg.angle, back: tg.back, mx: tg.mx, mz: tg.mz,
    };
  }
  const angle = tg.dist < SIDE_CAM.holdDist ? s.angle : tg.angle;
  const d = stepDt(dt);
  const ka = 1 - Math.exp(-SIDE_CAM.angleRate * d);
  const kp = 1 - Math.exp(-SIDE_CAM.posRate * d);
  const kb = 1 - Math.exp(-(tg.back > s.back ? SIDE_CAM.outRate : SIDE_CAM.inRate) * d);
  return {
    ok: true,
    angle: s.angle + angDiff(s.angle, angle) * ka,
    back: s.back + (tg.back - s.back) * kb,
    mx: s.mx + (tg.mx - s.mx) * kp,
    mz: s.mz + (tg.mz - s.mz) * kp,
  };
}

/** カメラの位置と見る点（カメラは見る点より低い＝見上げる） */
export function sideCamPose(state) {
  const s = state && typeof state === 'object' ? state : createSideCam();
  const a = num(s.angle);
  const back = num(s.back, SIDE_CAM.minBack);
  return {
    pos: {
      x: num(s.mx) + Math.sin(a) * back,
      y: SIDE_CAM.height + back * SIDE_CAM.heightPerBack,
      z: num(s.mz) + Math.cos(a) * back,
    },
    look: { x: num(s.mx), y: SIDE_CAM.lookY + back * SIDE_CAM.lookYPerBack, z: num(s.mz) },
  };
}

/** カメラの前・右・上（three.js の lookAt と同じ向き） */
export function sideCamBasis(pose) {
  let fx = pose.look.x - pose.pos.x;
  let fy = pose.look.y - pose.pos.y;
  let fz = pose.look.z - pose.pos.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ry = 0;
  const u = {
    x: ry * fz - rz * fy,
    y: rz * fx - rx * fz,
    z: rx * fy - ry * fx,
  };
  return { f: { x: fx, y: fy, z: fz }, r: { x: rx, y: ry, z: rz }, u };
}

/** 点が画面のどこに見えるか（x・y は画角の正接の比。depth は前方への距離） */
export function projectSideCam(pose, p) {
  const { f: F, r: R, u: U } = sideCamBasis(pose);
  const dx = num(p && p.x) - pose.pos.x;
  const dy = num(p && p.y) - pose.pos.y;
  const dz = num(p && p.z) - pose.pos.z;
  const depth = dx * F.x + dy * F.y + dz * F.z;
  const x = dx * R.x + dy * R.y + dz * R.z;
  const y = dx * U.x + dy * U.y + dz * U.z;
  return { x: depth > 0 ? x / depth : NaN, y: depth > 0 ? y / depth : NaN, depth };
}

/** カメラと二体の間にあって、二体を隠しそうな建物の id（崩れた建物は除く） */
export function sideCamOccluders(state, buildings, hero, foe) {
  const pose = sideCamPose(state);
  const a = num(state && state.angle);
  const fhx = -Math.sin(a);
  const fhz = -Math.cos(a);
  const rhx = Math.cos(a);
  const rhz = -Math.sin(a);
  const view = (p) => {
    const dx = num(p && p.x) - pose.pos.x;
    const dz = num(p && p.z) - pose.pos.z;
    return { dep: dx * fhx + dz * fhz, lat: dx * rhx + dz * rhz };
  };
  const subs = [hero, foe].filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z))).map(view);
  if (!subs.length) return [];
  const minDep = Math.min(...subs.map((s) => s.dep));
  const meanDep = subs.reduce((t, s) => t + s.dep, 0) / subs.length;
  if (!(meanDep > 0)) return [];
  const loLat = Math.min(...subs.map((s) => s.lat));
  const hiLat = Math.max(...subs.map((s) => s.lat));
  const pad = SIDE_CAM.occludePad;
  const out = [];
  for (const b of Array.isArray(buildings) ? buildings : []) {
    if (!b || b.collapsed) continue;
    const v = view(b);
    if (v.dep <= 0 || v.dep >= minDep - pad) continue;
    const k = v.dep / meanDep;
    const r = Math.max(0, num(b.radius));
    if (v.lat >= loLat * k - r - pad && v.lat <= hiLat * k + r + pad) out.push(b.id);
  }
  return out;
}
