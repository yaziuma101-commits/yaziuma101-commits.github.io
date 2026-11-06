// ハブの島：中央の台座（集めたモヒカン・付け替え）、仲間4人、ボスの門、絵画の館。
// 地面・道・砂浜・海・建物の壁は手続きテクスチャ（textures.js）。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import { BOSSES, MOHICAN_TOTAL } from '../bosses.js';
import { isBossDefeated } from '../progress.js';
import {
  buildAlinus, buildMohicanModel, createAnimState, stepAnim, DASH_SPEED,
} from '../characters.js';
import {
  NPCS, findTalkTarget, nextLine, cameraTurn,
} from '../npcs.js';
import {
  createHeroRig, applyMohawkColor, setDefaultMohawkColor, getDefaultMohawkColor,
} from '../hero-model.js';
import { availableColors } from '../mohawk-color.js';
import { hubBosses, gameIdForBoss } from '../boss-registry.js';
import { enterBossGate } from '../hub-gate-entry.js';
import {
  gatePoint, gateAt, isGateOpen, isWalkable, HUB_WALK_RADIUS,
} from '../hub.js';
import { ownedColorsFrom } from '../ending.js';
import {
  GALLERY_ANGLE_DEG, GALLERY_CASTLE_RADIUS, GALLERY_DOOR, GALLERY_DOOR_RANGE, GALLERY_HUB_SPAWN,
} from '../gallery-layout.js';
import { labelTexture } from './gallery.js';
import { getTextures } from '../textures.js';
import { waterUvOffset, textureRepeat } from '../texture-gen.js';
import { createCastTroupe } from '../cast-build.js';
import { CAST_PLACEMENT, pickLine } from '../cast-defs.js';
import { createRng, timeSeed } from '../seeded-rng.js';
import { createEventScheduler, hubEventBlocked } from '../silly-rules.js';
import { createHubEventPlayer } from '../silly-fx.js';
import { createCastEventScheduler } from '../cast-events.js';
import { createCastEventPlayer } from '../cast-events-fx.js';
import { pitchFromOffset, stepPitch, orbitCameraPosition } from '../orbit-pitch.js';
import {
  loadStory, saveStory, rescuedCompanions, pendingThanks, THANKS_LINES, mansionOpen, shouldRaiseMansion,
  senpaiHint, SEAL_LINES, riseAt, RISE_TOTAL, allPaintingsEventDue,
} from '../story.js';
import { allCollected } from '../paintings.js';
import { createStoryOverlay } from '../story-overlay.js';
import { consumePitchDrag, resetPitchDrag } from '../pitch-drag.js';

// ---- 新キャラの置き場所（門への道・木・仲間を避ける。みんな広場の手前を向く） ----
const castAt = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  const x = r * Math.cos(a);
  const z = r * Math.sin(a);
  return Object.freeze({ x, z, facing: Math.atan2(-x, 4 - z) });
};
export const HUB_CAST_SPOTS = Object.freeze({
  dekaatama: castAt(250, 9.5),
  onasu: castAt(120, 8),
  tofu: castAt(50, 9),
  neko: castAt(190, 10.5),
  mohifry: Object.freeze({
    x: 0, z: 0, ring: 4.3, speed: 0.22, gap: 0.26, scale: 0.75,
  }),
});

// ---- 台座 ----
export const PEDESTAL_CENTER = Object.freeze({ x: 0, z: 0 });
export const PEDESTAL_RADIUS = 1.2;
export const PEDESTAL_HEIGHT = 1.1;
export const PEDESTAL_SLOT_RADIUS = 0.7;
export const PEDESTAL_RANGE = 2.7;

function ownsMohicanOf(progress, boss) {
  if (!progress || !boss || !boss.mohican) return false;
  if (Array.isArray(progress.mohicans)) return progress.mohicans.includes(boss.mohican.id);
  return isBossDefeated(progress, boss.id);
}

/**
 * 台座の上のモヒカンの枠 [{index,x,y,z,boss,filled,colorKey}]。
 * progress（進行状況か null）を渡すとボスの数だけ並び、勝ったボスの枠が filled になる。
 * 数を渡すと、その数だけ枠を並べる（filled は false）。1つ目は手前。
 */
export function pedestalSlots(progress = null, bosses = BOSSES) {
  const list = Array.isArray(bosses) ? bosses : BOSSES;
  const byCount = typeof progress === 'number';
  const count = byCount
    ? Math.max(0, Math.floor(Number.isFinite(progress) ? progress : 0))
    : list.length;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / count;
    const boss = list[i] || null;
    out.push(Object.freeze({
      index: i,
      x: PEDESTAL_CENTER.x + Math.cos(a) * PEDESTAL_SLOT_RADIUS,
      y: PEDESTAL_HEIGHT,
      z: PEDESTAL_CENTER.z + Math.sin(a) * PEDESTAL_SLOT_RADIUS,
      boss,
      filled: !byCount && ownsMohicanOf(progress, boss),
      colorKey: boss && boss.mohican ? boss.mohican.colorKey : null,
    }));
  }
  return out;
}

