// スーパー将棋の場面：和室（畳と障子）で、おなすくんと将棋を指す。
// 盤と駒は HTML（shogi-ui.js）で画面に重ねる。3D は後ろの背景だけ（文字は描かない）。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { PALETTE } from '../palette.js';
import { buildAlinus, createAnimState, stepAnim } from '../characters.js';
import { createHeroRig, applyMohawkColor } from '../hero-model.js';
import {
  createInitialState, legalMoves, gameStatus, pieceAt,
} from '../shogi-rules.js';
import {
  createSession, playMove, undo as undoSession, canUndo, DEFAULT_UNDO_LIMIT,
} from '../shogi-session.js';
import {
  createShogiUi, selectionMoves, sqKey, createWorkshop, createChoicePanel, shogiLevelView, levelLabel,
  shogiSillyPlan, nasuRollPose,
} from '../shogi-ui.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from '../silly-rules.js';
import { chooseMove } from '../shogi-ai.js';
import { generateNasuDef, customCost } from '../shogi-custom.js';
import {
  parseShogiSave, serializeShogiSave, SHOGI_STORAGE_KEY, SHOGI_LEVELS, DEFAULT_SHOGI_LEVEL,
} from '../shogi-save.js';
import { createRng } from '../mini-rng.js';
import {
  shogiCarryPlan, applyShogiCarry, shogiAiOptions, washAwayPiece, washTargets,
} from '../shogi-carry.js';
import { consumePitchDrag } from '../pitch-drag.js';
import { shogiSfx, ensureGameMusic, stopGameMusic } from '../audio.js';
import { shogiMoveSounds } from '../audio-rules.js';
import { PAUSE_BACK_GALLERY, createMinigamePanel } from './touch.js';
import { gameIntroView } from '../game-intro.js';
import { attachHeroFace } from '../opponent-faces.js';
import { smokeSummary } from '../smoke-state.js';

export const SHOGI_GAME_ID = 'super-shogi';
/** おなすくんの位置（盤の右に立つ）とカメラ */
export const ONASU_POS = Object.freeze({ x: 4.4, y: 0.15, z: -1.6 });
export const ONASU_FACE_Y = 1.2;
export const SHOGI_CAMERA = Object.freeze({
  pos: Object.freeze({ x: 0, y: 2.2, z: 5 }),
  look: Object.freeze({ x: 0, y: 1.4, z: 0 }),
  fov: 60,
});
/** おなすくんがカメラのほうを向く角度 */
export const ONASU_YAW = Math.atan2(SHOGI_CAMERA.pos.x - ONASU_POS.x, SHOGI_CAMERA.pos.z - ONASU_POS.z);

/** 点を画面の割合（左上 0,0 〜 右下 1,1）へ投影する（three.js を使わない） */
export function projectToScreen(p, cam = SHOGI_CAMERA, aspect = 16 / 9) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const nrm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  const f = nrm(sub(cam.look, cam.pos));
  const r = nrm(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  const v = sub(p, cam.pos);
  const z = dot(v, f);
  const th = Math.tan((cam.fov * Math.PI) / 360);
  return { x: 0.5 + dot(v, r) / (z * th * aspect) / 2, y: 0.5 - dot(v, u) / (z * th) / 2, depth: z };
}
/** 相手が指すまでの間（秒） */
export const AI_DELAY = 0.7;

const REASON = Object.freeze({
  checkmate: '詰み', resign: '投了', repetition: '千日手', nomoves: '指せる手なし',
});

/** 結果画面の中身 */
export function shogiResultView(status, plies, extra = []) {
  const winner = status ? status.winner : null;
  let title = '引き分け';
  let tone = '';
  let result = 'draw';
  if (winner === 'b') {
    title = '勝ち！';
    tone = 'good';
    result = 'win';
  } else if (winner === 'w') {
    title = '負け…';
    tone = 'bad';
    result = 'lose';
  }
  const n = Number.isFinite(Number(plies)) ? Number(plies) : 0;
  return {
    title,
    tone,
    result,
    lines: [
      `${n}手で${REASON[status && status.kind] || '終局'}`,
      ...(Array.isArray(extra) ? extra.filter((s) => typeof s === 'string' && s) : []),
    ],
    choices: [
      { id: 'again', label: 'もう一度' },
      { id: 'remake', label: '駒を作り直す' },
      { id: 'gallery', label: '館に戻る' },
    ],
  };
}

