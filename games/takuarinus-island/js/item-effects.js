// アイテム効果を既存ボス（倉庫番・レース・FPS）へ反映する規則。three.js・DOM に依存しない。
// 持ち込みなし（params が空）のときは、どの関数も従来と同じ挙動になる値を返す。
import { BOSS_RADIUS, PLAYER_RADIUS, clampToArena } from './fps-arena.js';
import { hashUnit } from './kendama-tricks.js';

const TAU = Math.PI * 2;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const posDt = (dt) => (Number.isFinite(dt) && dt > 0 ? dt : 0);
const isPos = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const unit = (rng) => {
  const v = Number(rng());
  return Number.isFinite(v) ? Math.min(0.999999, Math.max(0, v)) : 0.5;
};

/** 候補を順に見て、最初のオブジェクトを params とする（関数なら gameId を渡して呼ぶ）。無ければ {} */
export function pickItemParams(candidates, gameId) {
  for (const c of Array.isArray(candidates) ? candidates : []) {
    let v = c;
    if (typeof v === 'function') {
      try {
        v = v(gameId);
      } catch {
        v = null;
      }
    }
    if (isObj(v)) return v;
  }
  return {};
}

// ---- 倉庫番 ----
/** {pushDistance}: 既定 1。2 以上なら箱をその数まで押せる（最大 3） */
export function puzzleItemOptions(params) {
  const p = isObj(params) ? params : {};
  const n = Math.floor(Number(p.pushDistance));
  return { pushDistance: Number.isFinite(n) && n >= 2 ? Math.min(n, 3) : 1 };
}

// ---- レース ----
export function raceItemOptions(params) {
  const p = isObj(params) ? params : {};
  const mul = Number(p.rivalSpeedMul);
  const sec = Number(p.rivalSlowSec);
  const gun = Number.isFinite(mul) && mul > 0 && mul < 1 && Number.isFinite(sec) && sec > 0;
  return {
    gun,
    rivalSpeedMul: gun ? mul : 1,
    rivalSlowSec: gun ? sec : 0,
    screenDrops: p.screenDrops === true,
  };
}

export const RACE_GUN = Object.freeze({ range: 28, coneDeg: 30, cooldown: 0.45 });

export function createRaceGun(opts = raceItemOptions()) {
  const o = opts || raceItemOptions();
  return {
    enabled: !!o.gun, mul: num(o.rivalSpeedMul, 1), sec: num(o.rivalSlowSec, 0), cooldown: 0, slow: 0,
  };
}

/** 撃つ側のカートの前方（円錐の中）・射程内に相手がいるか */
export function rivalInSights(shooter, target, range = RACE_GUN.range, coneDeg = RACE_GUN.coneDeg) {
  if (!isPos(shooter) || !isPos(target)) return false;
  const dx = target.x - shooter.x;
  const dz = target.z - shooter.z;
  const d = Math.hypot(dx, dz);
  if (!(d <= range)) return false;
  if (d < 1e-6) return true;
  const h = num(shooter.heading);
  return (dx * Math.sin(h) + dz * Math.cos(h)) / d >= Math.cos((coneDeg * Math.PI) / 180);
}

/** 水鉄砲を撃つ。{gun, fired, hit}。持ち込みなし・冷却中は撃てない */
export function fireRaceGun(gun, shooter, target) {
  if (!gun || !gun.enabled || gun.cooldown > 0) return { gun, fired: false, hit: false };
  const hit = rivalInSights(shooter, target);
  return {
    gun: { ...gun, cooldown: RACE_GUN.cooldown, slow: hit ? gun.sec : gun.slow },
    fired: true,
    hit,
  };
}

export function tickRaceGun(gun, dt) {
  if (!gun || !gun.enabled) return gun;
  const h = posDt(dt);
  return { ...gun, cooldown: Math.max(0, gun.cooldown - h), slow: Math.max(0, gun.slow - h) };
}

/** 減速中の相手の最高速度（減速していなければ Infinity） */
export function rivalSpeedCap(gun, maxSpeed) {
  if (!gun || !gun.enabled || !(gun.slow > 0)) return Infinity;
  return maxSpeed * gun.mul;
}

