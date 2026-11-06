// 絵画の館の絵の一覧と、波打ち・飛び込み・暗さの規則（three.js・DOM に依存しない）
import { PALETTE } from './palette.js';

export const DRAWINGS_DIR = 'textures/drawings/';
export const DECOR_FRAME_COLOR = PALETTE.frameGold;

const E = (id, title, gameId, color, extra = {}) => Object.freeze({
  id,
  file: `${id}.webp`,
  title,
  gameId,
  frame: Object.freeze({ color }),
  darkenOnApproach: false,
  ...extra,
});

/** 入口の絵（飛び込める）。title は絵の題名、ゲーム名は game-catalog にある */
export const ENTRANCE_PAINTINGS = Object.freeze([
  E('deka-atama', 'デカ頭アリヌス', 'mohi-touch', PALETTE.frameDeka),
  E('mohifry', 'モヒフライ', 'blowaway', PALETTE.frameMohifry),
  E('onasu', 'おなすくん', 'super-shogi', PALETTE.mohicanPurple),
  E('sankaku', 'さんかくアリヌス', 'kendama', PALETTE.heroBody),
  E('tabakonus', 'タバコヌス', 'novel-chicken', PALETTE.gatePost),
  E('toufu', 'とうふアリヌス', 'find-file', PALETTE.pedestal),
  E('mukimuki', 'ムキムキヌス', 'lever-fighter', PALETTE.scarf),
  // 真っ暗ソウルの絵だけ額縁は真っ黒（約束どおり 黒＝RGB すべて 0）
  E('neko', 'ねこアリヌス', 'dark-soul', '#'.padEnd(7, '0'), { darkenOnApproach: true }),
  E('megane-seijin', 'メガネ星人', 'kaiju', PALETTE.gunTank),
]);

/** 入口の絵の行き先の種類（ねこアリヌスの絵は真っ暗ソウル、メガネ星人の絵は怪獣大決戦に繋がる） */
export const PAINTING_LINKS = Object.freeze(ENTRANCE_PAINTINGS.map((p) => Object.freeze({
  paintingId: p.id,
  kind: 'game',
  gameId: p.gameId,
})));

const D = (id, title, file = `${id}.webp`) => Object.freeze({ id, file, title });

/** 飾りの絵（飛び込めない。近づくと題名） */
export const DECOR_PAINTINGS = Object.freeze([
  D('tenohira', 'てのひら'),
  D('murasaki', 'むらさき'),
  D('ashidake', 'あしだけ'),
  D('manmaru', 'まんまる'),
  D('neko-kao', 'ねこがお'),
  D('marugao', 'まるがお'), // 依頼者の指定で「ふたつがお」の写真から差し替え（2026-11-04）
  D('tenshi', 'てんし'),
  D('nagamohi', 'ながモヒ'),
  // 新しい絵18枚
  D('mohikan-nukitori', 'モヒカンぬきとり'),
  D('inemuri-kart', 'いねむりカート'),
  D('heya-no-sumi', 'へやのすみ'),
  D('single', 'シングル', 'single.png'),
  D('nakimushi', 'なきむし'),
  D('atama-poripori', 'あたまポリポリ'),
  D('mohikan-motte', 'モヒカンもって'),
  D('akaruku-natta', 'あかるくなった'),
  D('taki', 'たき'),
  D('chibimohi-to', 'ちびモヒと'),
  D('graffiti', 'グラフィティ'),
  D('nakayoshi', 'なかよし'),
  D('trump-card', 'トランプ'),
  D('kinniku-mohi', '筋肉モヒカン', 'kinniku-mohi.jpg'),
  D('double', 'ダブル', 'double.jpg'),
  D('mohikan-chikazuku', 'ちかづくモヒカン'),
  D('sankyoudai', 'さんきょうだい'),
  D('gogo', 'ゴーゴー'),
  // 依頼者が描いた絵16枚（2026-11-04）。文字のある絵は下の段に来る偶数番目に置く
  D('takakute', 'たかくてとどかぬ'),
  D('ougi', 'おうぎ'),
  D('junban', 'てじな', 'junban.png'),
  D('tsukue', 'つくえ'),
  D('kami-nobita', 'かみのびた'),
  D('yoru-no-umi', 'よるのうみ'),
  D('otabe', 'おたべ'),
  D('hikkoshi', 'ひっこし'),
  D('safe', 'セーフ'),
  D('chikarakobu', 'ちからこぶ'),
  D('banzai', 'ばんざい'),
  D('softcream', 'ソフトクリーム'),
  D('mohikan-no-ame', 'モヒカンのあめ'),
  D('korogaru', 'ころがるモヒカン'),
  D('oi', 'おーい'),
  D('yubi', 'ゆび'),
]);

export const DECOR_RANGE = 3;

export function drawingUrl(file) {
  return DRAWINGS_DIR + file;
}

export function paintingById(id) {
  return ENTRANCE_PAINTINGS.find((p) => p.id === id) || DECOR_PAINTINGS.find((p) => p.id === id);
}

export function isEnterable(id) {
  return ENTRANCE_PAINTINGS.some((p) => p.id === id);
}

/** 飾りの絵に近づいたときの題名。範囲外・入口の絵・未知は null */
export function decorTitleAt(id, distance) {
  const p = DECOR_PAINTINGS.find((x) => x.id === id);
  if (!p) return null;
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return null;
  return distance <= DECOR_RANGE ? p.title : null;
}