// ---- 木（門への道・仲間・出現位置を避けて置く） ----
export const TREE_RADIUS = 0.7;
const TREE_SPOTS = [[0, 0.78, 1.1], [60, 0.82, 1], [115, 0.8, 1.15], [180, 0.78, 1], [240, 0.8, 1.1], [300, 0.78, 0.95], [330, 0.62, 1]];
const r3 = (v) => Math.round(v * 1000) / 1000;
export const HUB_TREES = Object.freeze(TREE_SPOTS.map(([deg, f, s]) => {
  const a = (deg * Math.PI) / 180;
  const r = HUB_WALK_RADIUS * f;
  return Object.freeze({ x: r3(r * Math.cos(a)), z: r3(r * Math.sin(a)), s, scale: s });
}));

/**
 * ハブに戻ったときの告知。
 * - 場面の引数 {fromBossId, celebrate}：新規獲得で戻ったときだけ「台座に〇〇が飾られた！」、それ以外は ''
 * - (数, 総数) か (ボス|名前, 数, 総数)：獲得数つきの一言
 */
export function celebrationText(a, b, c) {
  if (a === null) return '';
  if (a && typeof a === 'object' && !a.mohican && typeof a.name !== 'string') {
    if (!a.celebrate) return '';
    const id = a.fromBossId || a.fromBoss || a.bossId;
    const boss = BOSSES.find((x) => x.id === id);
    return boss && boss.mohican ? `台座に${boss.mohican.name}が飾られた！` : '';
  }
  let name = null;
  let count;
  let total = MOHICAN_TOTAL;
  if (a && typeof a === 'object') {
    name = (a.mohican && a.mohican.name) || a.name || null;
    count = b;
    if (c !== undefined) total = c;
  } else if (typeof a === 'string') {
    name = a;
    count = b;
    if (c !== undefined) total = c;
  } else {
    count = a;
    if (b !== undefined) total = b;
  }
  const head = name ? `${name}を手に入れた！` : 'モヒカンを手に入れた！';
  const n = Math.floor(Number(count));
  const tt = Math.max(1, Math.floor(Number(total)) || MOHICAN_TOTAL);
  if (!Number.isFinite(n)) return head;
  if (n >= tt) return `${head} モヒカン ${tt}/${tt} そろった！ 先輩に話しかけてみよう`;
  return `${head} モヒカン ${Math.max(0, n)}/${tt}　あと${tt - Math.max(0, n)}個`;
}

const CAM_DIST = 7;
const CAM_HEIGHT = 4.2;
const MOVE_SPEED = 6;
const ROT_SPEED = 2.2;
const DRAG_SPEED = 0.008;
const GRAVITY = 24;
const JUMP_SPEED = 8.5;
const CAM_TARGET_Y = 1.2;
const HUB_PITCH = pitchFromOffset(CAM_DIST, CAM_HEIGHT - CAM_TARGET_Y);
const CAM_RANGE = Math.hypot(CAM_DIST, CAM_HEIGHT - CAM_TARGET_Y);
const CONTROLS_HINT = 'WASD/矢印: 移動　Shift: ダッシュ　Space: ジャンプ　Q/E・R/F・ドラッグ: カメラ';
const COLOR_NAME = Object.freeze({
  blue: '青', red: '赤', yellow: '黄色', green: '緑',
});

function lerpAngle(a, b, t) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function pushOut(p, obstacles) {
  let { x, z } = p;
  for (const o of obstacles) {
    let dx = x - o.x;
    let dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < o.r) {
      if (d < 1e-6) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
      x = o.x + dx * o.r;
      z = o.z + dz * o.r;
    }
  }
  return { x, z };
}

function ownedColorIds(progress) {
  const ids = BOSSES.filter((b) => isBossDefeated(progress, b.id)).map((b) => b.id);
  return ownedColorsFrom(BOSSES, ids);
}

