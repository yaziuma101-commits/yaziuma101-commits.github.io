// 水鉄砲の水の量と補充（three.js・DOM に依存しない）。状態は不変に扱う
export const MAX_WATER = 12;
export const RELOAD_TIME = 1.5;

export function createWater() {
  return { ammo: MAX_WATER, reloading: false, timer: 0 };
}

/** 撃つ。撃てないときは fired:false で状態を変えない（自動補充はしない） */
export function shoot(w) {
  if (!w || w.reloading || !(w.ammo > 0)) return { water: w, fired: false };
  return { water: { ...w, ammo: w.ammo - 1 }, fired: true };
}

/** R で補充を始める。補充中・満タンなら何もしない。mul は補充の時間の倍率（持ち込みで遅くなる） */
export function startReload(w, mul = 1) {
  if (!w || w.reloading || w.ammo >= MAX_WATER) return w;
  const m = Number.isFinite(mul) && mul > 0 ? mul : 1;
  return { ...w, reloading: true, timer: RELOAD_TIME * m };
}

export function tickWater(w, dt) {
  if (!w || !w.reloading) return w;
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const timer = w.timer - h;
  if (timer <= 1e-9) return { ammo: MAX_WATER, reloading: false, timer: 0 };
  return { ...w, timer };
}
