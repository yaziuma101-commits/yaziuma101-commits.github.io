// 積み上げたもの吹っ飛ばしの舞台（揚げ物の屋台の前の広場・油の鍋・線・モヒフライ）。
// three.js は引数で受け取る。読み込み時には DOM・three.js に触らない。
import { PALETTE } from './palette.js';
import { getTextures } from './textures.js';
import { textureRepeat } from './texture-gen.js';
import { buildCastModel } from './cast-build.js';
import { getCast } from './cast-defs.js';
import { mohawkFan } from './touch-arena.js';
import { attachHeroFace } from './opponent-faces.js';

export const STACK_LAYOUT = Object.freeze({
  towerX: 0,
  baseWidth: 4,
  baseHeight: 0.5,
  blockHeight: 0.5,
  blockDepth: 1.4,
  hover: 1.0,
  hero: Object.freeze({ x: -3.2, z: 2.4 }),
  rival: Object.freeze({ x: -4.6, z: -2.2 }),
  blastSpot: Object.freeze({ x: -3.2, z: 1.0 }),
  lineX: 12,
  pot: Object.freeze({ x: 21, z: 0, r: 1 }),
  stallX: 25,
});

function buildMohifryFallback(THREE, mat) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const fan = mohawkFan(THREE, mat, 1.1, 'castFry', 'castFryDark');
  fan.position.y = 0.35;
  inner.add(fan);
  // 顔は主人公と同じテクスチャの顔
  attachHeroFace(THREE, mat, inner, { y: 0.75, z: 0.55, scale: 1.2 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 5), mat('castFryDark'));
    leg.position.set(s * 0.15, 0.17, 0);
    inner.add(leg);
  }
  return { root, inner, update() {} };
}

function buildMohifry(THREE, mat) {
  try {
    const def = getCast('mohifry');
    if (def) {
      const m = buildCastModel(THREE, def, {});
      if (m && m.root) return m;
    }
  } catch (err) {
    console.warn('モヒフライを作れないので代わりの形にします:', err);
  }
  return buildMohifryFallback(THREE, mat);
}

function buildStall(THREE, mat, tx) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 5), tx.material('planks', { repeat: textureRepeat(5, 1.1, 1.5) }));
  counter.position.y = 0.55;
  g.add(counter);
  for (const [x, z] of [[-1.1, -2.4], [-1.1, 2.4], [1.1, -2.4], [1.1, 2.4]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.18), tx.material('planks', { repeat: [1, 1] }));
    post.position.set(x, 1.5, z);
    g.add(post);
  }
  // 紅白の屋根
  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.92), mat(i % 2 ? 'castWhite' : 'curbRed'));
    strip.position.set(-0.1, 3.1, -2.3 + i * 0.92);
    strip.rotation.z = 0.18;
    g.add(strip);
  }
  // 提灯
  for (const z of [-1.6, 0, 1.6]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat('curbRed'));
    lamp.scale.y = 1.3;
    lamp.position.set(-1.25, 2.55, z);
    g.add(lamp);
  }
  // のれん
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 3.4), mat('castOrange'));
  sign.position.set(-1.3, 2.05, 0);
  g.add(sign);
  return g;
}

/**
 * 吹っ飛ばしの武器（根元が原点、+y へ伸びる）。kind: 'fan'（巨大うちわ）| 'hammer'（モヒカン型ハンマー）
 * rotation.z を正にすると後ろ（-x）へ振りかぶる。
 */
export function buildStackWeapon(THREE, mat, kind = 'fan') {
  const root = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), mat('boardDark'));
  handle.position.y = 0.8;
  root.add(handle);
  if (kind === 'hammer') {
    const head = new THREE.Group();
    head.position.y = 1.85;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.1), mat('heroMohican'));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 1.12), mat('heroMohicanStripe'));
    const moh = mohawkFan(THREE, mat, 0.75);
    moh.position.y = 0.2;
    head.add(block, band, moh);
    root.add(head);
  } else {
    const head = new THREE.Group();
    head.position.y = 2.4;
    const discGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.06, 18);
    discGeo.rotateZ(Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, mat('castWhite'));
    const markGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16);
    markGeo.rotateZ(Math.PI / 2);
    const mark = new THREE.Mesh(markGeo, mat('curbRed'));
    head.add(disc, mark);
    for (const a of [-0.6, 0, 0.6]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.05), mat('boardDark'));
      rib.rotation.x = a;
      head.add(rib);
    }
    root.add(head);
  }
  return { root, kind };
}

/** i 段目（1 始まり）のブロックの中心の高さ */
export function levelY(i, L = STACK_LAYOUT) {
  return L.baseHeight + (Number(i) - 0.5) * L.blockHeight;
}

const blockGeoCache = new Map();
function blockGeos(THREE, h, d) {
  const key = `${h}:${d}`;
  let g = blockGeoCache.get(key);
  if (!g || g.THREE !== THREE) {
    g = {
      THREE,
      body: new THREE.BoxGeometry(1, h, d),
      band: new THREE.BoxGeometry(1, h * 0.24, 0.04),
      ridge: new THREE.BoxGeometry(0.92, 0.08, d * 0.25),
    };
    blockGeoCache.set(key, g);
  }
  return g;
}