/** 減速中なら相手のカートの速度を抑えた新しい kart を返す。それ以外は同じ kart をそのまま返す */
export function applyRivalSlow(kart, gun, maxSpeed) {
  const cap = rivalSpeedCap(gun, maxSpeed);
  if (!kart || !Number.isFinite(cap) || !(kart.speed > cap)) return kart;
  return { ...kart, speed: cap };
}

/** 画面の水滴の配置（%・px・秒） */
export function screenDropLayout(rng, n = 9) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: 4 + unit(rng) * 88,
      y: 4 + unit(rng) * 80,
      size: 36 + unit(rng) * 70,
      delay: unit(rng) * 6,
      dur: 5 + unit(rng) * 4,
    });
  }
  return out;
}

// ---- FPS: 物陰の箱が動き回る ----
export const FPS_ROAM_MODES = Object.freeze(['toward-enemy', 'toward-player']);

export function fpsItemOptions(params) {
  const p = isObj(params) ? params : {};
  return { roam: FPS_ROAM_MODES.includes(p.coverBoxesRoam) ? p.coverBoxesRoam : null };
}

export const ROAM = Object.freeze({
  speed: 1.6,
  retargetMin: 1.5,
  retargetMax: 3.5,
  jitter: 2.2,
  gap: 0.45,
  arenaMargin: 1.5,
  aheadMin: 2.5,
  aheadMax: 4.5,
});

/** 箱（中心 x,z・半幅 hw,hd）と点の XZ 距離 */
export function boxDist(box, p) {
  const dx = Math.max(box.x - box.hw - p.x, 0, p.x - (box.x + box.hw));
  const dz = Math.max(box.z - box.hd - p.z, 0, p.z - (box.z + box.hd));
  return Math.hypot(dx, dz);
}

/** 障害物のうち kind==='box' のものを動かす状態を作る */
export function createRoamBoxes(obstacles, rng = Math.random) {
  const boxes = [];
  (obstacles || []).forEach((o, i) => {
    if (!o || o.kind !== 'box') return;
    boxes.push({
      index: i,
      x: (o.min.x + o.max.x) / 2,
      z: (o.min.z + o.max.z) / 2,
      hw: (o.max.x - o.min.x) / 2,
      hd: (o.max.z - o.min.z) / 2,
      frac: 0.25 + 0.4 * unit(rng),
      jx: 0,
      jz: 0,
      timer: 0,
    });
  });
  return { boxes };
}

/** 箱の目的地。toward-enemy: 主人公と番長の間（視線を遮る）／toward-player: 主人公の前 */
export function roamTarget(box, mode, { player, boss } = {}) {
  if (!isPos(player)) return { x: box.x + box.jx, z: box.z + box.jz };
  if (mode === 'toward-enemy' && isPos(boss)) {
    return {
      x: player.x + (boss.x - player.x) * box.frac + box.jx * 0.5,
      z: player.z + (boss.z - player.z) * box.frac + box.jz * 0.5,
    };
  }
  if (mode === 'toward-player') {
    const yaw = num(player.yaw);
    const k = Math.min(1, Math.max(0, (box.frac - 0.25) / 0.4));
    const d = ROAM.aheadMin + (ROAM.aheadMax - ROAM.aheadMin) * k;
    return {
      x: player.x - Math.sin(yaw) * d + box.jx * 0.6,
      z: player.z - Math.cos(yaw) * d + box.jz * 0.6,
    };
  }
  return { x: box.x + box.jx, z: box.z + box.jz };
}

