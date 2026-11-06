// レース番長のカートレース（1対1の3周勝負）。three.js は ctx から受け取る。
// モジュールの読み込み時には DOM に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import {
  TRACK, surfaceAt, clampToFence, nearestOnCenterline,
} from '../race-track.js';
import { stepKart, KART } from '../kart.js';
import { buildKart } from '../kart-model.js';
import { createHeroRig, setSeatedPose, applyMohawkColor } from '../hero-model.js';
import * as heroModel from '../hero-model.js';
import {
  buildRaceBoss, setModelSeated, seatedHipHeight, createAnimState, stepAnim,
} from '../characters.js';
import { createRace } from '../race-game.js';
import { BRAWL, isDriving, createRider } from '../race-brawl.js';
import { TOTAL_LAPS } from '../race-rules.js';
import { fx } from '../fx.js';
import {
  pickItemParams, raceItemOptions, createRaceGun, fireRaceGun, tickRaceGun, applyRivalSlow,
  screenDropLayout, phase4CarryOptions, laggedSteer, rescueEjected,
} from '../item-effects.js';
import { createRng, timeSeed } from '../seeded-rng.js';

export const CAM_BACK = 7;
export const CAM_HEIGHT = 3.5;
export const MAX_SUBSTEP = 1 / 60;
const HERO_SCALE = 0.8;
const RIVAL_SCALE = 0.8;
const CONTROLS_HINT = '↑/W: アクセル　↓/S: ブレーキ・バック　←→/AD: ハンドル　Shift: ドリフト　F: 飛び移る／パンチ　E: カートに乗る　Esc: ポーズ';
const FINISH_HINT = 'ゴール！　Esc: ポーズ（ハブへ戻る）';
const WIN_HINT = '1位でゴール！　Enter: 次へ';
const MENU_HINT = '↑↓: 選ぶ　Enter: 決定';

/** ゴールしてから結果（獲得演出・メニュー）へ進むまでの秒数 */
export const RESULT_DELAY = 2.2;
/** 負けたときのメニュー */
export const RESULT_MENU = Object.freeze([
  Object.freeze({ id: 'retry', label: 'もう一回' }),
  Object.freeze({ id: 'hub', label: 'ハブへ戻る' }),
]);

/** メニューの1フレーム分の入力 {up,down,enter} → {sel, action} */
export function resultMenuInput(sel, keys = {}) {
  const n = RESULT_MENU.length;
  let s = Number.isInteger(sel) ? ((sel % n) + n) % n : 0;
  if (keys.up) s = (s + n - 1) % n;
  if (keys.down) s = (s + 1) % n;
  return { sel: s, action: keys.enter ? RESULT_MENU[s].id : null };
}

/** 結果の見出し */
export function resultTitle(race) {
  if (!race || race.phase !== 'finished') return '';
  return race.result === 'win' ? '1位でゴール！' : '2位… レース番長の勝ち！';
}
const NO_STEER = Object.freeze({ steer: 0 });

/** キー状態 → カートの入力 */
export function readKartInput(isDown) {
  return {
    accel: !!isDown('ArrowUp', 'KeyW'),
    brake: !!isDown('ArrowDown', 'KeyS'),
    steer: (isDown('ArrowRight', 'KeyD') ? 1 : 0) - (isDown('ArrowLeft', 'KeyA') ? 1 : 0),
    drift: !!isDown('ShiftLeft', 'ShiftRight'),
  };
}

/** 歩くときの向き（カメラ基準）。forward/right は -1..1。右は (-cosθ, sinθ) */
export function footMove(forward, right, camHeading = 0) {
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  let x = fx * forward - fz * right;
  let z = fz * forward + fx * right;
  const l = Math.hypot(x, z);
  if (l > 1) {
    x /= l;
    z /= l;
  }
  return { x: x + 0, z: z + 0 };
}

/** 飛び移り・パンチ・乗り込み・歩きの入力 */
export function readBrawlInput(input, camHeading = 0) {
  const isDown = input.isDown;
  const wasPressed = input.wasPressed || (() => false);
  const f = (isDown('ArrowUp', 'KeyW') ? 1 : 0) - (isDown('ArrowDown', 'KeyS') ? 1 : 0);
  const s = (isDown('ArrowRight', 'KeyD') ? 1 : 0) - (isDown('ArrowLeft', 'KeyA') ? 1 : 0);
  return {
    action: !!wasPressed('KeyF'),
    punch: !!wasPressed('Mouse0'),
    board: !!wasPressed('KeyE'),
    dash: !!isDown('ShiftLeft', 'ShiftRight'),
    move: footMove(f, s, camHeading),
  };
}

