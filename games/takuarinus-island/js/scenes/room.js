// ボスの部屋：16×12 の部屋と、南の出口から続く通路。番長に話しかけると勝負（持ち込みを選んでから）。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import { chooseWithGateCarry } from '../gate-carry.js';
import { BOSSES } from '../bosses.js';
import { isBossDefeated } from '../progress.js';
import { createAnimState, stepAnim } from '../characters.js';
import { DASH_SPEED as ROOM_DASH_SPEED } from '../characters.js';
import { getBossModule, bossGameId } from '../boss-registry.js';
import { getTextures } from '../textures.js';
import { textureRepeat } from '../texture-gen.js';
import { createWalker } from './gallery.js';

export const ROOM_WIDTH = 16;
export const ROOM_DEPTH = 12;
export const ROOM_HALF_X = ROOM_WIDTH / 2;
export const ROOM_HALF_Z = ROOM_DEPTH / 2;
export const EXIT_HALF_WIDTH = 1.4;
export const EXIT_END = ROOM_HALF_Z + 3;
export const PLAYER_RADIUS = 0.3;
export const TALK_RANGE = 1.6;
export const ROOM_SPAWN = Object.freeze({ x: 0, z: ROOM_HALF_Z - 1.2, facing: Math.PI });
export const RETRY_PROMPT = 'もう一回 勝負するか？（Enter: する　Esc: やめる）';
const DOOR_HALF_WIDTH = EXIT_HALF_WIDTH;

/**
 * 持ち込みを選ぶ。門で選び済みならその選択を使い、もう一度は選ばせない。
 * 未選択なら ctx.chooseCarry（持ち込みの選択画面）に任せる。無ければ持ち込みなし。
 */
export function chooseViaGateCarry(ctx, gameId, onChosen) {
  const chooser = ctx && typeof ctx.chooseCarry === 'function'
    ? (g, chosen) => ctx.chooseCarry(g, chosen)
    : null;
  return chooseWithGateCarry(gameId, onChosen, null, chooser);
}

// 部屋の操作（Shift: ダッシュ）。歩く速さに掛ける倍率（DASH_SPEED 倍）
export function roomDashMultiplier(input) {
  return input && typeof input.isDown === 'function' && input.isDown('ShiftLeft', 'ShiftRight')
    ? ROOM_DASH_SPEED
    : 1;
}

function obstaclesOf(arg) {
  return Array.isArray(arg) ? arg : [];
}

/** 部屋の中か、出口の通路の上で、障害物に重ならなければ歩ける */
export function isRoomWalkable(p, obstacles = []) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  const r = PLAYER_RADIUS;
  const inRoom = Math.abs(p.x) <= ROOM_HALF_X - r && Math.abs(p.z) <= ROOM_HALF_Z - r;
  const inExit = Math.abs(p.x) <= EXIT_HALF_WIDTH - r
    && p.z >= ROOM_HALF_Z - r - 1e-9 && p.z <= EXIT_END + 1e-9;
  if (!inRoom && !inExit) return false;
  for (const o of obstaclesOf(obstacles)) {
    if (o && Math.hypot(p.x - o.x, p.z - o.z) < o.r) return false;
  }
  return true;
}

function clampInto(from, to) {
  const r = PLAYER_RADIUS;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const ex = EXIT_HALF_WIDTH - r;
  const fromInExit = from.z > ROOM_HALF_Z - r && Math.abs(from.x) <= ex + 1e-9;
  const toExit = Math.abs(to.x) <= ex && to.z > ROOM_HALF_Z - r;
  if (fromInExit || toExit) {
    const z = Math.min(to.z, EXIT_END);
    if (z > ROOM_HALF_Z - r) return { x: cl(to.x, -ex, ex), z };
  }
  return { x: cl(to.x, -(ROOM_HALF_X - r), ROOM_HALF_X - r), z: cl(to.z, -(ROOM_HALF_Z - r), ROOM_HALF_Z - r) };
}

