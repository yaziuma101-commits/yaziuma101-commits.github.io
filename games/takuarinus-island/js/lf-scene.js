// レバガチャファイターヌスの場面（ムキムキヌスの絵から）。真剣な格闘ゲーム。
// 夕暮れの屋上（lf-stage.js）で、主人公（FBX）とムキムキヌス（lf-fighters-3d.js）が向かい合う。
// 横から見るカメラが両者の中点を追う。文字は HTML（lf-ui.js）で重ねる。
// おふざけ度は effectiveSillyLevel を通す（常に 0）。ふざけた出来事・擬音・ふざけた効果音は呼ばない。
// Esc のポーズの「館に戻る」は main.js の readyRooms から自動で出る。
import { makeRng, randomSeed, hashSeed } from './lf-rng.js';
import { effectiveSillyLevel, sillyEventsAllowed } from './lf-serious.js';
import { poseFor, bodyFor, mixPose } from './lf-pose.js';
import { buildLfStage, LF_STAGE_MIN, LF_STAGE_MAX } from './lf-stage.js';
import { createHeroFighter3d, createFoeFighter3d } from './lf-fighters-3d.js';
import { createLfUi } from './lf-ui.js';
import { createMinigamePanel, createResultPanel } from './scenes/touch.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from './silly-rules.js';
import {
  ATTACKS, createFighter, attackIdFor, isGuarding, resolveAttack, stepFighterTimers, attackPhase,
  createProjectile, stepProjectile, resolveProjectileHit, specialOffset, hasSpecialMotion, checksWholeActive,
  impactSounds, impactShake, resolveClash, projectilesCollide,
} from './lf-fighter.js';
import {
  dirFromKeys, createInputBuffer, recordDirection, detectSpecial, hintLevel, clearBuffer, auraOpacity, INPUT_WINDOW,
} from './lf-input.js';
import {
  createMatch, beginFight, tickTimer, judgeRound, roundLabel, finishRound, nextRound, lfResultView,
} from './lf-match.js';
import { generateCommands } from './lf-command.js';
import {
  createDiscovery, markFound, markSeen, movesView, undiscoveredCommands, discoveryNotice, rollMisfire,
} from './lf-discovery.js';
import { specialCallout, opponentCommands } from './lf-callout.js';
import {
  lfCarryEffects, lfInputWindow, lfBoostHint, lfInitialFound, lfKeepCommands,
} from './lf-item-fx.js';
import {
  createAi, stepAi, DEFAULT_AI_LEVEL, AI_LEVELS, normalizeAiLevel, intentToKeys, aiAttackId, aiLevelChoices,
  parseLfSave, serializeLfSave, LF_SAVE_KEY,
} from './lf-ai.js';
import { lfSfx, ensureGameMusic, stopGameMusic } from './audio.js';
import {
  createCutscene, cutsceneControl, cutsceneKindFor, cinemaPoseFor, currentPanel,
} from './lf-cutscene.js';
import { createLfCinema } from './lf-cinema.js';
import { GAME_DRAWINGS } from './drawing-usage.js';
import { buildDrawingFrame } from './drawing-frame.js';
import { PALETTE } from './palette.js';
import { smokeSummary } from './smoke-state.js';
import { HARD_FOE } from './hard-mode.js';

/** 屋上の奥の小さな看板（筋肉モヒカンの絵）。真剣な雰囲気を壊さないよう、隅に控えめに置く */
function addRoofPoster(ctx, world) {
  const THREE = ctx && ctx.THREE;
  const file = GAME_DRAWINGS.lever[0];
  if (!THREE || !world || !file) return null;
  try {
    const sign = new THREE.Group();
    const fr = buildDrawingFrame(THREE, file, {
      maxW: 1.0, maxH: 1.3, frameColor: PALETTE.lfPosterFrame, border: 0.07,
    });
    fr.group.position.y = 2.3;
    sign.add(fr.group);
    const postMat = new THREE.MeshLambertMaterial({ color: PALETTE.lfPosterPost });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), postMat);
      post.position.set(s * 0.42, 0.85, -0.06);
      sign.add(post);
    }
    sign.position.set(-5.4, 0, -3.4);
    sign.rotation.y = 0.25;
    world.add(sign);
    return sign;
  } catch (err) {
    console.warn('看板を置けません:', err);
    return null;
  }
}

export const LF_GAME_ID = 'lever-fighter';
/** この場面の BGM（audio-music.js の LF_TRACKS） */
export const LF_MUSIC = 'lever-fighter';
export const LF_HERO_NAME = 'タクアリヌス';
export const LF_FOE_NAME = 'ムキムキヌス';
export const LF_ROUND_TIME = 60;
/** K.O. のスローモーション（時間倍率と長さ） */
export const LF_SLOW_SCALE = 0.25;
export const LF_KO_SLOW_SEC = 1.6;
/** ボタンの先行入力を受け付ける秒数 */
export const LF_PRESS_BUFFER = 0.15;
export const LF_ENTRANCE_LINES = Object.freeze([
  'お前の拳、見せてもらおう。',
  '構えろ。手加減はしない。',
  '……来い。ここで決着をつける。',
]);
export const LF_MOVE = Object.freeze({
  walk: 3.2, back: 2.6, jumpV: 9, gravity: 24, gap: 0.8, min: LF_STAGE_MIN, max: LF_STAGE_MAX,
});
const FIGHT_HINT = 'A/D・←→: 移動（離れる方向でガード）　W・↑: ジャンプ　S・↓: しゃがみ　J: パンチ　K: キック　Esc: ポーズ';
const KEYMAP = Object.freeze({
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
});
const GAME_CODES = new Set([...Object.values(KEYMAP).flat(), 'KeyJ', 'KeyK']);
const NO_KEYS = Object.freeze({
  left: false, right: false, up: false, down: false,
});

