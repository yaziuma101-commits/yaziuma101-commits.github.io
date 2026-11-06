// 工事中の部屋：ふざけた看板・ゲーム名の大看板・光る輪の出口（入ると館の広間へ戻る）。
// 持ち込みの効果バナーは入場時に main.js 側で出る。params を受けても何も起こさない。
import { PALETTE } from '../palette.js';
import { constructionRoom } from '../game-catalog.js';
import { createWalker, labelTexture } from './gallery.js';
import { getTextures } from '../textures.js';
import { textureRepeat } from '../texture-gen.js';

export const CONSTRUCTION_EXIT = Object.freeze({ x: 0, z: 2.8, r: 0.9 });

export function constructionWalkable(x, z, r = 0.35) {
  return Math.abs(x) <= 4.6 - r && z >= -3.6 + r && z <= 3.8 - r;
}

export function createConstructionScene(ctx) {
  const { THREE, mat } = ctx;
  let world = null;
  let walker = null;
  let bigSign = null;
  let tiltSign = null;
  let ring = null;
  let leaving = false;
  let time = 0;
  let room = null;
  let nuTimer = 4;

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 25, 70);
    ctx.addLights(world);
    const tx = getTextures(THREE);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 12), tx.material('grass', { repeat: textureRepeat(80, 80, 3) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    world.add(ground);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), tx.material('planks', { repeat: textureRepeat(10, 8, 2.5) }));
    floor.position.y = -0.1;
    world.add(floor);
    const wallMat = tx.material('brick', { repeat: [3, 1] });
    const back = new THREE.Mesh(new THREE.BoxGeometry(10.4, 3.5, 0.3), wallMat);
    back.position.set(0, 1.75, -4.15);
    world.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 8), wallMat);
      side.position.set(s * 5.15, 1.75, 0);
      world.add(side);
    }
    // ゲーム名の大看板（色味はテクスチャに任せるので白で乗算）
    bigSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4), new THREE.MeshBasicMaterial({ color: PALETTE.uiText }));
    bigSign.position.set(0, 2.6, -3.98);
    world.add(bigSign);
    // 傾いた看板
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mat('boardDark'));
    post.position.set(-2.2, 0.9, -2.2);
    world.add(post);
    tiltSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 1.1),
      new THREE.MeshBasicMaterial({ color: PALETTE.uiText, side: THREE.DoubleSide }),
    );
    tiltSign.position.set(-2.2, 1.8, -2.15);
    tiltSign.rotation.z = 0.22;
    world.add(tiltSign);
    // 工事のコーン
    const coneGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
    for (const [x, z] of [[2.4, -2.4], [3.2, -1.6], [1.6, -3]]) {
      const c = new THREE.Mesh(coneGeo, mat('gunBody'));
      c.position.set(x, 0.4, z);
      world.add(c);
    }
    // 光る輪の出口
    ring = new THREE.Mesh(
      new THREE.TorusGeometry(CONSTRUCTION_EXIT.r, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.uiAccent }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(CONSTRUCTION_EXIT.x, 0.15, CONSTRUCTION_EXIT.z);
    world.add(ring);
    walker = createWalker(ctx, { walkable: constructionWalkable, camDist: 6, camHeight: 3.6 });
    walker.addTo(world);
  }

  function setMap(mesh, tex) {
    const m = mesh.material;
    if (m.map) m.map.dispose();
    m.map = tex;
    m.needsUpdate = true;
  }

  return {
    enter(params = {}) {
      if (!world) build();
      room = constructionRoom(params.gameId) || {
        gameId: null, title: params.title || '？？？', sign: '工事中', exit: { to: 'gallery' },
      };
      setMap(bigSign, labelTexture(THREE, [room.title], { w: 320, h: 64 }));
      setMap(tiltSign, labelTexture(THREE, ['工事中', room.sign], { w: 256, h: 96, bg: PALETTE.signStripe, border: PALETTE.signInk }));
      leaving = false;
      walker.place(0, 0.4, Math.PI);
      ctx.setWorld(world);
      ctx.ui.refreshHud();
      ctx.ui.setHint('この部屋は工事中！　光る輪に入ると絵画の館へ戻る');
    },
    update(dt) {
      time += dt;
      ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
      ring.rotation.z += dt;
      nuTimer -= dt;
      if (nuTimer <= 0) {
        nuTimer = 6 + Math.random() * 6;
        if (ctx.silly && typeof ctx.silly.popText === 'function') ctx.silly.popText('ぬ゛');
      }
      if (leaving) return;
      walker.update(dt, { locked: false });
      const s = walker.st;
      if (Math.hypot(s.x - CONSTRUCTION_EXIT.x, s.z - CONSTRUCTION_EXIT.z) <= CONSTRUCTION_EXIT.r) {
        leaving = true;
        if (!ctx.goto((room && room.exit && room.exit.to) || 'gallery', { fromConstruction: true })) leaving = false;
      }
    },
    exit() {
      ctx.ui.setHint('');
    },
  };
}
