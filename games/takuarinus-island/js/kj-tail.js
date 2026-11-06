// 怪獣大決戦の「しっぽ」の規則（three.js・DOM・Web Audio に依存しない）。
// 腰から生える数個の節（根元が太く先が細い）。歩くと左右に揺れ、しっぽ攻撃で体ごと大きく振られる。
// しっぽ攻撃の当たり判定は、しっぽの先（先端と、その手前の関節）の位置で取る。
// 座標：体の前が +z、しっぽは体の後ろ（-z）へ伸びる。向き h の回転は three.js の rotation.y と同じ。
import { gaitPhase } from './kj-motion.js';
import { swingPose, followPose, WINDUP_END } from './kj-swing.js';
import { FULL_P } from './kj-rules.js';

const f = Object.freeze;

/** 節の数 */
export const TAIL_SEGMENTS = 5;
/**
 * しっぽの形（体の高さに対する比）。hipY: 付け根の高さ、back: 付け根の後ろへの出、length: 全長、
 * r0/r1: 根元と先の太さ、taper: 節の長さの縮み、droop: 付け根の垂れ下がり（ラジアン）、bend: 節ごとの反り上がり
 */
export const TAIL_SHAPES = f({
  hero: f({
    hipY: 0.36, back: 0.12, length: 0.85, r0: 0.11, r1: 0.022, taper: 0.8, droop: -0.5, bend: 0.07,
  }),
  alien: f({
    hipY: 0.42, back: 0.05, length: 0.7, r0: 0.045, r1: 0.01, taper: 0.82, droop: -0.72, bend: 0.08,
  }),
});
/** 歩くときの揺れ（根元・節・節ごとの遅れ） */
export const TAIL_WAG = f({ root: 0.22, seg: 0.12, lag: 0.7 });
/** 止まっていてもゆっくり揺れる */
export const TAIL_IDLE = f({ yaw: 0.07, sec: 4.6 });
/** しっぽ攻撃：振り抜くときのしなり（節ごと）、構えで反対へ引く量、持ち上がり */
export const TAIL_LASH = 0.3;
export const TAIL_COCK = 0.12;
export const TAIL_LIFT = 0.45;
/** しっぽの先の当たりの半径と、当たりを取る点の数（先端から数えて） */
export const TAIL_TIP_RADIUS = 6;
export const TAIL_TIP_POINTS = 3;
/** 振っている最中に先が触れた建物へのダメージ（毎秒） */
export const TAIL_SWEEP_DPS = 25;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp01 = (v) => Math.max(0, Math.min(1, num(v)));
const smooth = (x) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const lerp = (a, b, x) => a + (b - a) * x;

/** 体の高さ → しっぽの寸法（節ごとの長さと太さ） */
export function tailDims(height, shape = 'hero') {
  const sh = (typeof shape === 'string' ? TAIL_SHAPES[shape] : shape) || TAIL_SHAPES.hero;
  const hn = Number(height);
  const H = Number.isFinite(hn) && hn > 0 ? hn : 1;
  const total = sh.length * H;
  const w = [];
  let k = 1;
  let sum = 0;
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    w.push(k);
    sum += k;
    k *= sh.taper;
  }
  let at = 0;
  const segments = w.map((wi) => {
    const len = (total * wi) / sum;
    const s = {
      len,
      r0: lerp(sh.r0, sh.r1, at / total) * H,
      r1: lerp(sh.r0, sh.r1, Math.min(1, (at + len) / total)) * H,
    };
    at += len;
    return s;
  });
  return {
    height: H, baseY: sh.hipY * H, baseBack: sh.back * H, length: total, droop: sh.droop, bend: sh.bend, segments,
  };
}

/** しっぽ攻撃のしなりと持ち上がり（押している時間の進み具合 p から） */
export function tailLash(p, { returning = false, releasedAt = null } = {}) {
  const W = WINDUP_END.tail;
  const at = (q) => {
    const wind = smooth(q / W);
    const s = smooth((q - W) / (1 - W));
    return {
      lash: TAIL_LASH * Math.sin(Math.PI * s) - TAIL_COCK * wind * (1 - s),
      lift: TAIL_LIFT * Math.sin(Math.PI * s),
    };
  };
  const q = clamp01(p);
  const rel = Number(releasedAt);
  if (returning && Number.isFinite(rel) && rel > W && q < rel) {
    const b = at(rel);
    const k = smooth(q / rel);
    return { lash: b.lash * k + 0, lift: b.lift * k + 0 };
  }
  const r = at(q);
  return { lash: r.lash + 0, lift: r.lift + 0 };
}

/** 振っている最中（構えが終わって、伸び切る前） */
export function tailSweeping(p, pressed) {
  const q = num(p);
  return !!pressed && q > WINDUP_END.tail && q < FULL_P;
}

