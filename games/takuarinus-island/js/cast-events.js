// 仲間・キャラクターが起こすふざけた出来事の規則（three.js・DOM・Web Audio に依存しない）。
// 一覧・間隔・スケジューラ・動きの計算。乱数は必ず引数で受け取る。描画は cast-events-fx.js。
import { pick } from './seeded-rng.js';
import { normalizeSillyLevel, DEFAULT_SILLY_LEVEL } from './silly-rules.js';

const f = Object.freeze;

/** 主人公が動きにくくなる（吹っ飛ぶ・浮く・画面が隠れる）時間の上限（秒） */
export const MAX_HOLD_SEC = 2;

const E = (id, cast, sfx, words, duration, hold, label) => f({
  id, cast, sfx: f([...sfx]), words: f([...words]), duration, hold, label,
});

/** 出来事の一覧。cast は cast-defs.js の id、sfx は SILLY_SFX の名前、hold は主人公が邪魔される秒数 */
export const CAST_EVENTS = f([
  E('onasu-scatter', 'onasu', ['duck', 'boing'], ['おなすだぁ〜いすき'], 5, 0,
    'おなすくんが叫んでナスを撒き散らし、ナスが転がる'),
  E('mohifry-fry', 'mohifry', ['crowdWow', 'boing'], ['じゅわーっ', 'アチチ！'], 6, 0,
    'モヒフライが油の鍋に飛び込み、揚がって跳ね回る'),
  E('tofu-tower', 'tofu', ['slideUp', 'zuko'], ['ぐらぐら', 'ドーン！'], 6, 0,
    'とうふアリヌスがとうふを積み上げ、ぐらぐら揺れて崩れる'),
  E('tabako-ring', 'tabako', ['cowbell', 'trumpetFail'], ['20才になってから！'], 7, 0,
    'タバコヌスが煙の輪を吐き、通り抜けると看板が出る'),
  E('tenohira-highfive', 'tenohira', ['duck', 'boing'], ['パチーン！'], 3.5, 0.4,
    'てのひらくんがハイタッチして、主人公が少し吹っ飛ぶ'),
  E('neko-chase', 'neko', ['slideUp', 'duck', 'crowdAww'], ['にゃーん！', 'ぺたっ'], 7, 1.2,
    'ねこアリヌスが追いかけ回し、追いつくと肉球スタンプ'),
  E('nagamohi-bridge', 'nagamohi', ['slideUp', 'slideDown'], ['にょろ〜ん'], 6.5, 0,
    'ながモヒが島を横切り、長い体が橋のように並ぶ'),
  E('megane-ufo', 'megane', ['slideUp', 'slideDown'], ['ふわ〜'], 5, 1.8,
    'メガネ星人の UFO の光で主人公がふわっと浮く'),
  E('tenshi-halo', 'tenshi', ['crowdWow', 'cowbell'], ['キラーン'], 6, 0,
    '天使アリヌスが通ると主人公の頭に天使の輪がつく'),
  E('mukimuki-pushups', 'mukimuki', ['zuko', 'crowdWow'], ['ズシーン', 'ムキッ'], 5.5, 0,
    'ムキムキヌスの腕立て伏せのたびに地面が揺れる'),
  E('dekaatama-lift', 'dekaatama', ['boing', 'crowdAww'], ['ひっかかった！'], 4.5, 1.6,
    'デカ頭アリヌスの巨大モヒカンに引っかかって持ち上げられる'),
  E('manmaru-bowling', 'manmaru', ['boing', 'zuko', 'crowdWow', 'trumpetFail'],
    ['ころころ〜', 'ストライク！', 'ガコーン', 'ガター…'], 6, 0,
    'まんまる親子が転がって、ボウリングのように仲間をなぎ倒す'),
]);

export const CAST_EVENT_IDS = f(CAST_EVENTS.map((e) => e.id));

/** おふざけ度ごとの間隔（秒）。度2で20〜40秒に1回 */
export const CAST_EVENT_INTERVAL = f({ 1: f([40, 70]), 2: f([20, 40]), 3: f([12, 25]) });

export function castEventById(id) {
  return CAST_EVENTS.find((e) => e.id === id);
}

