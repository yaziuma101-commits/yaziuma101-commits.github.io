// 昔のホームページ風の飾り（GIF）を手で打ったドット絵から作る。生成AIは使っていない。
// 使い方: node tools/retro-art.mjs   → images/retro/*.gif ができる
// 外部の道具は使わず、GIF の書き出しもここで書いている。
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "images", "retro");
mkdirSync(OUT, { recursive: true });

// 色（ゲーム「タクアリヌスとモヒカンの島」と同じ青）
const C = {
  O: "#13237a", // 輪郭の濃い青
  B: "#2a56d8", // 体の青
  L: "#6fb6ff", // 水色（モヒカンの縞）
  H: "#9ad8ff", // 体のつや
  W: "#ffffff", // 顔の窓
  K: "#000000", // 目
  Y: "#ffd23f", // 黄色
  R: "#e0302a", // 赤
  G: "#ff8a1e", // 橙
  D: "#2b2b2b", // 黒っぽい
};

// ---- タクアリヌス（16×20） ----
const TAKU = [
  "......OOOO......",
  ".....OBLBLO.....",
  ".....OBLBLO.....",
  "..OOOOBLBLOOOO..",
  ".OBBBBBBBBBBBBO.",
  ".OBHHBBBBBBBBBO.",
  "OBBBWWWWWWWWBBBO",
  "OBBWWWWWWWWWWBBO",
  "OBBWWKWWWWKWWBBO",
  "OBBWWKWWWWKWWBBO",
  "OBBWWWWWWWWWWBBO",
  "OBBBWWWWWWWWBBBO",
  "OBBBBBBBBBBBBBBO",
  ".OBBBBBBBBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBBBBBBBBBBO..",
  "...OOBBBBBBOO...",
  "....OBO..OBO....",
  "...OBBO..OBBO...",
  "...OOOO..OOOO...",
];
const TAKU_BLINK = TAKU.map((r, y) => (y === 8 ? r.replace(/K/g, "W") : r));
const ARM_UP = [".OO", "OBO", "OBO", "OO."];
const ARM_DOWN = ["OO.", "OBO", "OBO", ".OO"];
const ARM_LEFT = [".OO", "OBO", "OBO", "OO."];

// ---- 5×7 の文字 ----
const FONT = {
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

// ---- 描く道具 ----
function canvas(w, h, fill = null) {
  return { w, h, px: new Array(w * h).fill(fill) };
}
function set(cv, x, y, col) {
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h || !col) return;
  cv.px[y * cv.w + x] = col;
}
function stamp(cv, grid, ox, oy, flip = false) {
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      set(cv, ox + (flip ? row.length - 1 - x : x), oy + y, C[ch]);
    });
  });
}
function text(cv, str, ox, oy, col, shadow) {
  [...str].forEach((ch, i) => {
    const g = FONT[ch];
    g.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== "#") return;
      if (shadow) set(cv, ox + i * 6 + x + 1, oy + y + 1, shadow);
      set(cv, ox + i * 6 + x, oy + y, col);
    }));
  });
}

// ---- GIF の書き出し ----
function lzw(minCode, idx) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, dict = new Map();
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = prefix * 4096 + k;
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1;
    } else {
      if (next >= (1 << size)) size++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}
function gif(name, frames, delays) {
  const { w, h } = frames[0];
  const colors = [null];
  frames.forEach((f) => f.px.forEach((c) => { if (!colors.includes(c)) colors.push(c); }));
  let cbits = 1;
  while ((1 << cbits) < colors.length) cbits++;
  const b = [];
  const u16 = (n) => b.push(n & 255, (n >> 8) & 255);
  b.push(..."GIF89a".split("").map((c) => c.charCodeAt(0)));
  u16(w); u16(h);
  b.push(0x80 | ((cbits - 1) << 4) | (cbits - 1), 0, 0);
  for (let i = 0; i < 1 << cbits; i++) {
    const c = colors[i];
    if (!c) b.push(0, 0, 0);
    else b.push(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));
  }
  if (frames.length > 1) {
    b.push(0x21, 0xff, 0x0b, ..."NETSCAPE2.0".split("").map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  }
  const minCode = Math.max(2, cbits);
  frames.forEach((f, i) => {
    b.push(0x21, 0xf9, 4, (2 << 2) | 1); u16(delays[i] ?? delays[0]); b.push(0, 0);
    b.push(0x2c); u16(0); u16(0); u16(w); u16(h); b.push(0);
    b.push(minCode);
    const data = lzw(minCode, f.px.map((c) => colors.indexOf(c)));
    for (let p = 0; p < data.length; p += 255) {
      const chunk = data.slice(p, p + 255);
      b.push(chunk.length, ...chunk);
    }
    b.push(0);
  });
  b.push(0x3b);
  writeFileSync(join(OUT, name), Buffer.from(b));
  console.log(name, w + "x" + h, frames.length + "コマ", b.length + "バイト");
}

