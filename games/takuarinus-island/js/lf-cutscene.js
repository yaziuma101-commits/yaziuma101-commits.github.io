// 試合の前後の会話の演出（映画の一場面のような見せ方と漫画のコマ割り）の規則。
// three.js・DOM・Web Audio に依存しない。台詞は真剣・オリジナル（擬音は出さない）。
import { poseFor, bodyFor, LF_POSE_STATES } from './lf-pose.js';

const f = Object.freeze;

export const LF_CUTSCENE_KINDS = f(['pre', 'win', 'lose']);
export const LF_CUTSCENE_SPEAKERS = f({ hero: 'タクアリヌス', foe: 'ムキムキヌス' });
export const SHOT_KINDS = f(['heroFace', 'foeFace', 'foeFist', 'twoShot', 'feetDust', 'sunset']);
export const CUTSCENE_MIN_PANELS = 3;
export const CUTSCENE_MAX_PANELS = 5;

function panel(kind, o = {}) {
  return f({
    shot: f({
      kind, move: o.move || 'push', pan: Number.isFinite(o.pan) ? o.pan : 1.2, drop: o.drop || 0,
    }),
    speaker: o.speaker || null,
    text: o.text || null,
    sec: o.sec || 4,
    pose: f({ hero: o.hero || 'idle', foe: o.foe || 'idle' }),
    say: f({ at: o.at || 'top', side: o.side || 'l' }),
  });
}

/** 演出の台本。コマ（shot: カメラの角度、speaker: 話す人、text: 台詞、sec: 自動で次へ進む秒数） */
export const CUTSCENES = f({
  pre: f([
    panel('sunset', { move: 'rise', text: '夕暮れの屋上。風が止んだ。', sec: 3.5 }),
    panel('foeFace', {
      speaker: 'foe', text: '……来たか。その髪、伊達じゃねえだろうな', sec: 4.5, side: 'l',
    }),
    panel('feetDust', { move: 'pan', pan: 1.4, sec: 3 }),
    panel('heroFace', {
      speaker: 'hero', text: '確かめてみろ', sec: 3.5, side: 'r', at: 'bottom',
    }),
    panel('foeFist', {
      speaker: 'foe', text: '技は拳で覚えろ。言葉じゃ教えねえ', sec: 4.5, side: 'l', at: 'bottom',
    }),
  ]),
  win: f([
    panel('foeFace', {
      speaker: 'foe', text: '……見事だ。お前の拳、確かに届いた', sec: 4.5, foe: 'kneel', drop: 0.27,
    }),
    panel('heroFace', {
      speaker: 'hero', text: '……', sec: 3.5, hero: 'nod', foe: 'kneel', side: 'r',
    }),
    panel('twoShot', {
      speaker: 'foe', text: '次に会うときは、俺も今より強い', move: 'pan', pan: 1.6, sec: 4.5,
    }),
    panel('sunset', {
      move: 'rise', text: '夕日の中、二人の影が長く伸びていた。', sec: 4, at: 'bottom',
    }),
  ]),
  lose: f([
    panel('heroFace', {
      speaker: 'hero', text: '……っ', sec: 3.5, hero: 'kneel', drop: 0.27, side: 'r',
    }),
    panel('foeFist', {
      speaker: 'foe', text: 'まだ甘い。', sec: 3.5, hero: 'kneel', side: 'l', at: 'bottom',
    }),
    panel('twoShot', {
      speaker: 'foe', text: '技は逃げねえ。探し続けろ', move: 'pan', pan: 1.6, sec: 4.5, hero: 'kneel',
    }),
    panel('foeFace', {
      speaker: 'foe', text: '立て。何度でも来い', sec: 4.5, hero: 'kneel',
    }),
  ]),
});

