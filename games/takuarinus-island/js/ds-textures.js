// 真っ暗ソウルの質感のある模様（古い床板・色あせた壁紙・しみのある漆喰・ほこり・布・金属）。
// canvas の 2D の描画相手 g を引数で受け取る（document・three.js・Web Audio に依存しない）。
// 色は palette.js だけを使う。乱数は引数の rng（() => [0,1)）だけ。
import { PALETTE } from './palette.js';

const C = PALETTE;
const f = Object.freeze;
const TAU = Math.PI * 2;
const ri = (rng, n) => Math.floor(rng() * Math.max(0, n));
const pick = (rng, list) => list[Math.min(list.length - 1, ri(rng, list.length))];

function specks(g, w, h, rng, color, n, alpha, size = 1) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(ri(rng, w), ri(rng, h), size, size);
  g.globalAlpha = 1;
}

function blot(g, x, y, r, color, alpha) {
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, Math.max(0.5, r), 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

/** 水のしみ（にじんだ塊と、縁の輪） */
function stain(g, w, h, rng, color, alpha) {
  const x = rng() * w;
  const y = rng() * h;
  const r = 3 + rng() * w * 0.12;
  for (let k = 0; k < 4; k++) {
    blot(g, x + (rng() - 0.5) * r * 0.4, y + (rng() - 0.5) * r * 0.4, r * (1 - k * 0.18), color, alpha * 0.5);
  }
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;
}

/** ひび（ふらつきながら伸びる線） */
function crack(g, w, h, rng, color, alpha, len = 20) {
  let x = rng() * w;
  let y = rng() * h;
  let a = rng() * TAU;
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 0; i < len; i++) {
    a += (rng() - 0.5) * 0.9;
    x += Math.cos(a) * 2;
    y += Math.sin(a) * 2;
    g.lineTo(x, y);
  }
  g.stroke();
  g.globalAlpha = 1;
}

/** 古い木の床板（板の継ぎ目・木目・節・擦り傷・ほこり） */
export function drawFloorboards(g, w, h, rng) {
  const rows = 8;
  const bh = h / rows;
  const tones = [C.dsBoard, C.dsBoardWorn, C.dsWood, C.dsBoardDark];
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * bh);
    const hh = Math.round((r + 1) * bh) - y0;
    let x = -ri(rng, Math.floor(w * 0.6));
    while (x < w) {
      const len = Math.max(8, Math.floor(w * (0.45 + rng() * 0.5)));
      g.fillStyle = pick(rng, tones);
      g.fillRect(x, y0, len, hh);
      g.globalAlpha = 0.3;
      for (let i = 0; i < 7; i++) {
        g.fillStyle = rng() < 0.55 ? C.dsBoardDark : C.dsWoodLight;
        g.fillRect(x, y0 + 1 + ri(rng, Math.max(1, hh - 2)), len, 1);
      }
      g.globalAlpha = 1;
      if (rng() < 0.4) blot(g, x + rng() * len, y0 + hh / 2, 1 + rng() * 2, C.dsBoardKnot, 0.7);
      g.fillStyle = C.dsBoardGap;
      g.fillRect(x, y0, 1, hh);
      x += len;
    }
    g.fillStyle = C.dsBoardGap;
    g.fillRect(0, y0, w, 1);
  }
  g.globalAlpha = 0.25;
  g.strokeStyle = C.dsWoodLight;
  g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const x = rng() * w;
    const y = rng() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 4 + rng() * 14, y + (rng() - 0.5) * 3);
    g.stroke();
  }
  g.globalAlpha = 1;
  specks(g, w, h, rng, C.dsDust, Math.floor((w * h) / 90), 0.18);
  for (let i = 0; i < 3; i++) stain(g, w, h, rng, C.dsStain, 0.25);
}

