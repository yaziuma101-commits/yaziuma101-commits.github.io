// パズル番長の部屋の中身とミニゲーム（three.js は引数で受け取る）。
import { buildAlinus, buildMohicanModel } from '../characters.js';
import { createPuzzleMinigame } from '../scenes/puzzle.js';

/** 番長のミニゲーム（3D 倉庫番）。{enter, update, exit} を返す */
export function createMinigame(ctx, boss, params) {
  return createPuzzleMinigame(ctx, boss, undefined, { params });
}

// 部屋の座標: x は [-8, 8]、z は [-6, 6]。北が -z、南（出入口）が +z。
export const ROOM_LAYOUT = Object.freeze({
  boss: Object.freeze({ x: 0, z: -3.6, radius: 1.3 }),
  prize: Object.freeze({ x: 2.6, z: -4.4, r: 0.5 }),
  crates: Object.freeze([
    Object.freeze({ x: -6, z: -4.2, s: 1.1, h: 2 }),
    Object.freeze({ x: 6, z: -4.2, s: 1.1, h: 1 }),
    Object.freeze({ x: -6, z: 3.2, s: 1, h: 1 }),
    Object.freeze({ x: 6, z: 2.4, s: 0.9, h: 2 }),
  ]),
  glowTiles: Object.freeze([
    Object.freeze({ x: -3, z: -0.5 }),
    Object.freeze({ x: 3, z: -0.5 }),
    Object.freeze({ x: -3.5, z: 2.5 }),
    Object.freeze({ x: 3.5, z: 2.5 }),
  ]),
});

/** 当たり判定の円（ボス本体は部屋シーン側で足す） */
export function roomObstacles() {
  const out = ROOM_LAYOUT.crates.map((c) => ({ x: c.x, z: c.z, r: c.s * 0.75 }));
  out.push({ x: ROOM_LAYOUT.prize.x, z: ROOM_LAYOUT.prize.z, r: ROOM_LAYOUT.prize.r });
  return out;
}

export function buildRoom(THREE, palette, mat, boss = null) {
  const group = new THREE.Group();
  const L = ROOM_LAYOUT;

  // ボスへ続くじゅうたん
  const carpetStart = L.boss.z + 1.6;
  const carpetEnd = 6;
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, carpetEnd - carpetStart), mat('road'));
  carpet.position.set(0, 0.02, (carpetStart + carpetEnd) / 2);
  group.add(carpet);

  // 光るマス（倉庫番のゴールの予告）
  const glowMat = new THREE.MeshLambertMaterial({
    color: palette.road, emissive: palette.road, emissiveIntensity: 0.3, flatShading: true,
  });
  const tileGeo = new THREE.BoxGeometry(0.9, 0.05, 0.9);
  for (const t of L.glowTiles) {
    const tile = new THREE.Mesh(tileGeo, glowMat);
    tile.position.set(t.x, 0.03, t.z);
    group.add(tile);
  }

  // 積まれた木箱
  for (const c of L.crates) {
    const geo = new THREE.BoxGeometry(c.s, c.s, c.s);
    for (let i = 0; i < c.h; i++) {
      const box = new THREE.Mesh(geo, mat(i % 2 ? 'boardDark' : 'board'));
      box.position.set(c.x, c.s * (i + 0.5), c.z);
      box.rotation.y = i * 0.3;
      group.add(box);
    }
  }

  // 番長の壇と本体（仲間と同系統で大きめ）
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 8), mat('pedestalTop'));
  dais.position.set(L.boss.x, 0.15, L.boss.z);
  group.add(dais);
  const model = buildAlinus(THREE, mat, { scale: 1.7, pose: 'hips' });
  model.root.position.set(L.boss.x, 0.3, L.boss.z);
  group.add(model.root);

  // 景品のモヒカン（勝利済みなら消える）
  const prize = new THREE.Group();
  prize.position.set(L.prize.x, 0, L.prize.z);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 6), mat('pedestal'));
  stand.position.y = 0.45;
  const colorKey = boss?.mohican?.colorKey && boss.mohican.colorKey in palette ? boss.mohican.colorKey : 'mohicanRed';
  const moh = buildMohicanModel(THREE, mat, colorKey);
  moh.position.y = 1;
  moh.scale.setScalar(1.3);
  prize.add(stand, moh);
  group.add(prize);

  return {
    group,
    boss: { x: L.boss.x, z: L.boss.z, radius: L.boss.radius, model },
    obstacles: roomObstacles(),
    setDefeated(defeated) {
      prize.visible = !defeated;
    },
    update(dt, t) {
      glowMat.emissiveIntensity = 0.3 + 0.25 * Math.sin(t * 3);
      moh.rotation.y += dt * 1.5;
      moh.position.y = 1 + Math.sin(t * 2) * 0.08;
    },
  };
}