/** モヒカンのブロック（幅は setWidth で変える。中心が原点） */
export function buildStackBlock(THREE, mat, {
  width = STACK_LAYOUT.baseWidth, colorKey = 'heroMohican',
  height = STACK_LAYOUT.blockHeight, depth = STACK_LAYOUT.blockDepth,
} = {}) {
  const g = blockGeos(THREE, height, depth);
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const body = new THREE.Mesh(g.body, mat(colorKey));
  const band = new THREE.Mesh(g.band, mat('heroMohicanStripe'));
  band.position.set(0, -height * 0.18, depth / 2 + 0.02);
  const ridge = new THREE.Mesh(g.ridge, mat('heroMohicanStripe'));
  ridge.position.y = height / 2 + 0.04;
  inner.add(body, band, ridge);
  const block = {
    root,
    colorKey,
    width,
    height,
    setWidth(w) {
      block.width = Math.max(0.01, Number(w) || 0.01);
      inner.scale.x = block.width;
    },
    setColor(key) {
      block.colorKey = key;
      body.material = mat(key);
    },
  };
  block.setWidth(width);
  return block;
}

/** 舞台を組み立てる。{world, rival, pot, update(t)} */
export function buildStackArena(THREE, { mat, addLights = null, makeShadow = null } = {}) {
  const world = new THREE.Scene();
  world.background = new THREE.Color(PALETTE.sky);
  world.fog = new THREE.Fog(PALETTE.sky, 25, 80);
  if (typeof addLights === 'function') addLights(world);
  const tx = getTextures(THREE);
  const L = STACK_LAYOUT;

  const grass = new THREE.Mesh(new THREE.CircleGeometry(70, 16), tx.material('grass', { repeat: textureRepeat(140, 140, 3) }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(10, -0.03, 0);
  world.add(grass);
  const plazaW = 40;
  const plazaD = 16;
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(plazaW, 0.1, plazaD),
    tx.material('cobble', { repeat: textureRepeat(plazaW, plazaD, 2.5) }),
  );
  plaza.position.set(11, -0.05, 0);
  world.add(plaza);

  // 塔の土台
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(L.baseWidth, L.baseHeight, 1.6),
    tx.material('planks', { repeat: textureRepeat(L.baseWidth, 1.6, 1.5) }),
  );
  base.position.set(L.towerX, L.baseHeight / 2, 0);
  world.add(base);

  // 線
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, plazaD - 1), mat('roadLine'));
  line.position.set(L.lineX, 0.02, 0);
  world.add(line);
  for (const z of [-(plazaD / 2 - 1), plazaD / 2 - 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat('boardDark'));
    pole.position.set(L.lineX, 0.8, z);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.6), mat('curbRed'));
    flag.position.set(L.lineX, 1.4, z + 0.3);
    world.add(pole, flag);
  }

  // 油の鍋
  const pot = new THREE.Group();
  pot.position.set(L.pot.x, 0, L.pot.z);
  const potBody = new THREE.Mesh(new THREE.CylinderGeometry(L.pot.r * 1.1, L.pot.r * 0.85, 0.9, 16), mat('gunNozzle'));
  potBody.position.y = 0.45;
  const oil = new THREE.Mesh(new THREE.CircleGeometry(L.pot.r * 1.0, 16), mat('castFry'));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 0.88;
  pot.add(potBody, oil);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.15), mat('roadDark'));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * L.pot.r * 0.8, 0.05, Math.sin(a) * L.pot.r * 0.8);
    pot.add(leg);
  }
  world.add(pot);

  const stall = buildStall(THREE, mat, tx);
  stall.position.set(L.stallX, 0, 0);
  world.add(stall);

  // 広場の飾り（樽）
  for (const [x, z] of [[6, -6], [16, 6], [-6, 5]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), tx.material('planks', { repeat: [2, 1] }));
    barrel.position.set(x, 0.5, z);
    world.add(barrel);
  }

  const rival = buildMohifry(THREE, mat);
  rival.root.position.set(L.rival.x, 0, L.rival.z);
  rival.root.rotation.y = Math.PI / 2;
  world.add(rival.root);
  let rivalShadow = null;
  if (typeof makeShadow === 'function') {
    rivalShadow = makeShadow(1.2);
    rivalShadow.position.set(L.rival.x, 0.02, L.rival.z);
    world.add(rivalShadow);
  }

  return {
    world,
    rival,
    rivalShadow,
    pot,
    oil,
    base,
    /** 土台の幅を塔の土台に合わせる */
    setBaseWidth(w) {
      const v = Number(w) > 0 ? Number(w) : L.baseWidth;
      base.scale.x = v / L.baseWidth;
    },
    update(t) {
      try {
        if (typeof rival.update === 'function') rival.update(t);
      } catch {
        // 演出のみ
      }
      rival.root.position.y = Math.abs(Math.sin(t * 3)) * 0.12;
      oil.position.y = 0.88 + Math.sin(t * 9) * 0.01;
    },
  };
}