/** 紹介の画面の中身（真剣な文面。コマンドのヒントは書かない） */
export function lfHowto(carryLine = null) {
  return {
    title: 'レバガチャファイターヌス',
    sub: '夕暮れの屋上。ムキムキヌスとの一騎打ち',
    lines: [
      '必殺技は3つ。コマンドは試合ごとに変わり、最初は誰にも分からない。',
      'レバーとボタンを動かし続け、自分の拳で技を探し当てろ。',
    ],
    rows: [
      ['A / D・← →', '移動（相手から離れる方向でガード）'],
      ['W / ↑', 'ジャンプ'],
      ['S / ↓', 'しゃがみ'],
      ['J', 'パンチ'],
      ['K', 'キック'],
      ['Esc', 'ポーズ（館に戻る）'],
    ],
    win: `勝ち方：3本勝負。2ラウンドを先に取った方の勝ち（1ラウンド${LF_ROUND_TIME}秒）。`,
    carry: typeof carryLine === 'string' && carryLine ? carryLine : '持ち込み：なし',
    note: 'Enter / Space で始める　Esc で館に戻る',
  };
}

export function createFighterBody(x, facing, id = 'p', maxHp = 100) {
  return {
    ...createFighter({
      id, x, facing, maxHp,
    }),
    vx: 0, vy: 0, crouch: false, move: 0, state: 'idle', airAttack: false, slide: 0, downT: 0,
  };
}

/** 1人ぶんの移動（keys: {left,right,up,down}）。foeX は相手の位置 */
export function stepFighterBody(b, k, dt, foeX) {
  const grounded = b.y <= 0 && b.vy <= 0;
  const backHeld = b.facing >= 0 ? !!k.left : !!k.right;
  const fwdHeld = b.facing >= 0 ? !!k.right : !!k.left;
  if (grounded) {
    b.crouch = !!k.down && !k.up;
    const mx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    b.move = b.crouch ? 0 : mx;
    const fwd = b.move !== 0 && b.move === b.facing;
    b.vx = b.move === 0 ? 0 : b.move * (fwd ? LF_MOVE.walk : LF_MOVE.back);
    if (k.up && !b.crouch) b.vy = LF_MOVE.jumpV;
  }
  b.x += b.vx * dt;
  if (b.vy > 0 || b.y > 0) {
    b.vy -= LF_MOVE.gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= 0) {
      b.y = 0;
      b.vy = 0;
    }
  }
  const onGround = b.y <= 0 && b.vy <= 0;
  b.guarding = onGround && backHeld && !fwdHeld;
  const dist = Math.abs(foeX - b.x);
  if (!onGround) b.state = 'jump';
  else if (b.crouch) b.state = 'crouch';
  else if (b.guarding && dist < 3) b.state = 'guard';
  else if (b.move !== 0) b.state = 'walk';
  else b.state = 'idle';
  return b;
}

/** 体が重ならないように押し分け、舞台の端に収める（倒れている体は押さない） */
export function separateBodies(a, b) {
  const G = LF_MOVE.gap;
  const low = () => a.y < 1 && b.y < 1 && !a.down && !b.down;
  const clamp = (f) => {
    f.x = Math.max(LF_MOVE.min, Math.min(LF_MOVE.max, f.x));
  };
  if (low()) {
    const dx = b.x - a.x;
    if (Math.abs(dx) < G) {
      const s = dx !== 0 ? Math.sign(dx) : (a.facing || 1);
      const push = (G - Math.abs(dx)) / 2;
      a.x -= s * push;
      b.x += s * push;
    }
  }
  clamp(a);
  clamp(b);
  if (low()) {
    const dx = b.x - a.x;
    if (Math.abs(dx) < G - 1e-6) {
      const s = dx !== 0 ? Math.sign(dx) : (a.facing || 1);
      const aAtWall = a.x <= LF_MOVE.min + 1e-6 || a.x >= LF_MOVE.max - 1e-6;
      if (aAtWall) b.x = a.x + s * G;
      else a.x = b.x - s * G;
      clamp(a);
      clamp(b);
    }
  }
}

/** 接地中で行動していないときだけ相手のほうへ向く */
export function faceEachOther(a, b) {
  const free = (f) => f.y <= 0 && !f.action && !f.down && !(f.stun > 0);
  if (free(a)) a.facing = Math.sign(b.x - a.x) || a.facing;
  if (free(b)) b.facing = Math.sign(a.x - b.x) || b.facing;
}

/** 重力と横の速度。着地したら true */
function fall(b, d) {
  let landed = false;
  if (b.vy > 0 || b.y > 0) {
    b.vy -= LF_MOVE.gravity * d;
    b.y += b.vy * d;
    if (b.y <= 0) {
      b.y = 0;
      b.vy = 0;
      landed = true;
    }
  }
  b.x += b.vx * d;
  if (landed && (b.down || b.stun > 0 || b.action)) b.vx = 0;
  return landed;
}

/** 押し出しをなめらかに進める。壁に当たった分は相手を押し返す */
function slideBody(b, other, d) {
  if (!b.slide) return;
  const step = Math.abs(b.slide) < 1e-3 ? b.slide : b.slide * Math.min(1, d * 16);
  b.slide -= step;
  b.x += step;
  const over = b.x > LF_MOVE.max ? b.x - LF_MOVE.max : b.x < LF_MOVE.min ? b.x - LF_MOVE.min : 0;
  if (over) {
    b.x -= over;
    if (other) other.x -= over;
  }
}

function startAction(b, id) {
  const a = ATTACKS[id];
  b.action = { id, t: 0, hitDone: false };
  b.guarding = false;
  b.crouching = id === 'crouchPunch' || id === 'crouchKick';
  b.crouch = b.crouching;
  if (a.air) b.airAttack = true;
  else b.vx = 0;
  b.state = id;
}

function storedSillyLevel() {
  try {
    return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY));
  } catch {
    return 0;
  }
}

