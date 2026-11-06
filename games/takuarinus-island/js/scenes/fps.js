// FPS番長との水鉄砲バトル（一人称）。段階1: 円形アリーナを歩き回り、視点を動かせる。
// モジュールの読み込み時には DOM に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import {
  ARENA_RADIUS, OBSTACLES, BOSS_SPAWN, PLAYER_EYE, PLAYER_RADIUS,
  createFpsPlayer, stepFpsPlayer, bossBox,
} from '../fps-arena.js';
import { buildFpsBoss, createAnimState, stepAnim } from '../characters.js';
import {
  BOSS_EYE, ORB_RADIUS, bossStage, stagePattern, createAttackState, tickAttack,
  POWERUP_TIME, stageUp, bossRuns, stageAnnounce,
  pickWaypoint, stepBossMove, createOrb, stepOrbs, hardSpread,
} from '../fps-boss-ai.js';
import { raycastWorld } from '../fps-geometry.js';
import {
  MAX_WATER, createWater, shoot, startReload, tickWater,
} from '../fps-water.js';
import {
  BOSS_MAX_HP, MAX_HEARTS, damageBoss, isBossDown,
  createPlayerHealth, hitPlayer, tickHealth, isPlayerDefeated,
} from '../fps-health.js';
import { recordWin, FPS_BOSS_ID } from '../fps-reward.js';
import { fx } from '../fx.js';
import {
  pickItemParams, fpsItemOptions, createRoamBoxes, stepRoamBoxes, roamObstacles, phase4CarryOptions,
} from '../item-effects.js';
import { createRng, timeSeed } from '../seeded-rng.js';

const WIN_DELAY = 1.6;

export const MOUSE_SENS = 0.0025;
const HINT_UNLOCKED = 'クリック: マウスで視点　J: 撃つ　R: 補充　←→: 視点　WASD: 移動　Shift: ダッシュ　Space: ジャンプ　Esc: ポーズ';
const HINT_LOCKED = 'マウス: 視点　左クリック・J: 撃つ　R: 補充　WASD: 移動　Shift: ダッシュ　Space: ジャンプ　Esc: ポーズ';
export const SHOT_RANGE = 60;
const FLASH_TIME = 0.12;
const TRAIL_TIME = 0.09;
const SPLASH_LIFE = 0.5;
const SPLASH_POOL = 40;