// ---- 1. 跳ねてまばたきするタクアリヌス ----
{
  const f = [];
  const make = (grid, y) => { const cv = canvas(16, 21); stamp(cv, grid, 0, y); return cv; };
  f.push(make(TAKU, 1), make(TAKU, 1), make(TAKU_BLINK, 1), make(TAKU, 1), make(TAKU, 0), make(TAKU, 1));
  gif("taku.gif", f, [60, 60, 12, 40, 14, 40]);
}

// ---- 2. 手をふるタクアリヌス（ご挨拶） ----
{
  const make = (arm, armY) => {
    const cv = canvas(22, 21);
    stamp(cv, TAKU, 3, 1);
    stamp(cv, ARM_LEFT, 0, 11, true);
    stamp(cv, arm, 19, armY);
    return cv;
  };
  gif("taku-wave.gif", [make(ARM_UP, 6), make(ARM_DOWN, 9)], [30, 30]);
}

// ---- 3. NEW! ----
{
  const a = canvas(25, 9); text(a, "NEW!", 1, 0, C.R, C.Y);
  const b2 = canvas(25, 9); text(b2, "NEW!", 1, 0, C.Y, C.R);
  gif("new.gif", [a, b2], [45, 45]);
}

// ---- 4. 工事中の柵（縞が流れて、ランプが光る） ----
{
  const f = [];
  for (let k = 0; k < 4; k++) {
    const cv = canvas(32, 18);
    // ランプ
    const lamp = k < 2 ? C.G : "#7a3a10";
    for (let y = 0; y < 3; y++) for (let x = 14; x < 18; x++) set(cv, x, y, lamp);
    set(cv, 15, 0, k < 2 ? C.Y : lamp);
    for (let x = 15; x < 17; x++) set(cv, x, 3, C.D);
    // 板
    for (let y = 4; y < 12; y++) for (let x = 0; x < 32; x++) {
      const edge = y === 4 || y === 11 || x === 0 || x === 31;
      set(cv, x, y, edge ? C.D : ((x + y + 32 - k * 2) % 8 < 4 ? C.Y : C.D));
    }
    // 脚
    for (let y = 12; y < 18; y++) { set(cv, 4, y, C.D); set(cv, 5, y, C.D); set(cv, 26, y, C.D); set(cv, 27, y, C.D); }
    for (let x = 2; x < 8; x++) set(cv, x, 17, C.D);
    for (let x = 24; x < 30; x++) set(cv, x, 17, C.D);
    f.push(cv);
  }
  gif("kouji.gif", f, [20]);
}

// ---- 5. キラキラ ----
{
  const shapes = [
    ["...", ".Y.", "..."],
    [".Y.", "YWY", ".Y."],
    ["..Y..", "..Y..", "YYWYY", "..Y..", "..Y.."],
    [".Y.", "YWY", ".Y."],
    ["...", "...", "..."],
  ];
  const f = shapes.map((s) => {
    const cv = canvas(7, 7);
    const o = (7 - s.length) >> 1;
    stamp(cv, s, o, o);
    return cv;
  });
  gif("kira.gif", f, [12, 12, 30, 12, 50]);
}

// ---- 6. このサイトのバナー（88×31） ----
{
  const make = (hop, blink) => {
    const cv = canvas(88, 31, C.O);
    for (let x = 0; x < 88; x++) { set(cv, x, 0, C.L); set(cv, x, 30, C.L); }
    for (let y = 0; y < 31; y++) { set(cv, 0, y, C.L); set(cv, 87, y, C.L); }
    for (let x = 2; x < 86; x++) { set(cv, x, 2, C.B); set(cv, x, 28, C.B); }
    for (let y = 2; y < 29; y++) { set(cv, 2, y, C.B); set(cv, 85, y, C.B); }
    // 背の白い丸（タクアリヌスが輪郭で沈まないように）
    for (let y = 4; y < 27; y++) for (let x = 4; x < 24; x++) {
      const dx = x - 13.5, dy = y - 15.5;
      if (dx * dx / 100 + dy * dy / 132 <= 1) set(cv, x, y, C.H);
    }
    stamp(cv, blink ? TAKU_BLINK : TAKU, 6, 6 - hop);
    text(cv, "TAKUAN", 30, 6, C.W, C.B);
    text(cv, "NO SHIMA", 30, 17, C.Y, C.B);
    return cv;
  };
  gif("banner.gif", [make(0, false), make(0, true), make(0, false), make(1, false)], [80, 12, 60, 14]);
}

