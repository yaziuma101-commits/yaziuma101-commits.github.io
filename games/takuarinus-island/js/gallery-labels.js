// 絵画の館の「近づいたときに画面に重ねて出す文字」の規則（three.js・DOM に依存しない）。
// 3D の中に文字を描くと内部解像度（320×240）でつぶれるので、題名・行き先・案内は HTML で重ねる。
import { paintingById, isEnterable, drawingUrl } from './gallery-data.js';
import { resolveDestination } from './game-catalog.js';

/** 入口の絵の題名・行き先を出す距離 */
export const ENTRANCE_LABEL_RANGE = 3.5;
/** 飾りの絵の題名を出す距離 */
export const DECOR_LABEL_RANGE = 3;
/** 3D に残す看板の文字テクスチャの最小の横幅（px） */
export const MIN_LABEL_TEXTURE = 512;

/**
 * 3D の看板の文字を描く canvas の大きさ。縦横比を保ち、横幅は min 以上（整数倍で拡大）。
 */
export function crispCanvasSize(w, h, min = MIN_LABEL_TEXTURE) {
  const W = Number(w) > 0 ? Number(w) : 256;
  const H = Number(h) > 0 ? Number(h) : 64;
  const m = Number(min) > 0 ? Number(min) : MIN_LABEL_TEXTURE;
  const scale = Math.max(2, Math.ceil(m / W));
  return { width: Math.round(W * scale), height: Math.round(H * scale), scale };
}

/**
 * 1枚の絵の表示内容。範囲外・未知は null。
 * 返り値 {id, kind:'entrance'|'decor', title, sub, hint, dark}
 */
export function paintingLabel(id, distance, { readyRooms = {} } = {}) {
  const d = Number(distance);
  if (!Number.isFinite(d) || d < 0) return null;
  const p = paintingById(id);
  if (!p) return null;
  if (isEnterable(id)) {
    if (d > ENTRANCE_LABEL_RANGE) return null;
    const dest = resolveDestination(id, readyRooms || {});
    if (!dest) return null;
    return {
      id,
      kind: 'entrance',
      title: dest.title,
      sub: dest.kind === 'construction' ? '行き先：工事中の部屋（ただいま準備中）' : '行き先：ゲームの部屋',
      hint: 'Space：絵に向かってジャンプすると飛び込める',
      dark: !!p.darkenOnApproach,
    };
  }
  if (d > DECOR_LABEL_RANGE) return null;
  return {
    id,
    kind: 'decor',
    title: p.title,
    sub: '飾りの絵（飛び込めない）',
    hint: '',
    dark: false,
  };
}

/** 札に一緒に出す絵の元ファイル（未知の絵は null） */
export function labelImageUrl(id) {
  const p = paintingById(id);
  return p && p.file ? drawingUrl(p.file) : null;
}

let presenter = null;

/** 札が決まるたびに呼ぶ関数（label, 絵の url）を登録する。null で解除 */
export function setLabelPresenter(fn) {
  presenter = typeof fn === 'function' ? fn : null;
}

function presentLabel(label) {
  if (presenter) {
    try {
      presenter(label, label ? labelImageUrl(label.id) : null);
    } catch {
      // 表示に失敗しても館は止めない
    }
  }
  return label;
}

/** いちばん近い絵の表示内容。slots は {id,x,z} の配列。何も無ければ null */
export function nearestLabel(pos, slots, opts = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return presentLabel(null);
  let best = null;
  let bestD = Infinity;
  for (const s of Array.isArray(slots) ? slots : []) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const d = Math.hypot(pos.x - s.x, pos.z - s.z);
    if (d >= bestD) continue;
    const l = paintingLabel(s.id, d, opts);
    if (!l) continue;
    best = l;
    bestD = d;
  }
  return presentLabel(best);
}