/** 視線の向き（カメラは YXZ 回転、前方は -z） */
export function aimDirection(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** 番長の当たり判定のカプセル */
export function bossCapsule(pos) {
  return {
    a: { x: pos.x, y: 0.5, z: pos.z },
    b: { x: pos.x, y: 1.6, z: pos.z },
    r: 0.5,
  };
}

export function waterText(w) {
  if (w.reloading) return 'ほじゅう中…';
  if (w.ammo <= 0) return `水 0/${MAX_WATER}　R でほじゅう`;
  return `水 ${w.ammo}/${MAX_WATER}`;
}

export function bossHpRatio(hp) {
  const r = hp / BOSS_MAX_HP;
  return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
}

export function bossHpText(hp) {
  // ダメージ1.2倍の持ち込みで小数になるので、切り上げて見せる
  return `${Math.max(0, Math.ceil(hp - 1e-9))}/${BOSS_MAX_HP}`;
}

/** ハートの表示（残り ♥、失った分 ♡）。max は持ち込みで増えた分も含む最大 */
export function heartsText(hearts, max = MAX_HEARTS) {
  const m = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_HEARTS;
  const n = Math.max(0, Math.min(m, Number.isFinite(hearts) ? Math.floor(hearts) : 0));
  return '♥'.repeat(n) + '♡'.repeat(m - n);
}

/** 負けたときのメニュー */
export const LOSE_ITEMS = Object.freeze([
  Object.freeze({ id: 'retry', label: 'もう一回' }),
  Object.freeze({ id: 'hub', label: 'ハブへ戻る' }),
]);

/** キー入力 {up, down, enter} で選択を動かす。{sel, action(id か null)} */
export function loseMenuStep(sel, keys = {}) {
  const n = LOSE_ITEMS.length;
  let s = Number.isInteger(sel) ? ((sel % n) + n) % n : 0;
  if (keys.up) s = (s + n - 1) % n;
  if (keys.down) s = (s + 1) % n;
  return { sel: s, action: keys.enter ? LOSE_ITEMS[s].id : null };
}

// ---- 演出の計算（DOM・three.js に依存しない） ----
const unit01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** 無敵中の点滅の速さ（1秒あたりの切り替え回数） */
export const BLINK_RATE = 14;
export const HURT_MAX_OPACITY = 0.45;
export const FLASH_MAX_OPACITY = 0.75;

/** 無敵中は見える/消えるを繰り返す。無敵でなければ常に見える */
export function blinkVisible(invuln, time, rate = BLINK_RATE) {
  if (!(invuln > 0)) return true;
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  return Math.floor(t * rate) % 2 === 0;
}

/** 残り時間 t / 全体 total に比例して薄れる濃さ（0〜max） */
export function fadeOpacity(t, total, max) {
  if (!(total > 0)) return 0;
  return max * unit01(t / total);
}

/** 被弾したときの赤いフラッシュの濃さ */
export function hurtOpacity(t, total) {
  return fadeOpacity(t, total, HURT_MAX_OPACITY);
}

/** 番長に当たったときの白い光の濃さ */
export function flashOpacity(t, total) {
  return fadeOpacity(t, total, FLASH_MAX_OPACITY);
}

/** 水鉄砲の構え。kick(0〜1): 撃った反動で跳ね上がる / lowered(0〜1): 補充中は下げる */
export function gunPose(kick, lowered) {
  const k = unit01(kick);
  const l = unit01(lowered);
  return {
    dy: -l * 0.22 + 0,
    dz: k * 0.06 + 0,
    rotX: k * 0.25 - l * 0.7 + 0,
    rotZ: l * 0.3 + 0,
  };
}

/** 「クリックで視点を固定」の案内を出すか（ポーズから戻ったあとなど） */
export function showLockPrompt({
  active = false, locked = false, ended = false, lost = false,
} = {}) {
  return !!active && !locked && !ended && !lost;
}

const ORB_POOL = 40;
const HURT_TIME = 0.35;
const WALL_KEYS = ['gatePost', 'gateBeam', 'mohicanYellow', 'heroMohicanStripe'];
const WALL_SEGMENTS = 16;
const WALL_HEIGHT = 4;
const VM_BASE = Object.freeze({ x: 0.3, y: -0.27, z: -0.55 });
const BOSS_SCALE = 1.15;

export function createFpsMinigame(ctx, boss, options = {}) {
  const { THREE, camera, input, mat } = ctx;
  // アイテム効果（物陰の箱が動き回る）。持ち込みなしなら curObstacles は OBSTACLES そのもの
  let roamMode = null;
  let roamState = null;
  let curObstacles = OBSTACLES;
  const obstacleMeshes = [];
  const roamRng = createRng(timeSeed());
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const canvas = ctx.renderer ? ctx.renderer.domElement : null;
  let bossPos = { x: BOSS_SPAWN.x, z: BOSS_SPAWN.z };
  let waypoint = { x: BOSS_SPAWN.x, z: BOSS_SPAWN.z };
  let stuckT = 0;
  let wpT = 0;
  let attack = createAttackState();
  let orbs = [];
  const orbMeshes = [];
  let carryOpts = phase4CarryOptions({});
  let health = createPlayerHealth();
  let bossAnim = createAnimState();
  let bossShadow = null;
  let lost = false;
  let loseSel = 0;
  let resultEl = null;
  let resultItems = [];
  let hurtEl = null;
  let hurtT = 0;
  let hudHearts = null;
  let shownHearts = '';
  let world = null;
  let bossModel = null;
  let viewModel = null;
  let hud = null;
  let player = createFpsPlayer();
  let active = false;
  let locked = false;
  // 視点の固定を断られた環境（埋め込みのブラウザなど）では、クリックだけで撃てるようにする
  let lockRefused = false;
  let selfUnlock = false;
  let listening = false;
  let lookYaw = 0;
  let lookPitch = 0;
  let time = 0;
  let bobT = 0;
  let water = createWater();
  let bossHp = BOSS_MAX_HP;
  let wantShoot = false;
  let kick = 0;
  let lowered = 0;
  let flashT = 0;
  let trailT = 0;
  let flash = null;
  let trail = null;
  const splashes = [];
  let hudWater = null;
  let hudHpFill = null;
  let hudHpText = null;
  let shownWater = '';
  let shownHp = -1;
  let ended = false;
  let finished = false;
  let endT = 0;
  let powerT = 0;
  let powerEl = null;
  let powerTitle = null;
  let powerSub = null;
  let lockEl = null;

  // ---- ポインターロック ----
  function isLockedNow() {
    return !!canvas && typeof document !== 'undefined' && document.pointerLockElement === canvas;
  }
  function requestLock() {
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
    try {
      const r = canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => { lockRefused = true; });
    } catch {
      // 直後の再ロックは拒否されることがある。次のクリックで再試行
    }
  }
  function releaseLock() {
    if (isLockedNow()) {
      selfUnlock = true;
      document.exitPointerLock();
    }
  }
  function onLockChange() {
    const was = locked;
    locked = isLockedNow();
    // Esc などで固定が外れたらポーズへ（自分で外したときは除く）
    if (was && !locked && active && !selfUnlock && typeof ctx.requestPause === 'function') ctx.requestPause();
    if (!locked) selfUnlock = false;
  }
  function onLockError() {
    lockRefused = true;
  }
  function onMouseMove(e) {
    if (!active || !locked) return;
    lookYaw -= (e.movementX || 0) * MOUSE_SENS;
    lookPitch -= (e.movementY || 0) * MOUSE_SENS;
  }
  function onMouseDown(e) {
    if (!active || ended || lost || e.button !== 0) return;
    if (locked || lockRefused) {
      wantShoot = true; // 1クリック1発
      if (locked) return;
    }
    requestLock();
  }
  function ensureListeners() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('mousemove', onMouseMove);
    if (canvas) canvas.addEventListener('mousedown', onMouseDown);
  }

  // ---- 組み立て ----
  function buildHud() {
    hud = document.createElement('div');
    hud.id = 'fps-hud';
    hud.className = 'hidden';
    const cross = document.createElement('div');
    cross.className = 'fps-crosshair';
    cross.textContent = '+';
    const bossBar = document.createElement('div');
    bossBar.className = 'fps-boss';
    const name = document.createElement('div');
    name.className = 'fps-boss-name';
    name.textContent = (boss && boss.name) || 'FPS番長';
    hudHpText = document.createElement('span');
    hudHpText.className = 'fps-boss-hp';
    name.append(' ', hudHpText);
    const bar = document.createElement('div');
    bar.className = 'fps-boss-bar';
    hudHpFill = document.createElement('div');
    hudHpFill.className = 'fps-boss-fill';
    bar.append(hudHpFill);
    bossBar.append(name, bar);
    hudWater = document.createElement('div');
    hudWater.className = 'fps-water';
    hudHearts = document.createElement('div');
    hudHearts.className = 'fps-hearts';
    hurtEl = document.createElement('div');
    hurtEl.className = 'fps-hurt';
    powerEl = document.createElement('div');
    powerEl.className = 'fps-powerup hidden';
    powerTitle = document.createElement('div');
    powerTitle.className = 'fps-powerup-title';
    powerSub = document.createElement('div');
    powerSub.className = 'fps-powerup-sub';
    powerEl.append(powerTitle, powerSub);
    lockEl = document.createElement('div');
    lockEl.className = 'fps-lock hidden';
    lockEl.textContent = 'クリックで視点を固定 ／ Esc でポーズ';
    hud.append(hurtEl, cross, bossBar, hudWater, hudHearts, powerEl, lockEl);
    document.body.append(hud);
    buildResult();
  }

  function buildViewModel() {
    const vm = new THREE.Group();
    let order = 50;
    const m = (key) => new THREE.MeshLambertMaterial({
      color: PALETTE[key], depthTest: false, depthWrite: false, fog: false,
    });
    const add = (geo, key, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m(key));
      mesh.position.set(x, y, z);
      mesh.renderOrder = order++;
      mesh.frustumCulled = false;
      vm.add(mesh);
      return mesh;
    };
    // 画面の右下から伸びる青い腕
    const arm = add(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 6), 'heroBody', 0.05, -0.2, 0.28);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.1, -0.19, 0.35).normalize());
    const grip = add(new THREE.BoxGeometry(0.06, 0.14, 0.07), 'gunNozzle', 0, -0.1, 0.09);
    grip.rotation.x = 0.3;
    add(new THREE.BoxGeometry(0.1, 0.12, 0.34), 'gunBody', 0, 0, 0);
    const nozzle = add(new THREE.CylinderGeometry(0.022, 0.03, 0.12, 6), 'gunNozzle', 0, 0.01, -0.22);
    nozzle.rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.075, 8, 6), 'gunTank', 0, 0.1, 0.03);
    add(new THREE.SphereGeometry(0.06, 8, 6), 'heroBody', 0, -0.11, 0.11);
    vm.position.set(VM_BASE.x, VM_BASE.y, VM_BASE.z);
    return vm;
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 28, 70);
    ctx.addLights(world);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 12), mat('grass'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    world.add(ground);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS + 0.8, ARENA_RADIUS + 0.8, 0.2, 24), mat('sand'));
    floor.position.y = -0.1;
    const center = new THREE.Mesh(new THREE.CircleGeometry(2.5, 16), mat('road'));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.01;
    world.add(floor, center);

    // カラフルな外壁（低ポリの円）
    const wr = ARENA_RADIUS + 0.4;
    const segW = 2 * wr * Math.sin(Math.PI / WALL_SEGMENTS) + 0.3;
    const wallGeo = new THREE.BoxGeometry(segW, WALL_HEIGHT, 0.8);
    const capGeo = new THREE.BoxGeometry(segW + 0.1, 0.3, 1.0);
    for (let i = 0; i < WALL_SEGMENTS; i++) {
      const a = (i / WALL_SEGMENTS) * Math.PI * 2;
      const w = new THREE.Mesh(wallGeo, mat(WALL_KEYS[i % WALL_KEYS.length]));
      w.position.set(Math.cos(a) * wr, WALL_HEIGHT / 2, Math.sin(a) * wr);
      w.rotation.y = -(a + Math.PI / 2);
      const cap = new THREE.Mesh(capGeo, mat('pedestal'));
      cap.position.set(w.position.x, WALL_HEIGHT + 0.15, w.position.z);
      cap.rotation.y = w.rotation.y;
      world.add(w, cap);
    }

    // 障害物（OBSTACLES から生成）
    OBSTACLES.forEach((o, i) => {
      const w = o.max.x - o.min.x;
      const h = o.max.y - o.min.y;
      const d = o.max.z - o.min.z;
      let key = 'gateBeam';
      if (o.kind === 'pillar') key = 'gatePost';
      else if (o.kind === 'box') key = i % 2 ? 'boardDark' : 'board';
      else if (h <= 1.2) key = 'pedestal';
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(key));
      const cx = (o.min.x + o.max.x) / 2;
      const cz = (o.min.z + o.max.z) / 2;
      m.position.set(cx, o.min.y + h / 2, cz);
      world.add(m);
      obstacleMeshes[i] = m;
      if (o.kind === 'wall' && h <= 1.2) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.12, d + 0.06), mat('uiAccent'));
        cap.position.set(cx, o.max.y + 0.06, cz);
        world.add(cap);
      } else if (o.kind === 'pillar') {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), mat('gateBeam'));
        cap.position.set(cx, o.max.y + 0.15, cz);
        world.add(cap);
      }
    });

    bossModel = buildFpsBoss(THREE, mat, { scale: BOSS_SCALE });
    bossModel.root.position.set(BOSS_SPAWN.x, 0, BOSS_SPAWN.z);
    bossShadow = ctx.makeShadow(1.3);
    bossShadow.position.set(BOSS_SPAWN.x, 0.02, BOSS_SPAWN.z);
    world.add(bossModel.root, bossShadow);

    // 当たったときに番長を白く光らせる覆い
    flash = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.6, 1.2, 3, 8),
      new THREE.MeshBasicMaterial({
        color: PALETTE.uiPanel, transparent: true, opacity: 0.7, depthWrite: false,
      }),
    );
    flash.visible = false;
    world.add(flash);

    // 水の軌跡（短い青い線）
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    trail = new THREE.Line(tg, new THREE.LineBasicMaterial({
      color: PALETTE.gunTank, transparent: true, opacity: 0.9,
    }));
    trail.frustumCulled = false;
    trail.visible = false;
    world.add(trail);

    // 水しぶき
    const dropGeo = new THREE.SphereGeometry(0.07, 6, 4);
    for (let i = 0; i < SPLASH_POOL; i++) {
      const m = new THREE.Mesh(dropGeo, mat('gunTank'));
      m.visible = false;
      world.add(m);
      splashes.push({
        mesh: m, life: 0, vx: 0, vy: 0, vz: 0,
      });
    }

    // 番長の水の玉（青い半透明の球）
    const orbGeo = new THREE.SphereGeometry(ORB_RADIUS, 10, 8);
    const orbMat = new THREE.MeshLambertMaterial({
      color: PALETTE.gunTank, emissive: PALETTE.gunTank, emissiveIntensity: 0.25,
      transparent: true, opacity: 0.6, depthWrite: false,
    });
    for (let i = 0; i < ORB_POOL; i++) {
      const m = new THREE.Mesh(orbGeo, orbMat);
      m.visible = false;
      world.add(m);
      orbMeshes.push(m);
    }

    viewModel = buildViewModel();
    buildHud();
  }

  // 段階が上がったら「パワーアップ！」を1秒出す
  function powerUp(s) {
    if (!powerEl) return;
    const a = stageAnnounce(s);
    powerTitle.textContent = a.title;
    powerSub.textContent = a.sub;
    powerT = POWERUP_TIME;
    powerEl.classList.remove('hidden', 'pop');
    void powerEl.offsetWidth; // アニメーションを最初から
    powerEl.classList.add('pop');
  }

  function hidePower() {
    powerT = 0;
    if (powerEl) powerEl.classList.add('hidden');
  }

  function updateHint() {
    ctx.ui.setHint(locked ? HINT_LOCKED : HINT_UNLOCKED);
  }

  function spawnSplash(p, d, n) {
    let left = n;
    for (const s of splashes) {
      if (left <= 0) break;
      if (s.life > 0) continue;
      left--;
      s.life = SPLASH_LIFE * (0.6 + Math.random() * 0.4);
      s.vx = -d.x * 2 + (Math.random() - 0.5) * 3;
      s.vy = 1 + Math.random() * 3;
      s.vz = -d.z * 2 + (Math.random() - 0.5) * 3;
      s.mesh.position.set(p.x, p.y, p.z);
      s.mesh.scale.setScalar(1);
      s.mesh.visible = true;
    }
  }

  function showTrail(p) {
    const start = camera.localToWorld(new THREE.Vector3(VM_BASE.x, VM_BASE.y + 0.03, VM_BASE.z - 0.3));
    const arr = trail.geometry.attributes.position.array;
    arr[0] = start.x; arr[1] = start.y; arr[2] = start.z;
    arr[3] = p.x; arr[4] = p.y; arr[5] = p.z;
    trail.geometry.attributes.position.needsUpdate = true;
    trail.visible = true;
    trailT = TRAIL_TIME;
  }

  function fire() {
    const r = shoot(water);
    water = r.water;
    if (!r.fired) return;
    sfx('shoot');
    kick = 1;
    const o = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const d = aimDirection(player.yaw, player.pitch);
    const bp = bossModel.root.position;
    const hit = raycastWorld(o, d, { capsule: bossCapsule(bp), boxes: curObstacles }, SHOT_RANGE);
    const t = hit.kind === 'none' ? SHOT_RANGE : hit.t;
    const p = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    showTrail(p);
    if (hit.kind === 'boss') {
      const prevHp = bossHp;
      bossHp = damageBoss(bossHp, carryOpts.damageMul);
      const up = stageUp(prevHp, bossHp);
      if (up && !isBossDown(bossHp)) powerUp(up);
      flashT = FLASH_TIME;
      const sp = { x: p.x - d.x * 0.15, y: p.y - d.y * 0.15, z: p.z - d.z * 0.15 };
      if (!fx.splash(sp)) spawnSplash(p, d, 10);
      if (isBossDown(bossHp)) win();
    } else if (hit.kind === 'box') {
      const sp = { x: p.x - d.x * 0.15, y: p.y - d.y * 0.15, z: p.z - d.z * 0.15 };
      if (!fx.splash(sp)) spawnSplash(p, d, 7);
    }
  }

  // 番長の体力が 0: 保存してから少し待って獲得演出へ
  function win() {
    if (ended) return;
    ended = true;
    finished = false;
    endT = WIN_DELAY;
    wantShoot = false;
    releaseLock();
    orbs = [];
    syncOrbs();
    const isNew = recordWin(FPS_BOSS_ID);
    if (typeof ctx.acceptWin === 'function') ctx.acceptWin(boss, isNew);
    const bp = bossModel.root.position;
    if (!fx.splash({ x: bp.x, y: 1.6, z: bp.z })) {
      spawnSplash({ x: bp.x, y: 1.6, z: bp.z }, { x: 0, y: 0, z: 0 }, 20);
    }
    ctx.ui.setHint('');
    ctx.ui.toast(`${(boss && boss.name) || 'FPS番長'}をびしょぬれにした！`, WIN_DELAY);
  }

  function updateEffects(dt) {
    kick = Math.max(0, kick - dt * 6);
    hurtT = Math.max(0, hurtT - dt);
    if (powerT > 0) {
      powerT = Math.max(0, powerT - dt);
      if (powerT <= 0 && powerEl) powerEl.classList.add('hidden');
    }
    if (hurtEl) hurtEl.style.opacity = hurtOpacity(hurtT, HURT_TIME).toFixed(3);
    if (lockEl) {
      lockEl.classList.toggle('hidden', !showLockPrompt({
        active, locked, ended, lost,
      }));
    }
    const target = water.reloading ? 1 : 0;
    lowered += Math.max(-dt * 6, Math.min(dt * 6, target - lowered));
    flashT = Math.max(0, flashT - dt);
    const bp = bossModel.root.position;
    flash.visible = flashT > 0;
    if (flash.visible) {
      flash.position.set(bp.x, 1.15, bp.z);
      flash.material.opacity = flashOpacity(flashT, FLASH_TIME);
    }
    trailT = Math.max(0, trailT - dt);
    trail.visible = trailT > 0;
    if (trail.visible) trail.material.opacity = 0.9 * (trailT / TRAIL_TIME);
    for (const s of splashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= 9 * dt;
      const m = s.mesh;
      m.position.set(m.position.x + s.vx * dt, m.position.y + s.vy * dt, m.position.z + s.vz * dt);
      if (s.life <= 0 || m.position.y < 0) {
        s.life = 0;
        m.visible = false;
      } else {
        m.scale.setScalar(Math.max(0.2, s.life / SPLASH_LIFE));
      }
    }
  }

  function updateHud() {
    const wt = waterText(water);
    if (wt !== shownWater) {
      shownWater = wt;
      hudWater.textContent = wt;
      hudWater.classList.toggle('reloading', water.reloading);
      hudWater.classList.toggle('empty', !water.reloading && water.ammo <= 0);
    }
    if (bossHp !== shownHp) {
      shownHp = bossHp;
      hudHpText.textContent = bossHpText(bossHp);
      hudHpFill.style.width = `${(bossHpRatio(bossHp) * 100).toFixed(1)}%`;
    }
    const ht = heartsText(health.hearts, MAX_HEARTS + carryOpts.heartBonus);
    if (ht !== shownHearts) {
      shownHearts = ht;
      hudHearts.textContent = ht;
    }
    hudHearts.classList.toggle('blink', health.invuln > 0 && !lost);
  }

  // ---- 負けたときのメニュー ----
  function buildResult() {
    resultEl = document.createElement('div');
    resultEl.id = 'fps-result';
    resultEl.className = 'overlay hidden';
    const panel = document.createElement('div');
    panel.className = 'race-result-panel';
    const h2 = document.createElement('h2');
    h2.textContent = 'びしょぬれになった……';
    const ul = document.createElement('ul');
    resultItems = LOSE_ITEMS.map((it, i) => {
      const li = document.createElement('li');
      li.textContent = it.label;
      li.addEventListener('mouseenter', () => {
        if (!lost) return;
        loseSel = i;
        renderLose();
      });
      li.addEventListener('click', () => {
        if (!active || !lost) return;
        loseSel = i;
        renderLose();
        chooseLose(it.id);
      });
      ul.append(li);
      return li;
    });
    const hint = document.createElement('p');
    hint.className = 'title-hint';
    hint.textContent = '↑↓ で選ぶ ／ Enter で決定';
    panel.append(h2, ul, hint);
    resultEl.append(panel);
    document.body.append(resultEl);
  }

  function renderLose() {
    resultItems.forEach((li, i) => li.classList.toggle('selected', i === loseSel));
  }

  function lose() {
    if (lost || ended) return;
    lost = true;
    wantShoot = false;
    loseSel = 0;
    releaseLock();
    renderLose();
    resultEl.classList.remove('hidden');
    ctx.ui.setHint('');
  }

  function chooseLose(id) {
    if (!lost) return;
    sfx('confirm');
    if (id === 'retry') {
      resetState();
      locked = isLockedNow();
      updateHint();
      requestLock();
    } else {
      ctx.goto('hub', { fromBossId: boss.id });
    }
  }

  // ---- 動き回る箱（アイテム効果） ----
  function syncObstacleMeshes() {
    curObstacles.forEach((o, i) => {
      const m = obstacleMeshes[i];
      if (!m) return;
      m.position.x = (o.min.x + o.max.x) / 2;
      m.position.z = (o.min.z + o.max.z) / 2;
    });
  }

  function resetRoam() {
    roamState = roamMode ? createRoamBoxes(OBSTACLES, roamRng) : null;
    curObstacles = roamObstacles(OBSTACLES, roamState);
    syncObstacleMeshes();
  }

  function updateRoam(dt) {
    if (!roamState) return;
    roamState = stepRoamBoxes(roamState, dt, {
      mode: roamMode,
      player: { x: player.x, z: player.z, yaw: player.yaw },
      boss: bossPos,
      rng: roamRng,
    });
    curObstacles = roamObstacles(OBSTACLES, roamState);
    syncObstacleMeshes();
  }

  // ---- 番長の移動と攻撃・水の玉 ----
  function syncOrbs() {
    for (let i = 0; i < orbMeshes.length; i++) {
      const m = orbMeshes[i];
      const o = orbs[i];
      m.visible = !!o;
      if (o) m.position.set(o.x, o.y, o.z);
    }
  }

  function updateBoss(dt) {
    const pat = stagePattern(bossStage(bossHp));
    const others = [...curObstacles, bossBox({ x: player.x, z: player.z }, PLAYER_RADIUS, 2)];
    const foe = carryOpts.foeSpeed || 1; // 高難易度: 番長が速く、弾幕が厚い
    const m = stepBossMove(bossPos, waypoint, pat.moveSpeed * foe, dt, others);
    stuckT = m.moved < pat.moveSpeed * foe * dt * 0.3 ? stuckT + dt : 0;
    wpT += dt;
    bossPos = { x: m.x, z: m.z };
    if (m.arrived || stuckT > 0.6 || wpT > 7) {
      waypoint = pickWaypoint(Math.random, curObstacles);
      stuckT = 0;
      wpT = 0;
    }
    const br = bossModel.root;
    br.position.x = bossPos.x;
    br.position.z = bossPos.z;
    bossShadow.position.set(bossPos.x, 0.02, bossPos.z);
    stepAnim(bossAnim, { moving: m.moved > 1e-4, dt, dash: bossRuns(bossHp) });
    bossModel.apply(bossAnim);

    // 見えているときだけ水の玉を撃つ
    const bossEye = { x: bossPos.x, y: BOSS_EYE, z: bossPos.z };
    const playerEye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const r = tickAttack(attack, dt, {
      hp: bossHp, bossEye, playerEye, boxes: curObstacles,
    });
    attack = r.state;
    if (r.fire) {
      if (foe > 1) attack = { ...attack, cooldown: attack.cooldown / foe };
      const dirs = foe > 1 ? hardSpread(r.fire.directions) : r.fire.directions;
      for (const d of dirs) {
        if (orbs.length >= ORB_POOL) break;
        orbs.push(createOrb({
          x: bossEye.x + d.x * 0.8, y: bossEye.y + d.y * 0.8, z: bossEye.z + d.z * 0.8,
        }, d, r.fire.speed * foe));
      }
    }
  }

  function updateOrbs(dt) {
    health = tickHealth(health, dt);
    const r = stepOrbs(orbs, dt, { player: { x: player.x, y: player.y, z: player.z }, obstacles: curObstacles });
    orbs = r.orbs;
    if (r.hits > 0) {
      const h = hitPlayer(health);
      health = h.health;
      if (h.damaged) {
        sfx('hit');
        hurtT = HURT_TIME;
        if (isPlayerDefeated(health)) lose();
      }
    }
    syncOrbs();
  }

  function resetState() {
    player = createFpsPlayer();
    lookYaw = 0;
    lookPitch = 0;
    time = 0;
    bobT = 0;
    water = createWater();
    bossHp = BOSS_MAX_HP;
    wantShoot = false;
    kick = 0;
    lowered = 0;
    flashT = 0;
    trailT = 0;
    shownWater = '';
    shownHp = -1;
    shownHearts = '';
    ended = false;
    finished = false;
    endT = 0;
    hidePower();
    bossPos = { x: BOSS_SPAWN.x, z: BOSS_SPAWN.z };
    waypoint = pickWaypoint();
    stuckT = 0;
    wpT = 0;
    attack = createAttackState();
    orbs = [];
    health = createPlayerHealth(carryOpts.heartBonus);
    bossAnim = createAnimState();
    lost = false;
    loseSel = 0;
    hurtT = 0;
    if (resultEl) resultEl.classList.add('hidden');
    if (hurtEl) hurtEl.style.opacity = '0';
    bossModel.root.rotation.set(0, 0, 0);
    bossModel.root.position.set(bossPos.x, 0, bossPos.z);
    bossModel.apply(bossAnim);
    bossShadow.position.set(bossPos.x, 0.02, bossPos.z);
    for (const s of splashes) {
      s.life = 0;
      s.mesh.visible = false;
    }
    syncOrbs();
    resetRoam();
    if (viewModel) viewModel.visible = true;
  }

  return {
    enter(arg) {
      if (!world) build();
      ensureListeners();
      const itemParams = pickItemParams([
        arg && (arg.itemParams || arg.params), options && options.params,
        ctx.itemParams, ctx.carryParams, boss && boss.itemParams,
      ], 'fps');
      roamMode = fpsItemOptions(itemParams).roam;
      // 新しいアイテムの効果（体力+1・ダメージ1.2倍・補充が遅い）。以前は表示だけで効いていなかった
      carryOpts = phase4CarryOptions(itemParams);
      resetState();
      locked = isLockedNow();
      active = true;
      ctx.setWorld(world);
      fx.init(world, THREE);
      camera.rotation.order = 'YXZ';
      camera.add(viewModel);
      world.add(camera);
      hud.classList.remove('hidden');
      ctx.ui.refreshHud();
      updateHint();
    },
    update(dt) {
      time += dt;
      fx.update(dt);
      if (ended) {
        input.consumeDrag();
        endT -= dt;
        updateEffects(dt);
        updateHud();
        const br = bossModel.root;
        const k = Math.min(1, Math.max(0, (WIN_DELAY - endT) / WIN_DELAY));
        br.rotation.y += dt * 9;
        br.position.y = Math.sin(k * Math.PI) * 0.6;
        if (endT <= 0 && !finished) {
          finished = true;
          ctx.finishMinigame(boss, { won: true });
        }
        return;
      }
      if (lost) {
        input.consumeDrag();
        const r = loseMenuStep(loseSel, {
          up: input.wasPressed('ArrowUp', 'KeyW'),
          down: input.wasPressed('ArrowDown', 'KeyS'),
          enter: input.wasPressed('Enter', 'NumpadEnter'),
        });
        if (r.sel !== loseSel) {
          loseSel = r.sel;
          renderLose();
        }
        updateEffects(dt);
        updateHud();
        if (r.action) {
          input.consume('Enter', 'NumpadEnter');
          chooseLose(r.action);
        }
        return;
      }
      input.consumeDrag();
      updateRoam(dt);
      const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
      const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      const turn = (input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('ArrowRight') ? 1 : 0);
      player = stepFpsPlayer(player, {
        forward,
        strafe,
        turn,
        dash: input.isDown('ShiftLeft', 'ShiftRight'),
        jump: input.wasPressed('Space'),
        lookYaw,
        lookPitch,
      }, dt, [...curObstacles, bossBox(bossPos)]);
      lookYaw = 0;
      lookPitch = 0;

      camera.position.set(player.x, player.y + PLAYER_EYE, player.z);
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      camera.updateMatrixWorld();

      // 水の補充と射撃
      if (input.wasPressed('KeyR')) {
        const before = water;
        water = startReload(water, carryOpts.reloadMul);
        if (water !== before && water.reloading) sfx('reload');
      }
      water = tickWater(water, dt);
      // J でも撃てる（視点を固定しなくても遊べるように）
      const shotByKey = input.wasPressed('KeyJ');
      if (shotByKey) wantShoot = true;
      if (wantShoot) {
        wantShoot = false;
        if (locked || lockRefused || shotByKey) fire();
      }
      if (!ended) {
        updateBoss(dt);
        updateOrbs(dt);
      }
      updateEffects(dt);
      updateHud();

      // 手と水鉄砲の揺れ
      if (player.moving && player.y === 0) bobT += dt;
      const amp = player.moving && player.y === 0 ? 1 : 0;
      const gp = gunPose(kick, lowered);
      viewModel.position.set(
        VM_BASE.x + Math.cos(bobT * 9) * 0.01 * amp,
        VM_BASE.y + Math.abs(Math.sin(bobT * 9)) * 0.014 * amp + Math.sin(time * 2) * 0.004 + gp.dy,
        VM_BASE.z + gp.dz,
      );
      // 撃つと反動で跳ね上がり、補充中は下げる
      viewModel.rotation.set(gp.rotX, 0, gp.rotZ);
      // 無敵中は手と水鉄砲を点滅させる
      viewModel.visible = blinkVisible(health.invuln, time);
      if (lost) return;

      // 番長はこちらを向いて構える
      const br = bossModel.root;
      br.rotation.y = Math.atan2(player.x - br.position.x, player.z - br.position.z);
      br.position.y = Math.abs(Math.sin(time * 2.4)) * 0.04;

      updateHint();
    },
    pauseItems() {
      if (ended || lost) return [];
      return [{
        id: 'fps-to-hub',
        label: 'やめてハブへ戻る',
        run: () => ctx.goto('hub', { fromBossId: boss.id }),
      }];
    },
    // 試し遊び用の状態（番長の体力・自分のハート・水の残り・持ち込み）
    smokeState() {
      return {
        phase: lost ? 'lost' : (bossHp <= 0 ? 'won' : (active ? 'fighting' : 'idle')),
        bossHp,
        playerHp: health.hearts,
        water: water && Number.isFinite(water.ammo) ? water.ammo : null,
        pos: { x: player.x, z: player.z },
        roam: roamMode,
        time,
      };
    },
    exit() {
      active = false;
      fx.dispose();
      releaseLock();
      if (world) world.remove(camera);
      if (viewModel) camera.remove(viewModel);
      camera.rotation.order = 'XYZ';
      if (hud) hud.classList.add('hidden');
      if (resultEl) resultEl.classList.add('hidden');
      if (hurtEl) hurtEl.style.opacity = '0';
      hidePower();
      lost = false;
      wantShoot = false;
      if (trail) trail.visible = false;
      if (flash) flash.visible = false;
      ctx.ui.setHint('');
    },
  };
}