/** 色あせた壁紙（縦縞・小さな菱形の柄・上からのしみ・継ぎ目・下のほこり） */
export function drawWallpaper(g, w, h, rng) {
  g.fillStyle = C.dsWallpaper;
  g.fillRect(0, 0, w, h);
  const step = w / 8;
  g.fillStyle = C.dsWallpaperStripe;
  for (let x = 0; x < w; x += step) g.fillRect(Math.round(x), 0, Math.max(1, Math.round(step / 2)), h);
  g.fillStyle = C.dsWallpaperMotif;
  const s = Math.max(2, step / 5);
  for (let iy = 0; iy < 8; iy++) {
    for (let ix = 0; ix < 8; ix++) {
      const x = ix * step + (iy % 2 ? step / 2 : 0) + step / 4;
      const y = iy * (h / 8) + h / 16;
      g.beginPath();
      g.moveTo(x, y - s);
      g.lineTo(x + s, y);
      g.lineTo(x, y + s);
      g.lineTo(x - s, y);
      g.closePath();
      g.fill();
    }
  }
  // 上のほうほど色が抜けている
  g.fillStyle = C.dsWallpaperFade;
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.1 - i * 0.015;
    g.fillRect(0, (i * h) / 12, w, h / 12);
  }
  g.globalAlpha = 1;
  // 上から垂れたしみ
  for (let i = 0; i < 4; i++) {
    const x = rng() * w;
    const len = h * (0.2 + rng() * 0.6);
    g.globalAlpha = 0.18;
    g.fillStyle = C.dsStain;
    g.fillRect(x, 0, 1 + rng() * 4, len);
    blot(g, x + 1, len, 2 + rng() * 3, C.dsStain, 0.2);
  }
  g.globalAlpha = 0.5;
  g.fillStyle = C.dsStain;
  g.fillRect(0, 0, 1, h);
  g.fillRect(Math.round(w / 2), 0, 1, h);
  g.globalAlpha = 1;
  // はがれかけた角
  blot(g, w / 2 + 2, rng() * h, 2 + rng() * 4, C.dsWallpaperFade, 0.35);
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = 0.03 * (i + 1);
    g.fillStyle = C.dsStain;
    g.fillRect(0, h - ((8 - i) * h) / 40, w, h / 40);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 2; i++) stain(g, w, h, rng, C.dsStain, 0.22);
  specks(g, w, h, rng, C.dsDust, Math.floor((w * h) / 200), 0.12);
}

/** しみのある漆喰（まだら・ひび・輪じみ） */
export function drawPlaster(g, w, h, rng) {
  g.fillStyle = C.dsPlaster;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    blot(g, rng() * w, rng() * h, 2 + rng() * 10, rng() < 0.6 ? C.dsPlasterDark : C.dsDust, 0.12);
  }
  specks(g, w, h, rng, C.dsPlasterDark, Math.floor((w * h) / 40), 0.3);
  for (let i = 0; i < 4; i++) crack(g, w, h, rng, C.dsPlasterStain, 0.6, 12 + ri(rng, 20));
  for (let i = 0; i < 3; i++) stain(g, w, h, rng, C.dsPlasterStain, 0.25);
}

/** すり切れたカーペット */
export function drawCarpet(g, w, h, rng) {
  g.fillStyle = C.dsCarpet;
  g.fillRect(0, 0, w, h);
  const s = Math.max(4, Math.floor(w / 16));
  g.globalAlpha = 0.5;
  g.fillStyle = C.dsCarpetLight;
  for (let iy = 0; iy * s < h; iy++) {
    for (let ix = 0; ix * s < w; ix++) {
      if ((ix + iy) % 2 === 0) g.fillRect(ix * s + 1, iy * s + 1, Math.floor(s / 2), Math.floor(s / 2));
    }
  }
  g.globalAlpha = 1;
  specks(g, w, h, rng, C.dsCarpetDark, Math.floor((w * h) / 6), 0.5);
  specks(g, w, h, rng, C.dsCarpetLight, Math.floor((w * h) / 12), 0.3);
  for (let i = 0; i < 6; i++) blot(g, rng() * w, rng() * h, 4 + rng() * 12, C.dsDust, 0.08);
  stain(g, w, h, rng, C.dsStain, 0.3);
}

