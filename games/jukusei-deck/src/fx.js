// 手応えの演出（揺れ・点滅・飛ぶ字・粒・飛んでいく札・体力の減り跡）。ルールには触らない。
// どれも時間で消える。座標は点の単位（320×180）。動いている間だけ毎フレーム描き直す。
const now = () => performance.now();
const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const F = { shakes: [], floats: [], flashes: [], parts: [], ghosts: [], blinks: [], trail: {} };
let raf = 0, redraw = () => {};
export function onFrame(fn) { redraw = fn; }
function kick() { if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(loop); }
function loop() {
  raf = 0;
  const t = now();
  for (const k of ["shakes", "floats", "flashes", "parts", "ghosts", "blinks"]) F[k] = F[k].filter(x => t < x.t0 + x.ms);
  redraw();
  if (busy()) kick();
}
function busy() {
  return F.shakes.length || F.floats.length || F.flashes.length || F.parts.length || F.ghosts.length || F.blinks.length ||
    Object.values(F.trail).some(x => x.shown !== x.hp);
}
const add = (k, o, delay = 0, ms = 300) => { F[k].push({ ...o, t0: now() + delay, ms }); kick(); };
const live = x => now() >= x.t0;
const age = x => Math.min(1, Math.max(0, (now() - x.t0) / x.ms));

// ---- 出す ----
export const shake = (mag, delay = 0, ms = 220) => { if (!calm) add("shakes", { mag }, delay, ms); };
export const float = (x, y, s, cls = "w", delay = 0, ms = 900) => add("floats", { x, y, s, cls }, delay, ms);
export const flash = (x, y, w, h, c = "w", delay = 0, ms = 180) => add("flashes", { x, y, w, h, c }, delay, ms);
export const blink = (who, c = "w", delay = 0, ms = 260) => add("blinks", { who, c }, delay, ms);
export const ghost = (card, x0, y0, x1, y1, delay = 0, ms = 240) => add("ghosts", { card, x0, y0, x1, y1 }, delay, ms);
export function burst(x, y, colors, n = 10, delay = 0, ms = 600) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4, sp = 18 + (i * 7) % 20;
    add("parts", { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 14, c: colors[i % colors.length] }, delay, ms);
  }
}

// ---- 描くときに読む ----
// 揺れ：点の単位の整数でずらす（荒いドットのまま揺れる）
export function shakeOffset() {
  let m = 0;
  for (const s of F.shakes) if (live(s)) m = Math.max(m, s.mag * (1 - age(s)));
  if (m < 0.5) return [0, 0];
  const t = now() / 16;
  return [Math.round(Math.sin(t * 2.7) * m), Math.round(Math.cos(t * 3.1) * m * 0.6)];
}
// 点滅：当たった人を一瞬その色で描く（60ms ごとに入れ替える）
export function blinkColor(who) {
  const b = F.blinks.find(x => x.who === who && live(x));
  return b && Math.floor((now() - b.t0) / 60) % 2 === 0 ? b.c : null;
}
// 体力の減り跡：減った分を少し残し、ゆっくり縮める
export function trail(key, hp) {
  const tr = F.trail[key] || (F.trail[key] = { hp, shown: hp, hold: 0 });
  if (hp !== tr.hp) { if (hp < tr.hp) tr.hold = now() + 250; else tr.shown = hp; tr.hp = hp; kick(); }
  if (now() > tr.hold && tr.shown > hp) tr.shown = Math.max(hp, tr.shown - 0.6);
  return tr.shown;
}
export function resetTrail() { F.trail = {}; }
export function drawUnder(P, drawCard) {
  for (const g of F.ghosts) {
    if (!live(g)) continue;
    const k = age(g), e = 1 - (1 - k) * (1 - k);
    drawCard(g.card, Math.round(g.x0 + (g.x1 - g.x0) * e), Math.round(g.y0 + (g.y1 - g.y0) * e - Math.sin(k * Math.PI) * 14));
  }
}
export function drawOver(P, W) {
  for (const f of F.flashes) if (live(f) && Math.floor((now() - f.t0) / 50) % 2 === 0) P.R(f.x, f.y, f.w, f.h, f.c);
  for (const p of F.parts) {
    if (!live(p)) continue;
    const k = (now() - p.t0) / 1000;
    P.R(Math.round(p.x + p.vx * k), Math.round(p.y + p.vy * k + 40 * k * k), age(p) > 0.6 ? 1 : 2, age(p) > 0.6 ? 1 : 2, p.c);
  }
  for (const f of F.floats) {
    if (!live(f)) continue;
    const k = age(f), up = k < 0.2 ? k / 0.2 * 8 : 8 + (k - 0.2) * 6;   // 跳ねて、ゆっくり浮く
    W(f.x, f.y - up, f.s, `${f.cls} pop${k > 0.8 ? " fade" : ""}`);
  }
}
