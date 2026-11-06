// 真っ暗ソウルの家具の形（three.js・DOM・Web Audio に依存しない）。
// ds-map の通れない矩形（OBSTACLES）ごとに、本物らしい大きさと形の部品の一覧を返す。
// 部品は {type:'box', x,y,z,w,h,d, rotY, mat} か {type:'cyl', x,y,z,r,rt,h, rotY, mat}（x,y,z は中心のワールド座標）。
import { makeRng } from './ds-rng.js';

const f = Object.freeze;

/** 家具の正面の向き（部屋の内側を向く） */
export const FURNITURE_FRONT = f({
  'study-shelf': '-z',
  'study-desk': '-z',
  'study-safe': '+x',
  'kids-bed': '-z',
  'kids-chest': '-z',
  'kids-wardrobe': '+x',
  'kitchen-counter': '-x',
  'kitchen-table': '+z',
  'kitchen-cupboard': '+x',
  'cellar-rack-w': '+x',
  'cellar-rack-e': '-x',
  'cellar-crates': '+z',
  'hall-clock': '+z',
});

/** 見た目の高さの上限（当たり判定の高さとは別） */
export const VISUAL_HEIGHT = f({
  shelf: 2.2,
  desk: 1.0,
  safe: 0.95,
  bed: 1.15,
  chest: 0.75,
  wardrobe: 2.05,
  counter: 2.3,
  table: 0.95,
  cupboard: 2.05,
  rack: 2.05,
  crates: 0.95,
  clock: 2.0,
});

/** 物が載る天板の高さ（ヒューズや電池の置き場所に合わせる） */
export const REST_SURFACES = f({
  'study-desk': 0.8, 'kids-chest': 0.7, 'kitchen-table': 0.8, 'kitchen-counter': 0.95,
});

/** 部品の材質（tex は ds-textures の OBJECT_TEXTURES、color は palette のキー） */
export const FURNITURE_MATERIALS = f({
  wood: f({ tex: 'grain', roughness: 0.78 }),
  darkWood: f({ tex: 'grainDark', roughness: 0.72 }),
  metal: f({ tex: 'metal', roughness: 0.45, metalness: 0.55 }),
  metalDark: f({ color: 'dsMetalDark', roughness: 0.5, metalness: 0.6 }),
  fabric: f({ tex: 'fabric', roughness: 1 }),
  linen: f({ tex: 'linen', roughness: 1 }),
  ceramic: f({ color: 'dsCeramic', roughness: 0.3 }),
  stoneTop: f({ color: 'dsStoneTop', roughness: 0.6 }),
  paper: f({ color: 'dsLinen', roughness: 1 }),
  bookA: f({ color: 'dsBookA', roughness: 0.85 }),
  bookB: f({ color: 'dsBookB', roughness: 0.85 }),
  bookC: f({ color: 'dsBookC', roughness: 0.85 }),
  brass: f({ color: 'dsBrass', roughness: 0.35, metalness: 0.85 }),
  crate: f({ tex: 'crate', roughness: 0.92 }),
  glass: f({
    color: 'dsGlass', roughness: 0.1, metalness: 0.3, opacity: 0.3,
  }),
});

const BOOKS = ['bookA', 'bookB', 'bookC'];

function seedOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 家具の向きの枠。局所座標は正面が +z、幅が x、奥行きが z、原点は床の中心 */
function frameOf(o) {
  const front = FURNITURE_FRONT[o.id] || '+z';
  const cx = (o.x1 + o.x2) / 2;
  const cz = (o.z1 + o.z2) / 2;
  const alongX = front === '+z' || front === '-z';
  const W = alongX ? o.x2 - o.x1 : o.z2 - o.z1;
  const D = alongX ? o.z2 - o.z1 : o.x2 - o.x1;
  const rot = {
    '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2,
  }[front];
  const toWorld = (lx, lz) => {
    switch (front) {
      case '-z': return { x: cx - lx, z: cz - lz };
      case '+x': return { x: cx + lz, z: cz - lx };
      case '-x': return { x: cx - lz, z: cz + lx };
      default: return { x: cx + lx, z: cz + lz };
    }
  };
  return {
    W, D, rot, toWorld,
  };
}

