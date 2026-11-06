// FPS番長の射撃場（部屋の中身）。three.js は引数で受け取る。
import { buildFpsBoss, buildMohicanModel } from '../characters.js';
import { createFpsMinigame } from '../scenes/fps.js';

/** 番長のミニゲーム（一人称の水鉄砲バトル）。{enter, update, exit, pauseItems} を返す */
export function createMinigame(ctx, boss, params) {
  return createFpsMinigame(ctx, boss, { params });
}

const f = Object.freeze;

// 部屋の座標: x は [-8, 8]、z は [-6, 6]。北が -z、南（出入口）が +z。
export const ROOM_LAYOUT = f({
  boss: f({ x: 0, z: -3.6, radius: 1.3 }),
  prize: f({ x: 2.6, z: -4.4, r: 0.5 }),
  targets: f([
    f({ x: -6, z: -5.3, ry: 0 }),
    f({ x: -3.9, z: -5.4, ry: 0 }),
    f({ x: 5.6, z: -5.3, ry: 0 }),
    f({ x: -7.3, z: -0.5, ry: Math.PI / 2 }),
    f({ x: 7.3, z: -1, ry: -Math.PI / 2 }),
  ]),
  barrels: f([
    f({ x: -6.4, z: 3.4 }),
    f({ x: -5.5, z: 4 }),
    f({ x: 6.4, z: 3.2 }),
  ]),
  sandbags: f([
    f({ x: -4.5, z: 1, w: 2.4 }),
    f({ x: 4.5, z: 1, w: 2.4 }),
  ]),
});
export const BARREL_RADIUS = 0.45;

/** 当たり判定の円（ボス本体は部屋シーン側で足す） */
export function roomObstacles() {
  const L = ROOM_LAYOUT;
  const out = [];
  for (const t of L.targets) out.push({ x: t.x, z: t.z, r: 0.4 });
  for (const b of L.barrels) out.push({ x: b.x, z: b.z, r: BARREL_RADIUS });
  for (const s of L.sandbags) {
    for (const dx of [-s.w / 4, s.w / 4]) out.push({ x: s.x + dx, z: s.z, r: s.w / 4 + 0.1 });
  }
  out.push({ x: L.prize.x, z: L.prize.z, r: L.prize.r });
  return out;
}

export function buildRoom(THREE, palette, mat, boss = null) {
  const group = new THREE.Group();
  const L = ROOM_LAYOUT;

  // 番長へ続く通路
  const carpetStart = L.boss.z + 1.6;
  const carpetEnd = 6;
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, carpetEnd - carpetStart), mat('road'));
  carpet.position.set(0, 0.02, (carpetStart + carpetEnd) / 2);
  group.add(carpet);

  // 的（白と赤の輪）
  const swingers = [];
  const ringKeys = ['checkerLight', 'mohicanRed', 'checkerLight', 'mohicanRed'];
  const ringR = [0.6, 0.45, 0.3, 0.15];
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6);
  for (const t of L.targets) {
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.z);
    g.rotation.y = t.ry;
    const post = new THREE.Mesh(postGeo, mat('boardDark'));
    post.position.y = 0.6;
    g.add(post);
    const face = new THREE.Group();
    face.position.y = 1.4;
    ringR.forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 12), mat(ringKeys[i]));
      ring.rotation.x = Math.PI / 2;
      ring.position.z = i * 0.012;
      face.add(ring);
    });
    g.add(face);
    group.add(g);
    swingers.push({ face, phase: swingers.length * 1.3 });
  }

  // 水の樽
  const barrelGeo = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS, 0.9, 8);
  const bandGeo = new THREE.CylinderGeometry(BARREL_RADIUS + 0.03, BARREL_RADIUS + 0.03, 0.12, 8);
  for (const b of L.barrels) {
    const barrel = new THREE.Mesh(barrelGeo, mat('gunTank'));
    barrel.position.set(b.x, 0.45, b.z);
    const band = new THREE.Mesh(bandGeo, mat('gunBody'));
    band.position.set(b.x, 0.6, b.z);
    group.add(barrel, band);
  }

  // 土のう
  for (const s of L.sandbags) {
    const low = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.45, 0.7), mat('sandDark'));
    low.position.set(s.x, 0.225, s.z);
    const up = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.8, 0.35, 0.6), mat('sandDark'));
    up.position.set(s.x, 0.62, s.z);
    group.add(low, up);
  }

  // 番長の壇と本体
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 8), mat('grassDark'));
  dais.position.set(L.boss.x, 0.15, L.boss.z);
  group.add(dais);
  const model = buildFpsBoss(THREE, mat, { scale: 1.7 });
  model.root.position.set(L.boss.x, 0.3, L.boss.z);
  group.add(model.root);

  // 景品のモヒカン（勝利済みなら消える）
  const prize = new THREE.Group();
  prize.position.set(L.prize.x, 0, L.prize.z);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 6), mat('pedestal'));
  stand.position.y = 0.45;
  const colorKey = boss?.mohican?.colorKey && boss.mohican.colorKey in palette ? boss.mohican.colorKey : 'mohicanGreen';
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
      for (const s of swingers) s.face.rotation.z = Math.sin(t * 1.5 + s.phase) * 0.08;
    },
  };
}