/** 手番と手数の表示 */
export function shogiStatusText(state, status) {
  if (!state) return '';
  const who = state.turn === 'b' ? 'あなたの番' : 'おなすくんの番';
  return `${who}　手数 ${state.plies}${status && status.inCheck ? '　王手！' : ''}`;
}

/** 対局前の「そのまま使う／作り直す」の中身 */
export function shogiMenuView(def) {
  const name = def && def.name ? def.name : '？';
  return {
    title: 'スーパー将棋',
    lines: [`前に作った駒「${name}」（${customCost(def)}点）`, 'おなすくんも毎回ちがう「ナス」を持ってくる'],
    choices: [{ id: 'use', label: 'そのまま使う' }, { id: 'remake', label: '作り直す' }],
  };
}

/** 保存を読む（壊れていれば空） */
export function loadShogiSave(storage) {
  try {
    return parseShogiSave(storage ? storage.getItem(SHOGI_STORAGE_KEY) : null);
  } catch {
    return parseShogiSave(null);
  }
}

/** 保存を書く。書けたら true */
export function storeShogiSave(storage, save) {
  try {
    if (!storage) return false;
    storage.setItem(SHOGI_STORAGE_KEY, serializeShogiSave(save || {}));
    return true;
  } catch {
    return false;
  }
}

function shogiStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

const PLAY_HINT = 'クリック: 駒を選ぶ → 光るマスに指す　矢印+Enter でも指せる　U: 待った　Esc: 選択解除／ポーズ';

