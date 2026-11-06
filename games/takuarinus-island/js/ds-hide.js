// 真っ暗ソウルの隠れ場所と、隠れている間の入力の止め方（three.js・DOM・Web Audio に依存しない）。
// 隠れている間は敵に見つからない（隠れるところを見られた場合だけ見つかる。判定は ds-stalker-ai.js）。
import { roomAt } from './ds-map.js';

const f = Object.freeze;

/** 隠れ場所に入れる距離 */
export const HIDE_RANGE = 1.1;
/** 隠れている間に首を回せる幅（ラジアン） */
export const PEEK_RANGE = 0.75;

// x,z は外で立つ位置（出るとここへ戻る）、inside は隠れている目の位置、eye は目の高さ
// view は隙間の見え方（slats: 戸の板の隙間 / under: ベッドの下 / curtain: カーテンの端 / gap: 物の陰）
const S = (id, name, kind, view, x, z, ix, iz, eye) => f({
  id,
  name,
  kind,
  view,
  room: roomAt(x, z),
  x,
  z,
  inside: f({ x: ix, z: iz }),
  eye,
  peekYaw: Math.atan2(x - ix, z - iz),
});

export const HIDE_SPOTS = f([
  S('kids-wardrobe', '衣装だんす', 'wardrobe', 'slats', -1.8, 2.9, -2.28, 2.9, 1.5),
  S('kids-bed', 'ベッドの下', 'bed', 'under', 2.0, 8.3, 3.3, 8.3, 0.14),
  S('study-curtain', 'カーテンの裏', 'curtain', 'curtain', -4.7, 8.5, -4.2, 8.5, 1.5),
  S('kitchen-cupboard', '食器棚の下の戸棚', 'cupboard', 'gap', 7.1, 8.8, 6.62, 8.8, 0.55),
  S('hall-curtain', '廊下のカーテンの裏', 'curtain', 'curtain', -3.5, -1.25, -3.5, -1.82, 1.5),
  S('hall-coats', 'コート掛けの陰', 'coats', 'curtain', 7.5, -1.25, 7.5, -1.8, 1.45),
  S('cellar-crates', '木箱の陰', 'crates', 'gap', -4.75, -9.7, -4.75, -11.75, 0.98),
]);

export function hideSpotById(id) {
  return HIDE_SPOTS.find((s) => s.id === id) || null;
}

/** いちばん近い隠れ場所（range 以内）。地下室の隠れ場所は扉が開いてから */
export function nearestHideSpot(pos, range = HIDE_RANGE, { basementOpen = true } = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  let best = null;
  let bd = Infinity;
  for (const s of HIDE_SPOTS) {
    if (s.room === 'basement' && !basementOpen) continue;
    const d = Math.hypot(pos.x - s.x, pos.z - s.z);
    if (d <= range && d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export function createHideState() {
  return { spotId: null, seen: false, t: 0 };
}

/** 隠れる。seen は隠れるところを見られたか。隠れたら true */
export function enterHide(h, spot, seen = false) {
  if (!h || !spot || h.spotId) return false;
  h.spotId = spot.id;
  h.seen = !!seen;
  h.t = 0;
  return true;
}

/** 出る。出る位置 {x,z} を返す（隠れていなければ null） */
export function exitHide(h) {
  if (!h || !h.spotId) return null;
  const s = hideSpotById(h.spotId);
  h.spotId = null;
  h.seen = false;
  h.t = 0;
  return s ? { x: s.x, z: s.z } : null;
}

/** 隠れている間の向きを隙間の方向のまわりに収める */
export function clampPeekYaw(spot, yaw) {
  if (!spot) return yaw;
  const y = Number.isFinite(yaw) ? yaw : spot.peekYaw;
  const d = Math.atan2(Math.sin(y - spot.peekYaw), Math.cos(y - spot.peekYaw));
  return spot.peekYaw + Math.max(-PEEK_RANGE, Math.min(PEEK_RANGE, d));
}

/** 入力を包む。blocked(code) が真のキーは押されていないことにする */
export function gateInput(input, blocked) {
  if (!input || typeof input !== 'object') return input;
  const ok = (c) => {
    try {
      return !blocked(c);
    } catch {
      return true;
    }
  };
  return new Proxy(input, {
    get(t, k) {
      if ((k === 'isDown' || k === 'wasPressed') && typeof t[k] === 'function') {
        return (...codes) => {
          const list = codes.filter(ok);
          return list.length ? !!t[k].apply(t, list) : false;
        };
      }
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