/** 次の出来事までの秒数。level 0 は Infinity */
export function nextCastEventDelay(level, rng) {
  const lv = normalizeSillyLevel(level);
  if (lv === 0) return Infinity;
  const [lo, hi] = CAST_EVENT_INTERVAL[lv];
  return lo + rng() * (hi - lo);
}

/** 直前と同じ出来事は返さない */
export function pickCastEvent(rng, lastId) {
  const list = CAST_EVENT_IDS.filter((id) => id !== lastId);
  return pick(rng, list.length ? list : CAST_EVENT_IDS);
}

/** tick(dt,{blocked}) で出来事 ID か null。1 回の tick で最大 1 つ */
export function createCastEventScheduler({ level = DEFAULT_SILLY_LEVEL, rng } = {}) {
  let lv = normalizeSillyLevel(level);
  let elapsed = 0;
  let delay = nextCastEventDelay(lv, rng);
  let last = null;
  return {
    tick(dt, { blocked = false } = {}) {
      if (blocked || lv === 0) return null;
      elapsed += Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (elapsed < delay) return null;
      elapsed = 0;
      delay = nextCastEventDelay(lv, rng);
      last = pickCastEvent(rng, last);
      return last;
    },
    setLevel(n) {
      lv = normalizeSillyLevel(n);
      elapsed = 0;
      delay = nextCastEventDelay(lv, rng);
    },
    get level() { return lv; },
    get delay() { return delay; },
  };
}

// ---- 動きの計算 ----
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);

/** 持ち上げの高さ（なめらかに上がって下がる）。duration は MAX_HOLD_SEC までに丸める */
export function liftCurve(t, duration, peak = 1) {
  const d = Math.min(MAX_HOLD_SEC, Math.max(0, Number(duration) || 0));
  if (!(t > 0) || !(t < d)) return 0;
  const edge = Math.min(0.35, d / 2);
  const k = Math.min(1, t / edge, (d - t) / edge);
  return peak * k * k * (3 - 2 * k);
}

/** 吹っ飛びの移動量（時刻 t0→t1 の間に進む距離）。合計は dist、time 秒で止まる */
export function knockbackDelta(t0, t1, dist, time = 0.35) {
  const T = time > 0 ? time : 0.35;
  const s = (t) => {
    const k = clamp01((Number.isFinite(t) ? t : 0) / T);
    return dist * (1 - (1 - k) * (1 - k));
  };
  return s(t1) - s(t0);
}

/** from から to へ speed で dt 秒ぶん近づく（行き過ぎない） */
export function chaseStep(from, to, speed, dt) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const step = Math.max(0, speed) * Math.max(0, dt);
  if (d <= step || d < 1e-9) return { x: to.x, z: to.z };
  return { x: from.x + (dx / d) * step, z: from.z + (dz / d) * step };
}

/**
 * 煙の輪（縦向き、法線 nx,nz）を主人公が通り抜けたか。
 * 前のフレームと今のフレームで輪の面の反対側に移り、輪の中心から横に radius 以内なら真。
 */
export function ringCrossed(prevRing, curRing, prevHero, curHero, radius) {
  if (!prevRing || !curRing || !prevHero || !curHero) return false;
  const nl = Math.hypot(curRing.nx, curRing.nz) || 1;
  const nx = curRing.nx / nl;
  const nz = curRing.nz / nl;
  const side = (r, p) => (p.x - r.x) * nx + (p.z - r.z) * nz;
  const a = side(prevRing, prevHero);
  const b = side(curRing, curHero);
  if (a === 0 && b === 0) return false;
  if (!(a * b <= 0)) return false;
  const lat = Math.abs(-(curHero.x - curRing.x) * nz + (curHero.z - curRing.z) * nx);
  return lat <= radius;
}

/** 線分 from→to から radius 以内にある targets の {index,k}（k は線分上の位置 0〜1）。k の順 */
export function hitsAlongPath(from, to, targets, radius) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const L2 = dx * dx + dz * dz;
  const out = [];
  (Array.isArray(targets) ? targets : []).forEach((p, index) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    const k = L2 > 0 ? clamp01(((p.x - from.x) * dx + (p.z - from.z) * dz) / L2) : 0;
    const d = Math.hypot(from.x + dx * k - p.x, from.z + dz * k - p.z);
    if (d <= radius) out.push({ index, k });
  });
  return out.sort((a, b) => a.k - b.k);
}