// ---- 7. 区切り線（波） ----
{
  const cv = canvas(12, 7);
  for (let x = 0; x < 12; x++) {
    const y = 3 + Math.round(2 * Math.sin((x / 12) * Math.PI * 2));
    set(cv, x, y, C.B); set(cv, x, y + 1, C.L);
  }
  gif("nami.gif", [cv], [0]);
}

// ---- 8. 壁紙（薄い水色に小さなモヒカン） ----
{
  const cv = canvas(48, 48, "#e4f3ff");
  for (let y = 0; y < 48; y += 8) for (let x = 0; x < 48; x += 8) set(cv, x + ((y / 8) % 2) * 4, y, "#cfe6fb");
  const mini = ["OO..", "BLBL", "BLBL"];
  const tint = { O: "#b7d6f5", B: "#c3ddf7", L: "#d6eafc" };
  const put = (ox, oy) => mini.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === ".") return;
    set(cv, ox + x, oy + y, tint[ch]);
  }));
  put(10, 10); put(34, 34);
  gif("kabegami.gif", [cv], [0]);
}

// ======== 仕掛け用（2026-11-17 追加） ========
C.N = "#3fae4f"; // 緑
C.P = "#d0d4dc"; // 電話の灰色

// ---- 9. ちびモヒ（歩く2コマ。右向き） ----
{
  const top = [
    "....OO....",
    "...OBLO...",
    "..OOBLOO..",
    ".OBBBBBBO.",
    "OBWWWWWWBO",
    "OBWKWWKWBO",
    "OBWWWWWWBO",
    "OBBBBBBBBO",
    ".OBBBBBBO.",
    "..OOOOOO..",
  ];
  const a = canvas(10, 12); stamp(a, [...top, "..OB..BO..", ".OOO..OOO."], 0, 0);
  const b = canvas(10, 12); stamp(b, ["..........", ...top, "...OBBO..."], 0, 0);
  gif("chibi.gif", [a, b], [18, 18]);
  const st = canvas(10, 12); stamp(st, [...top, "..OB..BO..", "..OO..OO.."], 0, 0);
  gif("chibi-stand.gif", [st], [0]);
}

// ---- 10. 隠しモヒカン（小さい） ----
{
  const cv = canvas(6, 6);
  stamp(cv, ["..OO..", ".OBLO.", ".OBLO.", ".OBLO.", "OBLBLO", "OOOOOO"], 0, 0);
  gif("kakure.gif", [cv], [0]);
}

// ---- 11. 夜ふかしヌス（半目でスマホ） ----
{
  const halfEyes = TAKU.map((r, y) => (y === 8 ? r.replace(/K/g, "O") : r));
  const make = (screen) => {
    const cv = canvas(20, 21);
    stamp(cv, halfEyes, 0, 1);
    stamp(cv, ["OOOO", "O" + screen + screen + "O", "O" + screen + screen + "O", "OPPO", "OOOO"], 14, 10);
    return cv;
  };
  gif("yofukashi.gif", [make("L"), make("H"), make("L"), make("W")], [50, 8, 70, 6]);
}

// ---- 12. サンタ帽のタクアリヌス（モヒカンは帽子を突き抜ける） ----
{
  const hat = (g) => g.map((r, y) => (y === 2 ? "...ORRBLBLRRO..." : y === 3 ? "..OWWWWWWWWWWO.." : r));
  const a = canvas(16, 21); stamp(a, hat(TAKU), 0, 1);
  const b = canvas(16, 21); stamp(b, hat(TAKU_BLINK), 0, 1);
  gif("santa.gif", [a, a, b, a], [60, 60, 12, 40]);
}

// ---- 13. 足あと帳のスタンプ（6種） ----
{
  const recolorMohawk = (g, b, l) => g.map((r, y) => (y < 4 ? r.replace(/B/g, "#").replace(/L/g, "%").replace(/#/g, b).replace(/%/g, l) : r));
  const variants = {
    "aoi": TAKU,
    "kin": recolorMohawk(TAKU, "Y", "W"),
    "oko": recolorMohawk(TAKU, "R", "G").map((r, y) => (y === 7 ? "OBBWKWWWWWWKWBBO".slice(0, 16) : r)),
    "nemui": TAKU_BLINK.map((r, y) => (y === 9 ? r.replace(/K/g, "O") : r)),
    "niji": TAKU.map((r, y) => (y >= 1 && y <= 3 ? r.slice(0, 6) + "RYNL" + r.slice(10) : r)),
  };
  for (const [name, g] of Object.entries(variants)) {
    const cv = canvas(16, 20); stamp(cv, g, 0, 0);
    gif("stamp-" + name + ".gif", [cv], [0]);
  }
  const w = canvas(22, 21); stamp(w, TAKU, 3, 1); stamp(w, ARM_LEFT, 0, 11, true); stamp(w, ARM_UP, 19, 6);
  gif("stamp-yaa.gif", [w], [0]);
}