export const PROMPT_TEXT = Object.freeze({
  jump: 'F: 飛び移る',
  punch: 'F / クリック: パンチ',
  counter: 'F: 反撃！',
  board: 'E: カートに乗る',
  return: 'カートへ戻ろう（WASD: 移動　Shift: ダッシュ）',
});

export function promptText(p) {
  return (p && PROMPT_TEXT[p]) || '';
}

const BRAWL_MESSAGES = Object.freeze({
  'player-punch': 'パンチ！',
  'rival-stunned': '番長 気絶！',
  'player-counter': '反撃！',
  'rival-jump': '番長が飛び乗ってきた！',
  'player-ejected': 'やられた！ カートへ戻れ！',
  'player-board': '乗った！',
  'kart-bump': 'ドン！',
});

export function brawlMessage(e) {
  return BRAWL_MESSAGES[e] || '';
}

/** 取っ組み合いの出来事 → 効果音の出来事 */
export const BRAWL_SFX = Object.freeze({
  'player-punch': 'punch',
  'rival-punch': 'punch',
  'player-counter': 'punch',
  'rival-stunned': 'stun',
  'player-ejected': 'stun',
  'player-jump': 'jump',
  'rival-jump': 'jump',
  'kart-bump': 'punch',
});

/** カメラが追う位置と向き（カートを降りている間は、自分のカートの方を向く） */
export function cameraTarget(race, camHeading = 0, yawFx = 0) {
  const p = race.player.kart;
  const pr = race.player.rider;
  if (!pr || pr.state === 'driving' || pr.state === 'boarding') {
    return { focus: p, heading: p.heading + yawFx * 0.5, rate: 5 };
  }
  if (pr.state === 'jumping' || pr.state === 'onKart' || pr.state === 'punching') {
    return { focus: { x: pr.x, z: pr.z }, heading: race.rival.kart.heading, rate: 4 };
  }
  const dx = p.x - pr.x;
  const dz = p.z - pr.z;
  return {
    focus: { x: pr.x, z: pr.z },
    heading: Math.hypot(dx, dz) > 1.5 ? Math.atan2(dx, dz) : camHeading,
    rate: 2.5,
  };
}

const HOOD_OFFSET = 0.95; // 相手のカートのボンネットに立つ位置
const HOOD_Y = 0.7;
const SEAT_Y = 0.62;
const STAR_Y_SEATED = 2.5;
const STAR_Y_STAND = 2.4;

const SPARK_INTERVAL = 0.06;

/** 後輪の接地点（side: +1 右 / -1 左）。yaw は見た目の向きのずれ */
export function rearWheelPoint(kart, side = 1, yaw = 0) {
  const a = (Number.isFinite(kart.heading) ? kart.heading : 0) + (Number.isFinite(yaw) ? yaw : 0);
  const lx = side >= 0 ? 0.8 : -0.8;
  const lz = -0.8;
  return {
    x: kart.x + lx * Math.cos(a) + lz * Math.sin(a),
    y: 0.15,
    z: kart.z - lx * Math.sin(a) + lz * Math.cos(a),
  };
}

function makeStars(THREE, mat) {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.18, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = new THREE.Mesh(geo, mat('signStripe'));
    s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    g.add(s);
  }
  g.visible = false;
  return g;
}

/** 1フレーム分進める。dt は 1/60 以下に分割。柵の外('out')は芝生として扱う */
export function stepPlayerKart(kart, inp, dt, track = TRACK) {
  let k = kart;
  let left = Number.isFinite(dt) && dt > 0 ? dt : 0;
  while (left > 1e-9) {
    const h = Math.min(MAX_SUBSTEP, left);
    left -= h;
    let s = surfaceAt(track, k.x, k.z);
    if (s === 'out') s = 'grass';
    k = clampToFence(track, stepKart(k, inp, h, s));
  }
  return k;
}

/** 後ろから追うカメラの位置と注視点 */
export function chaseCamera(kart, camHeading, back = CAM_BACK, height = CAM_HEIGHT) {
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  return {
    x: kart.x - fx * back,
    y: height,
    z: kart.z - fz * back,
    lx: kart.x + fx * 3,
    ly: 1.2,
    lz: kart.z + fz * 3,
  };
}

export function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export function speedKmh(kart) {
  return Math.round(Math.abs(kart.speed || 0) * 5);
}

const pad2 = (v) => String(v).padStart(2, '0');

/** 秒 → mm:ss.cc */
export function formatRaceTime(sec) {
  const s = Number.isFinite(sec) ? sec : 0;
  const cs = Math.max(0, Math.floor(s * 100 + 1e-6));
  return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}

export function rankText(rank) {
  return `${rank === 1 ? 1 : 2}位`;
}

export function lapText(race) {
  return `${race.displayLap}/${TOTAL_LAPS}`;
}

