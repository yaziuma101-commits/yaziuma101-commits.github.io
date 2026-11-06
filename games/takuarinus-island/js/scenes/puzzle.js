// パズル番長のミニゲーム: 3D の倉庫番（見た目と入力だけ。規則は sokoban.js / puzzle-session.js）
// モジュールの読み込み時には DOM に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import { isGoal, boxesOnGoal } from '../sokoban.js';
import {
  createSession, moveSession, advanceSession, undoSession, restartSession, pullSession,
} from '../puzzle-session.js';
import { LEVELS, HARD_LEVELS } from '../levels.js';
import { buildAlinus, createAnimState, stepAnim } from '../characters.js';
import { createHeroRig } from '../hero-model.js';
import { pickItemParams, puzzleItemOptions, phase4CarryOptions } from '../item-effects.js';

export const PUZZLE_MOVE_TIME = 0.12;
// カメラは盤面の真南の斜め上に固定（横にずらさず、回さない）。
// 画面の上＝盤面の上（−z）、画面の右＝盤面の右（+x）になり、方向キーと一致する。
export const PUZZLE_CAMERA = Object.freeze({
  position: Object.freeze({ x: 0, y: 9, z: 5.2 }),
  target: Object.freeze({ x: 0, y: 0, z: 0.4 }),
});
const HERO_SCALE = 0.7;
const DIR_KEYS = [
  ['up', ['KeyW', 'ArrowUp']],
  ['down', ['KeyS', 'ArrowDown']],
  ['left', ['KeyA', 'ArrowLeft']],
  ['right', ['KeyD', 'ArrowRight']],
];
// モデルの向き（rotation.y）。0 で +z（画面手前）を向く
export const DIR_FACING = Object.freeze({
  up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2,
});
const HINT = 'WASD/矢印: 移動　Z: 1手戻す　R: やり直し　Esc: ポーズ';
const PULL_HINT = '　X: 箱を引く';
/** 「最初の1手がずれる」ときの向き（右へ90度） */
export const SLIP_OF = Object.freeze({
  up: 'right', right: 'down', down: 'left', left: 'up',
});

/** 押されている方向キー（なければ null）。isDown は input.isDown 互換 */
export function heldDirection(isDown) {
  for (const [dir, codes] of DIR_KEYS) if (isDown(...codes)) return dir;
  return null;
}

/** マス (x,y) → 盤面中心を原点とした x-z 座標。y（up が −1）は −z が奥 */
export function cellToWorld(level, x, y) {
  return { x: x - (level.width - 1) / 2, z: y - (level.height - 1) / 2 };
}

export function puzzleStatusText(session) {
  const g = session.game;
  return `問 ${session.index + 1}/${session.levels.length}　手数 ${g.moves}　箱 ${boxesOnGoal(g)}/${g.boxes.length}`;
}

export function bannerText(session) {
  if (session.status === 'level-clear') return 'クリア！ Enter で次へ';
  if (session.status === 'won') return `全${session.levels.length}問クリア！ Enter`;
  return '';
}