/** 縦横比を保って maxW×maxH に収める（少なくとも片方は max に一致） */
export function fitFrame(imgW, imgH, maxW, maxH) {
  for (const v of [imgW, imgH, maxW, maxH]) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new RangeError('fitFrame: 正の数が必要です');
  }
  if (maxW / imgW <= maxH / imgH) return { width: maxW, height: (imgH * maxW) / imgW };
  return { width: (imgW * maxH) / imgH, height: maxH };
}

export const RIPPLE_RANGE = 6;

/** 波打ちの強さ。d≤0 で 1、d≥RIPPLE_RANGE で 0、その間は単調に下がる */
export function rippleStrength(d) {
  if (typeof d !== 'number' || Number.isNaN(d)) return 0;
  if (d <= 0) return 1;
  if (d >= RIPPLE_RANGE) return 0;
  const t = 1 - d / RIPPLE_RANGE;
  return t * t * (3 - 2 * t);
}

// ---- 波打ちシェーダー ----
export const RIPPLE_AMPLITUDE = 0.03;
/** 歪みの波: u に sin(v*fy + t*ty)、v に sin(u*fx + t*tx) */
export const RIPPLE_WAVE = Object.freeze({ fy: 18, ty: 3, fx: 14, tx: 2.3 });

/** シェーダーの振幅 uniform に入れる値 */
export function rippleAmplitude(d) {
  return rippleStrength(d) * RIPPLE_AMPLITUDE;
}

/** シェーダーと同じ式で UV を歪める（テスト・確認用） */
export function rippleUv(u, v, time, amp) {
  const W = RIPPLE_WAVE;
  return {
    u: u + amp * Math.sin(v * W.fy + time * W.ty),
    v: v + amp * Math.sin(u * W.fx + time * W.tx),
  };
}

const f1 = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const RIPPLE_VERTEX_SHADER = `
uniform float uTime;
uniform float uAmp;
varying vec2 vUv;
void main() {
  vec2 d = vec2(
    sin(uv.y * ${f1(RIPPLE_WAVE.fy)} + uTime * ${f1(RIPPLE_WAVE.ty)}),
    sin(uv.x * ${f1(RIPPLE_WAVE.fx)} + uTime * ${f1(RIPPLE_WAVE.tx)})
  );
  vUv = uv + d * uAmp;
  vec3 p = position;
  p.z += (d.x + d.y) * uAmp * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const RIPPLE_FRAGMENT_SHADER = `
uniform sampler2D map;
uniform float uHasMap;
uniform float uAmp;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec4 c = uHasMap > 0.5 ? texture2D(map, uv) : vec4(1.0);
  // 明るさは足さない（絵が白く飛ばないように）。波打ちは UV と頂点の揺れだけで表す
  gl_FragColor = vec4(c.rgb * uTint, 1.0);
  #include <colorspace_fragment>
}
`;

export const DIVE_RANGE = 2;

/** 飛び込めるか：入口の絵で、射程内で、空中にいるとき */
export function canDive(paintingId, { distance, airborne } = {}) {
  return isEnterable(paintingId)
    && typeof distance === 'number' && Number.isFinite(distance)
    && distance <= DIVE_RANGE && !!airborne;
}

const DARK_MAX = 0.4;

/** 近づいたときの暗さ（darkenOnApproach の絵だけ） */
export function darknessLevel(paintingId, distance) {
  const p = ENTRANCE_PAINTINGS.find((x) => x.id === paintingId);
  if (!p || !p.darkenOnApproach) return 0;
  return DARK_MAX * rippleStrength(distance);
}

// ---- 飛び込みの画面（白 → 絵の色 → 暗転） ----
export const DIVE_OVERLAY = Object.freeze({ whiteIn: 0.15, toPaint: 0.3, toDark: 0.3 });
export const DIVE_OVERLAY_TIME = DIVE_OVERLAY.whiteIn + DIVE_OVERLAY.toPaint + DIVE_OVERLAY.toDark;

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/** 経過 t 秒の画面の重ね具合。opacity: 全体、paint: 白→絵の色、dark: 暗転 */
export function diveOverlay(t) {
  const O = DIVE_OVERLAY;
  const x = typeof t === 'number' && Number.isFinite(t) ? t : 0;
  return {
    opacity: clamp01(x / O.whiteIn),
    paint: clamp01((x - O.whiteIn) / O.toPaint),
    dark: clamp01((x - O.whiteIn - O.toPaint) / O.toDark),
  };
}

/** 重ねる色 [r,g,b]（0〜255） */
export function overlayRgb(rgb, o) {
  const p = clamp01(o.paint);
  const k = 1 - clamp01(o.dark);
  return [0, 1, 2].map((i) => Math.round((255 * (1 - p) + (rgb[i] ?? 255) * p) * k));
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0')).join('')}`;
}

/** 絵の主な色。白い紙を除いた色の付いた画素の平均（無ければ全体の平均） */
export function dominantRgb(data, { minChroma = 40 } = {}) {
  let cr = 0; let cg = 0; let cb = 0; let cn = 0;
  let ar = 0; let ag = 0; let ab = 0; let an = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    ar += r; ag += g; ab += b; an++;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= minChroma) {
      cr += r; cg += g; cb += b; cn++;
    }
  }
  if (cn > 0) return [Math.round(cr / cn), Math.round(cg / cn), Math.round(cb / cn)];
  if (an > 0) return [Math.round(ar / an), Math.round(ag / an), Math.round(ab / an)];
  return [255, 255, 255];
}
