// レース番長のガレージ（部屋の中身）。three.js は引数で受け取る。
// 勝負（カートレース）は次の段階で createMinigame として足す。
import { buildRaceBoss, buildMohicanModel } from '../characters.js';
import { createRaceMinigame } from '../scenes/race.js';

/** 番長のミニゲーム（カートレース）。{enter, update, exit, pauseItems} を返す */
export function createMinigame(ctx, boss, params) {
  return createRaceMinigame(ctx, boss, { params });
}

const f = Object.freeze;

// 部屋の座標: x は [-8, 8]、z は [-6, 6]。北が -z、南（出入口）が +z。
export const ROOM_LAYOUT = f({
  boss: f({ x: 0, z: -3.6, radius: 1.3 }),
  prize: f({ x: 2.6, z: -4.4, r: 0.5 }),
  flag: f({ x: -2.6, z: -4.6, r: 0.3 }),
  tires: f([
    f({ x: -6.6, z: -4.6, h: 4 }),
    f({ x: -5.2, z: -4.8, h: 3 }),
    f({ x: 5.2, z: -4.8, h: 2 }),
    f({ x: 6.6, z: -4.6, h: 4 }),
    f({ x: -6.8, z: 0.5, h: 3 }),
    f({ x: 6.8, z: 0.5, h: 2 }),
    f({ x: -6.6, z: 3.6, h: 2 }),
    f({ x: 6.6, z: 3.4, h: 3 }),
  ]),
});
export const TIRE_RADIUS = 0.7;

/** 当たり判定の円（ボス本体は部屋シーン側で足す） */
export function roomObstacles() {
  const L = ROOM_LAYOUT;
  const out = L.tires.map((t) => ({ x: t.x, z: t.z, r: TIRE_RADIUS }));
  out.push({ x: L.prize.x, z: L.prize.z, r: L.prize.r });
  out.push({ x: L.flag.x, z: L.flag.z, r: L.flag.r });
  return out;
}

function checkerTexture(THREE, palette, cols, rows, cell = 16) {
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const g = c.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 ? palette.checkerDark : palette.checkerLight;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(THREE, palette, mat, boss = null) {
  const group = new THREE.Group();
  const L = ROOM_LAYOUT;

  // チェッカーの床（2x2 のマス）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshLambertMaterial({ map: checkerTexture(THREE, palette, 8, 6) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  group.add(floor);

  // 積まれたタイヤ
  const tireGeo = new THREE.TorusGeometry(0.45, 0.2, 6, 10);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.3, 8);
  for (const t of L.tires) {
    for (let i = 0; i < t.h; i++) {
      const y = 0.2 + i * 0.4;
      const dx = i % 2 ? 0.06 : -0.04;
      const tire = new THREE.Mesh(tireGeo, mat('tire'));
      tire.rotation.x = Math.PI / 2;
      tire.position.set(t.x + dx, y, t.z);
      const rim = new THREE.Mesh(rimGeo, mat('tireRim'));
      rim.position.set(t.x + dx, y, t.z);
      group.add(tire, rim);
    }
  }

  // チェッカーの旗
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), mat('tireRim'));
  pole.position.set(L.flag.x, 1.4, L.flag.z);
  group.add(pole);
  const flagPivot = new THREE.Group();
  flagPivot.position.set(L.flag.x, 2.35, L.flag.z);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.85),
    new THREE.MeshLambertMaterial({ map: checkerTexture(THREE, palette, 4, 3), side: THREE.DoubleSide }),
  );
  flag.position.x = 0.71;
  flagPivot.add(flag);
  group.add(flagPivot);

  // 番長の壇と本体
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 8), mat('roadDark'));
  dais.position.set(L.boss.x, 0.15, L.boss.z);
  group.add(dais);
  const model = buildRaceBoss(THREE, mat, { scale: 1.7 });
  model.root.position.set(L.boss.x, 0.3, L.boss.z);
  group.add(model.root);

  // 景品のモヒカン（勝利済みなら消える）
  const prize = new THREE.Group();
  prize.position.set(L.prize.x, 0, L.prize.z);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 6), mat('pedestal'));
  stand.position.y = 0.45;
  const colorKey = boss?.mohican?.colorKey && boss.mohican.colorKey in palette ? boss.mohican.colorKey : 'mohicanYellow';
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
      moh.rotation.y += dt * 1.5;
      moh.position.y = 1 + Math.sin(t * 2) * 0.08;
      flagPivot.rotation.y = Math.sin(t * 2) * 0.3;
      if (model.flutter) model.flutter(t);
    },
  };
}