export function createHubScene(ctx) {
  const {
    THREE, camera, input, mat,
  } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const storySfx = (e) => { if (typeof ctx.storySfx === 'function') ctx.storySfx(e); };
  const gates = hubBosses();
  const R = HUB_WALK_RADIUS;
  let world = null;
  let rig = null;
  let heroShadow = null;
  let waterTex = null;
  const obstacles = [];
  const npcs = [];
  const mohicans = [];
  const talkCounts = {};
  const anim = createAnimState();
  let troupe = null;
  const castRng = createRng(timeSeed());
  let hubEvents = null;
  let eventPlayer = null;
  let castEvents = null;
  let castPlayer = null;
  let heroLift = 0;
  let castle = null;
  let story = loadStory(ctx.storage);
  let rise = null; // 館がせり上がる演出 {t, fw}
  let thanksQueue = [];
  let thanksWait = 0;
  let overlay = null;
  const defeatedIds = () => BOSSES.filter((b) => isBossDefeated(ctx.getProgress(), b.id)).map((b) => b.id);
  const visibleNpcs = () => npcs.filter((n) => n.model.root.visible);
  const sillyLevel = () => {
    try {
      return ctx.silly && typeof ctx.silly.level === 'function' ? Number(ctx.silly.level()) || 0 : 0;
    } catch {
      return 0;
    }
  };
  const st = {
    x: 0, z: 8, y: 0, vy: 0, yaw: 0, pitch: HUB_PITCH, facing: Math.PI, moving: false, leaving: false,
  };
  let time = 0;

  function buildCastle(tx) {
    const a = (GALLERY_ANGLE_DEG * Math.PI) / 180;
    const g = new THREE.Group();
    const p = gatePoint({ gateAngleDeg: GALLERY_ANGLE_DEG }, GALLERY_CASTLE_RADIUS);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.PI / 2 - a; // ローカル z = 外向き（正面は -z で島の中心を向く）
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const brick = (w, h) => tx.material('brick', { repeat: textureRepeat(w, h, 2.5) });
    add(new THREE.BoxGeometry(11, 1.4, 7.5), tx.material('cobble', { repeat: textureRepeat(11, 7.5, 2.5) }), 0, -0.65, 3.2);
    add(new THREE.BoxGeometry(9, 6, 6), brick(9, 6), 0, 3, 3);
    add(new THREE.BoxGeometry(2.4, 0.05, 3.3), mat('scarf'), 0, 0.03, -1.65);
    const merlon = brick(1, 1);
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.9, 0.8, 0.9), merlon, i * 1.8, 6.4, 0.3);
    const flagGeo = new THREE.BoxGeometry(0.9, 0.55, 0.05);
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5);
    const towerMat = brick(8, 8.5);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.3, 1.4, 8.5, 8), towerMat, s * 4.8, 4.25, 0.2);
      add(new THREE.ConeGeometry(1.7, 2.6, 8), mat('uiAccent'), s * 4.8, 9.8, 0.2);
      add(poleGeo, mat('boardDark'), s * 4.8, 11.7, 0.2);
      add(flagGeo, mat('mohicanYellow'), s * 4.8 + 0.45, 12.1, 0.2);
      add(new THREE.BoxGeometry(0.8, 1.2, 0.1), mat('signInk'), s * 2.6, 3.8, -0.06);
    }
    add(new THREE.CylinderGeometry(1.6, 1.7, 10, 8), brick(10, 10), 0, 5, 4);
    add(new THREE.ConeGeometry(2.1, 3.2, 8), mat('uiAccent'), 0, 11.6, 4);
    add(poleGeo, mat('boardDark'), 0, 13.9, 4);
    add(flagGeo, mat('mohicanRed'), 0.45, 14.3, 4);
    add(new THREE.BoxGeometry(2.2, 3, 0.2), tx.material('planks', { repeat: [1, 1] }), 0, 1.5, -0.05);
    const arch = add(new THREE.CircleGeometry(1.1, 10, 0, Math.PI), mat('boardDark'), 0, 3, -0.16);
    arch.rotation.y = Math.PI;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: labelTexture(THREE, ['絵画の館'], { w: 128, h: 32 }) }),
    );
    plate.position.set(0, 5, -0.07);
    plate.rotation.y = Math.PI;
    g.add(plate);
    return g;
  }

  function road(tx, deg, r0, r1, w) {
    const a = (deg * Math.PI) / 180;
    const len = r1 - r0;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.04, len),
      tx.material('cobble', { repeat: textureRepeat(w, len, 2.5) }),
    );
    const rc = (r0 + r1) / 2;
    m.position.set(Math.cos(a) * rc, 0.02, Math.sin(a) * rc);
    m.rotation.y = Math.PI / 2 - a;
    world.add(m);
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 45, 150);
    ctx.addLights(world);
    const tx = getTextures(THREE);

    // 海（UV をゆっくり流す）
    const seaR = 220;
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(seaR, 32),
      tx.material('water', { repeat: textureRepeat(seaR * 2, seaR * 2, 4) }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.7;
    waterTex = sea.material.map;
    world.add(sea);

    // 砂浜と芝生の島
    const sandMat = tx.material('sand', { repeat: textureRepeat((R + 10) * 2, (R + 10) * 2, 3) });
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(R + 9, R + 11, 0.6, 40), sandMat);
    beach.position.y = -0.6;
    const grassMat = tx.material('grass', { repeat: textureRepeat((R + 1.2) * 2, (R + 1.2) * 2, 3) });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R + 1.6, 0.6, 40), [sandMat, grassMat, grassMat]);
    island.position.y = -0.3;
    world.add(beach, island);

    // 石畳の道（門と館の入口へ）と台座のまわり
    for (const b of gates) road(tx, b.gateAngleDeg, 2.2, R + 2.5, 2.6);
    road(tx, GALLERY_ANGLE_DEG, 2.2, R + 0.5, 2.6);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 3.4, 24),
      tx.material('cobble', { repeat: [3, 3] }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    world.add(ring);

    // 木の桟橋（床板）
    const pierA = (100 * Math.PI) / 180;
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.25, 9),
      tx.material('planks', { repeat: textureRepeat(3, 9, 2.5) }),
    );
    pier.position.set(Math.cos(pierA) * (R + 6), -0.25, Math.sin(pierA) * (R + 6));
    pier.rotation.y = Math.PI / 2 - pierA;
    world.add(pier);

    // 門
    const postGeo = new THREE.BoxGeometry(0.5, 3.5, 0.5);
    const beamGeo = new THREE.BoxGeometry(4.6, 0.45, 0.6);
    const boardGeo = new THREE.BoxGeometry(3, 0.9, 0.2);
    for (const b of gates) {
      const p = gatePoint(b, R + 0.6);
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      g.rotation.y = Math.atan2(p.x, p.z);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, mat('gatePost'));
        post.position.set(s * 1.9, 1.75, 0);
        g.add(post);
      }
      const beam = new THREE.Mesh(beamGeo, mat('gateBeam'));
      beam.position.y = 3.6;
      const board = new THREE.Mesh(boardGeo, tx.material('planks', { repeat: [1, 1] }));
      board.position.y = 4.35;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.65),
        new THREE.MeshBasicMaterial({ map: labelTexture(THREE, [b.name], { w: 256, h: 64 }) }),
      );
      label.position.set(0, 4.35, -0.11);
      label.rotation.y = Math.PI;
      g.add(beam, board, label);
      world.add(g);
    }

    castle = buildCastle(tx);
    world.add(castle);

    // 台座と集めたモヒカン（枠はボスの数だけ）
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, PEDESTAL_HEIGHT, 12), mat('pedestal'));
    base.position.set(PEDESTAL_CENTER.x, PEDESTAL_HEIGHT / 2, PEDESTAL_CENTER.z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 12), mat('pedestalTop'));
    top.position.set(PEDESTAL_CENTER.x, PEDESTAL_HEIGHT, PEDESTAL_CENTER.z);
    world.add(base, top);
    obstacles.push({ x: PEDESTAL_CENTER.x, z: PEDESTAL_CENTER.z, r: PEDESTAL_RADIUS });
    for (const s of pedestalSlots(null)) {
      if (!s.boss || !s.colorKey) continue;
      const group = buildMohicanModel(THREE, mat, s.colorKey);
      group.scale.setScalar(1.3);
      group.position.set(s.x, s.y + 0.06, s.z);
      group.visible = false;
      world.add(group);
      mohicans.push({ boss: s.boss, group });
    }

    // 木
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
    const leafGeo = new THREE.ConeGeometry(1.6, 2.6, 7);
    const leafGeo2 = new THREE.ConeGeometry(1.2, 2, 7);
    for (const t of HUB_TREES) {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.scale.setScalar(t.s);
      const trunk = new THREE.Mesh(trunkGeo, mat('trunk'));
      trunk.position.y = 1;
      const l1 = new THREE.Mesh(leafGeo, mat('leaf'));
      l1.position.y = 2.8;
      const l2 = new THREE.Mesh(leafGeo2, mat('leaf'));
      l2.position.y = 3.9;
      g.add(trunk, l1, l2);
      world.add(g);
      obstacles.push({ x: t.x, z: t.z, r: TREE_RADIUS });
    }

    // 仲間
    for (const npc of NPCS) {
      const model = buildAlinus(THREE, mat, npc.shape);
      model.root.position.set(npc.x, 0, npc.z);
      model.root.rotation.y = npc.facing;
      const shadow = ctx.makeShadow(npc.shadow);
      shadow.position.set(npc.x, 0.02, npc.z);
      world.add(model.root, shadow);
      const ob = { x: npc.x, z: npc.z, r: npc.radius };
      npcs.push({
        npc, model, shadow, ob, anim: createAnimState(),
      });
      obstacles.push(ob);
    }

    // 新キャラ
    troupe = createCastTroupe(THREE, CAST_PLACEMENT.hub, HUB_CAST_SPOTS, { makeShadow: (r) => ctx.makeShadow(r) });
    world.add(troupe.group);
    obstacles.push(...troupe.obstacles);

    // ふざけた出来事（当たり判定なし）
    eventPlayer = createHubEventPlayer(THREE, world, {
      rng: castRng,
      buddies: () => visibleNpcs().map((n) => n.model.root),
      view: () => ({ x: st.x, z: st.z, yaw: st.yaw }),
      sound: (name) => sfx(name),
      popText: (w) => {
        if (ctx.silly && typeof ctx.silly.popText === 'function') ctx.silly.popText(w);
      },
    });

    // 仲間・キャラクターが起こすふざけた出来事（当たり判定なし）
    castPlayer = createCastEventPlayer(THREE, world, {
      rng: castRng,
      hero: () => ({
        x: st.x, z: st.z, y: st.y + heroLift, yaw: st.yaw,
      }),
      buddies: () => visibleNpcs().map((n) => n.model.root),
      castRoot: (id) => {
        const t = troupe && troupe.group.visible ? troupe.talkers.find((x) => x.id === id) : null;
        return t && t.model && !(t.model.def && t.model.def.crowd) ? t.model.root : null;
      },
      sound: (name) => sfx(name),
      popText: (w) => {
        if (ctx.silly && typeof ctx.silly.popText === 'function') ctx.silly.popText(w, { force: true });
      },
      toast: (text, sec) => ctx.ui.toast(text, sec),
      shake: (s) => {
        if (ctx.silly && typeof ctx.silly.shake === 'function') ctx.silly.shake(s, { force: true });
      },
      nudgeHero: (dx, dz) => nudgeHero(dx, dz),
      setHeroLift: (h) => { heroLift = Number.isFinite(h) && h > 0 ? h : 0; },
    });

    rig = createHeroRig(THREE, mat);
    heroShadow = ctx.makeShadow(1.1);
    world.add(rig.root, heroShadow);
  }

  // 出来事で主人公を押す（歩ける場所だけ）
  function nudgeHero(dx, dz) {
    if (st.leaving || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
    const q = pushOut({ x: st.x + dx, z: st.z + dz }, obstacles);
    if (isWalkable(q, gates)) {
      st.x = q.x;
      st.z = q.z;
    }
  }

  function refreshPedestal() {
    const slots = pedestalSlots(ctx.getProgress());
    for (const m of mohicans) {
      const s = slots.find((x) => x.boss && x.boss.id === m.boss.id);
      m.group.visible = !!(s && s.filled);
    }
  }

  /** 物語の進みを島に映す: 助けた仲間だけを出し、館は封印が解けるまで地面の下 */
  function applyStory() {
    story = loadStory(ctx.storage);
    const here = rescuedCompanions(defeatedIds());
    for (const n of npcs) {
      const on = here.includes(n.npc.id);
      n.model.root.visible = on;
      n.shadow.visible = on;
      n.ob.r = on ? n.npc.radius : 0;
    }
    // 島を歩き回る館のボス（ビッグヌス）は、封印が解けるまで出てこない
    if (troupe) {
      const on = mansionOpen(story);
      troupe.group.visible = on;
      for (const o of troupe.obstacles) {
        if (o.r0 === undefined) o.r0 = o.r;
        o.r = on ? o.r0 : 0;
      }
    }
    if (castle) {
      castle.visible = mansionOpen(story) || !!rise;
      castle.position.y = mansionOpen(story) ? 0 : -16;
    }
  }

  function startRise() {
    if (rise || st.leaving) return;
    rise = { t: 0, fw: 0, rumbled: false, revealed: false };
    if (castle) {
      castle.visible = true;
      castle.position.y = -16;
    }
    if (!overlay) overlay = createStoryOverlay();
    overlay.letterbox(true);
    overlay.caption('めでたし めでたし', 'end');
    overlay.confetti(true);
    try { ctx.music('ending'); } catch { /* 握りつぶす */ }
    sfx('mohawkGet');
  }

  /** silent: 場面を出るとき（ポーズからタイトルへ等）。先輩の話は開かない（タイトルの上に残って固まるため） */
  function finishRise(silent = false) {
    rise = null;
    story = { ...story, mansionRisen: true };
    saveStory(ctx.storage, story);
    if (castle) castle.position.y = 0;
    if (overlay) overlay.hideAll();
    try { ctx.music('hub'); } catch { /* 握りつぶす */ }
    if (silent) return;
    const senpai = NPCS.find((n) => n.id === 'senpai');
    ctx.ui.openDialog({ name: senpai ? senpai.name : '先輩アリヌス', lines: [...SEAL_LINES] });
  }

  /** 演出の1コマ。カメラは映画のように: 島の上空 → 地面すれすれ → 館を見上げる */
  function updateRise(dt) {
    rise.t += dt;
    const r = riseAt(rise.t);
    const g = castle ? castle.position : { x: 0, y: 0, z: 0 };
    let cam;
    let look;
    if (r.phase === 'fakeEnd') {
      // 主人公の上からゆっくり引いて、島全体を見下ろす（エンディングらしく）
      const k = r.k * r.k * (3 - 2 * r.k);
      cam = { x: st.x + Math.sin(rise.t * 0.2) * (6 + 14 * k), y: 3 + 15 * k, z: st.z + Math.cos(rise.t * 0.2) * (6 + 14 * k) };
      look = { x: st.x * (1 - k), y: 1.5, z: st.z * (1 - k) };
    } else if (r.phase === 'rumble') {
      if (!rise.rumbled) {
        rise.rumbled = true;
        storySfx('rumble');
        if (overlay) {
          overlay.caption('……！？', 'shock');
          overlay.confetti(false);
        }
        try { ctx.music(null); } catch { /* 握りつぶす */ }
      }
      cam = { x: st.x + 3.5, y: 1.2, z: st.z + 3.5 };
      look = { x: g.x, y: 2, z: g.z };
    } else {
      if (!rise.revealed && r.phase === 'rise') {
        rise.revealed = true;
        storySfx('reveal');
        if (overlay) overlay.caption('');
      }
      // 館の足もとから見上げ、せり上がるにつれて引いていく
      const k = r.phase === 'rise' ? r.k : 1;
      const dx = st.x - g.x;
      const dz = st.z - g.z;
      const d = Math.hypot(dx, dz) || 1;
      const back = 9 + 9 * k;
      cam = { x: g.x + (dx / d) * back + (dz / d) * 4 * (1 - k), y: 0.6 + 3 * k, z: g.z + (dz / d) * back - (dx / d) * 4 * (1 - k) };
      look = { x: g.x, y: 2 + 5 * (castle ? (castle.position.y + 16) / 16 : 1), z: g.z };
    }
    if (castle && (r.phase === 'rise' || r.phase === 'settle' || r.phase === 'done')) castle.position.y = -16 + 16 * r.riseY;
    const sh = r.shake * 0.35;
    camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
    camera.lookAt(look.x, look.y, look.z);
    if (rise.t >= RISE_TOTAL) finishRise();
  }

  function queueThanks() {
    const list = pendingThanks(defeatedIds(), story);
    thanksQueue = list;
    thanksWait = list.length ? 1.2 : 0;
  }

  function sayThanks() {
    const id = thanksQueue.shift();
    const n = npcs.find((x) => x.npc.id === id);
    if (!n || !THANKS_LINES[id]) return;
    story = { ...story, greeted: [...story.greeted, id] };
    saveStory(ctx.storage, story);
    // 駆け寄るかわりに大きく跳ねて、主人公のほうを向く
    n.hop = 1.2;
    sfx('mohawkGet');
    ctx.ui.openDialog({ name: n.npc.name, lines: [...THANKS_LINES[id]] });
  }

  function stepNpcs(dt) {
    for (const n of npcs) {
      if (!n.model.root.visible) continue;
      let y = 0;
      if (n.hop > 0) {
        n.hop = Math.max(0, n.hop - dt);
        y = Math.abs(Math.sin(n.hop * 9)) * 0.7 * Math.min(1, n.hop * 2);
      }
      stepAnim(n.anim, { moving: false, airborne: y > 0.05, dt });
      n.model.apply(n.anim);
      n.model.root.position.y = y;
      const near = Math.hypot(st.x - n.npc.x, st.z - n.npc.z) < 4;
      const look = near || n.hop > 0 ? Math.atan2(st.x - n.npc.x, st.z - n.npc.z) : n.npc.facing;
      n.model.root.rotation.y = lerpAngle(n.model.root.rotation.y, look, Math.min(1, dt * 4));
    }
  }

  function talkTo(npc) {
    st.facing = Math.atan2(npc.x - st.x, npc.z - st.z);
    let lines = [nextLine(talkCounts, npc)];
    let onClose = null;
    if (npc.id === 'senpai') {
      const ids = defeatedIds();
      if (shouldRaiseMansion(ids, story)) {
        // 3人とも助けた: エンディングと見せかけて、地響きで館がせり上がる
        lines = ['おお……！ 3人とも助け出したな！', 'これで島にも平和が戻った。ありがとう、タクアリヌス！'];
        onClose = () => startRise();
      } else {
        lines.push(senpaiHint(ids, story));
      }
    }
    sfx('talk');
    ctx.ui.setHint('');
    ctx.ui.openDialog({ name: npc.name, lines, onClose });
  }

  function talkToCast(t) {
    st.facing = Math.atan2(t.x - st.x, t.z - st.z);
    sfx('talk');
    ctx.ui.setHint('');
    if (ctx.silly && typeof ctx.silly.squash === 'function' && t.model) ctx.silly.squash(t.model.root);
    ctx.ui.openDialog({ name: t.name, lines: [pickLine(t.id, castRng)] });
  }

  // 台座の前で E：持っている色（青＋獲得した色）を順に付け替える
  function swapMohawk() {
    const owned = availableColors(ownedColorIds(ctx.getProgress()));
    if (owned.length <= 1) {
      ctx.ui.toast('モヒカンを手に入れると、ここで付け替えられるよ', 2.5);
      return;
    }
    const cur = getDefaultMohawkColor();
    const next = owned[(owned.indexOf(cur) + 1) % owned.length];
    if (typeof ctx.setMohawkColor === 'function') ctx.setMohawkColor(next);
    // 既定の色が変わると main.js が保存する（selectColor）
    if (getDefaultMohawkColor() !== next) setDefaultMohawkColor(next);
    applyMohawkColor(rig, next);
    sfx('confirm');
    ctx.ui.toast(`モヒカンを付け替えた！（${COLOR_NAME[next] || next}）`, 2);
  }

  function tickHubEvents(dt, busy) {
    if (!eventPlayer) return;
    const lv = sillyLevel();
    if (!hubEvents) {
      hubEvents = createEventScheduler({ level: lv, rng: castRng });
    } else if (hubEvents.level !== lv) {
      hubEvents.setLevel(lv);
      if (lv === 0) eventPlayer.clear();
    }
    const paused = typeof ctx.isPaused === 'function' && !!ctx.isPaused();
    const castBusy = !!(castPlayer && castPlayer.activeId);
    const id = hubEvents.tick(dt, { blocked: hubEventBlocked({ talking: busy, paused }) || castBusy });
    if (id) eventPlayer.start(id);
    eventPlayer.update(paused ? 0 : dt);
    tickCastEvents(dt, busy, paused, lv);
  }

  function tickCastEvents(dt, busy, paused, lv) {
    if (!castPlayer) return;
    if (!castEvents) {
      castEvents = createCastEventScheduler({ level: lv, rng: castRng });
    } else if (castEvents.level !== lv) {
      castEvents.setLevel(lv);
      if (lv === 0) castPlayer.clear();
    }
    const blocked = hubEventBlocked({ talking: busy, paused }) || !!eventPlayer.activeId || !!castPlayer.activeId;
    const id = castEvents.tick(dt, { blocked });
    if (id) castPlayer.start(id);
    castPlayer.update(paused ? 0 : dt);
  }

  // 門に入る：持ち込むアイテムを選ぶ → そのボスの部屋へ。移れなかったら島へ少し戻して動けるようにする
  function enterGate(gate) {
    st.leaving = true;
    ctx.ui.setHint('');
    enterBossGate(gate, {
      chooseCarry: typeof ctx.chooseCarry === 'function' ? (g, ok, ng) => ctx.chooseCarry(g, ok, ng) : null,
      goto: (key, params) => ctx.goto(key, params),
      gameIdOf: gameIdForBoss,
      onFail: () => {
        const back = gatePoint(gate, R - 1.5);
        st.x = back.x;
        st.z = back.z;
        st.y = 0;
        st.vy = 0;
        st.leaving = false;
      },
    });
  }

  function updateHint(npc, atPedestal, locked) {
    if (locked) {
      ctx.ui.setHint('');
      return;
    }
    if (npc) {
      ctx.ui.setHint(`E/Enter: ${npc.name}と話す`);
      return;
    }
    if (atPedestal) {
      ctx.ui.setHint('E/Enter: モヒカンを付け替える');
      return;
    }
    for (const b of gates) {
      const g = gatePoint(b, R);
      if (Math.hypot(st.x - g.x, st.z - g.z) < 4) {
        ctx.ui.setHint(`この先は${b.name}の部屋`);
        return;
      }
    }
    if (mansionOpen(story) && Math.hypot(st.x - GALLERY_DOOR.x, st.z - GALLERY_DOOR.z) < 4) {
      ctx.ui.setHint('この先は絵画の館');
      return;
    }
    ctx.ui.setHint(CONTROLS_HINT);
  }

  return {
    enter(params = {}) {
      const prm = params || {};
      if (!world) build();
      ctx.setWorld(world);
      if (eventPlayer) eventPlayer.clear();
      if (castPlayer) castPlayer.clear();
      heroLift = 0;
      rise = null;
      if (overlay) {
        overlay.caption('');
        overlay.letterbox(false);
      }
      applyStory();
      queueThanks();
      // 絵を全部集めたら（番長の高難易度で最後の1枚を取ったときなど）、イベントへ
      try {
        const pt = typeof ctx.paintings === 'function' ? ctx.paintings() : null;
        if (pt && allPaintingsEventDue(allCollected(pt), story)) {
          st.leaving = true;
          if (!ctx.goto('allpaintings', {})) st.leaving = false;
        }
      } catch {
        // 進めなくても島は遊べる
      }
      refreshPedestal();
      const fromId = prm.fromBossId || prm.fromBoss || null;
      const boss = fromId ? BOSSES.find((b) => b.id === fromId) : null;
      const p = boss
        ? gatePoint(boss, R - 2)
        : (prm.fromGallery ? { x: GALLERY_HUB_SPAWN.x, z: GALLERY_HUB_SPAWN.z } : { x: 0, z: 8 });
      Object.assign(st, {
        x: p.x, z: p.z, y: 0, vy: 0, moving: false, leaving: false,
      });
      if (boss || prm.fromGallery) {
        st.facing = Math.atan2(-p.x, -p.z);
        st.yaw = Math.atan2(p.x, p.z);
      } else {
        st.facing = Math.PI;
        st.yaw = 0;
      }
      Object.assign(anim, createAnimState());
      st.pitch = HUB_PITCH;
      resetPitchDrag();
      applyMohawkColor(rig, getDefaultMohawkColor());
      ctx.ui.refreshHud();
      ctx.ui.setHint(CONTROLS_HINT);
      if (prm.celebrate || prm.newMohican || prm.fromReward) {
        const count = mohicans.filter((m) => m.group.visible).length;
        const head = celebrationText({ fromBossId: boss ? boss.id : null, celebrate: true });
        ctx.ui.toast(head ? `${head}　モヒカン ${count}/${MOHICAN_TOTAL}` : celebrationText(count, MOHICAN_TOTAL), 3.5);
      }
    },
    update(dt) {
      time += dt;
      if (waterTex) {
        const o = waterUvOffset(time);
        waterTex.offset.set(o.u, o.v);
      }
      for (const m of mohicans) m.group.rotation.y += dt * 1.2;
      if (rise) {
        updateRise(dt);
        stepNpcs(dt);
        return;
      }

      const talking = ctx.ui.isDialogOpen();
      if (!talking && !st.leaving && thanksQueue.length) {
        thanksWait -= dt;
        if (thanksWait <= 0) {
          sayThanks();
          thanksWait = 0.4;
        }
      }
      const npc = !talking && !st.leaving ? findTalkTarget(st, visibleNpcs().map((n) => n.npc)) : null;
      const atPedestal = !talking && !npc && !st.leaving
        && Math.hypot(st.x - PEDESTAL_CENTER.x, st.z - PEDESTAL_CENTER.z) <= PEDESTAL_RANGE;
      const buddy = !talking && !npc && !atPedestal && !st.leaving && troupe && troupe.group.visible
        ? findTalkTarget(st, troupe.talkers) : null;
      const turn = cameraTurn(input.isDown('KeyQ'), input.isDown('KeyE'), talking || !!npc || !!buddy || atPedestal);
      st.yaw += turn * ROT_SPEED * dt - input.consumeDrag() * DRAG_SPEED;
      st.pitch = stepPitch(st.pitch, {
        up: !talking && !!input.isDown('KeyR'),
        down: !talking && !!input.isDown('KeyF'),
        dragY: consumePitchDrag(),
        dt,
      });

      if (talking) {
        if (input.wasPressed('Escape', 'Backspace')) ctx.ui.closeDialog();
        else if (input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space')) ctx.ui.advanceDialog();
      } else if (npc && input.wasPressed('KeyE', 'Enter', 'NumpadEnter')) {
        talkTo(npc);
      } else if (atPedestal && input.wasPressed('KeyE', 'Enter', 'NumpadEnter')) {
        swapMohawk();
      } else if (buddy && input.wasPressed('KeyE', 'Enter', 'NumpadEnter')) {
        talkToCast(buddy);
      }
      const locked = talking || ctx.ui.isDialogOpen() || st.leaving;

      const ix = locked ? 0 : (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
      const iy = locked ? 0 : (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
      const fx = -Math.sin(st.yaw);
      const fz = -Math.cos(st.yaw);
      let mx = fx * iy - fz * ix;
      let mz = fz * iy + fx * ix;
      const len = Math.hypot(mx, mz);
      st.moving = len > 0;
      // Shift を押している間はダッシュ（DASH_SPEED 倍）
      const dash = !locked && st.moving && !!input.isDown('ShiftLeft', 'ShiftRight');
      if (st.moving) {
        mx /= len;
        mz /= len;
        const step = MOVE_SPEED * (dash ? DASH_SPEED : 1) * dt;
        const tryP = (x, z) => {
          const q = pushOut({ x, z }, obstacles);
          return isWalkable(q, gates) ? q : null;
        };
        const q = tryP(st.x + mx * step, st.z + mz * step)
          || tryP(st.x + mx * step, st.z)
          || tryP(st.x, st.z + mz * step);
        if (q) {
          st.x = q.x;
          st.z = q.z;
        }
        st.facing = lerpAngle(st.facing, Math.atan2(mx, mz), Math.min(1, dt * 12));
      }

      const wasAir = st.y > 0;
      if (!locked && st.y <= 0 && input.wasPressed('Space')) {
        st.vy = JUMP_SPEED;
        sfx('jump');
      }
      st.vy -= GRAVITY * dt;
      st.y += st.vy * dt;
      if (st.y < 0) {
        st.y = 0;
        st.vy = 0;
      }
      if (wasAir && st.y === 0) sfx('land');

      stepAnim(anim, {
        moving: st.moving, airborne: st.y > 0, vy: st.vy, dt, dash,
      });
      rig.apply(anim);
      const bob = st.moving && st.y === 0 ? Math.abs(Math.sin(anim.phase)) * (dash ? 0.08 : 0.05) : 0;
      rig.root.position.set(st.x, st.y + bob + heroLift, st.z);
      rig.root.rotation.y = st.facing;
      heroShadow.position.set(st.x, 0.03, st.z);
      heroShadow.scale.setScalar(1.1 / (1 + (st.y + heroLift) * 0.25));

      const camTarget = { x: st.x, y: CAM_TARGET_Y + st.y * 0.4, z: st.z };
      const cp = orbitCameraPosition(camTarget, st.yaw, st.pitch, CAM_RANGE);
      camera.position.set(cp.x, cp.y, cp.z);
      camera.lookAt(camTarget.x, camTarget.y, camTarget.z);

      stepNpcs(dt);

      if (troupe) troupe.update(dt, st);
      tickHubEvents(dt, talking || ctx.ui.isDialogOpen() || st.leaving);
      updateHint(npc || buddy, atPedestal, ctx.ui.isDialogOpen());

      if (!st.leaving && !locked && Math.hypot(st.x, st.z) > R + 0.3) {
        const gate = gateAt(st, gates);
        if (gate && isGateOpen(gate)) {
          enterGate(gate);
        }
      }
      if (!st.leaving && !locked && mansionOpen(story)
        && Math.hypot(st.x - GALLERY_DOOR.x, st.z - GALLERY_DOOR.z) <= GALLERY_DOOR_RANGE) {
        st.leaving = true;
        if (!ctx.goto('gallery', {})) st.leaving = false;
      }
    },
    // 試し遊び用の状態（島にいる仲間・館が出たか・演出中か）
    smokeState() {
      return {
        phase: rise ? `rise:${riseAt(rise.t).phase}` : 'walk',
        companions: visibleNpcs().map((n) => n.npc.id),
        mansion: mansionOpen(story),
        castleY: castle ? castle.position.y : null,
        pos: { x: st.x, z: st.z },
      };
    },
    exit() {
      if (rise) finishRise(true);
      if (overlay) {
        overlay.caption('');
        overlay.letterbox(false);
      }
      if (eventPlayer) eventPlayer.clear();
      if (castPlayer) castPlayer.clear();
      heroLift = 0;
      ctx.ui.setHint('');
    },
  };
}
