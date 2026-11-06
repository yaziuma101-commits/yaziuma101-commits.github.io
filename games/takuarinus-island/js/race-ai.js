// レース番長の運転（three.js・DOM に依存しない）。通過点を順にたどる。
import { KART } from './kart.js';

// 依頼者の指摘（2026-11-04）「番長のカートが遅い」→ 自分のカートの最高速いっぱいまで踏む
export const AI_SPEED_FACTOR = 1;
export const AI_REACH = 12;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createAIDriver(track, { speedFactor = AI_SPEED_FACTOR, drift = false } = {}) {
  const w = track.waypoints;
  const n = w.length;
  const driver = {
    targetIndex: n > 1 ? 1 : 0,
    input(kart) {
      // 近づいたか、通り過ぎたら次の点へ
      for (let g = 0; g < n; g++) {
        const t = w[driver.targetIndex];
        const prev = w[(driver.targetIndex - 1 + n) % n];
        const near = Math.hypot(t.x - kart.x, t.z - kart.z) < AI_REACH;
        const passed = (kart.x - t.x) * (t.x - prev.x) + (kart.z - t.z) * (t.z - prev.z) > 0;
        if (near || passed) driver.targetIndex = (driver.targetIndex + 1) % n;
        else break;
      }
      const t = w[driver.targetIndex];
      const err = wrap(Math.atan2(t.x - kart.x, t.z - kart.z) - kart.heading);
      const steer = clamp(-err * 2, -1, 1) + 0;
      const speed = Number.isFinite(kart.speed) ? kart.speed : 0;
      const brake = Math.abs(err) > 1.2 && speed > 10;
      const accel = !brake && speed < KART.maxSpeed * speedFactor * (kart.topMul > 0 ? kart.topMul : 1);
      return {
        accel,
        brake,
        steer,
        drift: !!drift && Math.abs(steer) > 0.6 && speed >= KART.driftMinSpeed,
      };
    },
  };
  return driver;
}