export function createPuzzleMinigame(ctx, boss, levels = LEVELS, options = {}) {
  let pushDistance = 1;
  const { THREE, camera, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  let world = null;
  let board = null;
  let geos = null;
  let glowMat = null;
  let heroModel = null;
  let heroShadow = null;
  let boxMeshes = [];
  let session = null;
  const anim = createAnimState();
  const move = { t: 1, hFrom: null, hTo: null, bi: -1, bFrom: null, bTo: null };
  let facing = 0;
  let faceDir = 'down';
  let slipPending = false;
  let noUndo = false; // 高難易度: Z の1手戻しを使えない
  let time = 0;
  let finished = false;
  let claimed = false;
  let hudEl = null;
  let bannerEl = null;
  let lastHud = null;
  let lastBanner = null;

  function ensureDom() {
    if (hudEl) return;
    hudEl = document.createElement('div');
    hudEl.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'padding:6px 14px', 'border-radius:0',
      'border:3px solid var(--p-uiAccent)', 'background:var(--p-uiPanel)', 'color:var(--p-uiText)',
      'font-weight:bold', 'font-size:20px', 'pointer-events:none', 'z-index:10',
    ].join(';');
    bannerEl = document.createElement('div');
    bannerEl.style.cssText = [
      'position:fixed', 'left:50%', 'top:38%', 'transform:translate(-50%,-50%)', 'padding:14px 28px',
      'border-radius:0', 'border:4px solid var(--p-uiAccent)', 'background:var(--p-uiPanel)',
      'color:var(--p-uiTitle)', 'font-size:clamp(22px,4vw,40px)', 'font-weight:bold',
      'text-align:center', 'pointer-events:none', 'z-index:12', 'white-space:nowrap',
    ].join(';');
    hudEl.classList.add('hidden');
    bannerEl.classList.add('hidden');
    document.body.append(hudEl, bannerEl);
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 20, 50);
    ctx.addLights(world);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 12), mat('grass'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    world.add(ground);

    geos = {
      tile: new THREE.BoxGeometry(1, 0.2, 1),
      wall: new THREE.BoxGeometry(1, 0.8, 1),
      goal: new THREE.BoxGeometry(0.8, 0.04, 0.8),
      box: new THREE.BoxGeometry(0.78, 0.78, 0.78),
    };
    glowMat = new THREE.MeshLambertMaterial({
      color: PALETTE.road, emissive: PALETTE.road, emissiveIntensity: 0.4, flatShading: true,
    });
    board = new THREE.Group();
    world.add(board);

    // 番長が奥で見守る
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.3, 8), mat('pedestalTop'));
    dais.position.set(0, 0.15, -5.8);
    const bm = buildAlinus(THREE, mat, { scale: 1.3, pose: 'hips' });
    bm.root.position.set(0, 0.3, -5.8);
    world.add(dais, bm.root);

    heroModel = createHeroRig(THREE, mat, { scale: HERO_SCALE });
    heroShadow = ctx.makeShadow(0.8);
    world.add(heroModel.root, heroShadow);
  }

  function buildBoard() {
    board.clear();
    const lv = session.game.level;
    for (let y = 0; y < lv.height; y++) {
      for (let x = 0; x < lv.width; x++) {
        const p = cellToWorld(lv, x, y);
        const tile = new THREE.Mesh(geos.tile, mat((x + y) % 2 ? 'pedestal' : 'pedestalTop'));
        tile.position.set(p.x, -0.1, p.z);
        board.add(tile);
        if (lv.walls[y][x]) {
          const w = new THREE.Mesh(geos.wall, mat('sea'));
          w.position.set(p.x, 0.4, p.z);
          board.add(w);
        } else if (lv.goalMap[y][x]) {
          const gm = new THREE.Mesh(geos.goal, glowMat);
          gm.position.set(p.x, 0.02, p.z);
          board.add(gm);
        }
      }
    }
    boxMeshes = session.game.boxes.map(() => {
      const m = new THREE.Mesh(geos.box, mat('board'));
      board.add(m);
      return m;
    });
  }

  function placeBox(i, p) {
    boxMeshes[i].position.set(p.x, 0.39, p.z);
  }

  function refreshBoxColors() {
    const g = session.game;
    g.boxes.forEach((b, i) => {
      boxMeshes[i].material = mat(isGoal(g.level, b.x, b.y) ? 'leaf' : 'board');
    });
  }

  function snapAll() {
    const g = session.game;
    move.t = 1;
    const hp = cellToWorld(g.level, g.player.x, g.player.y);
    heroModel.root.position.set(hp.x, 0, hp.z);
    g.boxes.forEach((b, i) => placeBox(i, cellToWorld(g.level, b.x, b.y)));
    refreshBoxColors();
  }

  function tryStep(dir) {
    if (slipPending) {
      // 持ち込みの「最初の1手がずれる」：最初の1手だけ右へ90度ずれる
      slipPending = false;
      dir = SLIP_OF[dir] || dir;
      ctx.ui.toast('玉に引っぱられて、1手目がずれた！', 1.6);
    }
    faceDir = dir;
    facing = DIR_FACING[dir];
    const g = session.game;
    const prevP = { ...g.player };
    const prevB = g.boxes.map((b) => ({ ...b }));
    animateMove(moveSession(session, dir), prevP, prevB);
  }

  /** 向いている側の箱を手前に引く（持ち込みで回数があるときだけ） */
  function tryPullBox() {
    const g = session.game;
    const prevP = { ...g.player };
    const prevB = g.boxes.map((b) => ({ ...b }));
    const r = pullSession(session, faceDir);
    if (r === 'pull') ctx.ui.toast(`箱を引いた！（のこり ${session.pullLeft || 0} 回）`, 1.4);
    else ctx.ui.toast('引ける箱が無い（箱の方を向いて、後ろを空けて X）', 1.6);
    animateMove(r, prevP, prevB);
  }

  function animateMove(r, prevP, prevB) {
    const g = session.game;
    if (r !== 'walk' && r !== 'push' && r !== 'pull') return;
    if (r === 'push' || r === 'pull') sfx('push');
    if (session.status === 'level-clear' || session.status === 'won') sfx('puzzleClear');
    // 全問クリアの瞬間に獲得・保存する（演出中にリロードしても残る）
    if (session.status === 'won' && !claimed) {
      claimed = true;
      if (typeof ctx.claimVictory === 'function') ctx.claimVictory(boss);
    }
    move.t = 0;
    move.hFrom = cellToWorld(g.level, prevP.x, prevP.y);
    move.hTo = cellToWorld(g.level, g.player.x, g.player.y);
    move.bi = r === 'push' || r === 'pull'
      ? g.boxes.findIndex((b, i) => b.x !== prevB[i].x || b.y !== prevB[i].y)
      : -1;
    if (move.bi >= 0) {
      move.bFrom = cellToWorld(g.level, prevB[move.bi].x, prevB[move.bi].y);
      const nb = g.boxes[move.bi];
      move.bTo = cellToWorld(g.level, nb.x, nb.y);
    }
  }

  function stepMove(dt) {
    if (move.t >= 1) return;
    move.t = Math.min(1, move.t + dt / PUZZLE_MOVE_TIME);
    const k = move.t;
    heroModel.root.position.set(
      move.hFrom.x + (move.hTo.x - move.hFrom.x) * k, 0,
      move.hFrom.z + (move.hTo.z - move.hFrom.z) * k,
    );
    if (move.bi >= 0) {
      placeBox(move.bi, {
        x: move.bFrom.x + (move.bTo.x - move.bFrom.x) * k,
        z: move.bFrom.z + (move.bTo.z - move.bFrom.z) * k,
      });
    }
    if (move.t >= 1) refreshBoxColors();
  }

  function updateDom() {
    const h = puzzleStatusText(session) + (pushDistance > 1 ? `　箱${pushDistance}マス押し` : '')
      + (session.pullLeft > 0 ? `　箱を引ける ×${session.pullLeft}（X）` : '');
    if (h !== lastHud) {
      hudEl.textContent = h;
      lastHud = h;
    }
    const b = move.t >= 1 ? bannerText(session) : '';
    if (b !== lastBanner) {
      bannerEl.textContent = b;
      bannerEl.classList.toggle('hidden', !b);
      lastBanner = b;
    }
  }

  function finish(won) {
    if (finished) return;
    finished = true;
    ctx.finishMinigame(boss, { won });
  }

  return {
    enter(arg) {
      if (!world) build();
      ensureDom();
      const params = pickItemParams([
        arg && (arg.itemParams || arg.params), options && options.params,
        ctx.itemParams, ctx.carryParams, boss && boss.itemParams,
      ], 'puzzle');
      pushDistance = puzzleItemOptions(params).pushDistance;
      // 新しいアイテム：箱を引ける（「1回だけ取り消せる」の品）・最初の1手がずれる。以前は表示だけだった
      const extra = phase4CarryOptions(params);
      const pullLeft = extra.undoOnce || extra.missFree > 0 ? 1 : 0;
      // 高難易度: 番長の問題が難しくなる（箱が多く、手数が長い）。ほかの面を渡されたときはそのまま
      session = createSession(params && params.hard && levels === LEVELS ? HARD_LEVELS : levels, { pushDistance, pullLeft });
      slipPending = extra.firstMoveSlip;
      noUndo = extra.noUndo;
      faceDir = 'down';
      finished = false;
      claimed = false;
      facing = 0;
      buildBoard();
      snapAll();
      ctx.setWorld(world);
      lastHud = null;
      lastBanner = null;
      hudEl.classList.remove('hidden');
      updateDom();
      ctx.ui.setHint(pullLeft > 0 ? HINT + PULL_HINT : HINT);
    },
    update(dt) {
      time += dt;
      glowMat.emissiveIntensity = 0.35 + 0.3 * Math.sin(time * 4);
      if (input.wasPressed('Escape')) {
        finish(false);
        return;
      }
      stepMove(dt);

      if (session.status === 'playing') {
        if (input.wasPressed('KeyZ')) {
          if (noUndo) {
            ctx.ui.toast('高難易度：1手戻しは使えない（R でやり直し）', 2);
          } else if (undoSession(session)) snapAll();
        } else if (input.wasPressed('KeyR')) {
          if (restartSession(session)) snapAll();
        } else if (move.t >= 1 && session.pullLeft > 0 && input.wasPressed('KeyX')) {
          tryPullBox();
        } else if (move.t >= 1) {
          const dir = heldDirection(input.isDown);
          if (dir) tryStep(dir);
        }
      } else if (move.t >= 1 && input.wasPressed('Enter', 'NumpadEnter')) {
        if (session.status === 'level-clear') {
          if (advanceSession(session)) {
            sfx('confirm');
            buildBoard();
            snapAll();
          }
        } else if (session.status === 'won') {
          finish(true);
        }
      }

      stepAnim(anim, { moving: move.t < 1, airborne: false, vy: 0, dt });
      heroModel.apply(anim);
      heroModel.root.rotation.y = facing;
      heroShadow.position.set(heroModel.root.position.x, 0.05, heroModel.root.position.z);

      camera.position.set(PUZZLE_CAMERA.position.x, PUZZLE_CAMERA.position.y, PUZZLE_CAMERA.position.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(PUZZLE_CAMERA.target.x, PUZZLE_CAMERA.target.y, PUZZLE_CAMERA.target.z);
      updateDom();
    },
    // 試し遊び用の状態（局面・何問目・手数・押せるマス数）
    smokeState() {
      const g = session && session.game;
      return {
        phase: session ? session.status : 'none',
        level: session ? session.index + 1 : 0,
        moves: g ? g.moves : 0,
        pushDistance,
        player: g ? { x: g.player.x, y: g.player.y } : null,
        finished,
      };
    },
    exit() {
      if (hudEl) hudEl.classList.add('hidden');
      if (bannerEl) bannerEl.classList.add('hidden');
      ctx.ui.setHint('');
    },
  };
}