/** 汚れたタイル（目地の黒ずみ・ひび） */
export function drawTile(g, w, h, rng) {
  g.fillStyle = C.dsTile;
  g.fillRect(0, 0, w, h);
  const n = 4;
  const s = w / n;
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = Math.round(ix * s) + 1;
      const y = Math.round(iy * s) + 1;
      const sz = Math.round(s) - 2;
      g.fillStyle = (ix + iy) % 2 ? C.dsTileMid : C.dsTileLight;
      g.fillRect(x, y, sz, sz);
      g.globalAlpha = 0.12 + rng() * 0.15;
      g.fillStyle = C.dsStain;
      g.fillRect(x, y + Math.round(sz * 0.6), sz, Math.round(sz * 0.4));
      g.globalAlpha = 1;
    }
  }
  specks(g, w, h, rng, C.dsDust, Math.floor((w * h) / 60), 0.2);
  for (let i = 0; i < 3; i++) crack(g, w, h, rng, C.dsStain, 0.6, 10 + ri(rng, 10));
  stain(g, w, h, rng, C.dsStain, 0.3);
}

/** 湿ったコンクリート */
export function drawConcrete(g, w, h, rng) {
  g.fillStyle = C.dsConcrete;
  g.fillRect(0, 0, w, h);
  specks(g, w, h, rng, C.dsConcreteDark, Math.floor((w * h) / 5), 0.5);
  specks(g, w, h, rng, C.dsConcreteLight, Math.floor((w * h) / 10), 0.4);
  for (let i = 0; i < 12; i++) blot(g, rng() * w, rng() * h, 3 + rng() * 12, C.dsConcreteDark, 0.15);
  for (let i = 0; i < 4; i++) crack(g, w, h, rng, C.dsStain, 0.55, 15 + ri(rng, 20));
  for (let i = 0; i < 3; i++) stain(g, w, h, rng, C.dsStain, 0.3);
}

/** 地下の石積み（目地・湿った筋） */
export function drawStone(g, w, h, rng) {
  g.fillStyle = C.dsStone;
  g.fillRect(0, 0, w, h);
  const bh = h / 8;
  const bw = w / 4;
  for (let iy = 0; iy < 8; iy++) {
    const off = iy % 2 ? bw / 2 : 0;
    for (let x = -off; x < w; x += bw) {
      g.fillStyle = rng() < 0.5 ? C.dsStoneMid : C.dsStoneLight;
      g.fillRect(Math.round(x) + 1, Math.round(iy * bh) + 1, Math.round(bw) - 2, Math.round(bh) - 2);
    }
  }
  specks(g, w, h, rng, C.dsStone, Math.floor((w * h) / 8), 0.4);
  g.fillStyle = C.dsStain;
  for (let i = 0; i < 5; i++) {
    g.globalAlpha = 0.2;
    g.fillRect(rng() * w, 0, 1 + rng() * 3, h * (0.3 + rng() * 0.7));
  }
  g.globalAlpha = 1;
  stain(g, w, h, rng, C.dsStain, 0.3);
}

/** 家具の木目 */
export function drawWoodGrain(g, w, h, rng, opt = {}) {
  const base = C[opt.base || 'dsWood'];
  const dark = C[opt.dark || 'dsWoodDark'];
  const light = C[opt.light || 'dsWoodLight'];
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.35;
  for (let i = 0; i < w; i += 2) {
    g.fillStyle = rng() < 0.6 ? dark : light;
    g.fillRect(i + ri(rng, 2), 0, 1, h);
  }
  g.globalAlpha = 0.5;
  g.strokeStyle = dark;
  g.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    const x0 = rng() * w;
    const ph = rng() * TAU;
    const amp = 1 + rng() * 3;
    g.beginPath();
    g.moveTo(x0, 0);
    for (let y = 0; y <= h; y += 4) g.lineTo(x0 + Math.sin(y * 0.06 + ph) * amp, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (rng() < 0.7) blot(g, rng() * w, rng() * h, 1.5 + rng() * 2, dark, 0.6);
  specks(g, w, h, rng, C.dsDust, Math.floor((w * h) / 120), 0.15);
}

/** 布（縦横の糸・黒ずみ・ほつれ） */
export function drawCloth(g, w, h, rng, opt = {}) {
  const base = C[opt.base || 'dsFabric'];
  const fiber = C[opt.fiber || 'dsCarpetLight'];
  const dark = C[opt.dark || 'dsCarpetDark'];
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.3;
  g.fillStyle = fiber;
  for (let x = 0; x < w; x += 2) g.fillRect(x, 0, 1, h);
  g.globalAlpha = 0.15;
  g.fillStyle = dark;
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  g.globalAlpha = 1;
  for (let i = 0; i < 10; i++) blot(g, rng() * w, rng() * h, 3 + rng() * 9, dark, 0.3);
  for (let i = 0; i < 4; i++) blot(g, rng() * w, rng() * h, 1 + rng() * 2, dark, 0.8);
  specks(g, w, h, rng, fiber, Math.floor((w * h) / 30), 0.35);
}

/** 皮膚（青白く、まだら） */
export function drawSkin(g, w, h, rng) {
  g.fillStyle = C.dsStalkerSkin;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 20; i++) blot(g, rng() * w, rng() * h, 2 + rng() * 8, C.dsPlasterDark, 0.18);
  g.globalAlpha = 0.25;
  g.strokeStyle = C.dsStalkerClothDark;
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = rng() * w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 6) g.lineTo(x + (rng() - 0.5) * 4, y);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** 古い金属（擦れの筋と錆） */
export function drawMetal(g, w, h, rng) {
  g.fillStyle = C.dsMetal;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.15;
  for (let y = 0; y < h; y += 1) {
    g.fillStyle = rng() < 0.5 ? C.dsMetalDark : C.dsDust;
    g.fillRect(0, y, w, 1);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 10; i++) blot(g, rng() * w, rng() * h, 1 + rng() * 5, C.dsRust, 0.35);
  specks(g, w, h, rng, C.dsRust, Math.floor((w * h) / 50), 0.4);
}