function builder(o) {
  const fr = frameOf(o);
  const parts = [];
  const box = (lx, y, lz, w, h, d, mat) => {
    const p = fr.toWorld(lx, lz);
    parts.push({
      type: 'box', x: p.x, y, z: p.z, w, h, d, rotY: fr.rot, mat,
    });
  };
  const cyl = (lx, y, lz, r, h, mat, rt = r) => {
    const p = fr.toWorld(lx, lz);
    parts.push({
      type: 'cyl', x: p.x, y, z: p.z, r, rt, h, rotY: fr.rot, mat,
    });
  };
  return {
    ...fr, parts, box, cyl,
  };
}

const BUILD = {
  shelf(b, o) {
    const { W, D, box } = b;
    const H = 2.2;
    box(0, H / 2, -D / 2 + 0.015, W, H, 0.03, 'darkWood');
    const bays = Math.max(1, Math.round(W / 2));
    for (let i = 0; i <= bays; i++) box(-W / 2 + 0.025 + (i * (W - 0.05)) / bays, H / 2, 0, 0.05, H, D, 'darkWood');
    box(0, H - 0.03, 0, W, 0.06, D, 'darkWood');
    box(0, 0.06, 0.01, W, 0.12, D - 0.02, 'darkWood');
    const shelves = [0.12, 0.62, 1.12, 1.62];
    for (const y of shelves) box(0, y + 0.02, 0, W - 0.05, 0.04, D - 0.04, 'wood');
    const rng = makeRng(seedOf(o.id));
    let count = 0;
    for (const y of shelves) {
      let x = -W / 2 + 0.08;
      while (x < W / 2 - 0.1 && count < 120) {
        if (rng() < 0.45) {
          x += 0.15 + rng() * 0.4;
          continue;
        }
        const n = 3 + Math.floor(rng() * 6);
        for (let k = 0; k < n; k++) {
          const bw = 0.03 + rng() * 0.04;
          if (x + bw > W / 2 - 0.08) break;
          const bh = 0.2 + rng() * 0.17;
          const bd = 0.17 + rng() * 0.08;
          box(x + bw / 2, y + 0.04 + bh / 2, -D / 2 + 0.04 + bd / 2, bw, bh, bd, BOOKS[Math.floor(rng() * 3) % 3]);
          x += bw + 0.002;
          count += 1;
        }
        x += 0.05;
      }
    }
  },
  desk(b) {
    const {
      W, D, box, cyl,
    } = b;
    const topD = Math.min(0.65, D - 0.3);
    const topZ = -D / 2 + topD / 2;
    box(0, 0.78, topZ, W, 0.04, topD, 'wood');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(sx * (W / 2 - 0.05), 0.38, topZ + sz * (topD / 2 - 0.05), 0.05, 0.76, 0.05, 'darkWood');
    }
    box(0, 0.71, -D / 2 + 0.03, W - 0.12, 0.1, 0.02, 'darkWood');
    const px = W / 2 - 0.27;
    box(px, 0.5, topZ, 0.42, 0.5, topD - 0.06, 'darkWood');
    for (let i = 0; i < 3; i++) {
      const y = 0.34 + i * 0.16;
      box(px, y, topZ + topD / 2 - 0.025, 0.38, 0.14, 0.012, 'wood');
      box(px, y, topZ + topD / 2 - 0.01, 0.06, 0.02, 0.01, 'brass');
    }
    box(-0.25, 0.8025, topZ + 0.05, 0.3, 0.005, 0.22, 'paper');
    cyl(-0.55, 0.83, topZ - 0.15, 0.03, 0.06, 'glass');
    // 机の下に押し込まれた椅子
    const cz = D / 2 - 0.22;
    box(0, 0.45, cz, 0.42, 0.04, 0.4, 'wood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 0.18, 0.215, cz + sz * 0.17, 0.035, 0.43, 0.035, 'darkWood');
    box(0, 0.73, cz + 0.18, 0.42, 0.5, 0.03, 'wood');
  },
  safe(b) {
    const { W, D, box } = b;
    box(0, 0.04, 0, W, 0.08, D - 0.02, 'metalDark');
    box(0, 0.49, 0, W - 0.02, 0.82, D, 'metal');
  },
  bed(b) {
    const {
      W, D, box, cyl,
    } = b;
    const bw = Math.min(1.6, W - 0.7);
    const bl = Math.min(2.45, D - 0.1);
    const z0 = -D / 2 + 0.04;
    const zc = z0 + bl / 2;
    box(0, 0.56, z0, bw + 0.1, 1.1, 0.06, 'darkWood');
    for (const s of [-1, 1]) cyl(s * (bw / 2 + 0.05), 0.575, z0, 0.04, 1.15, 'darkWood');
    box(0, 0.3, z0 + bl, bw + 0.1, 0.6, 0.05, 'darkWood');
    for (const s of [-1, 1]) box(s * (bw / 2), 0.28, zc, 0.05, 0.16, bl, 'darkWood');
    box(0, 0.43, zc, bw - 0.06, 0.2, bl - 0.1, 'linen');
    box(0, 0.555, zc + 0.25, bw, 0.05, bl - 0.6, 'fabric');
    for (const s of [-1, 1]) box(s * (bw / 2 + 0.01), 0.42, zc + 0.25, 0.02, 0.3, bl - 0.6, 'fabric');
    box(0, 0.59, z0 + 0.3, 0.75, 0.11, 0.35, 'linen');
    // ナイトテーブルと燃え尽きたろうそく
    const nx = -(bw / 2 + 0.17);
    box(nx, 0.3, z0 + 0.25, 0.22, 0.6, 0.4, 'wood');
    cyl(nx, 0.64, z0 + 0.25, 0.025, 0.08, 'linen');
  },
  chest(b) {
    const { W, D, box } = b;
    box(0, 0.02, 0, W - 0.08, 0.04, D - 0.12, 'darkWood');
    box(0, 0.35, -0.02, W - 0.04, 0.62, D - 0.08, 'darkWood');
    box(0, 0.68, 0, W, 0.04, D, 'wood');
    for (let i = 0; i < 3; i++) {
      const y = 0.15 + i * 0.18;
      box(0, y, D / 2 - 0.045, W - 0.12, 0.15, 0.02, 'wood');
      for (const s of [-1, 1]) box(s * 0.22, y, D / 2 - 0.03, 0.04, 0.03, 0.02, 'brass');
    }
  },
  wardrobe(b) {
    const { W, D, box } = b;
    box(0, 0.04, 0, W - 0.02, 0.08, D - 0.04, 'darkWood');
    box(0, 1.0, -0.02, W - 0.04, 1.84, D - 0.06, 'darkWood');
    box(0, 1.96, 0, W, 0.08, D, 'darkWood');
    const dw = W / 2 - 0.06;
    for (const s of [-1, 1]) {
      const x = s * (W / 4 - 0.01);
      box(x, 1.0, D / 2 - 0.025, dw, 1.76, 0.03, 'wood');
      box(x, 1.35, D / 2 - 0.008, dw - 0.18, 0.6, 0.006, 'darkWood');
      box(x, 0.55, D / 2 - 0.008, dw - 0.18, 0.6, 0.006, 'darkWood');
      box(s * 0.06, 1.0, D / 2 - 0.006, 0.02, 0.14, 0.008, 'brass');
    }
  },
  counter(b) {
    const {
      W, D, box, cyl,
    } = b;
    box(0, 0.05, -0.06, W - 0.02, 0.1, D - 0.14, 'darkWood');
    box(0, 0.46, -0.04, W, 0.86, D - 0.08, 'wood');
    box(0, 0.92, 0, W, 0.06, D, 'stoneTop');
    for (let x = -W / 2 + 0.6; x < W / 2 - 0.1; x += 0.6) {
      box(x, 0.47, D / 2 - 0.075, 0.012, 0.78, 0.012, 'darkWood');
      box(x - 0.05, 0.75, D / 2 - 0.07, 0.02, 0.06, 0.01, 'brass');
    }
    // 流し
    const sx = 0.25;
    box(sx, 0.952, 0.02, 0.62, 0.006, 0.46, 'metal');
    box(sx, 0.956, 0.02, 0.5, 0.003, 0.34, 'metalDark');
    cyl(sx, 1.05, -D / 2 + 0.08, 0.018, 0.2, 'metal');
    box(sx, 1.14, -D / 2 + 0.16, 0.025, 0.025, 0.17, 'metal');
    for (const s of [-1, 1]) cyl(sx + s * 0.12, 0.975, -D / 2 + 0.08, 0.025, 0.05, 'metal');
    // 置きっぱなしの皿
    cyl(-1.2, 0.96, 0, 0.11, 0.02, 'ceramic');
    cyl(-1.0, 0.995, 0.1, 0.04, 0.09, 'ceramic', 0.045);
    // 吊り戸棚
    box(0, 1.85, -D / 2 + 0.18, W - 0.2, 0.75, 0.34, 'wood');
    for (let x = -W / 2 + 0.7; x < W / 2 - 0.2; x += 0.6) box(x, 1.85, -D / 2 + 0.355, 0.012, 0.7, 0.01, 'darkWood');
  },
  table(b) {
    const {
      W, D, box, cyl,
    } = b;
    box(0, 0.78, 0, W, 0.04, D, 'wood');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) cyl(sx * (W / 2 - 0.1), 0.38, sz * (D / 2 - 0.1), 0.035, 0.76, 'darkWood', 0.03);
    }
    for (const s of [-1, 1]) {
      box(0, 0.72, s * (D / 2 - 0.08), W - 0.2, 0.08, 0.03, 'darkWood');
      box(s * (W / 2 - 0.08), 0.72, 0, 0.03, 0.08, D - 0.2, 'darkWood');
    }
    cyl(0.45, 0.8075, -0.3, 0.12, 0.015, 'ceramic');
    cyl(0.5, 0.845, 0.0, 0.04, 0.09, 'ceramic', 0.045);
    box(-0.4, 0.802, 0.25, 0.35, 0.004, 0.26, 'paper');
  },
  cupboard(b) {
    const {
      W, D, box, cyl,
    } = b;
    box(0, 0.44, -0.02, W - 0.02, 0.8, D - 0.04, 'wood');
    box(0, 0.86, 0, W, 0.04, D, 'darkWood');
    for (const s of [-1, 1]) {
      box(s * 0.01, 0.44, D / 2 - 0.035, 0.012, 0.74, 0.012, 'darkWood');
      box(s * 0.08, 0.6, D / 2 - 0.03, 0.02, 0.06, 0.012, 'brass');
    }
    // ガラス戸の上の棚（中が見える）
    const backZ = -D / 2 + 0.02;
    box(0, 1.42, backZ, W - 0.06, 1.08, 0.02, 'wood');
    for (const s of [-1, 1]) box(s * (W / 2 - 0.04), 1.42, -D / 2 + 0.17, 0.03, 1.08, 0.3, 'wood');
    box(0, 1.3, -D / 2 + 0.17, W - 0.1, 0.02, 0.28, 'darkWood');
    box(0, 1.98, -D / 2 + 0.18, W, 0.04, 0.36, 'darkWood');
    for (let i = 0; i < 5; i++) box(-0.6 + i * 0.3, 1.0, -D / 2 + 0.1, 0.2, 0.2, 0.015, 'ceramic');
    for (let i = 0; i < 4; i++) cyl(-0.55 + i * 0.36, 1.39, -D / 2 + 0.15, 0.05, 0.16, 'ceramic', 0.04);
    for (const s of [-1, 1]) box(s * (W / 4 - 0.02), 1.42, -D / 2 + 0.325, W / 2 - 0.08, 0.98, 0.01, 'glass');
  },
  rack(b, o) {
    const {
      W, D, box, cyl,
    } = b;
    const posts = Math.max(2, Math.round(W / 1.75) + 1);
    for (let i = 0; i < posts; i++) {
      const x = -W / 2 + 0.03 + (i * (W - 0.06)) / (posts - 1);
      for (const s of [-1, 1]) box(x, 1.0, s * (D / 2 - 0.03), 0.05, 2.0, 0.05, 'darkWood');
    }
    const shelves = [0.15, 0.65, 1.15, 1.65];
    for (const y of shelves) box(0, y, 0, W, 0.03, D - 0.02, 'wood');
    const rng = makeRng(seedOf(o.id));
    for (const y of shelves) {
      const top = y + 0.015;
      let x = -W / 2 + 0.15;
      while (x < W / 2 - 0.3) {
        const r = rng();
        if (r < 0.3) {
          x += 0.2 + rng() * 0.5;
          continue;
        }
        if (r < 0.62) {
          const jr = 0.05 + rng() * 0.04;
          const jh = 0.14 + rng() * 0.1;
          if (x + jr * 2 > W / 2 - 0.04) break;
          cyl(x + jr, top + jh / 2, (rng() - 0.5) * 0.2, jr, jh, rng() < 0.3 ? 'glass' : 'ceramic', jr * 0.8);
          x += jr * 2 + 0.05;
        } else if (r < 0.85) {
          const bw = 0.25 + rng() * 0.15;
          const bh = 0.18 + rng() * 0.08;
          const bd = Math.min(0.3 + rng() * 0.15, D - 0.06);
          if (x + bw > W / 2 - 0.04) break;
          box(x + bw / 2, top + bh / 2, 0, bw, bh, bd, 'crate');
          x += bw + 0.05;
        } else {
          const bw = 0.3 + rng() * 0.2;
          if (x + bw > W / 2 - 0.04) break;
          box(x + bw / 2, top + 0.06, 0.02, bw, 0.12, Math.min(0.3, D - 0.08), 'fabric');
          x += bw + 0.05;
        }
      }
    }
  },
  crates(b) {
    const { box } = b;
    box(0, 0.3, 0.02, 0.95, 0.6, 0.9, 'crate');
    for (const y of [0.12, 0.3, 0.48]) box(0, y, 0.48, 0.97, 0.06, 0.02, 'darkWood');
    for (const s of [-1, 1]) box(s * 0.46, 0.3, 0.48, 0.05, 0.6, 0.03, 'darkWood');
    box(0.08, 0.75, -0.05, 0.6, 0.3, 0.6, 'crate');
  },
  clock(b) {
    const { W, D, box } = b;
    box(0, 0.08, 0, W, 0.16, D, 'darkWood');
    box(0, 0.55, 0, W - 0.08, 0.78, D - 0.04, 'darkWood');
    box(0, 0.62, D / 2 - 0.012, 0.3, 0.6, 0.004, 'glass');
    box(0, 0.82, D / 2 - 0.016, 0.012, 0.3, 0.006, 'brass');
    box(0, 0.62, D / 2 - 0.015, 0.11, 0.11, 0.01, 'brass');
    box(0, 1.11, -0.01, W - 0.18, 0.34, D - 0.08, 'darkWood');
    box(0, 1.6, 0, W - 0.04, 0.64, D, 'darkWood');
    box(0, 1.96, 0, W, 0.08, D, 'darkWood');
  },
};

/** 家具の部品の一覧（未知の種類は当たり判定の箱そのまま） */
export function furnitureParts(o) {
  if (!o || ![o.x1, o.x2, o.z1, o.z2].every((v) => Number.isFinite(v))) return [];
  const b = builder(o);
  const fn = Object.prototype.hasOwnProperty.call(BUILD, o.kind) ? BUILD[o.kind] : null;
  if (fn) fn(b, o);
  else b.box(0, (o.h || 1) / 2, 0, b.W, o.h || 1, b.D, 'wood');
  return b.parts;
}
