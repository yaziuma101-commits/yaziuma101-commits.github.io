// 絵を描く道具。320×180 の点を描き、画面では4倍に見せる。生成AIは使わない。
import { SPR, ALIAS } from "../data/sprites.js";

// 16色（サイト「タクアンの島」の色に揃えた）。新しい色を作らず、ここから選ぶ
export const PAL = {
  k: "#13237a", b: "#2a56d8", l: "#6fb6ff", s: "#9ad8ff", g: "#3fae4f", G: "#2a7a36",
  n: "#7a4a1e", N: "#4a2c10", y: "#f3dc93", Y: "#e8b520", o: "#c98a1a", r: "#d8392b",
  w: "#fffdf6", p: "#6b3a8a", P: "#3d1f55", m: "#8a8f3a",
};
// 漬かっていく色（0.7.0）。段が進むと白は黄へ、緑は深く、腐る手前は沈んだ色に。16色の中で差し替えるだけ
export const AGE = [
  {},
  { w: "y", s: "y", l: "s", g: "G" },
  { w: "Y", y: "Y", s: "Y", l: "y", g: "G", G: "m", p: "P", r: "o" },
];
export const ROT = { Y: "m", o: "N", w: "g", g: "N", G: "N", r: "N", p: "m", P: "N", y: "m" }; // 腐った色

export function painter(ctx) {
  const R = (a, b, w, h, c) => { ctx.fillStyle = PAL[c] || c; ctx.fillRect(a, b, w, h); };
  const box = (a, b, w, h, fill = "w", line = "k") => { R(a, b, w, h, line); R(a + 1, b + 1, w - 2, h - 2, fill); };
  function spr(name, a, b, s = 1, remap = {}, flip = false) {
    let rows = SPR[name], base = {};
    if (!rows && ALIAS[name]) { rows = SPR[ALIAS[name][0]]; base = ALIAS[name][1]; }
    if (!rows) return;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      const c1 = base[ch] || ch;
      R(a + (flip ? 15 - i : i) * s, b + j * s, s, s, remap[c1] || c1);
    }));
  }
  return { R, box, spr, ctx };
}

// 章ごとの背景。四角の組み合わせだけで描く
export function background(P, chapter) {
  const { R, spr } = P;
  const kura = chapter.includes("蔵"), hama = chapter.includes("浜");   // 浜は夕暮れの空
  if (kura) {
    R(0, 0, 320, 104, "N");
    for (let x = 0; x < 320; x += 24) { R(x, 0, 2, 104, "n"); }
    R(0, 20, 320, 2, "n"); R(0, 60, 320, 2, "n");
    R(130, 22, 60, 38, "k"); R(132, 24, 56, 34, "P"); R(158, 24, 2, 34, "k"); // 窓
    for (let i = 0; i < 6; i++) spr("barrel", 10 + i * 18, 84 - (i % 2) * 2);
    for (let i = 0; i < 6; i++) spr("barrel", 198 + i * 18, 84 - (i % 2) * 2);
    R(0, 98, 320, 6, "n");
  } else {
    const s1 = hama ? "o" : "s", s2 = hama ? "Y" : "l";
    R(0, 0, 320, 34, s1); R(0, 34, 320, 8, s2); R(0, 42, 320, 6, s1); R(0, 48, 320, 14, s2);
    if (hama) { R(250, 40, 22, 12, "y"); R(254, 37, 14, 3, "y"); }   // 沈む日
    [[30, 22, 26], [120, 16, 34], [250, 26, 22]].forEach(([a, b, w]) => { R(a, b, w, 4, "w"); R(a + 4, b - 3, w - 10, 3, "w"); });
    R(0, 62, 320, 42, "b");
    for (let i = 0; i < 26; i++) R((i * 37) % 320, 66 + (i * 13) % 34, 6, 1, "l");
    R(40, 70, 240, 30, "y"); R(30, 76, 260, 28, "y"); R(48, 68, 224, 8, "g"); R(56, 66, 200, 4, "G");
    R(118, 38, 60, 30, "n"); R(118, 38, 60, 2, "N"); R(124, 48, 48, 20, "y");
    R(112, 30, 72, 10, "o"); R(116, 26, 64, 4, "Y"); R(112, 39, 72, 1, "N"); R(142, 52, 12, 16, "N");
    R(196, 44, 1, 26, "N"); R(236, 44, 1, 26, "N"); R(196, 44, 41, 1, "N");
    for (let i = 0; i < 8; i++) { R(199 + i * 5, 45, 2, 12 + (i % 3) * 2, "w"); R(199 + i * 5, 45, 2, 2, "g"); }
    spr("barrel", 92, 54); spr("barrel", 102, 56); spr("barrel", 180, 54);
  }
  R(0, 104, 320, 76, "y");
  for (let i = 0; i < 40; i++) R((i * 29) % 320, 108 + (i * 7) % 70, 1, 1, "o");
}