/** 1フレーム進めた新しい状態。主人公・番長には重ならない（滑って避ける） */
export function stepRoamBoxes(state, dt, {
  mode, player, boss, rng = Math.random,
} = {}) {
  if (!state || !Array.isArray(state.boxes) || !mode) return state;
  const h = posDt(dt);
  const guards = [];
  if (isPos(player)) guards.push([player, PLAYER_RADIUS + ROAM.gap]);
  if (isPos(boss)) guards.push([boss, BOSS_RADIUS + ROAM.gap]);
  const boxes = state.boxes.map((b) => {
    let { timer, jx, jz } = b;
    timer -= h;
    if (timer <= 0) {
      timer = ROAM.retargetMin + (ROAM.retargetMax - ROAM.retargetMin) * unit(rng);
      const a = unit(rng) * TAU;
      const r = unit(rng) * ROAM.jitter;
      jx = Math.cos(a) * r;
      jz = Math.sin(a) * r;
    }
    const nb = {
      ...b, timer, jx, jz,
    };
    if (h <= 0) return nb;
    const t = roamTarget(nb, mode, { player, boss });
    const dx = t.x - b.x;
    const dz = t.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-9) return nb;
    const s = Math.min(d, ROAM.speed * h);
    const lim = ROAM.arenaMargin + Math.hypot(b.hw, b.hd);
    const ok = (x, z) => guards.every(([p, r]) => {
      const dn = boxDist({
        x, z, hw: b.hw, hd: b.hd,
      }, p);
      if (dn >= r) return true;
      const d0 = boxDist(b, p);
      return d0 < r && dn >= d0;
    });
    const cands = [
      [b.x + (dx / d) * s, b.z + (dz / d) * s],
      [b.x + Math.sign(dx) * Math.min(Math.abs(dx), s), b.z],
      [b.x, b.z + Math.sign(dz) * Math.min(Math.abs(dz), s)],
    ];
    for (const [x, z] of cands) {
      const c = clampToArena({ x, z }, lim);
      if (ok(c.x, c.z)) return { ...nb, x: c.x, z: c.z };
    }
    return nb;
  });
  return { boxes };
}

// ---- けん玉ケンケン ----
const posOr = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);

export function kendamaItemOptions(params) {
  const p = isObj(params) ? params : {};
  return {
    windowScale: posOr(p.windowScale, 1),
    kensakiScale: posOr(p.kensakiScale, 1),
    chargeRate: posOr(p.chargeRate, 1),
    handDrift: Number.isFinite(p.handDrift) ? Math.abs(p.handDrift) : 0,
    chargeGuide: p.chargeGuide === true,
  };
}

/** 皿ごとの受けの窓の倍率（持ち込み分） */
export function kendamaWindowScale(opts, cup) {
  const o = opts || kendamaItemOptions();
  return o.windowScale * (cup === 'kensaki' ? o.kensakiScale : 1);
}

/** 手の流され（m）。t は秒 */
export function kendamaHandDrift(opts, t) {
  const a = opts && opts.handDrift > 0 ? opts.handDrift : 0;
  return a * Math.sin(num(t) * 1.3) || 0;
}

/**
 * 見下ろし型のけん玉で、手（主人公）が左右に流される量（-1〜1 の横移動の入力に足す）。
 * handDrift は旧けん玉の m 単位（0.1）なので、入力の大きさへ 4 倍して直す（0.1 → ±0.4）
 */
export function kendamaTopDrift(opts, t) {
  const a = opts && opts.handDrift > 0 ? Math.min(1, opts.handDrift * 4) : 0;
  return a * Math.sin(num(t) * 1.3) || 0;
}

// ---- 小説一夜漬けチキンレース ----
export function novelItemOptions(params) {
  const p = isObj(params) ? params : {};
  return {
    pageSpeed: posOr(p.pageSpeed, 1),
    aiDelay: Number.isFinite(p.aiDelay) && p.aiDelay > 0 ? p.aiDelay : 0,
    fontScale: posOr(p.fontScale, 1),
    textShake: p.textShake === true,
    eliminateOne: p.eliminateOne === true,
    bookmark: p.bookmark === true,
    pageSpeedRandom: p.pageSpeedRandom === true,
    scoreRandom: p.scoreRandom === true,
  };
}

/** その問のめくり速度の倍率 */
export function novelPageSpeed(opts, seed, questionNumber) {
  const o = opts || novelItemOptions();
  let s = o.pageSpeed;
  if (o.pageSpeedRandom) s *= hashUnit(seed, 'nv-age', questionNumber) < 0.5 ? 0.8 : 1.5;
  return s;
}

/** その問の主人公の得点の倍率（ふしぎなけん玉） */
export function novelScoreMul(opts, seed, questionNumber) {
  if (!opts || !opts.scoreRandom) return 1;
  return [0.5, 1, 2][Math.min(2, Math.floor(hashUnit(seed, 'nv-kd', questionNumber) * 3))];
}