/**
 * 体のひねり（しっぽは体と一緒に回る）と、しっぽのしなり・持ち上がり。
 * kind はいま進んでいる動作（punch / kick / tail か null）。follow は振り抜いた後の体の流れ
 */
export function tailSwingState({
  kind = null, p = 0, pressed = true, releasedAt = null, follow = null,
} = {}) {
  let twist = 0;
  let lash = 0;
  let lift = 0;
  if (kind && WINDUP_END[kind] !== undefined) {
    const opts = { returning: !pressed, releasedAt };
    twist += swingPose(kind, p, opts).twist;
    if (kind === 'tail') {
      const l = tailLash(p, opts);
      lash = l.lash;
      lift = l.lift;
    }
  }
  if (follow) twist += followPose(follow).twist;
  return { twist: twist + 0, lash: lash + 0, lift: lift + 0 };
}

/** しっぽの姿勢。{twist（付け根ごと回る角度）, yaws（節ごとの左右）, pitches（節ごとの上下）} */
export function tailPose({
  walked = 0, t = 0, gait = 0, idle = 1, twist = 0, lash = 0, lift = 0, offset = 0,
} = {}, dims = null) {
  const d = dims || tailDims(1);
  const ph = gaitPhase(walked);
  const g = clamp01(gait);
  const iw = clamp01(idle);
  const tt = num(t);
  const o = num(offset);
  const yaws = [];
  const pitches = [];
  for (let i = 0; i < d.segments.length; i++) {
    const wag = (i === 0 ? TAIL_WAG.root : TAIL_WAG.seg) * g * -Math.sin(ph - i * TAIL_WAG.lag);
    const sway = TAIL_IDLE.yaw * iw * Math.sin((2 * Math.PI * tt) / TAIL_IDLE.sec + o - i * 0.5) * (i === 0 ? 1 : 0.6);
    yaws.push(wag + sway + (i === 0 ? 0 : num(lash)) + 0);
    pitches.push((i === 0 ? d.droop + num(lift) : d.bend) + 0);
  }
  return { twist: num(twist), yaws, pitches };
}

// ---- 3×3 の回転（three.js の makeRotationY / makeRotationX と同じ向き） ----
const rotY = (a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotX = (a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const mulM = (A, B) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  }
  return o;
};
const mulV = (M, v) => [
  M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
  M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
  M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
];

/**
 * 体の足元を原点とした、しっぽの付け根と各関節の位置（最後が先端）。
 * 場面の組み方と同じ：付け根ごと twist で回り、各節は自分の位置で上下（X）してから左右（Y）に回る（YXZ）
 */
export function tailPoints(dims, pose) {
  const d = dims || tailDims(1);
  const p = pose || tailPose({}, d);
  let M = rotY(num(p.twist));
  let pos = mulV(M, [0, d.baseY, -d.baseBack]);
  const out = [{ x: pos[0], y: pos[1], z: pos[2] }];
  d.segments.forEach((s, i) => {
    M = mulM(mulM(M, rotY(num(p.yaws && p.yaws[i]))), rotX(num(p.pitches && p.pitches[i])));
    const v = mulV(M, [0, 0, -s.len]);
    pos = [pos[0] + v[0], pos[1] + v[1], pos[2] + v[2]];
    out.push({ x: pos[0], y: pos[1], z: pos[2] });
  });
  return out;
}

/** しっぽの先端（体の足元を原点とした位置） */
export function tailTip(dims, pose) {
  const pts = tailPoints(dims, pose);
  return pts[pts.length - 1];
}

/** 体の位置 (x, z) と向き heading で、体からの位置をワールドへ */
export function tailToWorld(q, x, z, heading) {
  const h = num(heading);
  const c = Math.cos(h);
  const s = Math.sin(h);
  return {
    x: num(x) + num(q && q.x) * c + num(q && q.z) * s,
    y: num(q && q.y),
    z: num(z) - num(q && q.x) * s + num(q && q.z) * c,
  };
}

/** しっぽの先のほう（先端から TAIL_TIP_POINTS 個の点）が、相手 (tx, tz, 半径 radius) に届くか */
export function tailTipHits(points, tx, tz, radius = 0, reach = TAIL_TIP_RADIUS) {
  const list = Array.isArray(points) ? points.slice(-TAIL_TIP_POINTS) : [];
  const lim = num(reach) + Math.max(0, num(radius));
  return list.some((p) => p && Math.hypot(num(p.x) - num(tx), num(p.z) - num(tz)) <= lim);
}

/** しっぽの先が届く、崩れていない建物 */
export function tailBuildingsHit(buildings, points, reach = TAIL_TIP_RADIUS) {
  const list = Array.isArray(buildings) ? buildings : [];
  return list.filter((b) => b && !b.collapsed && tailTipHits(points, b.x, b.z, b.radius, reach));
}