export function createShogiScene(ctx) {
  const { THREE, mat, camera, input } = ctx;
  let world = null;
  let rig = null;
  let anim = null;
  let onasu = null;
  const crowd = [];
  let ui = null;
  let session = null;
  let state = null;
  let phase = 'idle';
  let selected = null;
  let targets = new Set();
  let cursor = { x: 4, y: 6 };
  let lastMove = null;
  let pending = null;
  let aiT = 0;
  let aiSeed = 1;
  let t = 0;
  let leaving = false;
  let active = false;
  let gameId = SHOGI_GAME_ID;
  let carry = {};
  let carryLine = null;
  let workshop = null;
  let menu = null;
  let save = { def: null, level: 'normal' };
  let customs = null;
  let plan = shogiCarryPlan(null);
  let washLeft = 0;
  let washMode = false;
  let rewardLine = null;
  let rollT = -1;
  let sillyRng = createRng(1);
  let introPanel = null;

  // ---- 3D の和室 ----
  function makeTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    if (repeat) tex.repeat.set(repeat[0], repeat[1]);
    return tex;
  }

  function drawTatami(g, w, h) {
    const r = createRng(29);
    g.fillStyle = PALETTE.tatami;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.tatamiDark;
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); // 縞
    g.globalAlpha = 0.3;
    for (let i = 0; i < 160; i++) g.fillRect(r.int(w), r.int(h), 1, 2); // 目
    g.globalAlpha = 1;
    g.fillStyle = PALETTE.tatamiEdge;
    g.fillRect(0, 0, 4, h); // 縁
    g.fillRect(w - 4, 0, 4, h);
  }

  function drawShoji(g, w, h) {
    g.fillStyle = PALETTE.shojiPaper;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.shojiWood;
    for (let i = 1; i < 4; i++) g.fillRect(Math.round((w * i) / 4) - 1, 0, 2, h);
    for (let i = 1; i < 6; i++) g.fillRect(0, Math.round((h * i) / 6) - 1, w, 2);
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 6, w, 6);
    g.fillRect(0, 0, 4, h);
    g.fillRect(w - 4, 0, 4, h);
  }

  function buildOnasu() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), mat('nasuBody'));
    body.scale.set(1, 1.45, 0.95);
    body.position.y = 1.05;
    g.add(body);
    const calyx = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.45, 6), mat('nasuCalyx'));
    calyx.position.y = 2.02;
    calyx.rotation.x = Math.PI;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 5), mat('nasuCalyx'));
    stem.position.y = 2.35;
    g.add(calyx, stem);
    // 顔は主人公と同じテクスチャの顔
    attachHeroFace(THREE, mat, g, { y: 1.2, z: 0.68, scale: 2.2 });
    return g;
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.shojiWood);
    world.fog = new THREE.Fog(PALETTE.shojiWood, 14, 32);
    ctx.addLights(world);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshLambertMaterial({ map: makeTex(64, 128, drawTatami, [4.8, 2.4]) }),
    );
    floor.rotation.x = -Math.PI / 2;
    world.add(floor);
    const shojiMat = new THREE.MeshLambertMaterial({ map: makeTex(64, 96, drawShoji, [6, 1]) });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), shojiMat);
    back.position.set(0, 2, -4.5);
    world.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), shojiMat);
      side.position.set(s * 6, 2, 0);
      side.rotation.y = -s * Math.PI / 2;
      world.add(side);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.25), mat('shojiWood'));
    beam.position.set(0, 4, -4.4);
    world.add(beam);
    // 将棋盤（脚つき）
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.6), mat('shogiBoard'));
    board.position.set(0, 0.45, 0);
    world.add(board);
    const legGeo = new THREE.BoxGeometry(0.18, 0.3, 0.18);
    for (const [x, z] of [[-0.55, -0.6], [0.55, -0.6], [-0.55, 0.6], [0.55, 0.6]]) {
      const leg = new THREE.Mesh(legGeo, mat('shogiBoardEdge'));
      leg.position.set(x, 0.15, z);
      world.add(leg);
    }
    // 座布団
    const cushionGeo = new THREE.BoxGeometry(1.1, 0.15, 1.1);
    const c1 = new THREE.Mesh(cushionGeo, mat('scarf'));
    c1.position.set(0, 0.075, 1.8);
    const c2 = new THREE.Mesh(cushionGeo, mat('castPurpleDark'));
    c2.position.set(ONASU_POS.x, 0.075, ONASU_POS.z);
    c1.position.set(-2.6, 0.075, 2.2);
    world.add(c1, c2);
    // おなすくん（盤の右、カメラのほうを向く）
    onasu = buildOnasu();
    onasu.position.set(ONASU_POS.x, ONASU_POS.y, ONASU_POS.z);
    onasu.rotation.y = ONASU_YAW;
    world.add(onasu);
    const nsh = ctx.makeShadow(1.4);
    nsh.position.set(ONASU_POS.x, 0.16, ONASU_POS.z);
    world.add(nsh);
    // 主人公（左手前、おなすくんのほうを向く）
    rig = createHeroRig(THREE, mat);
    rig.root.position.set(-2.6, 0.15, 2.2);
    rig.root.rotation.y = Math.atan2(ONASU_POS.x + 2.6, ONASU_POS.z - 2.2);
    world.add(rig.root);
    anim = createAnimState();
    // 観客の仲間
    const spots = [[-3, -2.8, 'mohicanRed'], [3, -2.8, 'mohicanYellow'], [-3.8, 0.6, 'mohicanGreen'], [3.8, 0.4, 'mohicanPurple']];
    for (const [x, z, key] of spots) {
      const model = buildAlinus(THREE, mat, { scale: 0.85, mohicanColor: key });
      model.root.position.set(x, 0, z);
      model.root.rotation.y = Math.atan2(-x, -z);
      const sh = ctx.makeShadow(1);
      sh.position.set(x, 0.02, z);
      world.add(model.root, sh);
      crowd.push({ model, anim: createAnimState() });
    }
  }

  function placeCamera() {
    const c = SHOGI_CAMERA;
    camera.position.set(c.pos.x, c.pos.y, c.pos.z);
    camera.lookAt(c.look.x, c.look.y, c.look.z);
  }

  // ---- 対局 ----
  function render() {
    if (!ui || !state) return;
    const st = gameStatus(state);
    const shown = washMode
      ? new Set(washTargets(state, 'b').map((p) => sqKey(p.x, p.y)))
      : targets;
    ui.render({
      state,
      selected,
      targets: shown,
      cursor,
      lastMove,
      status: `${shogiStatusText(state, st)}　相手：${levelLabel(save.level)}`,
      thinking: phase === 'play' && state.turn === 'w',
      undosLeft: session ? session.undosLeft : 0,
      canUndo: canUndoNow(),
      washLeft: plan.washUses > 0 ? washLeft : null,
      washMode,
      canWash: canAct() && washLeft > 0,
    });
  }

  function canUndoNow() {
    return active && !leaving && phase === 'play' && !!session && canUndo(session) && !paused();
  }

  /** 待った：主人公の手番まで巻き戻す（1局に3回まで） */
  function onUndo() {
    if (!canUndoNow()) return;
    const r = undoSession(session);
    if (!r.ok) return;
    session = r.session;
    state = session.state;
    washMode = false;
    pending = null;
    if (ui) ui.hidePromote();
    selected = null;
    targets = new Set();
    lastMove = null;
    aiT = 0;
    render();
  }

  /** 水鉄砲：押し流す駒を選ぶ状態を切り替える */
  function onWash() {
    if (!canAct() || washLeft <= 0) return;
    washMode = !washMode;
    selected = null;
    targets = new Set();
    render();
  }

  /** 水鉄砲で相手の駒を盤外へ（持ち駒にならない・手番も変わらない） */
  function doWash(x, y) {
    washMode = false;
    try {
      const next = washAwayPiece(state, 'b', x, y);
      session = Object.freeze({ ...session, state: next });
      state = next;
      washLeft = Math.max(0, washLeft - 1);
      shogiSfx('shogiCapture');
    } catch (err) {
      console.warn('押し流せない:', err);
    }
    const st = gameStatus(state);
    if (st.kind !== 'ongoing') {
      finish(st);
      return;
    }
    render();
  }

  function clearSelection() {
    selected = null;
    targets = new Set();
    render();
  }

  function setSelection(sel) {
    selected = sel;
    targets = new Set(selectionMoves(legalMoves(state), sel).map((m) => sqKey(m.to.x, m.to.y)));
    render();
  }

  function paused() {
    return typeof ctx.isPaused === 'function' && !!ctx.isPaused();
  }

  function canAct() {
    return active && !leaving && phase === 'play' && state && state.turn === 'b'
      && ui && !ui.isPromoteOpen() && !ui.isResultOpen() && !paused();
  }

  function openWorkshop() {
    phase = 'workshop';
    state = null;
    session = null;
    selected = null;
    targets = new Set();
    pending = null;
    if (ui) {
      ui.hideResult();
      ui.unmount();
    }
    if (menu) menu.hide();
    workshop.open(save.def, (def) => {
      save = { ...save, def };
      storeShogiSave(shogiStorage(), save);
      chooseLevel();
    });
    ctx.ui.setHint('マスをクリックで進めるマスを選ぶ　∞: どこまでも進める　12点まで');
  }

  function beginPregame() {
    phase = 'menu';
    state = null;
    if (ui) ui.unmount();
    if (save.def) {
      menu.show(shogiMenuView(save.def), (id) => {
        if (id === 'use') chooseLevel();
        else openWorkshop();
      });
      ctx.ui.setHint('←→ で選ぶ ／ Enter で決定');
    } else {
      openWorkshop();
    }
  }

  /** 強さ選択（選んだ強さは保存する） */
  function chooseLevel() {
    if (workshop) workshop.close();
    if (!save.def) {
      openWorkshop();
      return;
    }
    phase = 'level';
    state = null;
    if (ui) ui.unmount();
    menu.show(shogiLevelView(save.level), (id) => {
      const level = SHOGI_LEVELS.includes(id) ? id : DEFAULT_SHOGI_LEVEL;
      save = { ...save, level };
      storeShogiSave(shogiStorage(), save);
      startGame();
    });
    ctx.ui.setHint('←→ で選ぶ ／ 1・2・3 でも選べる ／ Enter で決定');
  }

  /** 相手の手番：AI に1手選ばせて指す */
  function aiTurn() {
    let m = null;
    try {
      m = chooseMove(state, {
        ...shogiAiOptions(plan, state.plies, carry.hard ? 'hard' : save.level),
        seed: (aiSeed + state.plies) >>> 0,
      });
    } catch (err) {
      console.warn('AI が考えられません:', err);
      const all = legalMoves(state);
      m = all.length ? all[0] : null;
    }
    if (m) play(m);
    else finish(gameStatus(state));
  }

  function startGame() {
    if (workshop) workshop.close();
    if (menu) menu.hide();
    if (!save.def) {
      openWorkshop();
      return;
    }
    customs = [save.def, generateNasuDef(Date.now() >>> 0)];
    plan = shogiCarryPlan(carry, createRng((Date.now() ^ 0x9e3779b9) >>> 0).next);
    state = applyShogiCarry(createInitialState({ customs }), plan);
    // 先手と後手が入れ替わる持ち込み：おなすくんが先に指す
    if (plan.aiFirst) state = { ...state, turn: 'w' };
    session = createSession(state, { undoLimit: plan.undoLimit || DEFAULT_UNDO_LIMIT });
    washLeft = plan.washUses;
    washMode = false;
    rewardLine = null;
    if (ui) ui.mount();
    phase = 'play';
    selected = null;
    targets = new Set();
    lastMove = null;
    pending = null;
    cursor = { x: 4, y: 6 };
    aiT = 0;
    aiSeed = Date.now() >>> 0;
    if (ui) {
      ui.hideResult();
      ui.hidePromote();
    }
    render();
    ctx.ui.setHint(plan.washUses > 0 ? `${PLAY_HINT}　W: 水鉄砲` : PLAY_HINT);
  }

  function shogiSillyLevel() {
    try {
      return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY));
    } catch {
      return 2;
    }
  }

  /** おふざけ（ナスーッ！＋転がる・王手ッ！・モヒフライ）。入力は奪わない */
  function sillyFx(captured, st) {
    if (!ui || !active) return;
    let p;
    try {
      p = shogiSillyPlan(shogiSillyLevel(), { captured, inCheck: !!(st && st.inCheck) }, sillyRng.next);
    } catch {
      return;
    }
    try {
      if (p.nasu) {
        ui.showNasu();
        rollT = 0;
      }
      if (p.oute) ui.showOute();
      if (p.fly) ui.showFly(p.flyTop);
    } catch {
      // 飾りが出なくても対局は続ける
    }
  }

  /** 1手ぶんの効果音（パチッ／パシーン・シャキーン・ドドン・チーン） */
  function playMoveSounds(prev, move, st) {
    try {
      const captured = !!(prev && !move.drop && move.from && pieceAt(prev, move.to.x, move.to.y));
      const list = shogiMoveSounds({
        captured, promote: !!move.promote, kind: st.kind, inCheck: !!st.inCheck,
      });
      for (const s of list) shogiSfx(s.name, s.delay);
    } catch {
      // 音が鳴らなくても対局は続ける
    }
  }

  function play(move) {
    const prev = state;
    const captured = !!(prev && !move.drop && move.from && pieceAt(prev, move.to.x, move.to.y));
    try {
      session = playMove(session, move);
      state = session.state;
    } catch (err) {
      console.warn('指せない手:', err);
      return;
    }
    lastMove = move;
    selected = null;
    targets = new Set();
    aiT = 0;
    const st = gameStatus(state);
    playMoveSounds(prev, move, st);
    if (st.kind !== 'ongoing') {
      finish(st);
      sillyFx(captured, st);
      return;
    }
    render();
    sillyFx(captured, st);
  }

  function finish(st) {
    phase = 'result';
    selected = null;
    targets = new Set();
    if (ui) ui.hidePromote();
    render();
    washMode = false;
    if (st && st.winner === 'b') {
      try {
        const got = ctx.grantGameItem(SHOGI_GAME_ID);
        if (got && got.item && got.isNew) rewardLine = `アイテム獲得：${got.item.name}`;
      } catch (err) {
        console.warn('アイテムを渡せません:', err);
      }
    }
    const v = shogiResultView(st, session ? session.plies : state.plies, [carryLine, rewardLine]);
    ui.showResult(v, (id) => {
      if (id === 'again') startGame();
      else if (id === 'remake') openWorkshop();
      else backToGallery();
    });
    ctx.ui.setHint('←→ で選ぶ ／ Enter で決定');
  }

  function choose(cands) {
    if (cands.length === 1) {
      play(cands[0]);
      return;
    }
    pending = cands;
    ui.showPromote((yes) => {
      const m = pending ? pending.find((c) => c.promote === !!yes) : null;
      pending = null;
      if (m) play(m);
      else render();
    });
  }

  function onSquare(x, y) {
    if (!canAct()) return;
    cursor = { x, y };
    if (washMode) {
      const wp = pieceAt(state, x, y);
      if (wp && wp.side === 'w' && wp.type !== 'K' && washLeft > 0) doWash(x, y);
      else {
        washMode = false;
        render();
      }
      return;
    }
    if (selected) {
      const cands = selectionMoves(legalMoves(state), selected).filter((m) => m.to.x === x && m.to.y === y);
      if (cands.length) {
        choose(cands);
        return;
      }
    }
    const p = pieceAt(state, x, y);
    const same = selected && !selected.hand && selected.x === x && selected.y === y;
    if (p && p.side === 'b' && !same) setSelection({ x, y });
    else clearSelection();
  }

  function onHand(side, type) {
    if (!canAct() || side !== 'b') return;
    washMode = false;
    if (selected && selected.hand === type) clearSelection();
    else setSelection({ hand: type });
  }

  function onResign() {
    if (!active || leaving || phase !== 'play' || paused()) return;
    finish({ kind: 'resign', winner: 'w', inCheck: false });
  }

  function backToGallery() {
    if (leaving) return;
    leaving = true;
    if (!ctx.returnToGallery(gameId)) leaving = false;
  }

  function onKey(e) {
    if (!active || leaving || !ui || paused()) return;
    const code = e.code;
    const stop = () => {
      e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    };
    if (phase === 'intro') {
      if (e.repeat) return;
      if (code === 'Escape') {
        if (introPanel) introPanel.hide();
        stop();
        backToGallery();
        if (!leaving) beginPregame();
      } else if (['Enter', 'NumpadEnter', 'Space'].includes(code)) {
        if (introPanel) introPanel.close();
        if (typeof e.preventDefault === 'function') e.preventDefault();
      }
      return;
    }
    if (phase === 'workshop') {
      // 名前の入力中のキーはゲームに渡さない（文字は入力欄に入る）
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) e.stopPropagation();
      return;
    }
    if (phase === 'menu' || phase === 'level') {
      if (!menu || !menu.isOpen() || e.repeat) return;
      if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(code)) menu.move(-1);
      else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(code)) menu.move(1);
      else if (['Enter', 'NumpadEnter', 'Space'].includes(code)) menu.confirm();
      else if (phase === 'level' && /^(Digit|Numpad)[123]$/.test(code)) menu.choose(Number(code.slice(-1)) - 1);
      else return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (ui.isResultOpen()) {
      if (e.repeat) return;
      if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(code)) ui.moveResult(-1);
      else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(code)) ui.moveResult(1);
      else if (['Enter', 'NumpadEnter', 'Space'].includes(code)) ui.confirmResult();
      else return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (ui.isPromoteOpen()) {
      if (e.repeat) return;
      if (code === 'KeyP' || code === 'Enter' || code === 'NumpadEnter') ui.pickPromote(true);
      else if (code === 'KeyN') ui.pickPromote(false);
      else if (code === 'Escape') {
        ui.hidePromote();
        pending = null;
        render();
        stop();
      }
      return;
    }
    if (phase !== 'play') return;
    const d = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }[code];
    if (d) {
      cursor = { x: Math.max(0, Math.min(8, cursor.x + d[0])), y: Math.max(0, Math.min(8, cursor.y + d[1])) };
      render();
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      onSquare(cursor.x, cursor.y);
      if (typeof e.preventDefault === 'function') e.preventDefault();
    } else if (code === 'KeyW') {
      onWash();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    } else if (code === 'KeyU') {
      onUndo();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    } else if (code === 'Escape' && (selected || washMode)) {
      washMode = false;
      clearSelection();
      stop();
    }
  }

  function animate(d) {
    const thinking = phase === 'play' && state && state.turn === 'w';
    let roll = null;
    if (rollT >= 0) {
      rollT += d;
      const rp = nasuRollPose(rollT);
      if (rp.done) rollT = -1;
      else roll = rp;
    }
    if (roll) {
      // 体の中心（高さ 1.05）を軸に転がす
      const C = 1.05;
      onasu.rotation.z = roll.angle;
      onasu.position.x = ONASU_POS.x + roll.dx + C * Math.sin(roll.angle);
      onasu.position.y = 0.15 + C - C * Math.cos(roll.angle);
    } else {
      onasu.position.x = ONASU_POS.x;
      onasu.position.y = 0.15 + Math.abs(Math.sin(t * 2)) * 0.03;
      onasu.rotation.z = Math.sin(t * 1.3) * 0.05;
    }
    onasu.rotation.y = ONASU_YAW + (thinking ? Math.sin(t * 3) * 0.25 : (onasu.rotation.y - ONASU_YAW) * 0.9);
    crowd.forEach((c, i) => {
      const hop = Math.max(0, Math.sin(t * 4 + i * 1.7)) * 0.25;
      c.model.root.position.y = hop;
      stepAnim(c.anim, {
        moving: false, airborne: hop > 0.05, vy: 0, dt: d,
      });
      c.model.apply(c.anim);
    });
    stepAnim(anim, { moving: false, airborne: false, dt: d });
    rig.apply(anim);
  }

  return {
    enter(params = {}) {
      if (!world) build();
      gameId = typeof params.gameId === 'string' && params.gameId ? params.gameId : SHOGI_GAME_ID;
      carry = params.carry && typeof params.carry === 'object' ? params.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      leaving = false;
      t = 0;
      rollT = -1;
      sillyRng = createRng((Date.now() ^ 0x5bd1e995) >>> 0);
      applyMohawkColor(rig, ctx.mohawkColor());
      ctx.setWorld(world);
      placeCamera();
      ctx.ui.refreshHud();
      if (!ui) ui = createShogiUi({
        onSquare, onHand, onResign, onUndo, onWash,
      });
      if (!workshop) workshop = createWorkshop();
      if (!menu) menu = createChoicePanel();
      active = true;
      window.addEventListener('keydown', onKey, true);
      save = loadShogiSave(shogiStorage());
      // 最初にゲームの紹介（Enter / Space で始める、Esc で館に戻る）
      if (!introPanel) introPanel = createMinigamePanel();
      phase = 'intro';
      state = null;
      introPanel.show(gameIntroView(SHOGI_GAME_ID, { carryLine }), () => {
        if (active && !leaving && phase === 'intro') beginPregame();
      });
      if (phase === 'intro') ctx.ui.setHint('Enter / Space: 始める　Esc: 館に戻る');
    },
    update(dt) {
      if (!world) return;
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.1);
      t += d;
      // 盤をクリックしたときのドラッグはカメラに使わない
      if (input && typeof input.consumeDrag === 'function') input.consumeDrag();
      consumePitchDrag();
      ensureGameMusic('shogi');
      if (phase === 'play' && state && state.turn === 'w' && !leaving && !paused()) {
        aiT += d;
        if (aiT >= AI_DELAY) aiTurn();
      }
      animate(d);
      placeCamera();
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, state: smokeSummary(state), session: smokeSummary(session) };
    },
    exit() {
      active = false;
      phase = 'idle';
      pending = null;
      session = null;
      selected = null;
      targets = new Set();
      aiT = 0;
      rollT = -1;
      if (onasu) {
        onasu.position.x = ONASU_POS.x;
        onasu.rotation.z = 0;
      }
      window.removeEventListener('keydown', onKey, true);
      stopGameMusic('shogi');
      if (introPanel) introPanel.hide();
      if (ui) ui.unmount();
      if (workshop) workshop.close();
      if (menu) menu.hide();
      ctx.ui.setHint('');
    },
    pauseItems() {
      return [{ id: PAUSE_BACK_GALLERY, label: '館に戻る' }];
    },
    onPauseAction(id) {
      if (id === PAUSE_BACK_GALLERY) backToGallery();
    },
    get carry() { return carry; },
    get pausable() { return phase !== 'intro'; },
  };
}