// ---- 新2アイテムを既存6ゲームへ持ち込んだときの追加の効果（持ち込みなしなら全部無効の値） ----
export function phase4CarryOptions(params) {
  const p = isObj(params) ? params : {};
  const cntOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    missFree: cntOf(p.missFree),
    firstMoveSlip: p.firstMoveSlip === true,
    noUndo: p.noUndo === true, // 高難易度のパズル: Z の1手戻しを使えなくする
    undoOnce: p.undoOnce === true,
    steerLag: Number.isFinite(p.steerLag) && p.steerLag > 0 ? p.steerLag : 0,
    respawnOnce: p.respawnOnce === true,
    damageMul: posOr(p.damageMul, 1),
    heartBonus: cntOf(p.heartBonus),
    reloadMul: posOr(p.reloadMul, 1),
    foeSpeed: posOr(p.foeSpeed, 1), // 高難易度の番長: 動き・撃つ間隔・弾の速さを掛ける
    touchDouble: p.touchDouble === true,
    forgiveOnce: p.forgiveOnce === true,
    retryOnce: p.retryOnce === true,
    swapSides: p.swapSides === true,
    extraMatta: cntOf(p.extraMatta),
  };
}

/** 吹っ飛ばし：弱すぎる振り（power < below）を1回だけ打ち直せるか */
export const RETRY_SWING_BELOW = 0.5;
export function canRetrySwing(power, left, below = RETRY_SWING_BELOW) {
  return left > 0 && Number.isFinite(power) && power < below;
}

/** レース：ハンドルが lag 秒ほど遅れて効く（振り子のように追いつく）。lag が 0 ならそのまま */
export function laggedSteer(prev, target, dt, lag) {
  const t = Number.isFinite(target) ? target : 0;
  if (!(lag > 0)) return t;
  const p = Number.isFinite(prev) ? prev : 0;
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return p + (t - p) * Math.min(1, h / lag);
}

/** レース：カートから追い出されたとき、残りがあればすぐ自分のカートに戻す。{rider, left, rescued} */
export function rescueEjected(rider, left, makeDriver) {
  if (!rider || rider.state !== 'knockedOut' || !(left > 0) || typeof makeDriver !== 'function') {
    return { rider, left, rescued: false };
  }
  return { rider: makeDriver(), left: left - 1, rescued: true };
}

/** 動かした箱を反映した障害物の一覧。状態が無ければ base をそのまま返す */
export function roamObstacles(base, state) {
  if (!state || !Array.isArray(state.boxes) || state.boxes.length === 0) return base;
  const out = base.slice();
  for (const b of state.boxes) {
    const o = base[b.index];
    if (!o) continue;
    out[b.index] = Object.freeze({
      kind: o.kind,
      min: Object.freeze({ x: b.x - b.hw, y: o.min.y, z: b.z - b.hd }),
      max: Object.freeze({ x: b.x + b.hw, y: o.max.y, z: b.z + b.hd }),
    });
  }
  return out;
}

// ---- ファイルを見つけろ（持ち込みなしなら全部無効の値） ----
export const FF_DEFAULT_DOUBLE_CLICK_MS = 400;

/** 持ち込みの params → ファイルを見つけろの設定 */
export function findFileItemOptions(params) {
  const p = isObj(params) ? params : {};
  const cnt = (v) => (v === true ? 1 : (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0));
  return {
    penaltySec: Number.isFinite(p.penaltySec) && p.penaltySec >= 0 ? p.penaltySec : null,
    scoreMul: posOr(p.scoreMul, 1),
    aiDelayMul: posOr(p.aiDelayMul, 1),
    removeDecoys: cnt(p.removeDecoys),
    bookmark: cnt(p.bookmark),
    doubleClickMs: posOr(p.doubleClickMs, FF_DEFAULT_DOUBLE_CLICK_MS),
    clueHighlight: p.clueHighlight === true,
    confirmSubmit: p.confirmSubmit === true,
  };
}

/** 設定 → ff-match の createMatch に渡す effects（無効なものは入れない） */
export function ffMatchEffects(opts) {
  const o = opts || findFileItemOptions();
  const e = {};
  if (o.penaltySec !== null && o.penaltySec !== undefined) e.penaltySec = o.penaltySec;
  if (o.scoreMul !== 1) e.scoreMul = o.scoreMul;
  if (o.aiDelayMul !== 1) e.aiDelayMul = o.aiDelayMul;
  if (o.removeDecoys > 0) e.removeDecoys = o.removeDecoys;
  return e;
}