/** 画面中央の表示（3・2・1・GO!・ゴール！） */
export function raceCountText(race) {
  if (!race) return '';
  if (race.phase === 'countdown') return String(race.countdown);
  if (race.phase === 'racing') return race.goTimer > 0 ? 'GO!' : '';
  return 'ゴール！';
}

/** 各通過点での左向きの法線（単位ベクトル）と接線 */
export function trackNormals(track = TRACK) {
  const w = track.waypoints;
  const n = w.length;
  return w.map((p, i) => {
    const a = w[(i - 1 + n) % n];
    const b = w[(i + 1) % n];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    return { x: -tz, z: tx, tx, tz };
  });
}

function stripGeometry(THREE, track, normals, a, b, y, keep = null) {
  const w = track.waypoints;
  const n = w.length;
  const pos = [];
  const P = (k, off) => [w[k].x + normals[k].x * off, y, w[k].z + normals[k].z * off];
  for (let i = 0; i < n; i++) {
    if (keep && !keep(i)) continue;
    const j = (i + 1) % n;
    const p0a = P(i, a);
    const p0b = P(i, b);
    const p1a = P(j, a);
    const p1b = P(j, b);
    const v1x = p1a[0] - p0a[0];
    const v1z = p1a[2] - p0a[2];
    const v2x = p0b[0] - p0a[0];
    const v2z = p0b[2] - p0a[2];
    if (v1z * v2x - v1x * v2z > 0) pos.push(...p0a, ...p1a, ...p0b, ...p0b, ...p1a, ...p1b);
    else pos.push(...p0a, ...p0b, ...p1a, ...p0b, ...p1b, ...p1a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function canvasTexture(THREE, w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function checkerTex(THREE, cols, rows) {
  return canvasTexture(THREE, cols * 16, rows * 16, (g) => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = (x + y) % 2 ? PALETTE.checkerDark : PALETTE.checkerLight;
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    }
  });
}

function arrowTex(THREE) {
  return canvasTexture(THREE, 64, 64, (g, w, h) => {
    g.fillStyle = PALETTE.roadDark;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.signStripe;
    for (const y0 of [4, 36]) {
      g.beginPath();
      g.moveTo(w / 2, y0);
      g.lineTo(w - 6, y0 + 20);
      g.lineTo(w - 6, y0 + 28);
      g.lineTo(w / 2, y0 + 12);
      g.lineTo(6, y0 + 28);
      g.lineTo(6, y0 + 20);
      g.closePath();
      g.fill();
    }
  }, true);
}

const TREE_SPOTS = [
  [0, 0], [-40, 10], [40, -12], [-15, -25], [20, 25],
  [0, -95], [0, 95], [-135, 0], [135, 10], [-80, 90], [80, -90], [120, 55],
];

export function createRaceMinigame(ctx, boss, options = {}) {
  const { THREE, camera, input, mat } = ctx;
  // アイテム効果（水鉄砲で番長を減速・画面の水滴）。持ち込みなしなら何もしない
  let itemOpts = raceItemOptions();
  let carryOpts = phase4CarryOptions({});
  let gun = createRaceGun(itemOpts);
  let dropsEl = null;
  const dropRng = createRng(timeSeed());

  function showDrops(on) {
    if (!on) {
      if (dropsEl) dropsEl.classList.add('hidden');
      return;
    }
    if (!dropsEl) {
      dropsEl = document.createElement('div');
      dropsEl.id = 'race-drops';
      document.body.appendChild(dropsEl);
    }
    dropsEl.textContent = '';
    for (const d of screenDropLayout(dropRng)) {
      const e = document.createElement('div');
      e.className = 'race-drop';
      e.style.left = `${d.x.toFixed(1)}%`;
      e.style.top = `${d.y.toFixed(1)}%`;
      e.style.width = `${d.size.toFixed(0)}px`;
      e.style.height = `${(d.size * 1.15).toFixed(0)}px`;
      e.style.animationDelay = `${d.delay.toFixed(2)}s`;
      e.style.animationDuration = `${d.dur.toFixed(2)}s`;
      dropsEl.appendChild(e);
    }
    dropsEl.classList.remove('hidden');
  }

  /** F（飛び移れないとき）かクリックで水鉄砲。撃ったら取っ組み合いの入力は消す */
  function shootWater(bin) {
    const pr = race.player.rider;
    if (!isDriving(pr)) return;
    const pm = race.prompt;
    const wantF = bin.action && pm !== 'jump' && pm !== 'counter';
    const wantClick = bin.punch && pm !== 'counter';
    if (!wantF && !wantClick) return;
    bin.action = false;
    bin.punch = false;
    const r = fireRaceGun(gun, race.player.kart, race.rival.kart);
    gun = r.gun;
    if (!r.fired) return;
    sfx('shoot');
    const p = race.player.kart;
    const rk = race.rival.kart;
    if (r.hit) {
      fx.splash({ x: rk.x, y: 1.2, z: rk.z });
      st.flash = '命中！ 番長のカートが減速！';
      st.flashT = 1.2;
    } else {
      fx.splash({ x: p.x + Math.sin(p.heading) * 4, y: 1, z: p.z + Math.cos(p.heading) * 4 });
    }
  }
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  let built = null;
  let hud = null;
  let race = null;
  const st = {
    camHeading: TRACK.playerStart.heading,
    yawFx: 0,
    rivalYawFx: 0,
    t: 0,
    finishedShown: false,
    resultT: 0,
    menuOpen: false,
    menuSel: 0,
    done: false,
    flash: '',
    flashT: 0,
    prevBoost: 0,
    sparkT: 0,
    sparkSide: 1,
  };

  function showMenu(on) {
    st.menuOpen = !!on;
    if (!hud) return;
    hud.result.classList.toggle('hidden', !on);
    if (on) {
      hud.resultTitle.textContent = resultTitle(race);
      renderMenu();
    }
  }

  function renderMenu() {
    if (!hud) return;
    hud.resultItems.forEach((li, i) => li.classList.toggle('selected', i === st.menuSel));
  }

  function startRace() {
    race = createRace();
    st.camHeading = race.player.kart.heading;
    st.yawFx = 0;
    st.rivalYawFx = 0;
    st.t = 0;
    st.finishedShown = false;
    st.resultT = 0;
    st.menuSel = 0;
    st.done = false;
    st.flash = '';
    st.flashT = 0;
    st.prevBoost = 0;
    st.sparkT = 0;
    const h = ensureHud();
    h.cache.clear();
    h.el.classList.remove('hidden');
    showMenu(false);
    updateHud();
    ctx.ui.refreshHud();
    gun = createRaceGun(itemOpts);
    ctx.ui.setHint(gun.enabled ? `${CONTROLS_HINT}　F/クリック: 水鉄砲` : CONTROLS_HINT);
    showDrops(itemOpts.screenDrops);
    // 新しいアイテム：ハンドルの遅れ・追い出されたとき1回だけすぐ戻れる
    st.steerF = 0;
    st.rescueLeft = carryOpts.respawnOnce ? 1 : 0;
  }

  function chooseAction(action) {
    if (st.done || !st.menuOpen) return;
    sfx('confirm');
    if (action === 'retry') {
      startRace(); // 会話を飛ばしてすぐ再戦
    } else if (action === 'hub') {
      st.done = true;
      showMenu(false);
      ctx.goto('hub', { fromBossId: boss ? boss.id : undefined });
    }
  }

  function recordWin() {
    if (!boss) return;
    if (typeof ctx.recordWin === 'function') ctx.recordWin(boss);
    else if (typeof ctx.claimVictory === 'function') ctx.claimVictory(boss);
  }

  function handleResult(dt) {
    if (!st.finishedShown) {
      st.finishedShown = true;
      st.resultT = 0;
      // 勝ったら演出より先に保存する
      if (race.result === 'win') recordWin();
      ctx.ui.setHint(race.result === 'win' ? WIN_HINT : FINISH_HINT);
    }
    st.resultT += dt;
    if (st.done) return;
    if (race.result === 'win') {
      const skip = st.resultT > 0.5 && input.wasPressed('Enter', 'NumpadEnter', 'Space');
      if (st.resultT >= RESULT_DELAY || skip) {
        st.done = true;
        if (boss && typeof ctx.finishMinigame === 'function') ctx.finishMinigame(boss, { won: true });
        else ctx.goto('hub', {});
      }
      return;
    }
    if (!st.menuOpen) {
      if (st.resultT >= RESULT_DELAY) {
        showMenu(true);
        ctx.ui.setHint(MENU_HINT);
      }
      return;
    }
    const r = resultMenuInput(st.menuSel, {
      up: input.wasPressed('ArrowUp', 'KeyW'),
      down: input.wasPressed('ArrowDown', 'KeyS'),
      enter: input.wasPressed('Enter', 'NumpadEnter', 'Space', 'KeyE'),
    });
    if (r.sel !== st.menuSel) {
      st.menuSel = r.sel;
      renderMenu();
    }
    if (r.action) chooseAction(r.action);
  }

  function build() {
    const world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 45, 150);
    ctx.addLights(world);

    // 海と島
    const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 24), mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, 1.2, 32), mat('sand'));
    sand.scale.set(156, 1, 116);
    sand.position.y = -0.65;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 1, 32), mat('grass'));
    grass.scale.set(150, 1, 110);
    grass.position.y = -0.5;
    world.add(sea, sand, grass);

    // 道と縁石
    const normals = trackNormals(TRACK);
    const hw = TRACK.roadHalfWidth;
    world.add(new THREE.Mesh(stripGeometry(THREE, TRACK, normals, -hw, hw, 0.03), mat('road')));
    for (const [a, b] of [[hw, hw + 1.2], [-hw - 1.2, -hw]]) {
      world.add(new THREE.Mesh(stripGeometry(THREE, TRACK, normals, a, b, 0.05, (i) => i % 2 === 0), mat('mohicanRed')));
      world.add(new THREE.Mesh(stripGeometry(THREE, TRACK, normals, a, b, 0.05, (i) => i % 2 === 1), mat('checkerLight')));
    }

    // 柵（支柱＋横木2本）
    const W = TRACK.waypoints;
    const n = W.length;
    const fw = TRACK.fenceHalfWidth;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 1.5, 0.35), mat('gatePost'), n * 2);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.22, 1), mat('checkerLight'), n * 4);
    const dummy = new THREE.Object3D();
    let pi = 0;
    let ri = 0;
    for (const side of [1, -1]) {
      const pts = W.map((p, i) => ({ x: p.x + normals[i].x * fw * side, z: p.z + normals[i].z * fw * side }));
      for (let i = 0; i < n; i++) {
        dummy.position.set(pts[i].x, 0.75, pts[i].z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.setMatrixAt(pi++, dummy.matrix);
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (const y of [0.55, 1.15]) {
          dummy.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
          dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
          dummy.scale.set(1, 1, len);
          dummy.updateMatrix();
          rails.setMatrixAt(ri++, dummy.matrix);
        }
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    world.add(posts, rails);

    // 加速床（流れる矢印）
    const padTex = arrowTex(THREE);
    const padMat = new THREE.MeshBasicMaterial({ map: padTex });
    for (const pad of TRACK.boostPads) {
      const near = nearestOnCenterline(TRACK, pad.x, pad.z);
      const g = new THREE.Group();
      g.position.set(pad.x, 0.07, pad.z);
      g.rotation.y = Math.atan2(near.tx, near.tz) + Math.PI;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(pad.radius * 2, pad.radius * 2), padMat);
      plane.rotation.x = -Math.PI / 2;
      g.add(plane);
      world.add(g);
    }

    // スタートライン（チェッカー）とアーチ
    const g0 = TRACK.gates[0];
    const startG = new THREE.Group();
    startG.position.set(g0.x, 0, g0.z);
    startG.rotation.y = Math.atan2(g0.dx, g0.dz);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 2),
      new THREE.MeshLambertMaterial({ map: checkerTex(THREE, 9, 1) }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.06;
    startG.add(line);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), mat('gatePost'));
      post.position.set(s * (hw + 2.5), 2.5, 0);
      startG.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(2 * (hw + 2.5) + 0.6, 1.2, 0.4),
      new THREE.MeshLambertMaterial({ map: checkerTex(THREE, 12, 2) }),
    );
    banner.position.y = 5.2;
    startG.add(banner);
    world.add(startG);

    // 木（コースにかからない場所だけ）
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 6);
    const leafGeo = new THREE.IcosahedronGeometry(3, 0);
    TREE_SPOTS.forEach(([x, z], i) => {
      if (nearestOnCenterline(TRACK, x, z).dist < fw + 4) return;
      const trunk = new THREE.Mesh(trunkGeo, mat('trunk'));
      trunk.position.set(x, 1.5, z);
      const leaf = new THREE.Mesh(leafGeo, mat(i % 2 ? 'leaf' : 'grassDark'));
      leaf.position.set(x, 4.6, z);
      leaf.rotation.y = i;
      world.add(trunk, leaf);
    });

    // 主人公のカート
    const kart = buildKart(THREE, mat, { bodyKey: 'heroBody', trimKey: 'checkerLight' });
    const shadow = ctx.makeShadow(1);
    shadow.scale.set(1.8, 2.8, 1);
    shadow.position.y = 0.04;
    kart.root.add(shadow);
    const hero = createHeroRig(THREE, mat, { scale: HERO_SCALE });
    setSeatedPose(hero);
    kart.seat.add(hero.root);
    world.add(kart.root);

    // レース番長のカート
    const rivalKart = buildKart(THREE, mat, { bodyKey: 'mohicanYellow', trimKey: 'checkerDark' });
    const rshadow = ctx.makeShadow(1);
    rshadow.scale.set(1.8, 2.8, 1);
    rshadow.position.y = 0.04;
    rivalKart.root.add(rshadow);
    const rival = buildRaceBoss(THREE, mat, { scale: RIVAL_SCALE });
    setModelSeated(rival, true);
    rival.root.position.y = -seatedHipHeight(RIVAL_SCALE) + 0.04;
    rivalKart.seat.add(rival.root);
    world.add(rivalKart.root);

    // 降りている間、自分のカートの上に出す矢印
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6), mat('uiAccent'));
    arrow.rotation.x = Math.PI;
    arrow.visible = false;
    world.add(arrow);
    // 気絶の星
    const heroStars = makeStars(THREE, mat);
    const rivalStars = makeStars(THREE, mat);
    world.add(heroStars, rivalStars);
    hero.root.rotation.order = 'YXZ';
    rival.root.rotation.order = 'YXZ';

    return {
      world,
      kart,
      hero,
      rivalKart,
      rival,
      padTex,
      arrow,
      heroStars,
      rivalStars,
      heroMode: 'seat',
      rivalMode: 'seat',
      heroAnim: createAnimState(),
      rivalAnim: createAnimState(),
    };
  }

  function ensureHud() {
    if (hud) return hud;
    const el = document.createElement('div');
    el.id = 'race-hud';
    el.className = 'hidden';
    const box = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      el.appendChild(d);
      return d;
    };
    const lap = box('race-box race-lap');
    const rank = box('race-box race-rank');
    const time = box('race-box race-time');
    const speed = box('race-box race-speed');
    const fx = box('race-fx hidden');
    const prompt = box('race-box race-prompt hidden');
    prompt.style.cssText = 'position:fixed;left:50%;right:auto;top:auto;bottom:20%;transform:translateX(-50%);';
    document.body.appendChild(el);
    const count = document.createElement('div');
    count.id = 'race-count';
    count.className = 'hidden';
    document.body.appendChild(count);
    // 負けたときのメニュー
    const result = document.createElement('div');
    result.id = 'race-result';
    result.className = 'overlay hidden';
    const panel = document.createElement('div');
    panel.className = 'race-result-panel';
    const rTitle = document.createElement('h2');
    const list = document.createElement('ul');
    const resultItems = RESULT_MENU.map((it, i) => {
      const li = document.createElement('li');
      li.textContent = it.label;
      li.addEventListener('click', () => {
        st.menuSel = i;
        renderMenu();
        chooseAction(it.id);
      });
      list.appendChild(li);
      return li;
    });
    panel.append(rTitle, list);
    result.appendChild(panel);
    document.body.appendChild(result);
    hud = {
      el, lap, rank, time, speed, fx, prompt, count, result, resultTitle: rTitle, resultItems, cache: new Map(),
    };
    return hud;
  }

  function setText(h, key, node, text) {
    if (h.cache.get(key) === text) return;
    h.cache.set(key, text);
    node.textContent = text;
  }

  function updateHud() {
    const h = ensureHud();
    const k = race.player.kart;
    setText(h, 'lap', h.lap, `周回 ${lapText(race)}`);
    setText(h, 'rank', h.rank, rankText(race.playerRank));
    const t = race.player.racer.finished ? race.player.racer.finishTime : race.time;
    setText(h, 'time', h.time, formatRaceTime(t));
    setText(h, 'speed', h.speed, `${speedKmh(k)} km/h`);
    let fx = race.phase !== 'racing' ? '' : (k.boostTimer > 0 ? 'ダッシュ！' : (k.drifting ? 'ドリフト！' : ''));
    if (st.flashT > 0 && st.flash && race.phase === 'racing') fx = st.flash;
    const pt = race.phase === 'racing' && !st.menuOpen ? promptText(race.prompt) : '';
    if (h.cache.get('prompt') !== pt) {
      h.cache.set('prompt', pt);
      h.prompt.textContent = pt;
      h.prompt.classList.toggle('hidden', !pt);
    }
    if (h.cache.get('fx') !== fx) {
      h.cache.set('fx', fx);
      h.fx.textContent = fx;
      h.fx.classList.toggle('hidden', !fx);
    }
    const c = st.menuOpen ? '' : raceCountText(race);
    if (h.cache.get('count') !== c) {
      h.cache.set('count', c);
      h.count.textContent = c;
      h.count.classList.toggle('hidden', !c);
    }
  }

  function placeKart(km, k, yawFx, steer, dt, moving) {
    const target = k.drifting ? -steer * 0.35 : 0;
    const y = yawFx + (target - yawFx) * (1 - Math.exp(-dt * 8));
    km.root.position.set(k.x, 0, k.z);
    km.root.rotation.y = k.heading + y;
    km.update(k, moving ? dt : 0, steer, surfaceAt(TRACK, k.x, k.z), st.t);
    return y;
  }

  function kartOfSide(side) {
    return side === 'player' ? race.player.kart : race.rival.kart;
  }

  /** 乗り手の見た目の位置（相手のカートの上ではボンネットに立って運転手の方を向く） */
  function riderPose(r) {
    if (r.state === 'onKart' || r.state === 'punching' || r.state === 'jumping') {
      const k = kartOfSide(r.onSide);
      const s = r.state === 'jumping' ? Math.min(1, r.t / BRAWL.jumpTime) : 1;
      return {
        x: r.x + Math.sin(k.heading) * HOOD_OFFSET * s,
        y: r.y + HOOD_Y * s + SEAT_Y * (1 - s),
        z: r.z + Math.cos(k.heading) * HOOD_OFFSET * s,
        heading: r.state === 'jumping' ? r.heading : k.heading + Math.PI,
        lying: false,
      };
    }
    return {
      x: r.x,
      y: r.y,
      z: r.z,
      heading: r.heading,
      lying: r.state === 'knockedOut' && r.t >= BRAWL.ejectFlight,
    };
  }

  function tiltOf(r, pose) {
    if (pose.lying) return -1.3;
    if (r.state === 'punching') return 0.3;
    return 0;
  }

  function placeHero(dt) {
    const h = built.hero;
    const r = race.player.rider;
    if (r.state === 'driving') {
      if (built.heroMode !== 'seat') {
        built.kart.seat.add(h.root);
        h.root.position.set(0, 0, 0);
        h.root.rotation.set(0, 0, 0);
        setSeatedPose(h);
        built.heroMode = 'seat';
      }
      h.apply(null);
      h.root.position.y = -h.hipHeight + 0.04;
      return;
    }
    if (built.heroMode !== 'free') {
      built.world.add(h.root);
      if (typeof heroModel.clearSeatedPose === 'function') heroModel.clearSeatedPose(h);
      else h.seated = false;
      built.heroMode = 'free';
    }
    const pose = riderPose(r);
    stepAnim(built.heroAnim, {
      moving: !!r.moving,
      airborne: r.state === 'jumping' || r.state === 'boarding',
      vy: 0,
      dt,
      dash: !!r.dash,
    });
    h.apply(built.heroAnim);
    h.root.position.set(pose.x, pose.y, pose.z);
    h.root.rotation.set(tiltOf(r, pose), pose.heading, 0);
  }

  function placeRival(dt) {
    const m = built.rival;
    const r = race.rival.rider;
    if (r.state === 'driving') {
      if (built.rivalMode !== 'seat') {
        built.rivalKart.seat.add(m.root);
        m.root.position.set(0, 0, 0);
        m.root.rotation.set(0, 0, 0);
        setModelSeated(m, true);
        m.root.position.y = -seatedHipHeight(RIVAL_SCALE) + 0.04;
        built.rivalMode = 'seat';
      }
      return;
    }
    if (built.rivalMode !== 'free') {
      built.world.add(m.root);
      setModelSeated(m, false);
      built.rivalMode = 'free';
    }
    const pose = riderPose(r);
    stepAnim(built.rivalAnim, {
      moving: !!r.moving,
      airborne: r.state === 'jumping' || r.state === 'boarding',
      vy: 0,
      dt,
      dash: !!r.dash,
    });
    m.apply(built.rivalAnim);
    m.root.position.set(pose.x, pose.y, pose.z);
    m.root.rotation.set(tiltOf(r, pose), pose.heading, 0);
  }

  function placeStars(group, r, ownKart, dt, fxOwned = false) {
    group.visible = r.stun > 0;
    // 粒子の星が出ているときは、代わりの八面体の星を隠す
    for (const c of group.children) if (c.isMesh) c.visible = !fxOwned;
    if (!group.visible) return;
    if (r.state === 'driving') {
      group.position.set(ownKart.x, STAR_Y_SEATED, ownKart.z);
    } else {
      const p = riderPose(r);
      group.position.set(p.x, p.lying ? 0.9 : p.y + STAR_Y_STAND, p.z);
    }
    group.rotation.y += dt * 4;
  }

  return {
    enter(arg) {
      if (!built) built = build();
      const itemParams = pickItemParams([
        arg && (arg.itemParams || arg.params), options && options.params,
        ctx.itemParams, ctx.carryParams, boss && boss.itemParams,
      ], 'race');
      itemOpts = raceItemOptions(itemParams);
      carryOpts = phase4CarryOptions(itemParams);
      applyMohawkColor(built.hero, typeof ctx.mohawkColor === 'function' ? ctx.mohawkColor() : undefined);
      ctx.setWorld(built.world);
      fx.init(built.world, THREE);
      startRace();
    },
    update(dt) {
      if (!built || !race) return;
      st.t += dt;
      const kin = readKartInput(input.isDown);
      if (carryOpts.steerLag > 0) {
        st.steerF = laggedSteer(st.steerF, kin.steer, dt, carryOpts.steerLag);
        kin.steer = st.steerF;
      }
      const bin = readBrawlInput(input, st.camHeading);
      if (gun.enabled && race.phase === 'racing') shootWater(bin);
      race.update({ ...kin, ...bin }, dt);
      if (st.rescueLeft > 0) {
        const r = rescueEjected(race.player.rider, st.rescueLeft, () => createRider('player', race.player.kart));
        if (r.rescued) {
          race.player.rider = r.rider;
          st.rescueLeft = r.left;
          ctx.ui.toast('アイテムのおかげで、すぐカートに戻れた！', 2);
        }
      }
      if (gun.enabled) {
        if (race.phase === 'racing') race.rival.kart = applyRivalSlow(race.rival.kart, gun, KART.maxSpeed);
        gun = tickRaceGun(gun, dt);
      }
      const racing = race.phase === 'racing';
      const p = race.player.kart;
      const r = race.rival.kart;
      const pr = race.player.rider;
      const rr = race.rival.rider;
      if (racing) {
        if (p.boostTimer > st.prevBoost + 0.05) {
          sfx('boostPad');
          fx.boost({ x: p.x, y: 0.4, z: p.z });
        }
        if (p.drifting) {
          sfx('drift');
          st.sparkT -= dt;
          if (st.sparkT <= 0) {
            st.sparkT = SPARK_INTERVAL;
            st.sparkSide = -st.sparkSide;
            fx.sparks(rearWheelPoint(p, st.sparkSide, st.yawFx));
          }
        } else {
          st.sparkT = 0;
        }
      }
      st.prevBoost = p.boostTimer || 0;
      const pin = racing && isDriving(pr) ? kin : NO_STEER;
      const rin = racing && isDriving(rr) ? (race.rivalInput || NO_STEER) : NO_STEER;
      st.yawFx = placeKart(built.kart, p, st.yawFx, pin.steer, dt, racing);
      st.rivalYawFx = placeKart(built.rivalKart, r, st.rivalYawFx, rin.steer, dt, racing);
      placeHero(dt);
      placeRival(dt);
      // 粒子の星は同時に1つだけ（番長を優先）。もう片方は八面体の星
      const starTarget = rr.stun > 0 ? built.rivalStars : (pr.stun > 0 ? built.heroStars : null);
      const fxStars = fx.stars(starTarget);
      placeStars(built.heroStars, pr, p, dt, fxStars && starTarget === built.heroStars);
      placeStars(built.rivalStars, rr, r, dt, fxStars && starTarget === built.rivalStars);
      built.arrow.visible = pr.state !== 'driving' && pr.state !== 'boarding';
      if (built.arrow.visible) built.arrow.position.set(p.x, 3.3 + Math.sin(st.t * 4) * 0.25, p.z);
      if (built.rival.flutter) built.rival.flutter(st.t);
      built.padTex.offset.y = (built.padTex.offset.y - dt * 1.2) % 1;
      for (const e of race.events || []) {
        if (BRAWL_SFX[e]) sfx(BRAWL_SFX[e]);
        const msg = brawlMessage(e);
        if (msg) {
          st.flash = msg;
          st.flashT = 1.2;
        }
      }
      st.flashT = Math.max(0, st.flashT - dt);

      const cam = cameraTarget(race, st.camHeading, st.yawFx);
      st.camHeading = lerpAngle(st.camHeading, cam.heading, 1 - Math.exp(-dt * cam.rate));
      const c = chaseCamera(cam.focus, st.camHeading);
      camera.position.set(c.x, c.y, c.z);
      camera.lookAt(c.lx, c.ly, c.lz);
      if (race.phase === 'finished') handleResult(dt);
      fx.update(dt);
      updateHud();
    },
    /** ポーズメニューに足す項目 */
    pauseItems() {
      return [{
        id: 'race-quit-hub',
        label: 'やめてハブへ戻る',
        run: () => ctx.goto('hub', { fromBossId: boss ? boss.id : undefined }),
      }];
    },
    // 試し遊び用の状態（局面・周回・速さ・順位・持ち込み）
    smokeState() {
      if (!race) return { phase: 'none', lap: 0, speed: 0 };
      const k = race.player.kart;
      return {
        phase: race.phase,
        lap: race.player.racer.lap,
        totalLaps: race.totalLaps,
        speed: Math.abs(Number(k.speed) || 0),
        time: race.time,
        rank: race.playerRank,
        pos: { x: k.x, z: k.z },
        rivalSlow: gun ? !!gun.enabled : false,
      };
    },
    exit() {
      if (hud) {
        hud.el.classList.add('hidden');
        hud.count.classList.add('hidden');
        hud.result.classList.add('hidden');
      }
      st.menuOpen = false;
      showDrops(false);
      fx.dispose();
      ctx.ui.setHint('');
    },
  };
}
