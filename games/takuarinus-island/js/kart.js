// カートの動き（three.js・DOM に依存しない）
// 座標: x 右、z 前、y 上。heading は rad で、前方ベクトルは (sinθ, cosθ)。
export const KART = Object.freeze({
  maxSpeed: 22,
  accel: 12,
  brake: 30,
  reverseMax: 8,
  coastDecel: 6,
  turnRate: 1.5, // rad/s（最高速付近の値。速度に比例して小さくなり、停止中は 0）
  driftMinSpeed: 8,
  driftTurnMult: 1.7,
  grassFactor: 0.45,
  grassDecel: 18,
  boostFactor: 1.45,
  boostTime: 1.6,
  overspeedDecel: 14,
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function createKart({ x = 0, z = 0, heading = 0 } = {}) {
  return {
    x: num(x), z: num(z), heading: num(heading), speed: 0, boostTimer: 0, drifting: false,
  };
}

/** 1ステップ進めた新しい kart を返す（引数は変更しない） */
export function stepKart(kart, input = {}, dt = 0, surface = 'road') {
  const K = KART;
  const inp = input || {};
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let speed = num(kart.speed);
  let boostTimer = num(kart.boostTimer);

  if (surface === 'boost') {
    boostTimer = K.boostTime;
    speed = Math.max(speed, K.maxSpeed * K.boostFactor);
  }
  const grass = surface === 'grass';
  // topMul: そのカートだけの最高速の倍率（レース番長のカートは速い）
  const top = K.maxSpeed * (num(kart.topMul, 1) > 0 ? num(kart.topMul, 1) : 1);
  let cap = grass ? top * K.grassFactor : top;
  if (boostTimer > 0) cap = K.maxSpeed * K.boostFactor;

  const v0 = speed;
  if (inp.accel) {
    if (speed < cap) speed = Math.min(cap, speed + K.accel * h);
  } else if (inp.brake) {
    speed = Math.max(-K.reverseMax, speed - K.brake * h);
  } else if (speed > 0) {
    speed = Math.max(0, speed - K.coastDecel * h);
  } else if (speed < 0) {
    speed = Math.min(0, speed + K.coastDecel * h);
  }
  if (speed > cap) speed = Math.max(cap, speed - (grass ? K.grassDecel : K.overspeedDecel) * h);
  boostTimer = Math.max(0, boostTimer - h);

  const steer = clamp(num(inp.steer), -1, 1);
  const drifting = !!inp.drift && steer !== 0 && Math.abs(v0) >= K.driftMinSpeed;
  const mult = drifting ? K.driftTurnMult : 1;
  const heading = num(kart.heading) - steer * K.turnRate * clamp(Math.abs(v0) / K.maxSpeed, 0, 1) * h * mult;

  return {
    ...kart,
    x: num(kart.x) + Math.sin(heading) * speed * h,
    z: num(kart.z) + Math.cos(heading) * speed * h,
    heading,
    speed,
    boostTimer,
    drifting,
  };
}
