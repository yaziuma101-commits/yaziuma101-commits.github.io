// 積み上げたもの吹っ飛ばし：距離の得点・エビフライの追加点・難しい操作（three.js・DOM・Web Audio に依存しない）。
import { hashUnit } from './kendama-tricks.js';

export const GRAVITY = 9.8;
/** 地面に描く距離の目盛り（m） */
export const DISTANCE_MARKS = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40]);
/** 1m あたりの得点 */
export const POINTS_PER_METER = 1;
/** エビフライモヒカン1つの追加点 */
export const EBI_BONUS = 5;
/** 以前のゲージの往復の速さ（比較用・1秒で1往復） */
export const OLD_GAUGE_SPEED = 1;
export const OLD_SWEET_WIDTH = 0.2;
/** 新しいゲージ：平均の速さ（往復/秒）と、いちばん強い所の幅 */
export const GAUGE_SPEED = 2.2;
export const SWEET_WIDTH = 0.06;
export const SWEET_MIN = 1 - SWEET_WIDTH;
/** 角度：理想 45°、勝手に揺れる幅（度） */
export const IDEAL_ANGLE = 45;
export const WOBBLE_DEG = 25;
export const ANGLE_STEER_SPEED = 60; // A/D で動かす速さ（度/秒）
export const ANGLE_OFFSET_MAX = 40;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** 距離の得点（遠いほど高い）。負や数でない値は 0 */
export function distanceScore(distance) {
  return Math.max(0, Math.floor(fin(Number(distance)) * POINTS_PER_METER));
}

/** 越えた目盛りの数（表示用） */
export function marksPassed(distance) {
  return DISTANCE_MARKS.filter((m) => fin(Number(distance)) >= m).length;
}

export function ebiFryBonus(potCount) {
  return Math.max(0, Math.floor(fin(Number(potCount)))) * EBI_BONUS;
}

/** 1回の吹っ飛ばしの得点。distances は飛んだモヒカンごとの距離、potCount は鍋に入った数 */
export function throwScore({ distances = [], potCount = 0 } = {}) {
  const list = Array.isArray(distances) ? distances : [];
  const dist = list.reduce((a, d) => a + distanceScore(d), 0);
  const bonus = ebiFryBonus(potCount);
  return { distance: dist, bonus, total: dist + bonus };
}

/** その瞬間のゲージの速さ（往復/秒）。種から決まる区間ごとに 0.6〜1.6 倍で不規則に変わる */
export function gaugeSpeedAt(t, seed = 0) {
  const seg = Math.floor(Math.max(0, fin(t)) / 0.35);
  return GAUGE_SPEED * (0.6 + hashUnit(seed, 'stack-gauge', seg) * 1.0);
}

/** 時刻 t（秒）のゲージの値 0〜1。区間ごとに速さが変わる三角波 */
export function gaugePower(t, seed = 0) {
  const tt = Math.max(0, fin(t));
  const segLen = 0.35;
  const n = Math.floor(tt / segLen);
  let phase = 0;
  for (let i = 0; i < n; i++) phase += gaugeSpeedAt(i * segLen, seed) * segLen;
  phase += gaugeSpeedAt(tt, seed) * (tt - n * segLen);
  const f = phase - Math.floor(phase);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/** ゲージの値 → 強さ。いちばん強い所（狭い）だけ 1、それ以外は大きく落ちる */
export function effectivePower(p) {
  const v = clamp(fin(Number(p)), 0, 1);
  if (v >= SWEET_MIN) return 1;
  return v * 0.7;
}

/** 勝手に揺れ続ける角度（度）。理想の 45° のまわりを不規則に揺れる */
export function wobbleAngle(t, seed = 0) {
  const tt = fin(t);
  const a = 1.3 + hashUnit(seed, 'stack-wob', 1) * 0.8;
  const b = 2.9 + hashUnit(seed, 'stack-wob', 2) * 1.2;
  const w = 0.6 * Math.sin(tt * a * 2) + 0.4 * Math.sin(tt * b * 2 + 1.7);
  return IDEAL_ANGLE + WOBBLE_DEG * w;
}

/** A/D（dir: −1/0/+1）で揺れに逆らうための補正（度） */
export function stepAngleOffset(offset, dir, dt) {
  const d = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  return clamp(fin(offset) + d * ANGLE_STEER_SPEED * Math.max(0, fin(dt)), -ANGLE_OFFSET_MAX, ANGLE_OFFSET_MAX);
}

/** 主人公の飛距離。持ち込みの powerBonus は強さに足し、1 を超えた分は距離の倍率にする（いちばん強い所でも効く） */
export function heroThrowRange(power, angleDeg, powerBonus = 0) {
  const p = clamp(fin(Number(power)) + fin(Number(powerBonus)), 0, 1.2);
  return throwDistance(Math.min(1, p), angleDeg) * Math.max(1, p);
}

/** 強さ（0〜1）と角度（度）から飛距離（m）。両方合わせないと遠くへ飛ばない */
export function throwDistance(power, angleDeg) {
  const v = 4 + 16 * clamp(fin(Number(power)), 0, 1);
  const th = (clamp(fin(Number(angleDeg)), 0, 90) * Math.PI) / 180;
  return Math.max(0, (v * v * Math.sin(2 * th)) / GRAVITY);
}
