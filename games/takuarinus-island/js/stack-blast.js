// 吹っ飛ばし段階の規則（three.js・DOM に依存しない）。
export const LINE_DISTANCE = 12;
export const MAX_RANGE = 30;
export const POT_NEAR = 20;
export const POT_FAR = 22;
export const GAUGE_PERIOD = 1.2;
export const ANGLE_MIN = 15;
export const ANGLE_MAX = 75;
export const ANGLE_DEFAULT = 45;
export const ANGLE_RATE = 30;
export const SPREAD_LOW = 0.7;
export const SPREAD_HIGH = 1.3;
export const NOISE = 0.05;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function gaugeValue(t) {
  const ph = (((t % GAUGE_PERIOD) + GAUGE_PERIOD) % GAUGE_PERIOD) / GAUGE_PERIOD;
  return ph < 0.5 ? ph * 2 : 2 - ph * 2;
}

export function adjustAngle(angle, dir, dt) {
  return clamp(angle + dir * ANGLE_RATE * dt, ANGLE_MIN, ANGLE_MAX);
}

export function flightRange(power, angleDeg) {
  return MAX_RANGE * power * power * Math.sin((2 * angleDeg * Math.PI) / 180);
}

export function resolveBlast({
  levels, power, angleDeg, rng, powerBonus, potWidthBonus,
} = {}) {
  const n = Math.max(0, Math.floor(Number(levels) || 0));
  const p = clamp((Number(power) || 0) + (powerBonus ?? 0), 0, 1.2);
  const R = flightRange(p, angleDeg);
  const far = POT_FAR + (potWidthBonus ?? 0);
  const flights = [];
  let flown = 0;
  let pot = false;
  for (let i = 0; i < n; i++) {
    const noise = rng ? 1 + (rng.next() * 2 - 1) * NOISE : 1;
    const distance = R * (SPREAD_LOW + (SPREAD_HIGH - SPREAD_LOW) * ((i + 0.5) / n)) * noise;
    const over = distance > LINE_DISTANCE;
    const inPot = distance >= POT_NEAR && distance < far;
    if (over || inPot) flown += 1;
    if (inPot) pot = true;
    flights.push({
      index: i, distance, over: over || inPot, inPot,
    });
  }
  const potBonus = pot ? 1 : 0;
  return {
    flights, flown, potBonus, score: flown + potBonus,
  };
}

export function weaponFor(silliness) {
  return Number(silliness) >= 2 ? 'hammer' : 'fan';
}

/** 演出用：飛距離 distance のモヒカンが飛ぶ秒数（0.5〜2.8） */
export function flightDuration(distance) {
  const d = Math.abs(Number(distance) || 0);
  return clamp(0.5 + d / 12, 0.5, 2.8);
}

/**
 * 演出用：飛び始めから t 秒後の位置（放物線）。x は飛び始めからの水平距離。
 * 終わりでちょうど x=distance、y=endY。頂点の高さは distance×tan(角度)/4（最大 12）。
 */
export function flightPoint(distance, angleDeg, t, { startY = 0, endY = 0, duration } = {}) {
  const d = Number(distance) || 0;
  const T = duration > 0 ? duration : flightDuration(d);
  const k = clamp((Number(t) || 0) / T, 0, 1);
  const a = clamp(Number(angleDeg) || ANGLE_DEFAULT, ANGLE_MIN, ANGLE_MAX);
  const apex = Math.min(12, (Math.abs(d) * Math.tan((a * Math.PI) / 180)) / 4);
  return {
    x: d * k,
    y: startY + (endY - startY) * k + 4 * apex * k * (1 - k),
    k,
    done: k >= 1,
  };
}