// 依頼者の絵を縮め、線を1点幅にして、線の内側を白で塗る。絵そのものは変えない
export function loadOwner(src, size, crop = 1) {
  return new Promise((ok, ng) => {
    const im = new Image();
    im.onerror = ng;
    im.onload = () => {
      const W = im.width, H = im.height, s = Math.max(W, H) * crop / size, ox = (W - size * s) / 2, oy = (H - size * s) / 2;
      const t = document.createElement("canvas"); t.width = W; t.height = H;
      const tx = t.getContext("2d"); tx.drawImage(im, 0, 0);
      const d = tx.getImageData(0, 0, W, H).data, bg = [d[0], d[1], d[2]];
      const grid = () => Array.from({ length: size }, () => new Array(size).fill(false));
      const line = grid();
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        let best = 0;
        for (let v = Math.floor(oy + j * s); v < oy + (j + 1) * s; v += 2)
          for (let u = Math.floor(ox + i * s); u < ox + (i + 1) * s; u += 2) {
            if (u < 0 || u >= W || v < 0 || v >= H) continue;
            const q = (v * W + u) * 4;
            best = Math.max(best, Math.abs(d[q] - bg[0]) + Math.abs(d[q + 1] - bg[1]) + Math.abs(d[q + 2] - bg[2]));
          }
        line[j][i] = best > 150;
      }
      const out = grid(), st = [];
      for (let i = 0; i < size; i++) st.push([0, i], [size - 1, i], [i, 0], [i, size - 1]);
      while (st.length) { const [j, i] = st.pop(); if (j < 0 || i < 0 || j >= size || i >= size || out[j][i] || line[j][i]) continue; out[j][i] = true; st.push([j + 1, i], [j - 1, i], [j, i + 1], [j, i - 1]); }
      const thin = thinLines(line, size);
      // 案X：外側の輪郭（元の太い線のうち外に接する点）は残し、内側の線だけ1点幅にする
      const touch = (j, i) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dj, di]) => out[j + dj]?.[i + di]);
      const outline = line.map((r, j) => r.map((v, i) => thin[j][i] || (v && touch(j, i))));
      for (let grow = true; grow;) {
        grow = false;
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
          if (out[j][i] || thin[j][i] || !line[j][i]) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dj, di]) => out[j + dj]?.[i + di])) { out[j][i] = true; grow = true; }
        }
      }
      ok({ line: thin, outline, thick: line, out, size });
    };
    im.src = src;
  });
}
// Zhang-Suen の細線化
function thinLines(line, size) {
  const thin = line.map(r => r.slice());
  const at = (j, i) => (j >= 0 && i >= 0 && j < size && i < size && thin[j][i]) ? 1 : 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        if (!thin[j][i]) continue;
        const p = [at(j - 1, i), at(j - 1, i + 1), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i), at(j + 1, i - 1), at(j, i - 1), at(j - 1, i - 1)];
        const B = p.reduce((s, v) => s + v, 0);
        let A = 0; for (let q = 0; q < 8; q++) if (!p[q] && p[(q + 1) % 8]) A++;
        const c1 = step ? p[0] * p[2] * p[6] : p[0] * p[2] * p[4];
        const c2 = step ? p[0] * p[4] * p[6] : p[2] * p[4] * p[6];
        if (B >= 2 && B <= 6 && A === 1 && !c1 && !c2) del.push([j, i]);
      }
      del.forEach(([j, i]) => { thin[j][i] = false; });
      if (del.length) changed = true;
    }
  }
  return thin;
}
export function drawOwner(P, o, a, b, flip = false, ink = "k") {
  for (let j = 0; j < o.size; j++) for (let i = 0; i < o.size; i++) {
    const ii = flip ? o.size - 1 - i : i;
    if (o.line[j][ii]) P.R(a + i, b + j, 1, 1, ink);
    else if (!o.out[j][ii]) P.R(a + i, b + j, 1, 1, "w");
  }
}

// 清書した人物（data/people.js）を1点幅で描き、"#"／"o"／"." の行に直す
export function rasterPeople(spec) {
  const { w, h } = spec, g = Array.from({ length: h }, () => new Array(w).fill(false));
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = true; };
  const line = (x0, y0, x1, y1) => { // ブレゼンハム
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { put(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  const poly = (a, close) => { for (let k = 0; k + 3 < a.length; k += 2) line(a[k], a[k + 1], a[k + 2], a[k + 3]); if (close) line(a[a.length - 2], a[a.length - 1], a[0], a[1]); };
  const circle = (cx, cy, r) => { // 中点円
    let x = r, y = 0, d = 1 - r;
    while (x >= y) {
      [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]].forEach(([a, b]) => put(cx + a, cy + b));
      y++; if (d < 0) d += 2 * y + 1; else { x--; d += 2 * (y - x) + 1; }
    }
  };
  for (const s of spec.shapes) {
    if (s.c) circle(...s.c); else if (s.l) line(...s.l); else if (s.p) poly(s.p, true); else if (s.o) poly(s.o, false);
  }
  const out = g.map(r => r.map(() => false)), st = [];
  for (let i = 0; i < w; i++) st.push([0, i], [h - 1, i]);
  for (let j = 0; j < h; j++) st.push([j, 0], [j, w - 1]);
  while (st.length) { const [j, i] = st.pop(); if (j < 0 || i < 0 || j >= h || i >= w || out[j][i] || g[j][i]) continue; out[j][i] = true; st.push([j + 1, i], [j - 1, i], [j, i + 1], [j, i - 1]); }
  return g.map((r, j) => r.map((v, i) => (v ? "#" : out[j][i] ? "." : "o")).join(""));
}

// 清書した人物の行（rasterPeople の結果）を描く
export function drawPerson(P, rows, a, b, flip = false, ink = "k") {
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === ".") return;
    P.R(a + (flip ? r.length - 1 - i : i), b + j, 1, 1, ch === "#" ? ink : "w");
  }));
}