const easeOut = (k) => 1 - (1 - k) * (1 - k);

function lfStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function loadLevel() {
  try {
    const s = lfStorage();
    return parseLfSave(s ? s.getItem(LF_SAVE_KEY) : null).level;
  } catch {
    return DEFAULT_AI_LEVEL;
  }
}

function storeLevel(level) {
  try {
    const s = lfStorage();
    if (s) s.setItem(LF_SAVE_KEY, serializeLfSave({ level }));
  } catch {
    // 保存できなくても遊べる
  }
}

export function createLeverFighterScene(ctx) {
  const { camera } = ctx;
  let stage = null;
  let hero3d = null;
  let foe3d = null;
  let ui = null;
  let panel = null;
  let phase = 'idle'; // idle | intro | entrance | fight | ko | roundEnd
  let t = 0;
  let animT = 0;
  let simClock = 0;
  let phaseT = 0;
  let guard = 0;
  let leaving = false;
  let gameId = LF_GAME_ID;
  let carry = {};
  let carryLine = null;
  let silly = 0;
  let seed = 1;
  let rng = makeRng(1);
  let entranceLine = LF_ENTRANCE_LINES[0];
  let roundShown = false;
  let hero = createFighterBody(-2, 1, 'p');
  let foe = createFighterBody(2, -1, 'e');
  let match = createMatch({ roundTime: LF_ROUND_TIME });
  let resultPanel = null;
  let level = DEFAULT_AI_LEVEL;
  // 持ち込みアイテムの効果（lf-item-fx.js）と暴発の乱数・獲得の一行
  let fx = lfCarryEffects(null);
  let misfireRng = makeRng(2);
  let rewardLine = null;
  // 試合ごとに作り直す（コマンド探しは次の段階で使う）
  let commands = null;
  let foeCommands = null;
  let discovery = null;
  let ai = null;
  const inputBuf = createInputBuffer();
  let projectiles = [];
  // 同じ瞬間の打撃（相打ちを必殺技優先で決めるため、2人を動かしてからまとめて判定する）
  let strikes = [];
  let projKit = null;
  let hitstop = 0;
  let slow = 0;
  const shake = { t: 0, dur: 0.2, amp: 0 };
  let pending = null;
  let judgement = null;
  const cam = { x: 0, z: 8 };
  const held = new Set();
  let listening = false;
  // 試合の前後の会話の演出（lf-cutscene.js の進行と lf-cinema.js の表示）
  let cinema = null;
  let cine = null;
  let cineNext = null;
  let cineBodies = null;

  const onDown = (e) => {
    if (!GAME_CODES.has(e.code)) return;
    held.add(e.code);
    if (phase !== 'intro' && phase !== 'idle' && e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat && phase === 'fight' && (e.code === 'KeyJ' || e.code === 'KeyK')) {
      pending = { button: e.code === 'KeyJ' ? 'J' : 'K', at: simClock };
    }
  };
  const onUp = (e) => held.delete(e.code);
  const onBlur = () => held.clear();
  function listen(on) {
    if (typeof window === 'undefined' || on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
      window.addEventListener('blur', onBlur);
    } else {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    }
  }
  const isHeld = (codes) => codes.some((c) => held.has(c));
  const keys = () => ({
    left: isHeld(KEYMAP.left), right: isHeld(KEYMAP.right), up: isHeld(KEYMAP.up), down: isHeld(KEYMAP.down),
  });
  const pressed = (...codes) => !!ctx.input && typeof ctx.input.wasPressed === 'function' && !!ctx.input.wasPressed(...codes);

  function build() {
    stage = buildLfStage(ctx);
    addRoofPoster(ctx, stage.world);
    hero3d = createHeroFighter3d(ctx);
    foe3d = createFoeFighter3d(ctx);
    hero3d.addTo(stage.world);
    foe3d.addTo(stage.world);
    ui = createLfUi();
    projKit = buildProjectileKit();
  }

  function backToGallery() {
    if (leaving) return;
    leaving = true;
    let ok = false;
    try {
      ok = !!ctx.returnToGallery(gameId);
    } catch {
      ok = false;
    }
    if (!ok) leaving = false;
  }

  function shakeCam(amp, dur) {
    if (amp >= shake.amp * (shake.t / Math.max(1e-6, shake.dur))) {
      shake.amp = amp;
      shake.dur = dur;
      shake.t = dur;
    }
  }

  function loser() {
    if (!judgement) return null;
    if (judgement.winner === 'enemy') return hero;
    return foe;
  }

  function placeCamera(d, snap = false) {
    const focus = (phase === 'ko' || phase === 'roundEnd') && judgement && judgement.reason === 'ko' ? loser() : null;
    let tx;
    let tz;
    if (focus) {
      tx = Math.max(-4.5, Math.min(4.5, focus.x));
      tz = 5.0;
    } else {
      const mid = (hero.x + foe.x) / 2;
      const dist = Math.abs(hero.x - foe.x);
      tx = Math.max(-3.5, Math.min(3.5, mid));
      tz = Math.max(6, Math.min(9.2, 5.6 + dist * 0.55));
    }
    const k = snap ? 1 : 1 - Math.exp(-d * (focus ? 2.5 : 5));
    cam.x += (tx - cam.x) * k;
    cam.z += (tz - cam.z) * k;
    let sx = 0;
    let sy = 0;
    if (shake.t > 0) {
      shake.t = Math.max(0, shake.t - d);
      const a = shake.amp * (shake.t / Math.max(1e-6, shake.dur));
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    camera.position.set(cam.x + sx, 1.65 + (cam.z - 6) * 0.12 + sy, cam.z);
    camera.lookAt(cam.x + sx * 0.5, 1.15 + (focus ? -0.35 : 0) + sy * 0.5, 0);
  }

  // ---- 打撃 ----
  /** このフレームの打撃をまとめて判定する。相打ちは必殺技が勝つ（resolveClash） */
  function flushStrikes() {
    if (!strikes.length) return;
    const list = strikes;
    strikes = [];
    const res = list.map((s) => ({ s, r: resolveAttack(s.att, s.def, s.act.id) }));
    let apply = res.map((x) => x.r.outcome !== 'miss');
    if (res.length === 2) {
      const c = resolveClash(
        { id: res[0].s.act.id, outcome: res[0].r.outcome },
        { id: res[1].s.act.id, outcome: res[1].r.outcome },
      );
      apply = [c.a, c.b];
    }
    res.forEach(({ s, r }, i) => {
      if (apply[i]) {
        applyImpact(s.att.facing >= 0 ? 1 : -1, s.def, r, s.act.id);
        s.act.hitDone = true;
      } else if (r.outcome !== 'miss' || !checksWholeActive(s.act.id)) {
        s.act.hitDone = true;
      }
    });
  }

  /** 当たり・ガードの結果を体に反映し、音・ヒットストップ・画面揺れを出す */
  function applyImpact(sign, def, r, id) {
    const nd = r.defender;
    const oldX = def.x;
    Object.assign(def, {
      hp: nd.hp, stun: nd.stun, stunKind: nd.stunKind, down: nd.down, ko: nd.ko, action: nd.action, guarding: nd.guarding,
    });
    def.slide = (def.slide || 0) + (nd.x - oldX);
    if (r.outcome === 'hit' && def.y <= 0) def.vx = 0;
    if (def.ko) {
      def.vy = 5.5;
      def.vx = sign * 2.2;
      def.downT = 0;
      def.slide = 0;
    }
    for (const [snd, delay] of impactSounds(id, r.outcome)) lfSfx(snd, delay);
    hitstop = Math.max(hitstop, r.hitstop);
    const sh = impactShake(id, r.outcome, !!def.ko);
    shakeCam(sh.amp, sh.dur);
    return r;
  }

  function advanceAction(b, other, d) {
    const act = b.action;
    const a = ATTACKS[act.id];
    const prevT = act.t;
    act.t += d;
    let landed = false;
    if (hasSpecialMotion(act.id)) {
      // 昇天拳は上昇して落ち、旋風脚は回転しながら前進する（重力ではなく技の軌道で動かす）
      const o0 = specialOffset(act.id, prevT);
      const o1 = specialOffset(act.id, act.t);
      b.x += b.facing * (o1.dx - o0.dx);
      b.vx = 0;
      if (o1.y != null) {
        b.y = Math.max(0, o1.y);
        b.vy = 0;
      }
    } else {
      if (!a.air && b.y <= 0) b.vx = 0;
      landed = fall(b, d);
    }
    const ph = attackPhase(act.id, act.t);
    if (a.projectile) {
      if (!act.hitDone && act.t >= a.startup) {
        act.hitDone = true;
        if (phase === 'fight') {
          spawnProjectile(b);
          lfSfx('lfSpecial');
        }
      }
    } else if (ph === 'active' && !act.hitDone) {
      if (a.special && !act.sfxDone) {
        act.sfxDone = true;
        lfSfx('lfSpecial');
      }
      if (phase === 'fight') {
        strikes.push({ att: b, def: other, act });
      } else {
        act.hitDone = true;
      }
    }
    if ((a.air && landed) || ph === 'done') {
      b.action = null;
      b.crouching = b.crouch;
      if (a.air) {
        b.vx = 0;
        b.airAttack = false;
      }
    }
    b.state = b.action ? act.id : (b.y > 0 ? 'jump' : b.crouch ? 'crouch' : 'idle');
  }

  // ---- 飛び道具（モヒカン波動） ----
  function buildProjectileKit() {
    const { THREE } = ctx;
    const glow = (n, o) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(n), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return {
      core: new THREE.SphereGeometry(0.15, 12, 8),
      halo: new THREE.SphereGeometry(0.3, 12, 8),
      ring: new THREE.TorusGeometry(0.33, 0.035, 6, 20),
      coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lfcWhite) }),
      mats: { p: [glow(PALETTE.lfcDeepskyblue, 0.6), glow(PALETTE.lfcCyan, 0.8)], e: [glow(PALETTE.lfcOrangered, 0.6), glow(PALETTE.lfcGold, 0.8)] },
    };
  }

  function makeProjectileMesh(owner) {
    const { THREE } = ctx;
    const K = projKit;
    const [haloMat, ringMat] = K.mats[owner === 'p' ? 'p' : 'e'];
    const g = new THREE.Group();
    const core = new THREE.Mesh(K.core, K.coreMat);
    const halo = new THREE.Mesh(K.halo, haloMat);
    halo.scale.set(1.6, 1, 1);
    const ring = new THREE.Mesh(K.ring, ringMat);
    ring.rotation.y = Math.PI / 2;
    g.add(core, halo, ring);
    return { g, halo, ring };
  }

  function hasProjectile(id) {
    return projectiles.some((e) => !e.dead && e.p.ownerId === id);
  }

  function spawnProjectile(b) {
    if (!stage || !projKit) return;
    const p = createProjectile({ ownerId: b.id, x: b.x + b.facing * 0.75, facing: b.facing });
    const m = makeProjectileMesh(b.id);
    m.g.position.set(p.x, p.y + 0.05, 0);
    stage.world.add(m.g);
    projectiles.push({
      p, m, age: 0, dead: false,
    });
  }

  function clearProjectiles() {
    if (stage) for (const e of projectiles) stage.world.remove(e.m.g);
    projectiles = [];
  }

  function stepProjectiles(d) {
    if (!projectiles.length) return;
    for (const e of projectiles) {
      e.p = stepProjectile(e.p, d);
      e.age += d;
    }
    for (let i = 0; i < projectiles.length; i++) {
      for (let j = i + 1; j < projectiles.length; j++) {
        const a = projectiles[i];
        const b = projectiles[j];
        if (a.dead || b.dead) continue;
        if (projectilesCollide(a.p, b.p)) {
          a.dead = true;
          b.dead = true;
          lfSfx('lfGuard');
          shakeCam(0.04, 0.15);
        }
      }
    }
    for (const e of projectiles) {
      if (e.dead) continue;
      if (e.p.x < LF_MOVE.min - 3 || e.p.x > LF_MOVE.max + 3) {
        e.dead = true;
        continue;
      }
      if (phase !== 'fight') continue;
      const def = e.p.ownerId === hero.id ? foe : hero;
      const r = resolveProjectileHit(e.p, def);
      if (r.outcome === 'cancel') {
        // 必殺技どうし：攻撃中の必殺技が飛び道具を打ち消す（普通の技では消えない）
        e.dead = true;
        hitstop = Math.max(hitstop, r.hitstop);
        lfSfx('lfGuard');
        shakeCam(0.05, 0.15);
      } else if (r.outcome !== 'miss') {
        applyImpact(e.p.facing >= 0 ? 1 : -1, def, r, 'wave');
        e.dead = true;
      }
    }
    const alive = [];
    for (const e of projectiles) {
      if (e.dead) stage.world.remove(e.m.g);
      else alive.push(e);
    }
    projectiles = alive;
  }

  function syncProjectiles(d) {
    for (const e of projectiles) {
      e.m.g.position.x = e.p.x;
      e.m.ring.rotation.x += d * 14;
      const pulse = 1 + 0.12 * Math.sin(e.age * 30);
      e.m.halo.scale.set(1.6 * pulse, pulse, pulse);
    }
  }

  // ---- 必殺技とコマンド探し ----
  function refreshMoves(fresh = null) {
    if (ui) ui.setMoves(movesView(commands, discovery), fresh);
  }

  function startSpecial(b, id) {
    startAction(b, id);
    lfSfx('lfCharge');
  }

  /** 必殺技の名前とコマンドを頭上に出す。矢印は主人公の今の向き（相手の技も主人公がそのまま入力できる向き） */
  function announce(who, sk, first) {
    const v = specialCallout(sk, who === 'p' ? commands : foeCommands, hero.facing, {
      who: who === 'p' ? 'hero' : 'foe', first,
    });
    if (v && ui) ui.callout(who, v.name, v.command, v.sec, { first: v.first });
  }

  /** 頭上の表示を、それぞれの体の上に合わせる */
  function placeCallouts() {
    if (!ui || !ctx.THREE) return;
    if (!ui.calloutVisible('p') && !ui.calloutVisible('e')) return;
    camera.updateMatrixWorld();
    const v = new ctx.THREE.Vector3();
    for (const [who, b, h] of [['p', hero, hero3d.height], ['e', foe, foe3d.height]]) {
      if (!ui.calloutVisible(who)) continue;
      v.set(b.x, b.y + h + 0.3, 0).project(camera);
      ui.placeCallout(who, (v.x * 0.5 + 0.5) * 100, (1 - (v.y * 0.5 + 0.5)) * 100);
    }
  }

  /** ボタンを押したとき、直近の方向の並びがコマンドに合えば必殺技を出す。出したら true */
  function trySpecial(button) {
    if (!commands) return false;
    const sk = detectSpecial(inputBuf, commands, button, simClock, lfInputWindow(fx));
    if (!sk || (sk === 'wave' && hasProjectile(hero.id))) return false;
    clearBuffer(inputBuf);
    startSpecial(hero, sk);
    const first = !!discovery && markFound(discovery, sk);
    if (first) {
      ui.notice(discoveryNotice(sk), 2.4);
      lfSfx('lfDiscover', 0.05);
      refreshMoves(sk);
    }
    announce('p', sk, first);
    return true;
  }

  /** 揚げモヒカン：技が出なかったとき、たまに暴発する（見つけたには入れない） */
  function tryMisfire() {
    if (!(fx.misfireRate > 0)) return false;
    const sk = rollMisfire(misfireRng, fx.misfireRate);
    if (!sk || (sk === 'wave' && hasProjectile(hero.id))) return false;
    clearBuffer(inputBuf);
    startSpecial(hero, sk);
    // 暴発は「見つけた」に入れない（見ただけの扱い）
    const seen = !!discovery && markSeen(discovery, sk);
    if (seen) refreshMoves(sk);
    announce('p', sk, seen);
    return true;
  }

  function stepHero(d, control) {
    const k = control ? keys() : NO_KEYS;
    const dir = dirFromKeys(k, hero.facing);
    if (control) recordDirection(inputBuf, dir, simClock);
    Object.assign(hero, stepFighterTimers(hero, d));
    slideBody(hero, foe, d);
    if (hero.down) {
      fall(hero, d);
      hero.downT += d;
      hero.guarding = false;
      hero.state = 'down';
      return;
    }
    if (hero.action) {
      advanceAction(hero, foe, d);
      return;
    }
    if (hero.stun > 0) {
      if (hero.y <= 0) hero.vx = 0;
      fall(hero, d);
      hero.guarding = hero.stunKind === 'block' && isGuarding(hero, dir);
      hero.state = hero.stunKind === 'hit' ? 'hit' : 'guard';
      return;
    }
    if (pending && simClock - pending.at > LF_PRESS_BUFFER) pending = null;
    if (control && pending) {
      const airborne = hero.y > 0;
      if (!airborne && trySpecial(pending.button)) {
        pending = null;
        return;
      }
      if (!airborne && tryMisfire()) {
        pending = null;
        return;
      }
      if (!airborne || !hero.airAttack) {
        startAction(hero, attackIdFor({ button: pending.button, crouching: !airborne && (hero.crouch || !!k.down), airborne }));
        pending = null;
        return;
      }
    }
    stepFighterBody(hero, k, d, foe.x);
    hero.crouching = hero.crouch;
    hero.guarding = isGuarding(hero, dir);
    if (hero.y <= 0) hero.airAttack = false;
  }

  /** ムキムキヌス：AI の意図をキー状態に直し、主人公と同じ規則で動かす */
  function stepFoe(d, control) {
    let k = NO_KEYS;
    let attackId = null;
    let special = null;
    if (control && ai) {
      const intent = stepAi(ai, {
        dist: Math.abs(hero.x - foe.x),
        foeAttacking: !!hero.action,
        foeAirborne: hero.y > 0,
      }, d);
      const ha = hero.action ? ATTACKS[hero.action.id] : null;
      k = intentToKeys(intent, foe.facing, { lowGuard: !!ha && ha.height === 'low' });
      attackId = aiAttackId(intent, foe.y > 0);
      special = intent.special || null;
    }
    const dir = dirFromKeys(k, foe.facing);
    Object.assign(foe, stepFighterTimers(foe, d));
    slideBody(foe, hero, d);
    if (foe.down) {
      fall(foe, d);
      foe.downT += d;
      foe.guarding = false;
      foe.state = 'down';
      return;
    }
    if (foe.action) {
      advanceAction(foe, hero, d);
      return;
    }
    if (foe.stun > 0) {
      if (foe.y <= 0) foe.vx = 0;
      fall(foe, d);
      foe.guarding = foe.stunKind === 'block' && isGuarding(foe, dir);
      foe.state = foe.stunKind === 'hit' ? 'hit' : 'guard';
      return;
    }
    if (special && foe.y <= 0 && ATTACKS[special] && !(special === 'wave' && hasProjectile(foe.id))) {
      startSpecial(foe, special);
      const seen = !!discovery && markSeen(discovery, special);
      if (seen) refreshMoves(special);
      announce('e', special, seen);
      return;
    }
    if (attackId && (foe.y <= 0 || !foe.airAttack)) {
      startAction(foe, attackId);
      return;
    }
    stepFighterBody(foe, k, d, hero.x);
    foe.crouching = foe.crouch;
    foe.guarding = isGuarding(foe, dir);
    if (foe.y <= 0) foe.airAttack = false;
  }

  function simulate(d, control) {
    simClock += d;
    stepHero(d, control);
    stepFoe(d, control);
    flushStrikes();
    separateBodies(hero, foe);
    stepProjectiles(d);
    faceEachOther(hero, foe);
  }

  // ---- 見た目 ----
  function actionPose(b, tt, who) {
    const act = b.action;
    const a = ATTACKS[act.id];
    const baseState = a.air ? 'jump' : (act.id === 'crouchPunch' || act.id === 'crouchKick' ? 'crouch' : 'idle');
    const base = poseFor(baseState, tt, who);
    // 必殺技の溜め（発生まで）は charge の構え
    if (a.special && act.t < a.startup) {
      return mixPose(base, poseFor('charge', tt, who), Math.min(1, act.t / 0.07));
    }
    const tgt = poseFor(act.id, tt, who);
    let k = 1;
    if (act.t < a.startup) k = act.t / Math.max(1e-6, a.startup);
    else if (a.recovery != null) {
      const r0 = a.startup + (a.active || 0);
      if (act.t > r0) k = Math.max(0, 1 - (act.t - r0) / Math.max(1e-6, a.recovery));
    }
    return mixPose(base, tgt, Math.min(1, k * 1.15));
  }

  function visualOf(b, who, offset) {
    const tt = animT + offset;
    const act = b.action ? ATTACKS[b.action.id] : null;
    const st = act ? (act.special && b.action.t < act.startup ? 'charge' : b.action.id) : b.state;
    const table = b.action ? actionPose(b, tt, who) : poseFor(st, tt, who);
    let fx = bodyFor(st, tt);
    if (st === 'down') {
      const k = easeOut(Math.min(1, (b.downT || 0) / 0.55));
      fx = { ...fx, tilt: fx.tilt * k, dy: fx.dy * k };
    }
    return { st, table, fx };
  }

  function syncVisuals(d) {
    const h = visualOf(hero, 'hero', 0);
    const f = visualOf(foe, 'foe', 0.7);
    hero3d.sync(hero, h.st, h.table, h.fx, d);
    foe3d.sync(foe, f.st, f.table, f.fx, d);
    syncProjectiles(d);
  }

  // ---- ラウンドの流れ ----
  function resetBodies() {
    hero = createFighterBody(-2, 1, 'p', 100 + fx.extraHp);
    foe = createFighterBody(2, -1, 'e', (carry.hard ? HARD_FOE.lfHp : 100) - fx.foeHpMinus);
    hero3d.snapYaw(1);
    foe3d.snapYaw(-1);
    hitstop = 0;
    slow = 0;
    shake.t = 0;
    pending = null;
    strikes = [];
    judgement = null;
    clearBuffer(inputBuf);
    clearProjectiles();
    if (ui) ui.hideCallouts();
  }

  function resetRoundHud() {
    ui.setHp(1, 1, { instant: true });
    ui.setTimer(match.timeLeft);
    ui.setWins(match.wins.player, match.wins.enemy, match.target);
  }

  /** 新しい試合（種・AI・3本勝負を作り直す） */
  function newMatch() {
    seed = randomSeed();
    rng = makeRng(seed);
    misfireRng = makeRng(hashSeed(seed, 'lf-misfire'));
    const keep = commands ? lfKeepCommands(fx, commands, discovery) : null;
    commands = generateCommands(seed, commands ? { previous: commands, keep } : {});
    foeCommands = opponentCommands(commands);
    discovery = createDiscovery(lfInitialFound(
      fx, keep ? Object.keys(keep) : [], makeRng(hashSeed(seed, 'lf-reveal')),
    ));
    ai = createAi({ seed, level: carry.hard ? 3 : level });
    match = createMatch({ roundTime: LF_ROUND_TIME + fx.extraTime });
    resetBodies();
    resetRoundHud();
    refreshMoves();
  }

  /** 試合前の強さの3択 */
  function startLevelSelect() {
    if (phase !== 'intro' && phase !== 'result') return;
    if (phase === 'result') {
      resetBodies();
      ui.setHp(1, 1, { instant: true });
    }
    phase = 'level';
    phaseT = 0;
    guard = 0.25;
    ui.hideBanner();
    ui.hideSay();
    const v = aiLevelChoices(level);
    resultPanel.show(v, (id) => chooseLevel(id));
    resultPanel.move(v.index);
    ctx.ui.setHint('←→: 強さを選ぶ　1・2・3 でも選べる　Enter: 決定');
  }

  function chooseLevel(id) {
    if (phase !== 'level') return;
    level = normalizeAiLevel(id);
    storeLevel(level);
    newMatch();
    startCinema('pre', () => startEntrance(true));
  }

  function startEntrance(quiet = false) {
    phase = 'entrance';
    phaseT = quiet ? 1.9 : 0;
    roundShown = false;
    entranceLine = LF_ENTRANCE_LINES[Math.floor(rng() * LF_ENTRANCE_LINES.length) % LF_ENTRANCE_LINES.length];
    if (!quiet) ui.say(LF_FOE_NAME, entranceLine, 2.3);
    ctx.ui.setHint('');
  }

  /** 会話の演出を始める。終わったら（飛ばしても） then を呼ぶ */
  function startCinema(kind, then) {
    cine = createCutscene(kind);
    cineNext = then;
    phase = 'cinema';
    phaseT = 0;
    guard = 0.35;
    pending = null;
    held.clear();
    hitstop = 0;
    slow = 0;
    ui.hideBanner();
    ui.hideSay();
    ui.hideCallouts();
    ui.hideNotice();
    ui.setSlow(false);
    clearProjectiles();
    cineBodies = {
      hero: {
        x: -2, y: 0, vy: 0, facing: 1,
      },
      foe: {
        x: 2, y: 0, vy: 0, facing: -1,
      },
    };
    hero3d.snapYaw(1);
    foe3d.snapYaw(-1);
    if (!cinema) cinema = createLfCinema(ctx);
    cinema.show(cine, stage.world);
    ctx.ui.setHint('');
  }

  function endCinema() {
    const next = cineNext;
    cine = null;
    cineNext = null;
    if (cinema) cinema.hide();
    if (typeof next === 'function') next();
  }

  /** 演出中の2人の姿勢と、コマの絵 */
  function syncCinema(d) {
    const p = currentPanel(cine);
    const pose = (p && p.pose) || {};
    const h = cinemaPoseFor(pose.hero, animT, 'hero');
    const f = cinemaPoseFor(pose.foe, animT + 0.7, 'foe');
    hero3d.sync(cineBodies.hero, h.state, h.table, h.body, d);
    foe3d.sync(cineBodies.foe, f.state, f.table, f.body, d);
    if (cinema) {
      cinema.update(cine, stage.world, {
        hero: { x: cineBodies.hero.x, h: hero3d.height },
        foe: { x: cineBodies.foe.x, h: foe3d.height },
      }, d);
    }
  }

  function endRound(j) {
    judgement = j;
    phase = 'ko';
    phaseT = 0;
    pending = null;
    ctx.ui.setHint('');
    if (j.reason === 'ko') {
      slow = LF_KO_SLOW_SEC;
      lfSfx('lfKo');
      ui.banner(j.winner === 'draw' ? 'ダブルK.O.' : 'K.O.', 2.4, 'red');
    } else {
      ui.banner('時間切れ', 1.6);
    }
  }

  function showRoundResult() {
    phase = 'roundEnd';
    phaseT = 0;
    if (judgement) match = finishRound(match, judgement);
    ui.setWins(match.wins.player, match.wins.enemy, match.target);
    const w = judgement && judgement.winner;
    const text = w === 'player' ? `${LF_HERO_NAME}の勝ち` : w === 'enemy' ? `${LF_FOE_NAME}の勝ち` : '引き分け';
    ui.banner(text, 2.2, w === 'player' ? 'gold' : '');
  }

  /** ラウンドが終わったあと：試合終了なら結果、そうでなければ次のラウンド */
  function afterRound() {
    if (match.phase === 'matchEnd') {
      startCinema(cutsceneKindFor(match.winner), () => showResult());
      return;
    }
    match = nextRound(match);
    resetBodies();
    resetRoundHud();
    phase = 'entrance';
    phaseT = 2.0;
    roundShown = false;
  }

  function showResult() {
    phase = 'result';
    phaseT = 0;
    guard = 0.4;
    ui.hideBanner();
    ui.setSlow(false);
    rewardLine = null;
    if (match.winner === 'player') {
      try {
        const got = ctx.grantGameItem(LF_GAME_ID);
        if (got && got.item && got.isNew) {
          rewardLine = `アイテム獲得：${got.item.name}`;
          if (ctx.ui && typeof ctx.ui.banner === 'function') ctx.ui.banner(rewardLine, 3);
          lfSfx('lfDiscover');
        }
      } catch {
        rewardLine = null;
      }
    }
    const v = lfResultView(match, {
      heroName: LF_HERO_NAME,
      foeName: LF_FOE_NAME,
      extra: [`相手の強さ：${(AI_LEVELS[level] || AI_LEVELS[DEFAULT_AI_LEVEL]).name}`, carryLine, rewardLine],
    });
    resultPanel.show(v, (id) => {
      if (id === 'again') startLevelSelect();
      else backToGallery();
    });
    ctx.ui.setHint('←→: 選ぶ　Enter: 決定');
  }

  function stepCombat(d) {
    if (hitstop > 0) {
      hitstop = Math.max(0, hitstop - d);
    } else {
      const scale = slow > 0 ? LF_SLOW_SCALE : 1;
      if (slow > 0) slow = Math.max(0, slow - d);
      const sd = d * scale;
      animT += sd;
      simulate(sd, phase === 'fight');
      if (phase === 'fight') {
        match = tickTimer(match, sd);
        const j = judgeRound({ playerHp: hero.hp, enemyHp: foe.hp, timeLeft: match.timeLeft });
        if (j) endRound(j);
      }
    }
    if (phase === 'ko' && hitstop <= 0 && slow <= 0 && phaseT >= 1.8) showRoundResult();
    else if (phase === 'roundEnd' && phaseT >= 2.8) afterRound();
    const lv = phase === 'fight' && commands
      ? hintLevel(inputBuf, undiscoveredCommands(commands, discovery), simClock, lfInputWindow(fx)) : 0;
    ui.setAura(auraOpacity(lfBoostHint(fx, lv)));
    ui.setSlow(slow > 0);
    ui.setHp(hero.hp / hero.maxHp, foe.hp / foe.maxHp);
    ui.setTimer(match.timeLeft);
  }

  return {
    enter(params = {}) {
      const p = params && typeof params === 'object' ? params : {};
      gameId = typeof p.gameId === 'string' && p.gameId ? p.gameId : LF_GAME_ID;
      carry = p.carry && typeof p.carry === 'object' ? p.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      fx = lfCarryEffects(carry);
      silly = effectiveSillyLevel(storedSillyLevel());
      if (!sillyEventsAllowed(silly) && ctx.silly && typeof ctx.silly.clear === 'function') ctx.silly.clear();
      if (!stage) build();
      level = loadLevel();
      commands = null;
      newMatch();
      held.clear();
      leaving = false;
      t = 0;
      animT = 0;
      simClock = 0;
      phaseT = 0;
      guard = 0.3;
      ctx.setWorld(stage.world);
      hero3d.setMohawk(ctx.mohawkColor());
      ui.mount();
      ui.setNames(LF_HERO_NAME, LF_FOE_NAME);
      resetRoundHud();
      ui.hideBanner();
      ui.hideSay();
      listen(true);
      syncVisuals(0);
      placeCamera(0, true);
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      if (!panel) panel = createMinigamePanel();
      if (!resultPanel) resultPanel = createResultPanel();
      resultPanel.hide();
      phase = 'intro';
      panel.show(lfHowto(carryLine), () => startLevelSelect());
    },
    update(dt) {
      if (!stage) return;
      ensureGameMusic(LF_MUSIC);
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.05);
      t += d;
      phaseT += d;
      guard = Math.max(0, guard - d);
      let simD = d;
      if (phase === 'intro') {
        if (pressed('Escape')) {
          if (panel) panel.hide();
          backToGallery();
          if (!leaving && panel) panel.show(lfHowto(carryLine), () => startLevelSelect());
        } else if (guard <= 0 && pressed('Enter', 'NumpadEnter', 'Space')) {
          if (panel) panel.close();
        }
        animT += d;
      } else if (phase === 'entrance') {
        if (!roundShown && phaseT >= 2.4) {
          roundShown = true;
          ui.banner(roundLabel(match), 1.1);
        }
        if (phaseT >= 3.6) {
          phase = 'fight';
          phaseT = 0;
          held.clear();
          pending = null;
          clearBuffer(inputBuf);
          match = beginFight(match);
          ui.banner('始め！', 0.9, 'gold');
          ctx.ui.setHint(FIGHT_HINT);
        }
        animT += d;
      } else if (phase === 'level' || phase === 'result') {
        if (guard <= 0 && resultPanel && resultPanel.isOpen()) {
          if (pressed('ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW')) resultPanel.move(-1);
          if (pressed('ArrowRight', 'ArrowDown', 'KeyD', 'KeyS')) resultPanel.move(1);
          if (phase === 'level') {
            [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']].forEach((codes, i) => {
              if (resultPanel.isOpen() && pressed(...codes)) {
                resultPanel.move(i - resultPanel.selected());
                resultPanel.confirm();
              }
            });
          }
          if (resultPanel.isOpen() && pressed('Enter', 'NumpadEnter', 'Space')) resultPanel.confirm();
        }
        animT += d;
      } else if (phase === 'cinema') {
        if (cine && !cine.done) {
          cine = cutsceneControl(cine, {
            skip: pressed('Escape'),
            next: guard <= 0 && pressed('Enter', 'NumpadEnter', 'Space'),
          }, d);
        }
        animT += d;
      } else if (phase === 'fight' || phase === 'ko' || phase === 'roundEnd') {
        const before = animT;
        stepCombat(d);
        simD = animT - before;
      }
      const fighting = phase === 'fight' || phase === 'ko' || phase === 'roundEnd';
      if (!fighting) ui.setAura(0);
      ui.setMovesVisible(fighting || phase === 'entrance');
      stage.update(t);
      if (phase === 'cinema' && cine && cine.done) endCinema();
      if (phase === 'cinema' && cine) syncCinema(d);
      else syncVisuals(simD);
      placeCamera(d);
      ui.tick(d);
      placeCallouts();
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, match: smokeSummary(match), carry: smokeSummary(fx) };
    },
    exit() {
      phase = 'idle';
      stopGameMusic(LF_MUSIC);
      listen(false);
      held.clear();
      pending = null;
      hitstop = 0;
      slow = 0;
      if (panel) panel.hide();
      if (resultPanel) resultPanel.hide();
      if (cinema) cinema.hide();
      cine = null;
      cineNext = null;
      if (ui) ui.unmount();
      ctx.ui.setHint('');
    },
    get pausable() { return phase !== 'intro' && phase !== 'cinema'; },
    get carry() { return carry; },
    /** 試合ごとに作った規則の状態（次の段階で使う） */
    get matchState() {
      return {
        commands, foeCommands, discovery, ai, match,
      };
    },
  };
}

export default createLeverFighterScene;