/** from から to へ動く。壁は越えず、壁沿いに滑る。障害物に当たれば軸ごとに試す */
export function clampRoomMove(from, to, obstacles = []) {
  const obs = obstaclesOf(obstacles);
  const t = clampInto(from, to);
  if (isRoomWalkable(t, obs)) return t;
  const a = clampInto(from, { x: to.x, z: from.z });
  if (isRoomWalkable(a, obs)) return a;
  const b = clampInto(from, { x: from.x, z: to.z });
  if (isRoomWalkable(b, obs)) return b;
  return { x: from.x, z: from.z };
}

/** 通路の端まで来たらハブへ */
export function isRoomExit(p) {
  return !!p && Math.abs(p.x) <= EXIT_HALF_WIDTH && p.z >= EXIT_END - 1e-9;
}

/** 番長に話しかけられる距離か。boss は {x,z,radius} か ROOM_LAYOUT */
export function canTalkToBoss(p, boss, range = TALK_RANGE) {
  const b = boss && boss.boss && Number.isFinite(boss.boss.x) ? boss.boss : boss;
  if (!p || !b || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return false;
  const radius = Number.isFinite(b.radius) ? b.radius : 1.3;
  return Math.hypot(p.x - b.x, p.z - b.z) <= radius + range;
}

/** 話しかけたときの会話。勝負前は intro、勝ったあとは after と再戦の確認 */
export function bossTalkLines(boss, defeated = false) {
  let won = defeated;
  if (defeated && typeof defeated === 'object') {
    won = Array.isArray(defeated.mohicans) ? isBossDefeated(defeated, boss && boss.id) : !!defeated.defeated;
  }
  const d = (boss && boss.dialogue) || {};
  if (won) return [...(Array.isArray(d.after) ? d.after : []), RETRY_PROMPT];
  return [...(Array.isArray(d.intro) ? d.intro : [])];
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export function createRoomScene(ctx) {
  const { THREE, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const built = new Map();
  let cur = null;
  let boss = null;
  let walker = null;
  let leaving = false;
  let time = 0;

  function buildShell(world) {
    const tx = getTextures(THREE);
    const H = 2.4;
    const T = 0.3;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 12), tx.material('grass', { repeat: textureRepeat(120, 120, 3) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    world.add(ground);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_WIDTH, 0.2, ROOM_DEPTH),
      tx.material('checker', { repeat: textureRepeat(ROOM_WIDTH, ROOM_DEPTH, 4) }),
    );
    floor.position.y = -0.1;
    world.add(floor);
    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        tx.material('brick', { repeat: textureRepeat(Math.max(w, d), h, 2) }),
      );
      m.position.set(x, y, z);
      world.add(m);
    };
    wall(ROOM_WIDTH + 2 * T, H, T, 0, H / 2, -ROOM_HALF_Z - T / 2);
    for (const s of [-1, 1]) wall(T, H, ROOM_DEPTH, s * (ROOM_HALF_X + T / 2), H / 2, 0);
    const segW = ROOM_HALF_X - DOOR_HALF_WIDTH + T;
    for (const s of [-1, 1]) wall(segW, H, T, s * (DOOR_HALF_WIDTH + segW / 2), H / 2, ROOM_HALF_Z + T / 2);
    // 出口の通路
    const len = EXIT_END - ROOM_HALF_Z + 1;
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(2 * DOOR_HALF_WIDTH, 0.2, len),
      tx.material('cobble', { repeat: textureRepeat(2 * DOOR_HALF_WIDTH, len, 2.5) }),
    );
    path.position.set(0, -0.08, ROOM_HALF_Z + len / 2);
    world.add(path);
    const LOW = 0.8;
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry(T, LOW, len),
        tx.material('brick', { repeat: textureRepeat(len, LOW, 2) }),
      );
      side.position.set(s * (DOOR_HALF_WIDTH + T / 2), LOW / 2, ROOM_HALF_Z + len / 2);
      world.add(side);
    }
  }

  function buildFor(b) {
    const world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 25, 70);
    ctx.addLights(world);
    buildShell(world);
    const mod = getBossModule(b.id);
    let room = null;
    if (mod && typeof mod.buildRoom === 'function') {
      try {
        room = mod.buildRoom(THREE, PALETTE, mat, b);
        world.add(room.group);
      } catch (e) {
        console.warn('部屋の中身を作れません:', e);
        room = null;
      }
    }
    const obstacles = room ? [...(room.obstacles || [])] : [];
    if (room && room.boss) {
      obstacles.push({ x: room.boss.x, z: room.boss.z, r: room.boss.radius });
      const sh = ctx.makeShadow(1.4);
      sh.position.set(room.boss.x, 0.31, room.boss.z);
      world.add(sh);
    }
    return { world, room, obstacles, bossAnim: createAnimState() };
  }

  function startGame() {
    if (leaving || !boss) return;
    leaving = true;
    const target = boss;
    const gameId = bossGameId(target.id) || target.id;
    const go = (entry) => {
      let ok = false;
      try {
        ok = ctx.startMinigame(target, entry && entry.params ? entry.params : {});
      } catch (e) {
        console.warn(e);
        ok = false;
      }
      // true 以外（undefined も含む）は失敗。固まらないよう元に戻して知らせる
      if (ok !== true) {
        leaving = false;
        ctx.ui.toast('まだ準備中だ！', 2);
        return;
      }
      if (entry && typeof entry.announce === 'function') entry.announce();
    };
    chooseViaGateCarry(ctx, gameId, go);
  }

  function talk() {
    const defeated = isBossDefeated(ctx.getProgress(), boss.id);
    sfx('talk');
    ctx.ui.setHint('');
    ctx.ui.openDialog({ name: boss.name, lines: bossTalkLines(boss, defeated), onClose: startGame });
  }

  return {
    enter(params = {}) {
      boss = BOSSES.find((b) => b.id === params.bossId) || null;
      if (!boss) {
        ctx.goto('hub', {});
        return;
      }
      if (!built.has(boss.id)) built.set(boss.id, buildFor(boss));
      cur = built.get(boss.id);
      if (!walker) {
        walker = createWalker(ctx, {
          move: (a, b) => clampRoomMove(a, b, cur ? cur.obstacles : []),
          camDist: 6,
          camHeight: 4,
        });
      }
      walker.addTo(cur.world);
      walker.place(ROOM_SPAWN.x, ROOM_SPAWN.z, ROOM_SPAWN.facing);
      if (cur.room && typeof cur.room.setDefeated === 'function') {
        cur.room.setDefeated(isBossDefeated(ctx.getProgress(), boss.id));
      }
      leaving = false;
      ctx.setWorld(cur.world);
      ctx.ui.refreshHud();
    },
    update(dt) {
      if (!cur || !boss) return;
      time += dt;
      const talking = ctx.ui.isDialogOpen();
      if (talking) {
        if (input.wasPressed('Escape', 'Backspace')) ctx.ui.closeDialog();
        else if (input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space')) ctx.ui.advanceDialog();
      }
      const room = cur.room;
      const near = !talking && !leaving && room && room.boss && canTalkToBoss(walker.st, room.boss);
      if (near && input.wasPressed('KeyE', 'Enter', 'NumpadEnter')) talk();
      const locked = talking || ctx.ui.isDialogOpen() || leaving;
      walker.update(dt, { locked, noTurn: !!near });

      if (room) {
        if (typeof room.update === 'function') room.update(dt, time);
        const model = room.boss && room.boss.model;
        if (model && typeof model.apply === 'function') {
          stepAnim(cur.bossAnim, { moving: false, airborne: false, dt });
          model.apply(cur.bossAnim);
          const s = walker.st;
          const look = Math.hypot(s.x - room.boss.x, s.z - room.boss.z) < 5
            ? Math.atan2(s.x - room.boss.x, s.z - room.boss.z) : 0;
          model.root.rotation.y = lerpAngle(model.root.rotation.y, look, Math.min(1, dt * 4));
        }
      }

      if (locked) ctx.ui.setHint('');
      else if (near) ctx.ui.setHint(`E/Enter: ${boss.name}と話す`);
      else ctx.ui.setHint('WASD: 移動　Space: ジャンプ　Q/E: カメラ　南の出口: ハブへ戻る');

      if (!leaving && !locked && isRoomExit(walker.st)) {
        leaving = true;
        ctx.goto('hub', { fromBossId: boss.id });
      }
    },
    exit() {
      ctx.ui.setHint('');
    },
  };
}