/** コマ割り（枠の中の %。0〜100）。並び順がコマの現れる順 */
const LAYOUTS = f({
  3: f([
    f([[0, 0], [100, 0], [100, 44], [0, 52]]),
    f([[0, 55], [47, 54], [41, 100], [0, 100]]),
    f([[50, 53.5], [100, 47], [100, 100], [44, 100]]),
  ]),
  4: f([
    f([[0, 0], [58, 0], [52, 46], [0, 46]]),
    f([[61, 0], [100, 0], [100, 46], [55, 46]]),
    f([[0, 49], [64, 49], [60, 100], [0, 100]]),
    f([[67, 49], [100, 49], [100, 100], [63, 100]]),
  ]),
  5: f([
    f([[0, 0], [36, 0], [32, 40], [0, 40]]),
    f([[39, 0], [100, 0], [100, 40], [35, 40]]),
    f([[0, 43], [100, 43], [100, 58], [0, 63]]),
    f([[0, 66.5], [48, 62.5], [44, 100], [0, 100]]),
    f([[51, 62.5], [100, 61.5], [100, 100], [47, 100]]),
  ]),
});

export function layoutFor(n) {
  const k = Math.max(CUTSCENE_MIN_PANELS, Math.min(CUTSCENE_MAX_PANELS, Math.floor(Number(n) || 0)));
  return LAYOUTS[k];
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/** コマの多角形 → 外接の箱（枠の %）と、箱に対する clip-path */
export function panelBox(poly) {
  const pts = Array.isArray(poly) && poly.length ? poly : [[0, 0], [100, 0], [100, 100], [0, 100]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(1e-6, Math.max(...xs) - x);
  const h = Math.max(1e-6, Math.max(...ys) - y);
  const points = pts.map(([px, py]) => [r3(((px - x) / w) * 100), r3(((py - y) / h) * 100)]);
  return {
    x: r3(x), y: r3(y), w: r3(w), h: r3(h), points, clip: `polygon(${points.map(([a, b]) => `${a}% ${b}%`).join(', ')})`,
  };
}

export function createCutscene(kind = 'pre') {
  const k = LF_CUTSCENE_KINDS.includes(kind) ? kind : 'pre';
  const panels = CUTSCENES[k];
  return {
    kind: k, panels, layout: layoutFor(panels.length), index: 0, t: 0, total: 0, done: false, skipped: false,
  };
}

export function currentPanel(cs) {
  return cs && Array.isArray(cs.panels) ? cs.panels[cs.index] || null : null;
}

/** 次のコマへ（最後のコマなら終わり）。新しいオブジェクトを返す */
export function advanceCutscene(cs) {
  if (!cs || cs.done) return cs;
  if (cs.index >= cs.panels.length - 1) return { ...cs, done: true };
  return { ...cs, index: cs.index + 1, t: 0 };
}

/** 演出を飛ばす */
export function skipCutscene(cs) {
  if (!cs || cs.done) return cs;
  return { ...cs, done: true, skipped: true };
}

/** 時間を進める。コマの秒数を過ぎたら自動で次へ */
export function stepCutscene(cs, dt) {
  if (!cs || cs.done) return cs;
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const p = currentPanel(cs);
  const t = cs.t + d;
  const total = cs.total + d;
  if (p && t >= p.sec) return { ...advanceCutscene(cs), total };
  return { ...cs, t, total };
}

/** 1フレームの操作（Esc: 飛ばす、Enter/Space: 次へ、何もなければ時間を進める） */
export function cutsceneControl(cs, { next = false, skip = false } = {}, dt = 0) {
  if (!cs || cs.done) return cs;
  if (skip) return skipCutscene(cs);
  if (next) return advanceCutscene(cs);
  return stepCutscene(cs, dt);
}

/** 演出の長さ（秒） */
export function cutsceneDuration(kind) {
  const list = CUTSCENES[kind] || [];
  return list.reduce((s, p) => s + p.sec, 0);
}

/** 試合の勝者 → 試合後の演出の種類 */
export function cutsceneKindFor(winner) {
  return winner === 'player' ? 'win' : 'lose';
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : d);
const vec = (x, y, z) => ({ x, y, z });
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const BASE_SHOTS = {
  heroFace: (a, drop) => {
    const dy = a.hh * drop;
    return { pos: vec(a.hx + 1.0, a.hh * 0.64 - dy, 1.45), look: vec(a.hx + 0.05, a.hh * 0.62 - dy, 0), fov: 34 };
  },
  foeFace: (a, drop) => {
    const dy = a.fh * drop;
    return { pos: vec(a.fx - 1.0, a.fh * 0.9 - dy, 1.5), look: vec(a.fx - 0.05, a.fh * 0.89 - dy, 0), fov: 34 };
  },
  foeFist: (a) => ({ pos: vec(a.fx - 0.95, a.fh * 0.76, 1.05), look: vec(a.fx - 0.35, a.fh * 0.74, 0.1), fov: 34 }),
  twoShot: (a) => ({ pos: vec(a.mid, 1.0, 7.4), look: vec(a.mid - 0.4, 1.35, 0), fov: 48 }),
  feetDust: (a) => ({ pos: vec(a.mid, 0.22, 3.0), look: vec(a.mid, 0.18, 0), fov: 46 }),
  sunset: (a) => ({ pos: vec(a.mid + 2.2, 0.7, 8.5), look: vec(a.mid - 8, 3.2, -40), fov: 52 }),
};

/**
 * コマのカメラ。shot: {kind, move:'push'|'pan'|'rise', pan, drop}、k: コマの進み（0..1）、
 * actors: {hero:{x,h}, foe:{x,h}}。返り値 {pos, look, fov}
 */
export function shotCamera(shot, k = 0, actors = {}) {
  const s = shot && typeof shot === 'object' ? shot : { kind: 'twoShot' };
  const hero = (actors && actors.hero) || {};
  const foe = (actors && actors.foe) || {};
  const a = {
    hx: num(hero.x, -2), fx: num(foe.x, 2), hh: num(hero.h, 1.7), fh: num(foe.h, 2.0),
  };
  a.mid = (a.hx + a.fx) / 2;
  const make = Object.prototype.hasOwnProperty.call(BASE_SHOTS, s.kind) ? BASE_SHOTS[s.kind] : BASE_SHOTS.twoShot;
  const b = make(a, clamp01(s.drop));
  const kk = clamp01(k);
  const e = kk * kk * (3 - 2 * kk);
  const move = s.move || 'push';
  if (move === 'push') {
    const m = 1 - 0.18 * e;
    b.pos = vec(b.look.x + (b.pos.x - b.look.x) * m, b.look.y + (b.pos.y - b.look.y) * m, b.look.z + (b.pos.z - b.look.z) * m);
  } else if (move === 'pan') {
    const p = num(s.pan, 1.2);
    b.pos.x += (e - 0.5) * p;
    b.look.x += (e - 0.5) * p * 0.6;
  } else if (move === 'rise') {
    b.pos.y += e * 0.5;
    b.look.y += e * 1.5;
  }
  return b;
}

/** 演出の中の姿勢。'nod'（うなずく）・'kneel'（片ひざ）と、lf-pose の状態 */
export function cinemaPoseFor(state, t = 0, who = 'hero') {
  const tt = Number.isFinite(t) ? t : 0;
  if (state === 'nod') {
    const table = poseFor('idle', tt, who);
    const n = Math.max(0, Math.sin(tt * 2.2)) * 0.4;
    table.head = { ...table.head, x: table.head.x + n };
    return { state: 'idle', table, body: bodyFor('idle', tt) };
  }
  if (state === 'kneel') {
    const table = poseFor('crouch', tt, who);
    table.spine = { ...table.spine, x: table.spine.x + 0.25 };
    table.head = { ...table.head, x: table.head.x + 0.35 };
    table.armR = { x: 0.3, y: 0, z: 0.25 };
    table.foreR = { x: 0.3, y: 0, z: 0 };
    table.armL = { x: 0.2, y: 0, z: 0.3 };
    table.foreL = { x: 0.3, y: 0, z: 0 };
    return { state: 'crouch', table, body: { dy: -0.27, tilt: 0, spin: 0 } };
  }
  const s = LF_POSE_STATES.includes(state) ? state : 'idle';
  return { state: s, table: poseFor(s, tt, who), body: bodyFor(s, tt) };
}