/** 木箱の板 */
export function drawCrate(g, w, h, rng) {
  const rows = 4;
  const bh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * bh);
    const hh = Math.round((r + 1) * bh) - y0;
    g.fillStyle = rng() < 0.5 ? C.dsCrate : C.dsBoardWorn;
    g.fillRect(0, y0, w, hh);
    g.globalAlpha = 0.3;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = C.dsWoodDark;
      g.fillRect(0, y0 + 1 + ri(rng, Math.max(1, hh - 2)), w, 1);
    }
    g.globalAlpha = 1;
    g.fillStyle = C.dsBoardGap;
    g.fillRect(0, y0, w, 2);
  }
  specks(g, w, h, rng, C.dsDust, Math.floor((w * h) / 80), 0.2);
  stain(g, w, h, rng, C.dsStain, 0.3);
}

/** 床・壁・天井の質感（ds-map の床材 → 模様と粗さ） */
export const SURFACE_TEXTURES = f({
  wood: f({ draw: drawFloorboards, size: 256, roughness: 0.82 }),
  carpet: f({ draw: drawCarpet, size: 128, roughness: 1 }),
  tile: f({ draw: drawTile, size: 128, roughness: 0.5 }),
  concrete: f({ draw: drawConcrete, size: 128, roughness: 0.95 }),
  paper: f({ draw: drawWallpaper, size: 128, roughness: 0.92 }),
  stone: f({ draw: drawStone, size: 128, roughness: 0.95 }),
  plaster: f({ draw: drawPlaster, size: 128, roughness: 0.97 }),
});

const cloth = (base, fiber, dark) => (g, w, h, rng) => drawCloth(g, w, h, rng, { base, fiber, dark });

/** 家具と人影の質感 */
export const OBJECT_TEXTURES = f({
  grain: f({
    draw: (g, w, h, rng) => drawWoodGrain(g, w, h, rng, { base: 'dsWood', dark: 'dsWoodDark', light: 'dsWoodLight' }),
    size: 128,
  }),
  grainDark: f({
    draw: (g, w, h, rng) => drawWoodGrain(g, w, h, rng, { base: 'dsWoodDark', dark: 'dsBoardGap', light: 'dsWoodMid' }),
    size: 128,
  }),
  metal: f({ draw: drawMetal, size: 64 }),
  fabric: f({ draw: cloth('dsFabric', 'dsCarpetLight', 'dsCarpetDark'), size: 64 }),
  linen: f({ draw: cloth('dsLinen', 'dsWallpaperFade', 'dsPlasterStain'), size: 64 }),
  crate: f({ draw: drawCrate, size: 64 }),
  robe: f({ draw: cloth('dsStalkerCloth', 'dsStalkerClothFiber', 'dsStalkerClothDark'), size: 128 }),
  fur: f({ draw: cloth('dsCatFur', 'dsStalkerClothFiber', 'dsStalkerClothDark'), size: 64 }),
  skin: f({ draw: drawSkin, size: 64 }),
});
