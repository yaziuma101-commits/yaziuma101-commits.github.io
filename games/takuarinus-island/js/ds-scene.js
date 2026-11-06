// 真っ暗ソウルの場面（ねこアリヌスの絵から）。本気のホラー。
// おふざけの仕組み（ふざけた出来事・擬音・ふざけた効果音）は一切呼ばない。
// 3D はほぼ真っ暗な屋敷で、主人公の懐中電灯（SpotLight）だけで見える。文字は HTML で重ねる。
// Esc のポーズの「館に戻る」は main.js の readyRooms から自動で出る。
import { PALETTE as DSC } from './palette.js';
import { createHeroRig, applyMohawkColor } from './hero-model.js';
import { createAnimState, stepAnim, HERO_HEIGHT } from './characters.js';
import { createMinigamePanel, createResultPanel } from './scenes/touch.js';
import {
  ROOMS, DOORS, OBSTACLES, CANDLES, FUSE_PANEL, BASEMENT_DOOR, EXIT_POS, SAFE_POS, ROOM_LABELS,
  isWalkable, slideMove, roomAt, distance,
} from './ds-map.js';
import {
  tickPlayer, toggleFlashlight, isLightOn, pickupBattery, pickupFuse, insertFuses,
  discoverClue, submitCode, openBasement, fusesMissing,
  restAtCandle,
  tryExit,
  triggerScare, createCreep, stepCreep, creepScale, CREEP_MAX, MAX_SCARES,
} from './ds-state.js';
import { inCone, inLightCone } from './ds-enemies.js';
// 敵は屋敷を歩き回る1体だけ。捕まったら一発でアウト（必勝ハチマキがあれば1回だけ振りほどける）
import {
  createEscapeRun, escapeResult as buildResult, escapeResultView as resultView,
  captureRun, tryBreakFree, canBeCaught,
} from './ds-escape.js';

// ---- 1プレイは ds-escape の規則そのまま（体力・ソウル・ボスの値は持たない） ----
const createRun = createEscapeRun;

// ---- 敵は ds-stalker-ai の1体だけ（escStalker が動かす） ----
// 影・ひっかき猫の一覧は作らない。ソウルの仕組みも無いので拾うものも無い。
const planEnemies = () => [];
const recoverSouls = () => 0;
// 地下室の天井の手は出てこない（地下室では歩き回る敵から隠れて出口へ向かう）
const BOSS_HOME = Object.freeze({ x: 0, z: -7 });
const BOSS_TOTAL_HITS = 1;
const createBoss = (level = 2) => ({
  type: 'boss',
  level,
  phase: 4,
  markHp: 0,
  state: 'gone',
  t: 0,
  target: { x: BOSS_HOME.x, z: BOSS_HOME.z },
  markExposed: false,
  defeated: true,
});
const stepBoss = () => ({ damage: 0 });
const bossRemainingHits = () => 0;
import {
  createStalker, stepStalker, seesPlayer, respawnStalker,
} from './ds-stalker-ai.js';
import {
  HIDE_SPOTS, HIDE_RANGE, nearestHideSpot, hideSpotById, createHideState, enterHide, exitHide,
  clampPeekYaw, gateInput,
} from './ds-hide.js';
import { lanternReward, LANTERN } from './ds-items.js';
import { FUSE_ROOMS, CLUE_ROOMS } from './ds-puzzle.js';
import { makeRng, rngInt } from './ds-rng.js';
import { materialAt } from './ds-map.js';
import { drawingPath, dsDrawingFile, DS_DRAWING_ROLES } from './drawing-usage.js';
import { prepareDrawing } from './drawing-prep.js';
import { SURFACE_TEXTURES, OBJECT_TEXTURES } from './ds-textures.js';
import { furnitureParts, FURNITURE_MATERIALS } from './ds-furniture.js';
import { STALKER, STALKER_STRIDE, stalkerPose } from './ds-stalker.js';
import { DS_SHADOW } from './ds-visual.js';
import {
  createView, stepView, lookDir, flashlightPose, moveSpeed, footstepGain, wrapInput, FPV_SPEED, CROUCH_KEYS,
} from './ds-fpv.js';
import { fitFrame } from './gallery-data.js';
import { gameById } from './game-catalog.js';
import { createAudioRules } from './audio-rules.js';
import {
  heartbeatParams, heartbeatInterval, nearestDistance as nearestDistanceBase, footstepVoice, footstepInterval, panFor,
  planDsSfx, DRONE, nextAmbientDelay,
} from './ds-audio-rules.js';
import { smokeSummary } from './smoke-state.js';

/** 心臓の鼓動に数える、歩き回る敵（場面が入れる） */
let dsHeartSource = null;
/** 一番近い敵までの距離（歩き回る敵も数える） */
function nearestDistance(from, list) {
  const base = nearestDistanceBase(from, list);
  const e = dsHeartSource;
  if (!from || !e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return base;
  const d = Math.hypot(e.x - from.x, e.z - from.z);
  return base === null ? d : Math.min(base, d);
}

/** 隠れている間の隙間の見え方（暗い所は真っ暗、隙間だけ外が見える） */
const DS_HIDE_VIEW_CSS = Object.freeze({
  slats: 'repeating-linear-gradient(90deg, var(--p-dsMemoBg) 0 5vw, transparent 5vw 7.5vw)',
  under: 'linear-gradient(180deg, var(--p-dsMemoBg) 0 38%, transparent 46% 80%, var(--p-dsMemoBg) 90%)',
  curtain: 'linear-gradient(90deg, var(--p-dsMemoBg) 0 26%, transparent 40% 60%, var(--p-dsMemoBg) 74%)',
  gap: 'radial-gradient(ellipse at center, transparent 0 20%, var(--p-dsMemoBg) 50%)',
});

export const DS_GAME_ID = 'dark-soul';
/** ゲームの題名（game-catalog の一覧から引く） */
const DS_TITLE = (gameById(DS_GAME_ID) || {}).title || '';
/** 懐中電灯の光（範囲・半角・強さ） */
export const DS_LIGHT = Object.freeze({
  range: 9, halfAngle: 0.45, intensity: 11, penumbra: 0.4,
});
/** 地下室の扉の鍵（金庫の鍵で開ける） */
const BASEMENT_LOCK_ENABLED = true;
const WALL_H = 3;
const HERO_TARGET_H = 1.6;
// 一人称のしゃがみで毎フレーム切り替える（歩く速さ）
let WALK_SPEED = FPV_SPEED.walk;
const RUN_SPEED = 4.4;
const MOUSE_YAW = 0.0024;
const MOUSE_PITCH = 0.002;
const PITCH_MIN = -0.5;
const PITCH_MAX = 0.65;
const KEY_TURN = 2.2;
const PLAY_HINT = 'WASD: 移動　Shift: 走る　C: しゃがむ　マウス: 見回す（クリックで固定）　F: 懐中電灯　E: 調べる・隠れる　Tab: メモ　Esc: ポーズ';

/** 紹介の画面の中身（ふざけた文面は書かない） */
export function dsHowto(carryLine = null) {
  return {
    title: DS_TITLE,
    sub: 'ねこアリヌスの古い屋敷。明かりは懐中電灯だけ',
    lines: [
      '屋敷の中はほとんど真っ暗だ。懐中電灯の光が届くところしか見えない。',
      '電池は点けている間だけ減っていく。切れたら何も見えなくなる。',
      '地下室の扉を開けて、この屋敷から出なければならない。',
      '暗がりに、何かがいる。戦う手段はない。捕まったら、それで終わりだ。',
      '懐中電灯の光を向けると気づかれる。明かりを消して動かずにいれば、近くても見つかりにくい。走る足音は遠くまで響く。',
      '衣装だんすやベッドの下に隠れてやり過ごせる。隠れるところを見られなければ、見つからない。',
      '配電盤にはヒューズが足りない。書斎の金庫は四桁の番号で閉ざされている。調べたことはメモ帳に残る。',
    ],
    rows: [
      ['W A S D', '移動'],
      ['Shift', '走る（スタミナを使う）'],
      ['マウス', '向き（クリックで視点を固定）'],
      ['← →', '向きを変える'],
      ['F', '懐中電灯のオン・オフ'],
      ['C', 'しゃがむ（ゆっくり・足音が小さい）'],
      ['E', '調べる・拾う・使う／隠れる・出る'],
      ['Tab', 'メモ帳を開く・閉じる'],
      ['Esc', 'ポーズ（館に戻る）'],
    ],
    win: '目的：地下室から屋敷の外へ出る。',
    carry: typeof carryLine === 'string' && carryLine ? carryLine : '持ち込み：なし',
    note: 'Enter / Space で始める　Esc で館に戻る',
  };
}

// ---- 手続きのテクスチャ ----
function makeTex(THREE, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.magFilter = THREE.NearestFilter;
  tx.minFilter = THREE.NearestFilter;
  tx.generateMipmaps = false;
  return tx;
}

const DRAW = {
  wood(g, w, h, r) {
    g.fillStyle = DSC.dsWood;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = DSC.dsWoodDark;
      g.fillRect(0, y, w, 1);
      g.fillRect(rngInt(r, w), y, 1, 8);
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = r() < 0.5 ? DSC.dsWoodLight : DSC.dsWoodMid;
      g.fillRect(rngInt(r, w), rngInt(r, h), 3, 1);
    }
  },
  carpet(g, w, h, r) {
    g.fillStyle = DSC.dsCarpet;
    g.fillRect(0, 0, w, h);
    g.fillStyle = DSC.dsCarpetLight;
    for (let y = 0; y < h; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) g.fillRect(x, y, 3, 3);
    }
    for (let i = 0; i < 80; i++) {
      g.fillStyle = DSC.dsCarpetDark;
      g.fillRect(rngInt(r, w), rngInt(r, h), 1, 1);
    }
  },
  tile(g, w, h) {
    g.fillStyle = DSC.dsTile;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = ((x + y) / 16) % 2 ? DSC.dsTileMid : DSC.dsTileLight;
        g.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  },
  concrete(g, w, h, r) {
    g.fillStyle = DSC.dsConcrete;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? DSC.dsConcreteDark : DSC.dsConcreteLight;
      g.fillRect(rngInt(r, w), rngInt(r, h), 1 + rngInt(r, 2), 1);
    }
  },
  paper(g, w, h, r) {
    g.fillStyle = DSC.dsPaper;
    g.fillRect(0, 0, w, h);
    g.fillStyle = DSC.dsPaperLight;
    for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h);
    for (let i = 0; i < 6; i++) {
      g.globalAlpha = 0.35;
      g.fillStyle = DSC.dsStain;
      g.fillRect(rngInt(r, w), rngInt(r, h), 4 + rngInt(r, 8), 6 + rngInt(r, 10));
    }
  },
  stone(g, w, h, r) {
    g.fillStyle = DSC.dsStone;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      const off = (y / 8) % 2 ? 8 : 0;
      for (let x = -off; x < w; x += 16) {
        g.fillStyle = r() < 0.5 ? DSC.dsStoneMid : DSC.dsStoneLight;
        g.fillRect(x + 1, y + 1, 14, 6);
      }
    }
  },
};

const FURNITURE_COLOR = Object.freeze({
  shelf: DSC.dsShelf,
  desk: DSC.dsDesk,
  safe: DSC.dsSafe,
  bed: DSC.dsBed,
  chest: DSC.dsChest,
  counter: DSC.dsCounter,
  table: DSC.dsTable,
  rack: DSC.dsRack,
  clock: DSC.dsClockWood,
});

/** a..b から gaps を除いた区間 */
function spans(a, b, gaps) {
  const out = [];
  let cur = a;
  for (const [g1, g2] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 > cur) out.push([cur, g1]);
    cur = Math.max(cur, g2);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

// 壁：h は x 方向に伸びる壁（z が固定）、v は z 方向に伸びる壁（x が固定）
const WALLS = [
  ['h', -2, -12, 12, 'paper'],
  ['h', 2, -12, 12, 'paper'],
  ['v', -12, -2, 2, 'paper'],
  ['v', 12, -2, 2, 'paper'],
  ['v', -12, 2, 10, 'paper'],
  ['v', -4, 2, 10, 'paper'],
  ['h', 10, -12, -4, 'paper'],
  ['v', -3, 2, 10, 'paper'],
  ['v', 5, 2, 10, 'paper'],
  ['h', 10, -3, 5, 'paper'],
  ['v', 6, 2, 10, 'paper'],
  ['v', 12, 2, 10, 'paper'],
  ['h', 10, 6, 12, 'paper'],
  ['v', -6, -12, -2, 'stone'],
  ['v', 6, -12, -2, 'stone'],
  ['h', -12, -6, 6, 'stone'],
];

function doorGaps(axis, fixed) {
  if (axis !== 'h') return [];
  return DOORS.filter((d) => d.z === fixed).map((d) => [d.x - d.width / 2, d.x + d.width / 2]);
}

/** 調べる・拾う・使うの届く距離 */
const FOCUS_RANGE = 1.4;
/** ヒューズの置き場所（部屋ごと。y は置いてある高さ） */
const FUSE_SPOTS = Object.freeze({
  corridor: { x: -6, z: -1.5, y: 0.04 },
  study: { x: -6.25, z: 6.5, y: 0.84 },
  kids: { x: -2.3, z: 9.5, y: 0.74 },
  kitchen: { x: 7.75, z: 6.6, y: 0.84 },
});
/** 電池の置き場所（部屋ごと） */
const BATTERY_SPOTS = Object.freeze({
  corridor: { x: 7, z: 1.5, y: 0.05 },
  study: { x: -10.5, z: 3, y: 0.05 },
  kids: { x: 4, z: 3, y: 0.05 },
  kitchen: { x: 11.65, z: 4, y: 0.99 },
  basement: { x: 3, z: -10, y: 0.05 },
});
/** 手がかりを調べる位置 */
const CLUE_SPOTS = Object.freeze({
  clock: { x: 4.3, z: -1.35 },
  graffiti: { x: -2.65, z: 6 },
  calendar: { x: 9, z: 9.55 },
});
/** 廊下の電球（x 座標） */
const CORRIDOR_LAMPS = Object.freeze([-9, -3, 3, 9]);
const LAMP_POWER = 7;
// 攻撃・回避・力尽きる仕組みは無い（捕まったら ds-escape の captureRun でろうそくへ戻る）
/** 古い見た目の処理が参照する、倒れる演出の長さ（秒）。いまは使われない（deadT は常に 0） */
const DEATH_TIME = 2.4;
/** 倒れる演出の長さ（古い見た目の処理が参照する。deadT は常に 0 なので実際には使われない） */
const DYING_TIME = DEATH_TIME;

/** 止まった柱時計の文字盤（数字は描かず、目盛りと針だけ） */
function drawClock(g, w, h, hour, minute) {
  const cx = w / 2;
  const cy = h / 2;
  const R = w / 2 - 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = DSC.dsClockWood;
  g.fillRect(0, 0, w, h);
  g.fillStyle = DSC.dsClockFace;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = DSC.dsClockRim;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = DSC.dsClockTick;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0 ? 3 : 2;
    g.fillRect(Math.round(cx + Math.sin(a) * (R - 5)) - 1, Math.round(cy - Math.cos(a) * (R - 5)) - 1, big, big);
  }
  const hand = (a, len, wd) => {
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
    g.stroke();
  };
  g.strokeStyle = DSC.dsClockHand;
  hand((((hour % 12) + minute / 60) / 12) * Math.PI * 2, R * 0.5, 3);
  hand((minute / 60) * Math.PI * 2, R * 0.82, 2);
}

/** 子ども部屋の落書き（棒の人とひっかき傷。文字は描かない） */
function drawGraffiti(g, w, h, count) {
  g.clearRect(0, 0, w, h);
  g.globalAlpha = 0.85;
  g.strokeStyle = DSC.dsCrayon;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(22, 20, 9, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(16, 12);
  g.lineTo(22, 2);
  g.lineTo(28, 12);
  g.stroke();
  g.fillStyle = DSC.dsCrayon;
  g.fillRect(18, 18, 2, 2);
  g.fillRect(25, 18, 2, 2);
  g.beginPath();
  g.moveTo(22, 29);
  g.lineTo(22, 46);
  g.moveTo(13, 36);
  g.lineTo(31, 36);
  g.moveTo(22, 46);
  g.lineTo(16, 58);
  g.moveTo(22, 46);
  g.lineTo(28, 58);
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = DSC.dsScratch;
  g.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    const x = 36 + i * 3;
    g.beginPath();
    g.moveTo(x, 32 + (i % 2) * 3);
    g.lineTo(x + 2, 58 - (i % 3) * 2);
    g.stroke();
  }
}

/** 台所のカレンダー（升目と赤い丸。文字は描かない） */
function drawCalendar(g, w, h, day) {
  g.fillStyle = DSC.dsCalendar;
  g.fillRect(0, 0, w, h);
  g.fillStyle = DSC.dsCalendarHead;
  g.fillRect(0, 0, w, 10);
  const top = 14;
  const cw = w / 7;
  const ch = (h - top - 2) / 4;
  g.strokeStyle = DSC.dsCalendarLine;
  g.lineWidth = 1;
  for (let r = 0; r <= 4; r++) {
    g.beginPath();
    g.moveTo(0, top + r * ch);
    g.lineTo(w, top + r * ch);
    g.stroke();
  }
  for (let c = 0; c <= 7; c++) {
    g.beginPath();
    g.moveTo(c * cw, top);
    g.lineTo(c * cw, top + 4 * ch);
    g.stroke();
  }
  g.fillStyle = DSC.dsCalendarDot;
  for (let i = 0; i < 28; i++) {
    g.fillRect(Math.floor((i % 7) * cw + 2), Math.floor(top + Math.floor(i / 7) * ch + 2), 2, 2);
  }
  const i = Math.max(0, Math.min(27, day - 1));
  const c = i % 7;
  const r = Math.floor(i / 7);
  g.strokeStyle = DSC.dsRedMark;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(c * cw + cw / 2, top + r * ch + ch / 2, cw / 2, ch / 2 - 1, 0, 0, Math.PI * 2);
  g.stroke();
}

function redrawTex(tex, draw) {
  if (!tex || !tex.image) return;
  const c = tex.image;
  draw(c.getContext('2d'), c.width, c.height);
  tex.needsUpdate = true;
}

// ---- 音（Web Audio で合成するオリジナルの音。おふざけの音は持たない） ----
function shaperCurve(k = 30) {
  const n = 512;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

function createDsSound() {
  let ac = null;
  let failed = false;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let amb = null;
  let noiseBuf = null;
  let curve = null;
  let drone = null;
  let watch = null;
  let lastTick = 0;
  let rulesT = 0;
  let sfxGain = 0;
  let musicGain = 0;
  let creakT = nextAmbientDelay('creak', Math.random);
  let catT = nextAmbientDelay('cat', Math.random);
  // 一人称の構え（しゃがむと足音が小さい）
  let stance = { running: false, crouch: false };
  const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;

  function ensure() {
    if (ac || failed) return ac;
    try {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      ac = C ? new C() : null;
    } catch {
      ac = null;
    }
    if (!ac) {
      failed = true;
      return null;
    }
    try {
      master = ac.createGain();
      master.gain.value = 1;
      master.connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      amb = ac.createGain();
      amb.gain.value = 0;
      amb.connect(musicBus);
    } catch {
      ac = null;
      failed = true;
    }
    return ac;
  }

  function refresh(d) {
    rulesT -= d;
    if (rulesT > 0) return;
    rulesT = 1;
    let rules = null;
    try {
      rules = createAudioRules(globalThis.localStorage);
    } catch {
      rules = createAudioRules({ getItem: () => null, setItem() {} });
    }
    sfxGain = rules.effectiveGain('sfx');
    musicGain = rules.effectiveGain('music');
    musicBus.gain.setTargetAtTime(musicGain * DRONE.level, ac.currentTime, 0.1);
  }

  function noise() {
    if (!noiseBuf) {
      const n = Math.max(1, Math.floor(ac.sampleRate * 2));
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  const getCurve = () => {
    if (!curve) curve = shaperCurve(30);
    return curve;
  };
  const filt = (type, freq, q = 1) => {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = freq;
    b.Q.value = q;
    return b;
  };
  function out(pan, bus = sfxBus) {
    if (pan && typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(bus);
      return p;
    }
    return bus;
  }
  function env(dest, t, attack, peak, decay) {
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }
  function osc(type, f0, f1, t, dur, dest) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function noiseSrc(t, dur, dest, type, freq, q = 1) {
    const s = ac.createBufferSource();
    s.buffer = noise();
    s.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(freq, t);
    fl.Q.setValueAtTime(q, t);
    s.connect(fl);
    fl.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return fl;
  }
  /** きしみ（低い刻みを細い共鳴に通す） */
  function creak(dest, gain, t, dur, f0) {
    const bp = filt('bandpass', f0, 9);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.linearRampToValueAtTime(f0 * 1.35, t + dur * 0.6);
    bp.frequency.linearRampToValueAtTime(f0 * 1.1, t + dur);
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t + dur * 0.25);
    g.gain.setValueAtTime(Math.max(0.0002, gain), t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    bp.connect(g);
    g.connect(dest);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(22, t);
    o.frequency.linearRampToValueAtTime(34, t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(18, t + dur);
    o.connect(bp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const SYN = {
    // 遠くの物音・時計の音（BGM の一部）
    bgm(g, opt) {
      const t = ac.currentTime;
      const p = out(Number(opt.pan) || 0, amb);
      if (opt.kind === 'tick') {
        const e = env(p, t, 0.001, g * (Number(opt.vol) || 0.06), 0.025);
        osc('square', 3200, 2700, t, 0.03, e);
        return;
      }
      if (opt.kind === 'thump') {
        const e = env(p, t, 0.01, g * 0.6, 0.6);
        const lp = filt('lowpass', 160);
        lp.connect(e);
        osc('sine', 70, 34, t, 0.6, lp);
        const e2 = env(p, t, 0.005, g * 0.25, 0.3);
        noiseSrc(t, 0.3, e2, 'lowpass', 300, 0.7);
      } else {
        creak(p, g * 1.6, t, 0.9 + Math.random() * 0.9, 500 + Math.random() * 500);
      }
    },
    heartbeat(g, opt) {
      const vol = Number.isFinite(opt.volume) ? Math.max(0, Math.min(1, opt.volume)) : 0.3;
      for (const [k, at] of [[1, 0], [0.7, 0.27]]) {
        const t = ac.currentTime + at;
        const e = env(sfxBus, t, 0.012, g * vol * k, 0.2);
        const lp = filt('lowpass', 140);
        lp.connect(e);
        osc('sine', 62, 38, t, 0.22, lp);
      }
    },
    footstep(g, opt) {
      const v = footstepVoice(opt.material);
      const mul = footstepGain({ running: !!opt.running && !stance.crouch, crouch: stance.crouch });
      const t = ac.currentTime + Math.random() * 0.02;
      const p = out((Math.random() - 0.5) * 0.15);
      const e = env(p, t, 0.004, g * mul * 0.8, v.decay);
      osc('sine', v.freq * 1.4, v.freq * 0.7, t, v.decay + 0.02, e);
      const e2 = env(p, t, 0.002, g * mul * v.noise, v.decay * 0.8);
      noiseSrc(t, v.decay, e2, 'bandpass', v.freq * 5, 1.2);
      if (opt.material === 'wood' && Math.random() < 0.18) creak(p, g * 1.2, t + 0.05, 0.4, 900);
    },
    door(g, opt) {
      const t = ac.currentTime;
      if (opt.locked) {
        for (let i = 0; i < 4; i++) {
          const at = t + i * 0.075 + Math.random() * 0.02;
          const e = env(sfxBus, at, 0.002, g * 0.55, 0.06);
          noiseSrc(at, 0.07, e, 'bandpass', 1300 + Math.random() * 400, 3);
          const e2 = env(sfxBus, at, 0.002, g * 0.3, 0.08);
          const lp = filt('lowpass', 700);
          lp.connect(e2);
          osc('square', 170, 120, at, 0.08, lp);
        }
        return;
      }
      if (opt.small) {
        const e = env(sfxBus, t, 0.002, g * 0.35, 0.12);
        osc('triangle', 2400, 2350, t, 0.12, e);
        osc('sine', 3650, 3600, t, 0.1, e);
        creak(sfxBus, g * 2, t + 0.15, 0.7, 1500);
        return;
      }
      creak(sfxBus, g * 3, t, 1.6, 650);
      creak(sfxBus, g * 2, t + 0.45, 1.1, 480);
      const e = env(sfxBus, t + 1.5, 0.01, g * 0.7, 0.5);
      const lp = filt('lowpass', 180);
      lp.connect(e);
      osc('sine', 72, 38, t + 1.5, 0.5, lp);
    },
    cat(g, opt) {
      const t = ac.currentTime;
      const p = out(Number.isFinite(opt.pan) ? opt.pan : Math.random() * 1.6 - 0.8);
      if (opt.near) {
        const e = env(p, t, 0.05, g * 1.6, 0.6);
        noiseSrc(t, 0.7, e, 'highpass', 2600, 0.7);
        const e2 = env(p, t, 0.08, g * 0.9, 0.55);
        const lp = filt('lowpass', 420);
        lp.connect(e2);
        osc('sawtooth', 95, 70, t, 0.6, lp);
        return;
      }
      // 遠くでゆがんだ声：ずれた2つの声 → 共鳴 → ひずみ → 音量 → 遠さ（ローパスとこだま）
      const lp = filt('lowpass', 950, 0.7);
      lp.connect(p);
      if (typeof ac.createDelay === 'function') {
        const dl = ac.createDelay(1);
        dl.delayTime.value = 0.34;
        const fb = ac.createGain();
        fb.gain.value = 0.32;
        lp.connect(dl);
        dl.connect(fb);
        fb.connect(dl);
        dl.connect(p);
      }
      const e = ac.createGain();
      e.gain.value = 0.0001;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(Math.max(0.0002, g * 0.45), t + 0.18);
      e.gain.setValueAtTime(Math.max(0.0002, g * 0.4), t + 1.0);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      e.connect(lp);
      const ws = ac.createWaveShaper();
      ws.curve = getCurve();
      ws.connect(e);
      const drive = ac.createGain();
      drive.gain.value = 4;
      drive.connect(ws);
      const bp = filt('bandpass', 1100, 2);
      bp.connect(drive);
      const vib = ac.createOscillator();
      vib.frequency.setValueAtTime(5.5, t);
      vib.frequency.linearRampToValueAtTime(3, t + 1.6);
      const vg = ac.createGain();
      vg.gain.value = 22;
      vib.connect(vg);
      vib.start(t);
      vib.stop(t + 1.8);
      for (const k of [1, 1.035]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(440 * k, t);
        o.frequency.linearRampToValueAtTime(720 * k, t + 0.35);
        o.frequency.linearRampToValueAtTime(610 * k, t + 0.8);
        o.frequency.linearRampToValueAtTime(330 * k, t + 1.4);
        o.frequency.linearRampToValueAtTime(240 * k, t + 1.7);
        vg.connect(o.frequency);
        const og = ac.createGain();
        og.gain.value = 0.3;
        o.connect(og);
        og.connect(bp);
        o.start(t);
        o.stop(t + 1.8);
      }
    },
    click(g, opt) {
      const t = ac.currentTime;
      if (opt.heavy) {
        const e = env(sfxBus, t, 0.002, g * 0.6, 0.05);
        const lp = filt('lowpass', 1800);
        lp.connect(e);
        osc('square', 620, 300, t, 0.05, lp);
        const e2 = env(sfxBus, t + 0.01, 0.004, g * 0.6, 0.12);
        osc('sine', 130, 70, t + 0.01, 0.13, e2);
        return;
      }
      for (const [at, k] of [[0, 1], [0.035, 0.55]]) {
        const e = env(sfxBus, t + at, 0.001, g * k * 0.5, 0.015);
        osc('square', 2300 - at * 8000, 1800, t + at, 0.02, e);
        const e2 = env(sfxBus, t + at, 0.001, g * k * 0.4, 0.012);
        noiseSrc(t + at, 0.02, e2, 'highpass', 4200, 0.7);
      }
    },
    hit(g, opt) {
      const t = ac.currentTime;
      if (opt.swing) {
        const e = env(sfxBus, t, 0.06, g * 0.25, 0.18);
        const bp = noiseSrc(t, 0.25, e, 'bandpass', 700, 1.2);
        bp.frequency.exponentialRampToValueAtTime(2200, t + 0.18);
        return;
      }
      if (opt.hurt) {
        const e = env(sfxBus, t, 0.005, g, 0.45);
        const lp = filt('lowpass', 220);
        lp.connect(e);
        osc('sine', 95, 38, t, 0.45, lp);
        const e2 = env(sfxBus, t, 0.003, g * 0.5, 0.25);
        noiseSrc(t, 0.25, e2, 'lowpass', 600, 0.8);
        return;
      }
      const s = opt.strength > 0 ? opt.strength : 1;
      const e = env(sfxBus, t, 0.003, g * s * 0.9, 0.2);
      osc('sine', 150, 52, t, 0.22, e);
      const e2 = env(sfxBus, t, 0.002, g * s * 0.55, 0.1);
      noiseSrc(t, 0.12, e2, 'bandpass', 900, 0.9);
      const e3 = env(sfxBus, t, 0.002, g * 0.12, 0.35);
      osc('triangle', 880, 860, t, 0.35, e3);
      osc('sine', 1312, 1300, t, 0.3, e3);
    },
    roll(g) {
      const t = ac.currentTime;
      const e = ac.createGain();
      e.gain.value = 0.0001;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(Math.max(0.0002, g * 0.6), t + 0.12);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      e.connect(sfxBus);
      const bp = noiseSrc(t, 0.5, e, 'bandpass', 300, 1.4);
      bp.frequency.linearRampToValueAtTime(1100, t + 0.2);
      bp.frequency.linearRampToValueAtTime(260, t + 0.45);
      const e2 = env(sfxBus, t + 0.36, 0.006, g * 0.55, 0.22);
      const lp = filt('lowpass', 200);
      lp.connect(e2);
      osc('sine', 90, 48, t + 0.36, 0.24, lp);
    },
    scare(g) {
      const t = ac.currentTime;
      const lp = filt('lowpass', 3200, 0.8);
      const e = ac.createGain();
      e.gain.value = 0.0001;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.linearRampToValueAtTime(Math.max(0.0002, g * 0.5), t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      lp.connect(e);
      e.connect(sfxBus);
      for (const f0 of [233, 247, 330, 349, 466]) osc('sawtooth', f0, f0 * 0.82, t, 1.4, lp);
      const e2 = env(sfxBus, t, 0.01, g * 0.6, 1.0);
      noiseSrc(t, 1.1, e2, 'highpass', 1800, 0.7);
      const e3 = env(sfxBus, t, 0.005, g * 0.9, 0.9);
      osc('sine', 58, 30, t, 0.9, e3);
    },
  };

  function startDrone() {
    const t = ac.currentTime;
    const nodes = [];
    const lp = filt('lowpass', DRONE.filterHz, DRONE.filterQ);
    const swell = ac.createGain();
    swell.gain.value = 1;
    lp.connect(swell);
    swell.connect(amb);
    for (const v of DRONE.voices) {
      const o = ac.createOscillator();
      o.type = v.type;
      o.frequency.value = v.freq;
      o.detune.value = v.detune || 0;
      const g = ac.createGain();
      g.gain.value = v.gain;
      o.connect(g);
      g.connect(lp);
      o.start(t);
      nodes.push(o);
    }
    const l1 = ac.createOscillator();
    l1.frequency.value = DRONE.sweepRate;
    const l1g = ac.createGain();
    l1g.gain.value = DRONE.filterSweep;
    l1.connect(l1g);
    l1g.connect(lp.frequency);
    l1.start(t);
    nodes.push(l1);
    const l2 = ac.createOscillator();
    l2.frequency.value = DRONE.swellRate;
    const l2g = ac.createGain();
    l2g.gain.value = DRONE.swellDepth;
    l2.connect(l2g);
    l2g.connect(swell.gain);
    l2.start(t);
    nodes.push(l2);
    // 床下のうなり
    const n1 = ac.createBufferSource();
    n1.buffer = noise();
    n1.loop = true;
    const nl = filt('lowpass', 110, 0.7);
    const ng = ac.createGain();
    ng.gain.value = DRONE.rumble;
    n1.connect(nl);
    nl.connect(ng);
    ng.connect(amb);
    n1.start(t);
    nodes.push(n1);
    // すきま風
    const n2 = ac.createBufferSource();
    n2.buffer = noise();
    n2.loop = true;
    const wb = filt('bandpass', 380, 0.8);
    const wg = ac.createGain();
    wg.gain.value = DRONE.wind;
    n2.connect(wb);
    wb.connect(wg);
    wg.connect(amb);
    n2.start(t, 0.7);
    nodes.push(n2);
    const l3 = ac.createOscillator();
    l3.frequency.value = 0.05;
    const l3g = ac.createGain();
    l3g.gain.value = 150;
    l3.connect(l3g);
    l3g.connect(wb.frequency);
    l3.start(t);
    nodes.push(l3);
    drone = { nodes };
  }

  function stopDrone() {
    if (!drone || !ac) return;
    const t = ac.currentTime;
    for (const n of drone.nodes) {
      try {
        n.stop(t + 0.1);
      } catch {
        // 握りつぶす
      }
    }
    drone = null;
  }

  function startWatch() {
    if (watch || typeof setInterval !== 'function') return;
    // 場面の更新が止まったら（ポーズ・結果・退出）持続音を消す
    watch = setInterval(() => {
      if (!ac) return;
      const idle = clock() - lastTick;
      try {
        if (idle > 0.4) amb.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      } catch {
        // 握りつぶす
      }
      if (idle > 6) {
        stopDrone();
        clearInterval(watch);
        watch = null;
      }
    }, 250);
  }

  function play(name, opt = {}) {
    if (!ensure() || !Object.prototype.hasOwnProperty.call(SYN, name)) return false;
    const plan = planDsSfx(name, name === 'bgm' ? 1 : sfxGain);
    if (!plan) return false;
    try {
      SYN[name](plan.gain, opt || {});
      return true;
    } catch {
      return false;
    }
  }

  function tick(d) {
    if (!ensure()) return;
    lastTick = clock();
    const dt = Number.isFinite(d) && d > 0 ? d : 0;
    try {
      if (ac.state === 'suspended' && typeof ac.resume === 'function') {
        const r = ac.resume();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
      refresh(dt);
      if (!drone) startDrone();
      amb.gain.setTargetAtTime(1, ac.currentTime, 0.6);
      startWatch();
      creakT -= dt;
      if (creakT <= 0) {
        creakT = nextAmbientDelay('creak', Math.random);
        play('bgm', { kind: Math.random() < 0.7 ? 'creak' : 'thump', pan: Math.random() * 1.6 - 0.8 });
      }
      catT -= dt;
      if (catT <= 0) {
        catT = nextAmbientDelay('cat', Math.random);
        play('cat', { pan: Math.random() * 1.6 - 0.8 });
      }
    } catch {
      // 音が出なくても遊べる
    }
  }

  function halt() {
    lastTick = 0;
    if (watch) {
      clearInterval(watch);
      watch = null;
    }
    if (!ac) return;
    try {
      amb.gain.cancelScheduledValues(ac.currentTime);
      amb.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    } catch {
      // 握りつぶす
    }
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (clock() - lastTick > 0.5) stopDrone();
      }, 600);
    }
  }

  function setStance(s) {
    stance = { running: !!(s && s.running), crouch: !!(s && s.crouch) };
  }

  return {
    tick, play, halt, setStance,
  };
}

// ---- リアルな見た目（質感のある模様・家具・人影） ----
function maxAniso(ctx) {
  try {
    return Math.max(1, Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()));
  } catch {
    return 1;
  }
}

/** ds-textures の模様を canvas に描いて、ミップマップつきのテクスチャにする */
function makeRealTex(THREE, spec, seed, aniso = 1) {
  const size = spec && spec.size > 0 ? spec.size : 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g && spec && typeof spec.draw === 'function') spec.draw(g, size, size, makeRng(seed));
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = THREE.RepeatWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.magFilter = THREE.LinearFilter;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.generateMipmaps = true;
  tx.anisotropy = aniso;
  return tx;
}

function makeFurnitureMats(THREE, aniso) {
  const out = {};
  const texCache = {};
  let seed = 101;
  for (const [key, spec] of Object.entries(FURNITURE_MATERIALS)) {
    let map = null;
    if (spec.tex) {
      if (!texCache[spec.tex]) texCache[spec.tex] = makeRealTex(THREE, OBJECT_TEXTURES[spec.tex], seed++, aniso);
      map = texCache[spec.tex];
    }
    const m = new THREE.MeshStandardMaterial({
      map,
      color: spec.color ? DSC[spec.color] : 'white',
      roughness: Number.isFinite(spec.roughness) ? spec.roughness : 0.9,
      metalness: Number.isFinite(spec.metalness) ? spec.metalness : 0,
    });
    if (Number.isFinite(spec.opacity) && spec.opacity < 1) {
      m.transparent = true;
      m.opacity = spec.opacity;
      m.depthWrite = false;
    }
    out[key] = m;
  }
  return out;
}

/** 家具（ds-furniture の部品）をまとめて組む。影を落とし、影を受ける */
function buildFurnitureSet(THREE, list, mats) {
  const group = new THREE.Group();
  const geos = new Map();
  const geoFor = (p) => {
    const key = p.type === 'cyl' ? `c:${p.r}:${p.rt}:${p.h}` : `b:${p.w}:${p.h}:${p.d}`;
    let g = geos.get(key);
    if (!g) {
      g = p.type === 'cyl' ? new THREE.CylinderGeometry(p.rt, p.r, p.h, 12) : new THREE.BoxGeometry(p.w, p.h, p.d);
      geos.set(key, g);
    }
    return g;
  };
  for (const o of list) {
    for (const p of furnitureParts(o)) {
      const m = new THREE.Mesh(geoFor(p), mats[p.mat] || mats.wood);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.rotY || 0;
      m.castShadow = !m.material.transparent;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}

function makeStalkerMats(THREE, aniso) {
  const robeTex = makeRealTex(THREE, OBJECT_TEXTURES.robe, 501, aniso);
  return {
    cloth: new THREE.MeshStandardMaterial({ map: robeTex, roughness: 0.96, metalness: 0 }),
    robe: new THREE.MeshStandardMaterial({
      map: robeTex, roughness: 0.98, metalness: 0, side: THREE.DoubleSide,
    }),
    skin: new THREE.MeshStandardMaterial({ map: makeRealTex(THREE, OBJECT_TEXTURES.skin, 502, aniso), roughness: 0.85, metalness: 0 }),
    fur: new THREE.MeshStandardMaterial({ map: makeRealTex(THREE, OBJECT_TEXTURES.fur, 503, aniso), roughness: 1, metalness: 0 }),
  };
}

/** 背の高い痩せた人影（足元が原点、+z が正面）。顔はフードの奥で見えない */
function buildStalkerModel(THREE, mats) {
  const S = STALKER;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = S.hipY;
  root.add(body);
  const mk = (geo, m, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.dsDressed = true;
    parent.add(mesh);
    return mesh;
  };
  const down = (geo, len) => {
    geo.translate(0, -len / 2, 0);
    return geo;
  };
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * S.hipHalf, S.hipY, 0);
    root.add(hip);
    mk(down(new THREE.CylinderGeometry(0.045, 0.03, S.legLen, 6), S.legLen), mats.cloth, 0, 0, 0, hip);
    mk(new THREE.BoxGeometry(0.09, 0.05, 0.26), mats.skin, 0, -S.legLen + 0.025, 0.06, hip);
    legs.push(hip);
  }
  const robeH = S.robeTop - S.robeHem;
  mk(new THREE.CylinderGeometry(S.robeTopR, S.robeHemR, robeH, 12, 3, true), mats.robe, 0, (S.robeTop + S.robeHem) / 2 - S.hipY, 0, body);
  mk(new THREE.CylinderGeometry(S.torsoR, S.torsoR * 0.85, 0.7, 8), mats.cloth, 0, 1.45 - S.hipY, 0, body);
  mk(new THREE.BoxGeometry(S.shoulderHalf * 2 + 0.04, 0.07, 0.16), mats.cloth, 0, S.shoulderY - S.hipY, 0, body);
  // すその破れ
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = 0.25 + (i % 3) * 0.12;
    const strip = mk(
      down(new THREE.PlaneGeometry(0.07, len), len),
      mats.robe,
      Math.sin(a) * S.robeHemR * 0.95,
      S.robeHem - S.hipY + 0.02,
      Math.cos(a) * S.robeHemR * 0.95,
      body,
    );
    strip.rotation.y = a;
  }
  const head = new THREE.Group();
  head.position.set(0, S.neckY - S.hipY, 0.03);
  body.add(head);
  mk(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6), mats.skin, 0, 0.04, 0, head);
  const skull = mk(new THREE.SphereGeometry(S.headR, 10, 8), mats.skin, 0, 0.15, 0.02, head);
  skull.scale.set(0.85, 1.25, 0.95);
  mk(new THREE.CylinderGeometry(0.07, 0.17, 0.4, 12, 1, true), mats.robe, 0, 0.18, -0.01, head);
  mk(new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mats.robe, 0, S.hoodTop, -0.01, head);
  const arms = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * S.shoulderHalf, S.shoulderY - S.hipY, 0);
    body.add(shoulder);
    mk(down(new THREE.CylinderGeometry(0.035, 0.03, S.upperArm, 6), S.upperArm), mats.cloth, 0, 0, 0, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -S.upperArm;
    shoulder.add(elbow);
    mk(down(new THREE.CylinderGeometry(0.028, 0.022, S.foreArm, 6), S.foreArm), mats.skin, 0, 0, 0, elbow);
    const hand = new THREE.Group();
    hand.position.y = -S.foreArm;
    elbow.add(hand);
    mk(new THREE.BoxGeometry(0.05, 0.11, 0.025), mats.skin, 0, -0.055, 0, hand);
    for (let i = 0; i < 4; i++) {
      mk(down(new THREE.CylinderGeometry(0.007, 0.005, 0.1, 4), 0.1), mats.skin, (i - 1.5) * 0.012, -0.11, 0, hand);
    }
    arms.push({ shoulder, elbow, side: s });
  }
  return {
    root, body, legs, arms, head,
  };
}

function poseStalker(m, p, baseY) {
  m.legs[0].rotation.x = -p.hipL;
  m.legs[1].rotation.x = -p.hipR;
  for (const a of m.arms) {
    a.shoulder.rotation.x = -(a.side > 0 ? p.shoulderL : p.shoulderR);
    a.shoulder.rotation.z = a.side * p.armOut;
    a.elbow.rotation.x = a.side > 0 ? p.elbowL : p.elbowR;
  }
  m.body.rotation.z = p.sway;
  m.body.rotation.x = p.lean;
  m.head.rotation.set(p.headBow, p.headYaw, p.headRoll);
  m.root.position.y = baseY - p.bob;
}

function angLerp(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** 一人称視点で包んだ場面（毎フレームの更新のあとで、カメラと懐中電灯を目の位置に置く） */
export function createDarkSoulScene(ctx) {
  const hooks = {};
  const scene = createDarkSoulSceneBase(ctx, hooks);
  const call = (name, ...a) => {
    if (typeof hooks[name] === 'function') {
      try {
        hooks[name](...a);
      } catch (err) {
        console.warn(err);
      }
    }
  };
  let lastArgs = [];
  // 結果の「もう一度」：同じ持ち込みで、紹介の画面からやり直す
  hooks.restart = () => enter(...lastArgs);
  const enter = (...a) => {
    lastArgs = a;
    call('visualOn');
    const r = typeof scene.enter === 'function' ? scene.enter(...a) : undefined;
    call('post', 0);
    return r;
  };
  const exit = (...a) => {
    let r;
    try {
      r = typeof scene.exit === 'function' ? scene.exit(...a) : undefined;
    } finally {
      call('visualOff');
    }
    return r;
  };
  const update = (dt) => {
    call('pre', dt);
    const r = typeof scene.update === 'function' ? scene.update(dt) : undefined;
    call('post', dt);
    return r;
  };
  return new Proxy(scene, {
    get(t, k) {
      if (k === 'enter') return enter;
      if (k === 'update') return update;
      if (k === 'exit') return exit;
      return Reflect.get(t, k, t);
    },
  });
}

function createDarkSoulSceneBase(ctx, hooks = {}) {
  const { THREE, camera, mat } = ctx;
  const view = createView();
  // 遊んでいる間は殴る・回避のキーを使わない。しゃがんでいる間は走れない
  const input = wrapInput(gateInput(ctx.input, (code) => escBlocks(code)), { active: () => phase === 'play', crouching: () => view.crouch });
  const dsSound = createDsSound();
  let auHeartT = 0;
  let auStepT = 0;
  let auLast = null;
  const auCatPrev = new WeakMap();
  let world = null;
  let rig = null;
  const anim = createAnimState();
  let spot = null;
  let fill = null;
  let doorPivot = null;
  const flames = [];
  let panel = null;
  let hud = null;
  let run = createRun({ seed: 1 });
  let phase = 'idle'; // idle | intro | play | result
  let t = 0;
  let guard = 0;
  let leaving = false;
  let gameId = DS_GAME_ID;
  let carry = {};
  let carryLine = null;
  let yaw = Math.PI / 2;
  let pitch = 0.1;
  let locked = false;
  let listening = false;
  let fxRng = makeRng(1);
  let flickT = 0;
  let flickOn = true;
  // ---- 謎解き ----
  const fuseMeshes = {};
  const batteryMeshes = {};
  const clueTex = {};
  const lamps = [];
  const batteriesTaken = new Set();
  let safePivot = null;
  let panelLampMat = null;
  let interactables = [];
  let focus = null;
  let safeUi = false;
  let safeEntry = '';
  let memoOpen = false;
  let msgT = 0;
  let escGuard = 0;
  let powerT = 0;
  // ---- 敵と戦い ----
  let enemyGroup = null;
  let enemyGeo = null;
  let enemies = [];
  let catRng = makeRng(1);
  let soulDrop = null;
  let weapon = null;
  let attackCd = 0;
  let swingT = -1;
  let attackQueued = false;
  let rollT = 0;
  let rollDir = { x: 0, z: 1 };
  let deadT = 0;
  // ---- ボス「巨大な手」とクリア ----
  let boss = null;
  let bossRng = makeRng(1);
  let hand = null;
  let bossSeen = false;
  let bossFlash = 0;
  let bossBar = null;
  let resultPanel = null;
  let cleared = false;
  // ---- 怖い絵と驚かせ ----
  const frames = [];
  let creepFrame = null;
  let powerFrame = null;
  let creep = createCreep();
  let pendingScare = null;
  let lastScareAt = -Infinity;
  let lampsOut = 0;
  let basementT = 0;
  // ---- そのほかの状態 ----
  let hitDone = true;
  let hurtT = 0;
  let deathAt = null;
  let lastMoving = false;
  let bossReachTotal = 1.8;
  let scareEl = null;
  let scareImg = null;
  let scareT = 0;
  let tickT = 1;
  let enemyMats = null;

  const isDown = (...c) => !!input && typeof input.isDown === 'function' && !!input.isDown(...c);
  const pressed = (...c) => !!input && typeof input.wasPressed === 'function' && !!input.wasPressed(...c);
  const paused = () => typeof ctx.isPaused === 'function' && !!ctx.isPaused();
  const canvasEl = () => {
    try {
      return ctx.canvas || null;
    } catch {
      return null;
    }
  };
  const basementOpen = () => !BASEMENT_LOCK_ENABLED || !!(run && run.basementOpen);

  // ---- 一人称の視点（目の高さのカメラと、カメラに付けた懐中電灯） ----
  let fpvPrev = null;
  const rawDown = (...c) => !!ctx.input && typeof ctx.input.isDown === 'function' && !!ctx.input.isDown(...c);
  hooks.pre = () => {
    view.crouch = phase === 'play' && !safeUi && deadT <= 0 && !paused() && rawDown(...CROUCH_KEYS);
    WALK_SPEED = moveSpeed({ crouch: view.crouch });
    dsSound.setStance({ crouch: view.crouch, running: !!(run && run.running) });
    escPre();
    fpvPrev = run ? { x: run.pos.x, z: run.pos.z } : null;
  };
  hooks.post = (dt) => {
    if (!world || !run) return;
    const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
    let moved = 0;
    if (fpvPrev) {
      moved = Math.hypot(run.pos.x - fpvPrev.x, run.pos.z - fpvPrev.z);
      if (moved > 1) moved = 0; // ろうそくへ戻ったときなどの瞬間移動は揺らさない
    }
    stepView(view, {
      moved, dt: d, crouch: view.crouch, dead: deadT > 0, running: !!run.running,
    });
    if (rig) rig.root.visible = false;
    const eyeY = view.eye + view.bob;
    const dir = lookDir(yaw, pitch);
    camera.position.set(run.pos.x, eyeY, run.pos.z);
    camera.lookAt(run.pos.x + dir.x, eyeY + dir.y, run.pos.z + dir.z);
    if (spot) {
      const fp = flashlightPose({ x: run.pos.x, y: eyeY, z: run.pos.z }, yaw, pitch);
      spot.position.set(fp.pos.x, fp.pos.y, fp.pos.z);
      spot.target.position.set(fp.target.x, fp.target.y, fp.target.z);
    }
    dressEnemies(d);
    escStep(d, moved);
  };

  // ---- 見た目（画面の解像度・懐中電灯の影・敵の姿） ----
  hooks.visualOn = () => {
    try {
      if (typeof ctx.setFullResolution === 'function') ctx.setFullResolution(true);
    } catch {
      // 解像度を変えられなくても遊べる
    }
    const r = ctx.renderer;
    if (r && r.shadowMap) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  };
  hooks.visualOff = () => {
    escCleanup();
    try {
      if (typeof ctx.setFullResolution === 'function') ctx.setFullResolution(false);
    } catch {
      // 握りつぶす
    }
    const r = ctx.renderer;
    if (r && r.shadowMap) r.shadowMap.enabled = false;
  };

  // ---- 歩き回る敵1体・隠れ場所・捕まったとき（動きと判定は ds-stalker-ai.js、隠れ場所は ds-hide.js） ----
  const ESC_CAUGHT_TIME = 2.8;
  let escRun = null;
  let escStalker = null;
  let escRng = makeRng(1);
  let escModel = null;
  let escAnim = {
    phase: 0, k: 0, t: 0, stepAcc: 0, px: null, pz: null,
  };
  let escHide = createHideState();
  let escCaughtT = 0;
  let escEBlock = false;
  let escPromptShown = false;
  let escHideEl = null;
  let escCaughtEl = null;
  let escPropsBuilt = false;
  let escHudTrimmed = false;

  /** 隠れている間・捕まった直後は、場面へキーを渡さない */
  function escBlocks(code) {
    if (escCaughtT > 0) return true;
    if (escHide.spotId) return !['KeyF', 'ArrowLeft', 'ArrowRight'].includes(code);
    return escEBlock && code === 'KeyE';
  }

  function escWorldOpts() {
    return { power: !!(run && run.power), basementOpen: basementOpen(), level: run ? run.level : 2 };
  }

  function escPlayerObs(moving) {
    return {
      x: run.pos.x,
      z: run.pos.z,
      yaw,
      lightOn: isLightOn(run),
      lightScale: run.lightScale,
      moving: !!moving && !escHide.spotId,
      running: !!run.running && !!moving,
      crouch: !!view.crouch,
      hidden: !!escHide.spotId,
      seenHiding: !!escHide.seen,
      noiseScale: run.noiseScale,
    };
  }

  /** 新しいプレイが始まったら、敵と隠れ場所を最初に戻す */
  function escSync() {
    if (!run || escRun === run) return;
    escRun = run;
    escStalker = createStalker({ seed: run.seed, level: run.level });
    escRng = makeRng(((Number(run.seed) >>> 0) ^ 0x5f3759df) >>> 0);
    escHide = createHideState();
    escCaughtT = 0;
    escAnim = {
      phase: 0, k: 0, t: 0, stepAcc: 0, px: null, pz: null,
    };
    escShowCaught(false);
    escShowHide(null);
  }

  function escPre() {
    escSync();
    // 攻撃・回避・力尽きる仕組みは無い。古い処理の分岐に入らないよう、毎フレーム止めておく
    attackQueued = false;
    swingT = -1;
    rollT = 0;
    deadT = 0;
    if (!run || phase !== 'play' || leaving || paused() || safeUi || escCaughtT > 0) return;
    const raw = ctx.input;
    if (!raw || typeof raw.wasPressed !== 'function' || !raw.wasPressed('KeyE')) return;
    if (escHide.spotId) {
      escLeaveHide();
      escEBlock = true;
      return;
    }
    if (focus) return;
    const hs = nearestHideSpot(run.pos, HIDE_RANGE, { basementOpen: basementOpen() });
    if (hs) {
      escGoHide(hs);
      escEBlock = true;
    }
  }

  function escGoHide(hs) {
    const seen = !!escStalker && seesPlayer(escStalker, escPlayerObs(false), escWorldOpts());
    if (!enterHide(escHide, hs, seen)) return;
    run.pos = { x: hs.inside.x, z: hs.inside.z };
    yaw = hs.peekYaw;
    pitch = 0.04;
    memoOpen = false;
    dsSound.play('door', { small: true });
    escShowHide(hs);
  }

  function escLeaveHide() {
    const hs = hideSpotById(escHide.spotId);
    exitHide(escHide);
    if (hs) run.pos = { x: hs.x, z: hs.z };
    dsSound.play('door', { small: true });
    escShowHide(null);
  }

  function escStep(d, moved) {
    escSync();
    escEBlock = false;
    if (!world || !run || !escStalker) return;
    escTrimHud();
    escEnsureModel();
    // 地下室の扉を開けて出口に着いたら外へ出る（ds-state の tryExit。ボスはいない）
    if (phase === 'play' && escCaughtT <= 0 && !leaving && !cleared && (run.exited || tryExit(run))) {
      escFinishClear();
      return;
    }
    if (phase === 'play') {
      if (escCaughtT > 0) {
        escCaughtT -= d;
        if (escCaughtT <= 0) escFinishCapture();
      } else {
        const speed = d > 0 ? moved / d : 0;
        const res = stepStalker(escStalker, d, { player: escPlayerObs(speed > 0.3), ...escWorldOpts() }, escRng);
        if (res.spotted) escOnSpotted();
        if (res.caught) escStartCapture();
      }
    }
    if (escHide.spotId && escCaughtT <= 0) escPlaceHidden();
    dsHeartSource = phase === 'play' && escCaughtT <= 0 ? escStalker : null;
    escPoseModel(d);
    escPrompt();
  }

  /** 隠れている間は、隙間の位置から外を見る */
  function escPlaceHidden() {
    const hs = hideSpotById(escHide.spotId);
    if (!hs) return;
    yaw = clampPeekYaw(hs, yaw);
    pitch = Math.max(-0.35, Math.min(0.35, pitch));
    const dir = lookDir(yaw, pitch);
    camera.position.set(hs.inside.x, hs.eye, hs.inside.z);
    camera.lookAt(hs.inside.x + dir.x, hs.eye + dir.y, hs.inside.z + dir.z);
    if (spot) {
      const fp = flashlightPose({ x: hs.inside.x, y: hs.eye, z: hs.inside.z }, yaw, pitch);
      spot.position.set(fp.pos.x, fp.pos.y, fp.pos.z);
      spot.target.position.set(fp.target.x, fp.target.y, fp.target.z);
    }
  }

  /** 屋敷の外へ出た：結果（時間・捕まった回数）と、初めてなら「古いランタン」 */
  function escFinishClear() {
    phase = 'result';
    memoOpen = false;
    safeUi = false;
    escShowHide(null);
    dsHeartSource = null;
    try {
      if (typeof document !== 'undefined' && document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    } catch {
      // 握りつぶす
    }
    locked = false;
    dsSound.play('door');
    let reward = null;
    try {
      const items = typeof ctx.getItems === 'function' ? ctx.getItems() : null;
      const owned = items && Array.isArray(items.owned) ? items.owned : [];
      if (lanternReward(owned)) {
        const got = ctx.grantGameItem(DS_GAME_ID);
        if (got && got.item && got.isNew) reward = `アイテム獲得：${got.item.name || LANTERN.name}`;
      }
    } catch {
      reward = null;
    }
    if (!resultPanel) resultPanel = createResultPanel();
    resultPanel.show(resultView(buildResult(run), [carryLine, reward]), (id) => {
      if (id === 'again' && typeof hooks.restart === 'function') {
        hooks.restart();
        return;
      }
      if (leaving) return;
      leaving = true;
      let ok = false;
      try {
        ok = !!ctx.returnToGallery(gameId);
      } catch {
        ok = false;
      }
      if (!ok) leaving = false;
    });
  }

  function escOnSpotted() {
    const pan = panFor({ x: run.pos.x, z: run.pos.z, yaw }, escStalker);
    dsSound.play('bgm', { kind: 'thump', pan });
  }

  /** 必勝ハチマキで1回だけ振りほどく。敵は遠くへ離れ、しばらく捕まらない */
  function escBreakFree() {
    if (escHide.spotId) escLeaveHide();
    dsSound.play('hit', { hurt: true });
    respawnStalker(escStalker, run.pos, escRng, escWorldOpts());
    try {
      if (ctx.ui && typeof ctx.ui.toast === 'function') ctx.ui.toast('ハチマキがちぎれた。……振りほどいて、逃げた', 2.5);
    } catch {
      // 握りつぶす
    }
  }

  function escStartCapture() {
    if (!canBeCaught(run)) return;
    if (tryBreakFree(run)) {
      escBreakFree();
      return;
    }
    escCaughtT = ESC_CAUGHT_TIME;
    if (escHide.spotId) {
      exitHide(escHide);
      escShowHide(null);
    }
    if (safeUi) {
      try {
        handleSafeKey('Escape');
      } catch {
        // 握りつぶす
      }
      safeUi = false;
    }
    memoOpen = false;
    dsSound.play('hit', { hurt: true });
    escShowCaught(true);
  }

  function escFinishCapture() {
    escCaughtT = 0;
    captureRun(run);
    respawnStalker(escStalker, run.pos, escRng, escWorldOpts());
    yaw = Math.PI / 2;
    pitch = 0.1;
    escShowCaught(false);
  }

  /** 戦いの名残（体力・ソウル・燭台・天井の手）は見せない */
  function escTrimHud() {
    if (hand && hand.root) hand.root.visible = false;
    if (soulDrop) soulDrop.visible = false;
    if (weapon) weapon.visible = false;
    if (bossBar && bossBar.style) bossBar.style.display = 'none';
    if (escHudTrimmed || typeof document === 'undefined') return;
    const root = document.getElementById('ds-root');
    if (!root) return;
    for (const sel of ['.ds-hp', '.ds-soul']) {
      const el = root.querySelector(sel);
      if (el) el.style.display = 'none';
    }
    escHudTrimmed = true;
  }

  function escEnsureModel() {
    if (!escModel) {
      escModel = buildStalkerModel(THREE, ensureStalkerMats());
      world.add(escModel.root);
    } else if (!attached(escModel.root)) {
      world.add(escModel.root);
    }
    escBuildProps();
  }

  function escPoseModel(d) {
    if (!escModel || !escStalker) return;
    const a = escAnim;
    const dt = d > 0 ? d : 0;
    let step = 0;
    if (a.px !== null) {
      step = Math.hypot(escStalker.x - a.px, escStalker.z - a.pz);
      if (step > 1) step = 0;
    }
    a.px = escStalker.x;
    a.pz = escStalker.z;
    a.phase += (step / STALKER_STRIDE) * Math.PI * 2;
    const sp = dt > 0 ? step / dt : 0;
    a.k += ((sp > 0.15 ? 1 : 0) - a.k) * Math.min(1, dt * 6);
    a.t += dt;
    const r = escModel.root;
    r.position.x = escStalker.x;
    r.position.z = escStalker.z;
    r.rotation.y = escStalker.yaw;
    r.visible = escCaughtT <= 0;
    poseStalker(escModel, stalkerPose({
      phase: a.phase, k: a.k, t: a.t, seed: 3,
    }), 0);
    // 引きずる足音（近いときだけ）
    a.stepAcc += step;
    if (a.stepAcc >= STALKER_STRIDE) {
      a.stepAcc = 0;
      const far = Math.hypot(escStalker.x - run.pos.x, escStalker.z - run.pos.z);
      if (far < 8 && phase === 'play') {
        const pan = panFor({ x: run.pos.x, z: run.pos.z, yaw }, escStalker);
        dsSound.play('bgm', { kind: fxRng() < 0.25 ? 'creak' : 'thump', pan });
      }
    }
  }

  /** 隠れ場所の案内（E: 隠れる／E: 出る） */
  function escPrompt() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('ds-prompt');
    if (!el) return;
    let text = null;
    if (phase === 'play' && escCaughtT <= 0 && !safeUi && run) {
      if (escHide.spotId) text = 'E: 出る';
      else if (!focus) {
        const hs = nearestHideSpot(run.pos, HIDE_RANGE, { basementOpen: basementOpen() });
        if (hs) text = `E: 隠れる（${hs.name}）`;
      }
    }
    if (text) {
      if (el.textContent !== text) el.textContent = text;
      el.classList.remove('hidden');
      escPromptShown = true;
    } else if (escPromptShown) {
      escPromptShown = false;
      if (!focus) el.classList.add('hidden');
    }
  }

  function escShowHide(hs) {
    if (typeof document === 'undefined') return;
    if (!escHideEl) {
      escHideEl = document.createElement('div');
      escHideEl.id = 'ds-hide';
      Object.assign(escHideEl.style, {
        position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '2', display: 'none',
      });
    }
    const root = document.getElementById('ds-root') || document.body;
    if (escHideEl.parentNode !== root) root.insertBefore(escHideEl, root.firstChild);
    if (!hs) {
      escHideEl.style.display = 'none';
      return;
    }
    escHideEl.style.background = DS_HIDE_VIEW_CSS[hs.view] || DS_HIDE_VIEW_CSS.gap;
    escHideEl.style.display = 'block';
  }

  function escShowCaught(on) {
    if (typeof document === 'undefined' || !document.body) return;
    if (!escCaughtEl) {
      escCaughtEl = document.createElement('div');
      escCaughtEl.id = 'ds-caught';
      Object.assign(escCaughtEl.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        right: '0',
        bottom: '0',
        zIndex: '30',
        pointerEvents: 'none',
        display: 'none',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--p-dsSafeBg)',
        color: 'var(--p-dsDeath)',
      });
      const t1 = document.createElement('div');
      t1.className = 'ds-caught-title';
      t1.textContent = '捕まった';
      Object.assign(t1.style, { fontSize: '36px', letterSpacing: '0.5em' });
      const t2 = document.createElement('div');
      t2.className = 'ds-caught-sub';
      t2.textContent = '最後に休んだろうそくの前から、もう一度';
      Object.assign(t2.style, { fontSize: '15px', marginTop: '18px', color: 'var(--p-dsFaint)' });
      escCaughtEl.append(t1, t2);
    }
    if (escCaughtEl.parentNode !== document.body) document.body.appendChild(escCaughtEl);
    escCaughtEl.style.display = on ? 'flex' : 'none';
  }

  /** カーテンとコート掛け（隠れ場所の目印。部屋側だけ見える布） */
  function escBuildProps() {
    if (escPropsBuilt || !world) return;
    escPropsBuilt = true;
    const tex = makeRealTex(THREE, OBJECT_TEXTURES.fabric, 611, maxAniso(ctx));
    tex.repeat.set(1, 2);
    const clothMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    const rodMat = new THREE.MeshStandardMaterial({ color: DSC.dsBrass, roughness: 0.4, metalness: 0.8 });
    const drape = (w, h) => {
      const geo = new THREE.PlaneGeometry(w, h, 12, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
      geo.computeVertexNormals();
      return geo;
    };
    for (const hs of HIDE_SPOTS) {
      if (hs.kind !== 'curtain' && hs.kind !== 'coats') continue;
      const g = new THREE.Group();
      const fx = Math.sin(hs.peekYaw);
      const fz = Math.cos(hs.peekYaw);
      g.position.set(hs.inside.x + fx * 0.16, 0, hs.inside.z + fz * 0.16);
      g.rotation.y = hs.peekYaw;
      if (hs.kind === 'curtain') {
        const m = new THREE.Mesh(drape(1.5, 2.6), clothMat);
        m.position.y = 1.35;
        m.castShadow = true;
        m.receiveShadow = true;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 6), rodMat);
        rod.rotation.z = Math.PI / 2;
        rod.position.y = 2.68;
        g.add(m, rod);
      } else {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), rodMat);
        bar.position.set(0, 1.85, -0.12);
        g.add(bar);
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(drape(0.5, 1.25), clothMat);
          m.position.set(-0.4 + i * 0.4, 1.2, 0.02 * i);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
        }
      }
      world.add(g);
    }
  }

  function escCleanup() {
    dsHeartSource = null;
    if (escHide.spotId && run) {
      const hs = hideSpotById(escHide.spotId);
      exitHide(escHide);
      if (hs) run.pos = { x: hs.x, z: hs.z };
    }
    escCaughtT = 0;
    if (escHideEl && escHideEl.parentNode) escHideEl.parentNode.removeChild(escHideEl);
    if (escCaughtEl && escCaughtEl.parentNode) escCaughtEl.parentNode.removeChild(escCaughtEl);
    escPromptShown = false;
    escHudTrimmed = false;
  }

  let hideMat = null;
  let stalkerMats = null;
  const dressedList = [];
  const hiddenMeshes = [];
  const furMeshes = [];
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpL = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const ensureStalkerMats = () => {
    if (!stalkerMats) stalkerMats = makeStalkerMats(THREE, maxAniso(ctx));
    return stalkerMats;
  };
  const attached = (o) => {
    let p = o;
    while (p.parent) p = p.parent;
    return p === world;
  };

  /** 古い敵の部品を隠し、背の高い人影を着せる。猫は暗い毛並みにする */
  function dressEnemies(d) {
    if (!world || !enemyGroup || !enemyGeo) return;
    const dt = Number.isFinite(d) && d > 0 ? d : 0;
    const hideGeos = [enemyGeo.torso, enemyGeo.head, enemyGeo.arm, enemyGeo.eye, enemyGeo.catEye];
    const furGeos = [enemyGeo.catBody, enemyGeo.catHead, enemyGeo.ear, enemyGeo.tail];
    const torsos = [];
    enemyGroup.traverse((o) => {
      if (!o.isMesh || o.userData.dsDressed) return;
      if (hideGeos.includes(o.geometry)) {
        o.userData.dsDressed = true;
        hiddenMeshes.push(o);
        if (o.geometry === enemyGeo.torso) torsos.push(o);
      } else if (furGeos.includes(o.geometry)) {
        o.userData.dsDressed = true;
        furMeshes.push(o);
      }
    });
    if (!hideMat) hideMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (let i = hiddenMeshes.length - 1; i >= 0; i--) {
      const o = hiddenMeshes[i];
      if (!attached(o)) {
        hiddenMeshes.splice(i, 1);
        continue;
      }
      if (o.material !== hideMat) o.material = hideMat;
      o.castShadow = false;
    }
    if (furMeshes.length) {
      const fur = ensureStalkerMats().fur;
      for (let i = furMeshes.length - 1; i >= 0; i--) {
        const o = furMeshes[i];
        if (!attached(o)) {
          furMeshes.splice(i, 1);
          continue;
        }
        if (o.material !== fur) o.material = fur;
        o.castShadow = true;
      }
    }
    for (const torso of torsos) {
      const holder = torso.parent && torso.parent !== enemyGroup ? torso.parent : torso;
      if (dressedList.some((e) => e.holder === holder)) continue;
      const model = buildStalkerModel(THREE, ensureStalkerMats());
      holder.add(model.root);
      dressedList.push({
        holder,
        torso,
        model,
        initScale: Math.abs(torso.scale.y) || 1,
        phase: fxRng() * Math.PI * 2,
        k: 0,
        t: fxRng() * 8,
        seed: dressedList.length * 5 + 1,
        prev: null,
        yaw: null,
      });
    }
    for (let i = dressedList.length - 1; i >= 0; i--) {
      const e = dressedList[i];
      if (!attached(e.holder)) {
        dressedList.splice(i, 1);
        continue;
      }
      e.holder.updateWorldMatrix(true, false);
      e.holder.getWorldPosition(tmpV);
      e.holder.getWorldScale(tmpS);
      const wx = tmpV.x;
      const wz = tmpV.z;
      tmpL.set(wx, 0, wz);
      e.holder.worldToLocal(tmpL);
      e.model.root.position.copy(tmpL);
      const shrink = Math.max(0, Math.min(1.5, Math.abs(e.torso.scale.y) / e.initScale));
      e.model.root.scale.set(shrink / (tmpS.x || 1), shrink / (tmpS.y || 1), shrink / (tmpS.z || 1));
      e.model.root.visible = e.torso.visible !== false && shrink > 0.01;
      let step = 0;
      let dx = 0;
      let dz = 0;
      if (e.prev) {
        dx = wx - e.prev.x;
        dz = wz - e.prev.z;
        step = Math.hypot(dx, dz);
        if (step > 1) step = 0;
      }
      e.prev = { x: wx, z: wz };
      e.phase += (step / STALKER_STRIDE) * Math.PI * 2;
      const speed = dt > 0 ? step / dt : 0;
      e.k += ((speed > 0.15 ? 1 : 0) - e.k) * Math.min(1, dt * 6);
      e.t += dt;
      let target = e.yaw === null ? 0 : e.yaw;
      if (step > 1e-4) target = Math.atan2(dx, dz);
      else if (run) target = Math.atan2(run.pos.x - wx, run.pos.z - wz);
      e.yaw = e.yaw === null ? target : angLerp(e.yaw, target, Math.min(1, dt * (step > 1e-4 ? 3 : 0.8)));
      e.holder.getWorldQuaternion(tmpQ);
      tmpE.setFromQuaternion(tmpQ, 'YXZ');
      e.model.root.rotation.y = e.yaw - tmpE.y;
      poseStalker(e.model, stalkerPose({
        phase: e.phase, k: e.k, t: e.t, seed: e.seed,
      }), tmpL.y);
    }
  }

  // ---- 入力（ポインタの固定とマウスの向き） ----
  function requestLock() {
    const c = canvasEl();
    if (!c || typeof c.requestPointerLock !== 'function') return;
    try {
      const p = c.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // 固定できなくてもドラッグと矢印キーで向きを変えられる
    }
  }
  function releaseLock() {
    try {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    } catch {
      // 握りつぶす
    }
  }
  const onMouseDown = (e) => {
    if (phase !== 'play' || leaving || paused() || safeUi || e.button !== 0) return;
    if (!locked) requestLock();
  };
  const onMouseMove = (e) => {
    if (phase !== 'play' || !locked || paused()) return;
    yaw -= (Number(e.movementX) || 0) * MOUSE_YAW;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + (Number(e.movementY) || 0) * MOUSE_PITCH));
  };
  const onLockChange = () => {
    const c = canvasEl();
    locked = !!c && document.pointerLockElement === c;
    // 固定中の Esc はブラウザが固定を外すのに使うので、外れたらポーズを開く
    if (!locked && phase === 'play' && !leaving && !paused() && !safeUi && typeof ctx.requestPause === 'function') {
      ctx.requestPause();
    }
  };
  // 金庫の入力とメモ帳（Tab）。ゲームの入力より先に受けて、ほかへ渡さない
  const onKeyDown = (e) => {
    if (phase !== 'play' || leaving) return;
    if (safeUi) {
      e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (e.repeat && e.code !== 'Backspace') return;
      handleSafeKey(e.code);
      return;
    }
    if (e.code === 'Tab') {
      e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (!e.repeat && !paused()) memoOpen = !memoOpen;
    }
  };
  function listen(on) {
    if (typeof window === 'undefined' || on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('pointerlockchange', onLockChange);
    } else {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerlockchange', onLockChange);
      dsSound.halt();
    }
  }

  // ---- 屋敷 ----
  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(DSC.dsVoid);
    world.fog = new THREE.Fog(DSC.dsVoid, 2.5, 11);
    world.add(new THREE.AmbientLight(DSC.dsAmbient, 0.035));
    // 床・壁・天井は質感のある模様（古い床板・色あせた壁紙・しみのある漆喰・ほこり）
    const aniso = maxAniso(ctx);
    const base = {};
    let texSeed = 77;
    for (const k of Object.keys(SURFACE_TEXTURES)) base[k] = makeRealTex(THREE, SURFACE_TEXTURES[k], texSeed++, aniso);
    const lambert = (kind, rx, ry) => {
      const key = base[kind] ? kind : 'plaster';
      const tx = base[key].clone();
      tx.repeat.set(rx, ry);
      tx.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: tx, roughness: SURFACE_TEXTURES[key].roughness, metalness: 0 });
    };
    const furnitureMats = makeFurnitureMats(THREE, aniso);

    // 床
    for (const r of ROOMS) {
      const w = r.x2 - r.x1;
      const d = r.z2 - r.z1;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lambert(r.material, w / 2, d / 2));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((r.x1 + r.x2) / 2, 0, (r.z1 + r.z2) / 2);
      floor.receiveShadow = true;
      world.add(floor);
    }
    // 天井
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 22), lambert('plaster', 12, 11));
    ceil.receiveShadow = true;
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, WALL_H, -1);
    world.add(ceil);
    // 壁と戸口の上の梁
    for (const [axis, fixed, a, b, style] of WALLS) {
      const gaps = doorGaps(axis, fixed);
      for (const [s1, s2] of spans(a, b, gaps)) {
        const len = s2 - s1;
        const geo = axis === 'h' ? new THREE.BoxGeometry(len, WALL_H, 0.2) : new THREE.BoxGeometry(0.2, WALL_H, len);
        const m = new THREE.Mesh(geo, lambert(style, len / 2, WALL_H / 2));
        if (axis === 'h') m.position.set((s1 + s2) / 2, WALL_H / 2, fixed);
        else m.position.set(fixed, WALL_H / 2, (s1 + s2) / 2);
        m.receiveShadow = true;
        m.castShadow = true;
        world.add(m);
      }
      for (const [g1, g2] of gaps) {
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(g2 - g1, 0.7, 0.2), lambert(style, 1, 0.3));
        lintel.position.set((g1 + g2) / 2, WALL_H - 0.35, fixed);
        world.add(lintel);
      }
    }
    // 家具（本物らしい大きさと形。ベッド・衣装だんす・本棚・机と椅子・柱時計・食器棚・流し・地下の棚と木箱）
    world.add(buildFurnitureSet(THREE, OBSTACLES, furnitureMats));
    // 配電盤（廊下の東の壁）
    const panelBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.5), new THREE.MeshLambertMaterial({ color: DSC.dsPanel }));
    panelBox.position.set(FUSE_PANEL.x + 0.88, 1.5, FUSE_PANEL.z);
    world.add(panelBox);
    // 地下室への扉（蝶番で回る）
    doorPivot = new THREE.Group();
    doorPivot.position.set(BASEMENT_DOOR.x - 1, 0, BASEMENT_DOOR.z);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 2.3, 0.08), new THREE.MeshLambertMaterial({ color: DSC.dsDoor }));
    door.position.set(1, 1.15, 0);
    doorPivot.add(door);
    world.add(doorPivot);
    // 外への扉（地下室の南の壁）
    const exitDoor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.08), new THREE.MeshLambertMaterial({ color: DSC.dsExitDoor }));
    exitDoor.position.set(EXIT_POS.x, 1.1, -11.88);
    world.add(exitDoor);
    // ろうそく（休憩所）
    for (const c of CANDLES) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.9, 6), new THREE.MeshLambertMaterial({ color: DSC.dsCandleStand }));
      stand.position.y = 0.45;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), new THREE.MeshLambertMaterial({ color: DSC.dsWax }));
      wax.position.y = 1.01;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: DSC.dsFlame }));
      flame.position.y = 1.16;
      flame.scale.y = 1.7;
      const light = new THREE.PointLight(DSC.dsCandleLight, 1.2, 4, 2);
      light.position.y = 1.2;
      g.add(stand, wax, flame, light);
      world.add(g);
      flames.push({
        flame, light, level: 1, target: 1, t: 0,
      });
    }
    // ---- 謎解きの物（ヒューズ・電池・手がかり・金庫・廊下の電球） ----
    const fuseBodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8);
    const fuseCapGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8);
    const fuseBodyMat = new THREE.MeshLambertMaterial({ color: DSC.dsFuse, emissive: DSC.dsFuseGlow });
    const fuseCapMat = new THREE.MeshLambertMaterial({ color: DSC.dsFuseCap, emissive: DSC.dsFuseCapGlow });
    for (const room of FUSE_ROOMS) {
      const sp = FUSE_SPOTS[room];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(fuseBodyGeo, fuseBodyMat));
      for (const k of [-1, 1]) {
        const cap = new THREE.Mesh(fuseCapGeo, fuseCapMat);
        cap.position.y = k * 0.1;
        g.add(cap);
      }
      g.rotation.z = Math.PI / 2;
      g.position.set(sp.x, sp.y + 0.05, sp.z);
      g.visible = false;
      world.add(g);
      fuseMeshes[room] = g;
    }
    const battGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
    const battMat = new THREE.MeshLambertMaterial({ color: DSC.dsBattery, emissive: DSC.dsBatteryGlow });
    for (const room of Object.keys(BATTERY_SPOTS)) {
      const sp = BATTERY_SPOTS[room];
      const m = new THREE.Mesh(battGeo, battMat);
      m.rotation.z = Math.PI / 2;
      m.position.set(sp.x, sp.y + 0.05, sp.z);
      m.visible = false;
      world.add(m);
      batteryMeshes[room] = m;
    }
    // 柱時計の文字盤
    const clk = OBSTACLES.find((o) => o.id === 'hall-clock');
    clueTex.clock = makeTex(THREE, 64, 64, () => {});
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshLambertMaterial({ map: clueTex.clock }));
    clockFace.position.set(clk ? (clk.x1 + clk.x2) / 2 : 4.3, 1.6, (clk ? clk.z2 : -1.6) + 0.02);
    world.add(clockFace);
    // 子ども部屋の西の壁の落書き
    clueTex.graffiti = makeTex(THREE, 64, 64, () => {});
    const graffiti = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshLambertMaterial({ map: clueTex.graffiti, transparent: true, alphaTest: 0.05 }),
    );
    graffiti.position.set(-2.88, 0.95, 6);
    graffiti.rotation.y = Math.PI / 2;
    world.add(graffiti);
    // 台所の北の壁のカレンダー
    clueTex.calendar = makeTex(THREE, 48, 64, () => {});
    const calendar = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshLambertMaterial({ map: clueTex.calendar }));
    calendar.position.set(9, 1.55, 9.88);
    calendar.rotation.y = Math.PI;
    world.add(calendar);
    // 金庫の扉（蝶番で開く）
    safePivot = new THREE.Group();
    safePivot.position.set(-11.39, 0, 5.55);
    const safeDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.9), new THREE.MeshLambertMaterial({ color: DSC.dsSafeDoor }));
    safeDoor.position.set(0.025, 0.45, 0.45);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), new THREE.MeshLambertMaterial({ color: DSC.dsDial }));
    dial.rotation.z = Math.PI / 2;
    dial.position.set(0.065, 0.5, 0.45);
    safePivot.add(safeDoor, dial);
    world.add(safePivot);
    // 配電盤の小さなランプ
    panelLampMat = new THREE.MeshBasicMaterial({ color: DSC.dsLampOff });
    const panelLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), panelLampMat);
    panelLamp.position.set(FUSE_PANEL.x + 0.8, 1.92, FUSE_PANEL.z);
    world.add(panelLamp);
    // 廊下の電球（電気が戻ると灯る）
    const bulbGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const cordGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4);
    const cordMat = new THREE.MeshBasicMaterial({ color: DSC.dsCord });
    for (const x of CORRIDOR_LAMPS) {
      const light = new THREE.PointLight(DSC.dsBulbLight, 0, 8, 2);
      light.position.set(x, 2.6, 0);
      const bulbMat = new THREE.MeshBasicMaterial({ color: DSC.dsBulbOff });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, 2.78, 0);
      const cord = new THREE.Mesh(cordGeo, cordMat);
      cord.position.set(x, 2.9, 0);
      world.add(light, bulb, cord);
      lamps.push({
        light, bulbMat, k: 0, t: 0,
      });
    }
    buildPaintings();
    interactables = makeInteractables();
    // 主人公と懐中電灯
    const scale = HERO_HEIGHT > 0 ? HERO_TARGET_H / HERO_HEIGHT : 1;
    rig = createHeroRig(THREE, mat, { scale });
    world.add(rig.root);
    spot = new THREE.SpotLight(DSC.dsFlashlight, DS_LIGHT.intensity, DS_LIGHT.range, DS_LIGHT.halfAngle, DS_LIGHT.penumbra, 1);
    // 懐中電灯で影が落ちる
    spot.castShadow = true;
    spot.shadow.mapSize.set(DS_SHADOW.mapSize, DS_SHADOW.mapSize);
    spot.shadow.bias = DS_SHADOW.bias;
    spot.shadow.normalBias = DS_SHADOW.normalBias;
    spot.shadow.camera.near = DS_SHADOW.near;
    spot.shadow.camera.far = DS_SHADOW.far;
    world.add(spot, spot.target);
    // 主人公がかろうじて見える程度の弱い明かり
    fill = new THREE.PointLight(DSC.dsFill, 0.35, 3, 2);
    world.add(fill);
    // 敵の入れ物と形
    enemyGroup = new THREE.Group();
    world.add(enemyGroup);
    enemyGeo = {
      torso: new THREE.CylinderGeometry(0.2, 0.34, 1.5, 8),
      head: new THREE.SphereGeometry(0.2, 8, 6),
      arm: new THREE.CylinderGeometry(0.05, 0.035, 1.1, 5),
      eye: new THREE.SphereGeometry(0.028, 6, 4),
      catBody: new THREE.SphereGeometry(0.22, 8, 6),
      catHead: new THREE.SphereGeometry(0.14, 8, 6),
      ear: new THREE.ConeGeometry(0.05, 0.12, 4),
      tail: new THREE.CylinderGeometry(0.025, 0.018, 0.5, 4),
      catEye: new THREE.SphereGeometry(0.022, 6, 4),
    };
    // 落としたソウル（光の粒）
    soulDrop = new THREE.Group();
    const soulMat = new THREE.MeshBasicMaterial({ color: DSC.dsSoul, fog: false });
    const soulGeo = new THREE.SphereGeometry(0.035, 6, 4);
    for (let i = 0; i < 7; i++) soulDrop.add(new THREE.Mesh(soulGeo, soulMat));
    const soulLight = new THREE.PointLight(DSC.dsSoulLight, 0.7, 3, 2);
    soulLight.position.y = 0.4;
    soulDrop.add(soulLight);
    soulDrop.visible = false;
    world.add(soulDrop);
    // 燭台（右手に持つ）
    weapon = new THREE.Group();
    weapon.position.set(-0.3, 0.85, 0.12);
    const brass = new THREE.MeshLambertMaterial({ color: DSC.dsBrass });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.55, 6), brass);
    shaft.position.y = 0.27;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.05, 8), brass);
    cup.position.y = 0.56;
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 6), new THREE.MeshLambertMaterial({ color: DSC.dsStub }));
    stub.position.y = 0.63;
    weapon.add(shaft, cup, stub);
    weapon.rotation.x = -0.35;
    rig.root.add(weapon);
    hand = buildHand();
    world.add(hand.root);
  }

  // ---- 重ね表示 ----
  function mountHud() {
    if (!hud) {
      const root = document.createElement('div');
      root.id = 'ds-root';
      root.innerHTML = '<div id="ds-vignette"></div>'
        + '<div id="ds-vitals"><div class="ds-hp"></div><div class="ds-bar ds-stamina"><i></i></div><div id="ds-items"></div>'
        + '<div class="ds-soul"></div></div>'
        + '<div id="ds-hurt">'
        + '</div>'
        + '<div id="ds-death">'
        + ''
        + '<div class="ds-death-title">力尽きた</div>'
        + '<div class="ds-death-sub"></div></div>'
        + '<div id="ds-battery"><span class="ds-batt-label">電池</span><div class="ds-batt"><i></i></div><span class="ds-batt-num"></span></div>'
        + '<div id="ds-lockhint" class="hidden">クリックで視点を固定</div>'
        + '<div id="ds-prompt" class="hidden"></div>'
        + '<div id="ds-msg"></div>'
        + '<div id="ds-whisper"></div>'
        + '<div id="ds-memo" class="hidden"><div class="ds-memo-title">メモ帳</div><ul class="ds-memo-list"></ul><div class="ds-memo-note">Tab: 閉じる</div></div>'
        + '<div id="ds-safe" class="hidden"><div class="ds-safe-title">金庫</div>'
        + '<div class="ds-safe-digits"><span></span><span></span><span></span><span></span></div>'
        + '<div class="ds-safe-note">数字: 入力　Backspace: 消す　Enter: ダイヤルを回す　Esc: やめる</div></div>';
      hud = {
        root,
        hp: root.querySelector('.ds-hp'),
        stamina: root.querySelector('.ds-stamina i'),
        battery: root.querySelector('#ds-battery'),
        battFill: root.querySelector('.ds-batt i'),
        battNum: root.querySelector('.ds-batt-num'),
        lock: root.querySelector('#ds-lockhint'),
        items: root.querySelector('#ds-items'),
        prompt: root.querySelector('#ds-prompt'),
        msg: root.querySelector('#ds-msg'),
        whisper: root.querySelector('#ds-whisper'),
        memo: root.querySelector('#ds-memo'),
        memoList: root.querySelector('.ds-memo-list'),
        safe: root.querySelector('#ds-safe'),
        digits: [...root.querySelectorAll('.ds-safe-digits span')],
        soul: root.querySelector('.ds-soul'),
        hurt: root.querySelector('#ds-hurt'),
        death: root.querySelector('#ds-death'),
        deathSub: root.querySelector('.ds-death-sub'),
        last: {},
      };
    }
    document.body.append(hud.root);
    hud.root.classList.remove('hidden');
    hud.last = {};
    hud.msg.classList.remove('ds-show');
    hud.whisper.classList.remove('ds-show');
    hud.safe.classList.toggle('hidden', !safeUi);
    msgT = 0;
    hud.death.style.opacity = deadT > 0 ? '1' : '0';
    hud.hurt.style.opacity = '0';
  }

  function setIf(key, value, fn) {
    if (hud.last[key] === value) return;
    hud.last[key] = value;
    fn(value);
  }

  function renderHud() {
    if (!hud || !run) return;
    const hp = Math.max(0, Math.min(run.maxHp, run.hp));
    setIf('hp', `${'●'.repeat(hp)}${'○'.repeat(Math.max(0, run.maxHp - hp))}`, (v) => { hud.hp.textContent = v; });
    setIf('st', Math.round((run.stamina / run.staminaMax) * 100), (v) => { hud.stamina.style.width = `${v}%`; });
    const b = Math.max(0, Math.min(100, run.battery));
    setIf('bt', Math.ceil(b), (v) => {
      hud.battFill.style.height = `${v}%`;
      hud.battNum.textContent = `${v}%`;
    });
    setIf('low', b < 20 ? (b <= 0 ? 'empty' : 'low') : '', (v) => {
      hud.battery.classList.toggle('ds-low', v === 'low');
      hud.battery.classList.toggle('ds-empty', v === 'empty');
    });
    setIf('lock', phase === 'play' && !locked && !safeUi, (v) => { hud.lock.classList.toggle('hidden', !v); });
    const items = [];
    if (run.fusesHeld > 0) items.push(`ヒューズ ×${run.fusesHeld}`);
    if (!run.power && run.fusesInserted > 0) items.push(`配電盤 ${run.fusesInserted}/3`);
    if (run.hasKey && !run.basementOpen) items.push('古い鍵');
    setIf('items', items.join('　'), (v) => { hud.items.textContent = v; });
    setIf('soul', run.soul, (v) => { hud.soul.textContent = `ソウル ${v}`; });
    setIf('prompt', phase === 'play' && focus && !safeUi ? focus.label : '', (v) => {
      hud.prompt.textContent = v ? `E　${v}` : '';
      hud.prompt.classList.toggle('hidden', !v);
    });
    setIf('memo', `${memoOpen ? 1 : 0}:${run.memo.length}:${run.seed}`, () => renderMemo());
    setIf('safe', safeUi ? `open:${safeEntry}` : '', () => renderSafe());
  }

  function renderMemo() {
    if (!hud || !run) return;
    hud.memo.classList.toggle('hidden', !memoOpen);
    const list = run.memo.map((m) => {
      const li = document.createElement('li');
      const where = document.createElement('span');
      where.className = 'ds-memo-where';
      where.textContent = ROOM_LABELS[m.room] || '持ち物';
      const p = document.createElement('div');
      p.textContent = m.text;
      li.append(where, p);
      return li;
    });
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'ds-memo-empty';
      li.textContent = 'まだ何も書き留めていない。';
      list.push(li);
    }
    hud.memoList.replaceChildren(...list);
  }

  function renderSafe() {
    if (!hud) return;
    hud.digits.forEach((el, i) => { el.textContent = safeEntry[i] || '_'; });
  }

  // ---- 謎解きの操作 ----
  function showMsg(text, sec = 4) {
    if (!hud) return;
    hud.msg.textContent = text;
    hud.msg.classList.add('ds-show');
    msgT = sec;
  }

  function showWhisper(text) {
    if (!hud) return;
    hud.whisper.textContent = text;
    hud.whisper.classList.remove('ds-show');
    void hud.whisper.offsetWidth;
    hud.whisper.classList.add('ds-show');
  }

  function setBulb(l, k) {
    l.bulbMat.color.setRGB(0.06 + 0.94 * k, 0.05 + 0.8 * k, 0.04 + 0.55 * k);
  }

  function resetPuzzle() {
    batteriesTaken.clear();
    focus = null;
    powerT = 0;
    resetFrames();
    if (!world || !run) return;
    const p = run.puzzle;
    for (const room of FUSE_ROOMS) if (fuseMeshes[room]) fuseMeshes[room].visible = p.fuseRooms.includes(room);
    for (const room of Object.keys(BATTERY_SPOTS)) {
      if (batteryMeshes[room]) batteryMeshes[room].visible = p.batteryRooms.includes(room);
    }
    redrawTex(clueTex.clock, (g, w, h) => drawClock(g, w, h, p.clues.clock.hour, p.clues.clock.minute));
    redrawTex(clueTex.graffiti, (g, w, h) => drawGraffiti(g, w, h, p.clues.graffiti.count));
    redrawTex(clueTex.calendar, (g, w, h) => drawCalendar(g, w, h, p.clues.calendar.day));
    for (const l of lamps) {
      l.k = 0;
      l.t = 0;
      l.light.intensity = 0;
      setBulb(l, 0);
    }
    if (panelLampMat) panelLampMat.color.set(DSC.dsLampOff);
    if (safePivot) safePivot.rotation.y = 0;
  }

  function makeInteractables() {
    const list = [];
    for (const room of FUSE_ROOMS) {
      const sp = FUSE_SPOTS[room];
      list.push({
        label: 'ヒューズを拾う',
        room,
        x: sp.x,
        z: sp.z,
        active: () => run.puzzle.fuseRooms.includes(room) && !run.fuseTaken.includes(room),
        use: () => takeFuse(room),
      });
    }
    for (const room of Object.keys(BATTERY_SPOTS)) {
      const sp = BATTERY_SPOTS[room];
      list.push({
        label: '電池を拾う',
        room,
        x: sp.x,
        z: sp.z,
        active: () => run.puzzle.batteryRooms.includes(room) && !batteriesTaken.has(room),
        use: () => takeBattery(room),
      });
    }
    for (const [source, label] of [['clock', '柱時計を調べる'], ['graffiti', '落書きを調べる'], ['calendar', 'カレンダーを調べる']]) {
      const sp = CLUE_SPOTS[source];
      list.push({
        label, room: CLUE_ROOMS[source], x: sp.x, z: sp.z, active: () => true, use: () => readClue(source),
      });
    }
    list.push({
      label: '配電盤を開ける', room: 'corridor', x: FUSE_PANEL.x, z: FUSE_PANEL.z, active: () => true, use: usePanel,
    });
    list.push({
      label: '金庫を開ける', room: 'study', x: SAFE_POS.x, z: SAFE_POS.z, active: () => true, use: openSafe,
    });
    list.push({
      label: '地下室の扉を開ける',
      room: 'corridor',
      x: BASEMENT_DOOR.x,
      z: BASEMENT_DOOR.z + 0.4,
      active: () => !run.basementOpen,
      use: useDoor,
    });
    list.push({
      label: '外への扉を開ける',
      room: 'basement',
      x: EXIT_POS.x,
      z: EXIT_POS.z,
      active: () => run.basementOpen && !cleared,
      use: useExit,
    });
    for (const c of CANDLES) {
      list.push({
        label: 'ろうそくの火で休む',
        room: roomAt(c.x, c.z),
        x: c.x,
        z: c.z,
        active: () => true,
        use: () => restHere(c.id),
      });
    }
    return list;
  }

  function updateFocus() {
    focus = null;
    if (phase !== 'play' || safeUi || !run || deadT > 0) return;
    const here = roomAt(run.pos.x, run.pos.z);
    let best = FOCUS_RANGE;
    for (const it of interactables) {
      if (it.room !== here || !it.active()) continue;
      const dd = distance(run.pos, it);
      if (dd <= best) {
        best = dd;
        focus = it;
      }
    }
  }

  function takeFuse(room) {
    if (!pickupFuse(run, room)) return;
    if (fuseMeshes[room]) fuseMeshes[room].visible = false;
    showMsg(`古いヒューズを拾った。（${run.fusesHeld}本 持っている）\n廊下の配電盤に合いそうだ。`, 4);
  }

  function takeBattery(room) {
    if (batteriesTaken.has(room)) return;
    batteriesTaken.add(room);
    pickupBattery(run);
    dsSound.play('click');
    if (batteryMeshes[room]) batteryMeshes[room].visible = false;
    showMsg('懐中電灯の電池を拾った。', 3);
  }

  function readClue(source) {
    const clue = run.puzzle.clues[source];
    if (!clue) return;
    const isNew = discoverClue(run, source);
    showMsg(isNew ? `${clue.text}\n（メモ帳に書き留めた　Tab）` : clue.text, 7);
  }

  function usePanel() {
    if (run.power) {
      showMsg('配電盤のヒューズは、三本とも収まっている。', 3);
      return;
    }
    if (run.fusesHeld <= 0) {
      showMsg(`配電盤のヒューズが${fusesMissing(run)}本 抜けている。屋敷のどこかにあるはずだ。`, 4);
      return;
    }
    const events = insertFuses(run);
    dsSound.play('click', { heavy: true });
    if (!events.length) {
      showMsg(`ヒューズを差し込んだ。あと${fusesMissing(run)}本 足りない。`, 4);
      return;
    }
    for (const ev of events) {
      if (ev.type !== 'power-restored') continue;
      powerT = 0;
      for (const l of lamps) l.t = fxRng() * 0.3;
      if (panelLampMat) panelLampMat.color.set(DSC.dsLampOn);
      showMsg('最後のヒューズを差し込むと、廊下の電球がひとつずつ灯った。', 4);
      showWhisper(ev.text);
      revealPowerPainting(ev.painting);
    }
  }

  function openSafe() {
    if (run.safeOpen) {
      showMsg('金庫の中は、もう空っぽだ。', 3);
      return;
    }
    safeUi = true;
    safeEntry = '';
    memoOpen = true;
    focus = null;
    if (hud) {
      hud.safe.classList.remove('hidden', 'ds-wrong');
      renderSafe();
    }
    releaseLock();
  }

  function closeSafe() {
    safeUi = false;
    safeEntry = '';
    if (hud) hud.safe.classList.add('hidden');
  }

  function handleSafeKey(code) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
    if (m) {
      if (safeEntry.length < 4) safeEntry += m[1];
      return;
    }
    if (code === 'Backspace') {
      safeEntry = safeEntry.slice(0, -1);
      return;
    }
    if (code === 'Escape') {
      closeSafe();
      escGuard = 0.3;
      return;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && safeEntry.length === 4) {
      const r = submitCode(run, safeEntry);
      if (r === 'ok' || r === 'already') {
        dsSound.play('door', { small: true });
        closeSafe();
        showMsg('カチリ、と小さな音がして金庫の扉が開いた。\n中に古い鍵が入っていた。', 5);
      } else {
        safeEntry = '';
        if (hud) {
          hud.safe.classList.remove('ds-wrong');
          void hud.safe.offsetWidth;
          hud.safe.classList.add('ds-wrong');
        }
        showMsg('……開かない。', 2);
        dsSound.play('click', { heavy: true });
      }
    }
  }

  function useDoor() {
    if (run.basementOpen) return;
    dsSound.play('door', { locked: !run.hasKey });
    if (openBasement(run)) showMsg('古い鍵を差し込んだ。重い扉が、きしみながら開いた。\n下から冷たい空気が上がってくる。', 5);
    else showMsg('地下室の扉には、鍵がかかっている。', 3);
  }

  function updatePuzzle(d) {
    updateFrames(d);
    escGuard = Math.max(0, escGuard - d);
    if (msgT > 0) {
      msgT -= d;
      if (msgT <= 0 && hud) hud.msg.classList.remove('ds-show');
    }
    if (!run) return;
    if (safePivot) {
      const target = run.safeOpen ? 1.4 : 0;
      safePivot.rotation.y += (target - safePivot.rotation.y) * Math.min(1, d * 2.5);
    }
    if (!run.power) return;
    powerT += d;
    for (const l of lamps) {
      l.t -= d;
      if (l.t <= 0) {
        if (powerT < 1.6) {
          l.t = 0.04 + fxRng() * 0.14;
          l.k = fxRng() < 0.45 ? 0 : 1;
        } else {
          l.t = 0.1 + fxRng() * 1.2;
          l.k = fxRng() < 0.06 ? 0.12 : 0.8 + fxRng() * 0.2;
        }
      }
      const lk = lampsOut > 0 ? 0 : l.k;
      l.light.intensity = LAMP_POWER * lk;
      setBulb(l, lk);
    }
  }

  // ---- 怖い絵（額に掛けた絵・近づく絵・電気が戻ると現れる絵・天井の手） ----
  const FRAME_SPOTS = Object.freeze({
    'heya-no-sumi.webp': {
      x: 4.87, y: 1.55, z: 4.4, ry: -Math.PI / 2, look: { x: 4.3, z: 4.4 },
    },
    'nakimushi.webp': {
      x: -11.87, y: 1.6, z: 3.2, ry: Math.PI / 2, look: { x: -11.3, z: 3.2 },
    },
    'mohikan-chikazuku.webp': {
      x: -5, y: 1.55, z: -1.87, ry: 0, look: { x: -5, z: -1.3 },
    },
  });
  const POWER_SPOT = Object.freeze({
    x: -4.5, y: 1.6, z: 1.87, ry: Math.PI, look: { x: -4.5, z: 1.3 },
  });
  /** 驚かせの間隔（秒）。続けて出さない */
  const SCARE_GAP = 25;

  /** 絵を読み、線を太らせる下ごしらえを通してテクスチャにする */
  function loadDrawing(file, done) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!(w > 0 && h > 0)) return;
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        const sg = src.getContext('2d');
        sg.drawImage(img, 0, 0, w, h);
        const out = prepareDrawing(sg.getImageData(0, 0, w, h), 256);
        const c = document.createElement('canvas');
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        done(tex, out.width, out.height);
      } catch (err) {
        console.warn('絵を貼れません:', file, err);
      }
    };
    img.onerror = () => console.warn('絵を読めません:', file);
    img.src = drawingPath(file);
  }

  function applyZoom(fr) {
    if (!fr || !fr.tex) return;
    const k = 1 / (fr.zoom > 0 ? fr.zoom : 1);
    fr.tex.repeat.set(k, k);
    fr.tex.offset.set((1 - k) / 2, (1 - k) / 2);
  }

  function addFrame(file, {
    x, y, z, rx = 0, ry = 0, max = 1.1, look = null, tint = DSC.dsPicTint, border = true,
  }) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, 0);
    const picMat = new THREE.MeshLambertMaterial({ color: DSC.dsPicDark });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), picMat);
    g.add(pic);
    let edge = null;
    if (border) {
      edge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), new THREE.MeshLambertMaterial({ color: DSC.dsFrameEdge }));
      edge.position.z = -0.03;
      g.add(edge);
    }
    const fr = {
      file, group: g, pic, tex: null, zoom: 1, look: look || { x, z },
    };
    const setSize = (w, h) => {
      const s = fitFrame(w, h, max, max);
      pic.scale.set(s.width, s.height, 1);
      if (edge) edge.scale.set(s.width + 0.14, s.height + 0.14, 1);
    };
    setSize(1, 1);
    loadDrawing(file, (tex, w, h) => {
      fr.tex = tex;
      picMat.map = tex;
      picMat.color.set(tint);
      picMat.needsUpdate = true;
      setSize(w, h);
      applyZoom(fr);
    });
    world.add(g);
    frames.push(fr);
    return fr;
  }

  function buildPaintings() {
    for (const file of DS_DRAWING_ROLES.walls) {
      const sp = FRAME_SPOTS[file];
      if (!sp) continue;
      const fr = addFrame(file, sp);
      if (file === DS_DRAWING_ROLES.creep) creepFrame = fr;
    }
    powerFrame = addFrame(DS_DRAWING_ROLES.power, POWER_SPOT);
    powerFrame.group.visible = false;
    // 地下室の天井に描かれた巨大な手
    addFrame(DS_DRAWING_ROLES.ceiling, {
      x: BOSS_HOME.x, y: 2.96, z: BOSS_HOME.z, rx: Math.PI / 2, max: 5.5, tint: DSC.dsFaint, border: false,
    });
  }

  function playerView() {
    return {
      x: run.pos.x,
      z: run.pos.z,
      yaw,
      lightOn: isLightOn(run),
      lightScale: run.lightScale,
      invuln: run.invuln > 0,
    };
  }

  function frameLit(fr) {
    if (!fr || !run || !fr.group.visible) return false;
    if (roomAt(fr.look.x, fr.look.z) !== roomAt(run.pos.x, run.pos.z)) return false;
    return inLightCone(playerView(), fr.look);
  }

  /** 近づいてくるモヒカンの絵：光を外して戻すたびに1段階ずつ大きくなる */
  function updateFrames() {
    if (!run || phase !== 'play' || deadT > 0) return;
    if (creepFrame && stepCreep(creep, frameLit(creepFrame))) {
      creepFrame.zoom = creepScale(creep.stage);
      applyZoom(creepFrame);
      if (creep.stage >= CREEP_MAX) queueScare('painting', 0.4);
    }
  }

  function resetFrames() {
    creep = createCreep();
    if (creepFrame) {
      creepFrame.zoom = 1;
      applyZoom(creepFrame);
    }
    if (powerFrame) powerFrame.group.visible = false;
  }

  function revealPowerPainting(id) {
    const file = dsDrawingFile(id) || DS_DRAWING_ROLES.power;
    if (powerFrame && powerFrame.file === file) powerFrame.group.visible = true;
  }

  function restHere(id) {
    if (!restAtCandle(run, id)) return;
    for (const f of flames) f.level = 1.6;
    showMsg('ろうそくの火のそばで、少しだけ休んだ。\n力尽きても、ここからやり直せる。', 4);
  }

  function useExit() {
    if (!run.bossDefeated) {
      dsSound.play('door', { locked: true });
      showMsg('扉はびくともしない。天井の闇の中に、まだ何かがいる。', 3);
      return;
    }
    if (tryExit(run)) {
      dsSound.play('door');
      finish();
    }
  }

  // ---- 驚かせ（1プレイ最大3回。規則は ds-state.js の triggerScare） ----
  function ensureScareEl() {
    if (scareEl || !hud) return scareEl;
    scareEl = document.createElement('div');
    scareEl.className = 'ds-scare';
    scareEl.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'background:var(--p-frameBlack);opacity:0;pointer-events:none;z-index:60';
    scareImg = document.createElement('img');
    scareImg.alt = '';
    scareImg.style.cssText = 'max-width:80vw;max-height:92vh;filter:grayscale(1) contrast(2.2) brightness(0.6);transform:scale(1.15)';
    scareEl.append(scareImg);
    hud.root.append(scareEl);
    return scareEl;
  }

  function queueScare(kind, delay = 0) {
    if (!run || pendingScare || run.scares >= MAX_SCARES) return;
    if (Array.isArray(run.scareKinds) && run.scareKinds.includes(kind)) return;
    pendingScare = { kind, at: t + delay };
  }

  function showScare(kind) {
    const faces = DS_DRAWING_ROLES.scareFaces;
    const file = faces[kind] || faces.dark;
    const el = ensureScareEl();
    if (el && scareImg) {
      scareImg.src = drawingPath(file);
      el.style.opacity = '1';
    }
    scareT = 0.9;
    dsSound.play('scare');
  }

  function updateScares(d) {
    if (scareT > 0) {
      scareT -= d;
      if (scareEl) scareEl.style.opacity = String(Math.max(0, Math.min(1, scareT / 0.6)));
    }
    if (lampsOut > 0) lampsOut = Math.max(0, lampsOut - d);
    if (!pendingScare || t < pendingScare.at || deadT > 0) return;
    if (t - lastScareAt < SCARE_GAP) {
      pendingScare.at = lastScareAt + SCARE_GAP;
      return;
    }
    const kind = pendingScare.kind;
    pendingScare = null;
    if (!triggerScare(run, kind)) return;
    lastScareAt = t;
    showScare(kind);
  }

  function hideScare() {
    scareT = 0;
    if (scareEl) scareEl.style.opacity = '0';
  }

  // ---- ボスの体力 ----
  function ensureBossBar() {
    if (bossBar || !hud) return bossBar;
    const wrap = document.createElement('div');
    wrap.className = 'ds-bossbar';
    wrap.style.cssText = 'position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);width:42vw;text-align:center;'
      + 'color:var(--p-dsText);font-size:14px;letter-spacing:0.3em;pointer-events:none;display:none';
    const label = document.createElement('div');
    label.textContent = '巨大な手';
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:4px;height:6px;border:1px solid var(--p-dsLine);background:var(--p-dsMemoBg)';
    const fillEl = document.createElement('i');
    fillEl.style.cssText = 'display:block;height:100%;width:100%;background:var(--p-dsHp)';
    bar.append(fillEl);
    wrap.append(label, bar);
    hud.root.append(wrap);
    bossBar = { wrap, fill: fillEl, shown: null, w: null };
    return bossBar;
  }

  function renderBossBar() {
    const bb = ensureBossBar();
    if (!bb) return;
    const show = phase === 'play' && bossSeen && boss && !boss.defeated
      && run && roomAt(run.pos.x, run.pos.z) === 'basement';
    if (bb.shown !== show) {
      bb.shown = show;
      bb.wrap.style.display = show ? 'block' : 'none';
    }
    if (show) {
      const w = Math.round((bossRemainingHits(boss) / BOSS_TOTAL_HITS) * 100);
      if (bb.w !== w) {
        bb.w = w;
        bb.fill.style.width = `${w}%`;
      }
    }
  }

  // ---- 巨大な手（mohikan-nukitori の絵をもとに） ----
  function buildHand() {
    const root = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: DSC.dsPicTint });
    const armGeo = new THREE.CylinderGeometry(0.26, 0.32, 1, 8);
    armGeo.translate(0, 0.5, 0);
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.y = 0.2;
    const palm = new THREE.Group();
    palm.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.85), skin));
    const fGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.7, 6);
    fGeo.translate(0, -0.35, 0);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.33 + i * 0.22, 0, 0.4);
      pivot.add(new THREE.Mesh(fGeo, skin));
      pivot.rotation.x = -1.3;
      palm.add(pivot);
      fingers.push(pivot);
    }
    const thumb = new THREE.Group();
    thumb.position.set(0.5, 0, 0.1);
    thumb.add(new THREE.Mesh(fGeo, skin));
    thumb.rotation.z = 1.0;
    palm.add(thumb);
    const markMat = new THREE.MeshBasicMaterial({ color: DSC.dsPicDark, fog: false });
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), markMat);
    mark.rotation.x = Math.PI / 2;
    mark.position.y = 0.45;
    const markLight = new THREE.PointLight(DSC.dsSoulLight, 0, 3, 2);
    markLight.position.y = 0.5;
    root.add(arm, palm, mark, markLight);
    root.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({
      color: DSC.dsWhisper, transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    world.add(ring);
    return {
      root, arm, palm, fingers, markMat, markLight, ring, ringMat, x: BOSS_HOME.x, y: 4, z: BOSS_HOME.z,
    };
  }

  function resetHand() {
    if (!hand) return;
    hand.x = BOSS_HOME.x;
    hand.z = BOSS_HOME.z;
    hand.y = 4;
    hand.root.visible = false;
    hand.ring.visible = false;
  }

  function updateHand(d) {
    if (!hand) return;
    if (!boss || !bossSeen) {
      hand.root.visible = false;
      hand.ring.visible = false;
      return;
    }
    let ty = 2.55 + Math.sin(t * 1.7) * 0.08;
    let curl = 0.2;
    let k = 0;
    if (boss.state === 'gone' || boss.defeated) {
      ty = 4.5;
    } else if (boss.state === 'reach') {
      k = Math.max(0, Math.min(1, 1 - boss.t / bossReachTotal));
      ty = 2.55 - 2.25 * k * k;
      curl = k;
    } else if (boss.state === 'down') {
      ty = 0.3;
      curl = 1;
    }
    const sp = boss.state === 'reach' ? 10 : 3;
    hand.y += (ty - hand.y) * Math.min(1, d * sp);
    if (boss.state !== 'gone') {
      hand.x += (boss.target.x - hand.x) * Math.min(1, d * 6);
      hand.z += (boss.target.z - hand.z) * Math.min(1, d * 6);
    }
    hand.root.visible = hand.y < 3.3;
    hand.root.position.set(hand.x, hand.y, hand.z);
    hand.root.rotation.y = Math.atan2(run.pos.x - hand.x, run.pos.z - hand.z);
    hand.arm.scale.y = Math.max(0.1, WALL_H - hand.y - 0.2);
    for (const f of hand.fingers) f.rotation.x = -1.35 + 1.05 * curl;
    const exposed = boss.markExposed && boss.state === 'down';
    hand.markMat.color.set(exposed ? DSC.dsSoul : DSC.dsPicDark);
    hand.markLight.intensity = exposed ? 1.4 + 0.6 * Math.sin(t * 8) : 0;
    bossFlash = Math.max(0, bossFlash - d);
    hand.palm.scale.setScalar(1 + bossFlash);
    const ringOn = boss.state === 'reach';
    hand.ring.visible = ringOn;
    if (ringOn) {
      hand.ring.position.set(boss.target.x, 0.02, boss.target.z);
      hand.ringMat.opacity = 0.2 + 0.5 * k;
    }
  }

  // ---- 敵 ----
  function getEnemyMats() {
    if (!enemyMats) {
      enemyMats = {
        body: new THREE.MeshLambertMaterial({ color: DSC.dsStain }),
        cat: new THREE.MeshLambertMaterial({ color: DSC.dsCord }),
        eye: new THREE.MeshBasicMaterial({ color: DSC.dsBulbLight, fog: false }),
        catEye: new THREE.MeshBasicMaterial({ color: DSC.dsFlame, fog: false }),
      };
    }
    return enemyMats;
  }

  function makeEnemyMesh(type) {
    const M = getEnemyMats();
    const g = new THREE.Group();
    const add = (geo, m, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    if (type === 'shadow') {
      add(enemyGeo.torso, M.body, 0, 0.8, 0);
      add(enemyGeo.head, M.body, 0, 1.72, 0);
      for (const s of [-1, 1]) {
        const a = add(enemyGeo.arm, M.body, s * 0.3, 1.0, 0.05);
        a.rotation.z = s * 0.12;
        add(enemyGeo.eye, M.eye, s * 0.075, 1.75, 0.18);
      }
    } else {
      const body = add(enemyGeo.catBody, M.cat, 0, 0.25, 0);
      body.scale.set(1, 0.8, 1.6);
      add(enemyGeo.catHead, M.cat, 0, 0.38, 0.32);
      for (const s of [-1, 1]) {
        add(enemyGeo.ear, M.cat, s * 0.07, 0.5, 0.32);
        add(enemyGeo.catEye, M.catEye, s * 0.05, 0.4, 0.44);
      }
      const tail = add(enemyGeo.tail, M.cat, 0, 0.42, -0.4);
      tail.rotation.x = -0.6;
    }
    enemyGroup.add(g);
    return g;
  }

  function spawnEnemies() {
    if (!enemyGroup) return;
    for (const c of [...enemyGroup.children]) enemyGroup.remove(c);
    enemies = planEnemies(run.seed, run.level).map((p) => {
      const e = p.type === 'shadow' ? createShadow({ x: p.x, z: p.z }) : createCat({ x: p.x, z: p.z }, catRng);
      return {
        e, mesh: makeEnemyMesh(p.type), home: { x: p.x, z: p.z }, fade: 0, flash: 0, bob: fxRng() * 6,
      };
    });
  }

  function stepEnemies(d) {
    const p = playerView();
    const here = roomAt(p.x, p.z);
    for (const en of enemies) {
      const e = en.e;
      en.flash = Math.max(0, en.flash - d);
      if (e.dead) {
        if (en.fade < 1) en.fade = Math.min(1, en.fade + d * 1.4);
        continue;
      }
      const active = roomAt(e.x, e.z) === here || distance(e, p) < NOTICE_RANGE;
      if (!active) continue;
      const prev = { x: e.x, z: e.z };
      const res = e.type === 'shadow' ? stepShadow(e, d, p, run.level) : stepCat(e, d, p, run.level, catRng);
      const q = slideMove(prev, { x: e.x, z: e.z }, { r: ENEMY_RADIUS, basementOpen: basementOpen() });
      e.x = q.x;
      e.z = q.z;
      if (e.type === 'cat') {
        const ps = auCatPrev.get(e);
        if (e.state === 'windup' && ps !== 'windup') {
          dsSound.play('cat', { near: true, pan: panFor({ x: p.x, z: p.z, yaw }, e) });
        }
        auCatPrev.set(e, e.state);
      }
      if (res.damage > 0 && deadT <= 0) hurt(res.damage);
      if (deadT > 0) return;
    }
  }

  // ---- 戦い ----
  function hurt(n) {
    if (!run || deadT > 0) return;
    const at = { x: run.pos.x, z: run.pos.z };
    const r = damagePlayer(run, n);
    if (!r.hit) return;
    dsSound.play('hit', { hurt: true });
    hurtT = 0.5;
    if (r.dead) onDeath(at);
    else run.invuln = Math.max(run.invuln, HURT_INVULN);
  }

  function onDeath(at) {
    deathAt = at;
    deadT = DEATH_TIME;
    swingT = -1;
    rollT = 0;
    memoOpen = false;
    if (hud) {
      hud.deathSub.textContent = run.dropped ? `ソウル ${run.dropped.amount} を、その場に落とした` : '';
      hud.death.style.opacity = '1';
    }
    if (boss && !boss.defeated) {
      boss.state = 'idle';
      boss.t = 3;
      boss.markExposed = false;
      boss.target = { x: BOSS_HOME.x, z: BOSS_HOME.z };
    }
  }

  function respawn() {
    deadT = 0;
    deathAt = null;
    if (hud) hud.death.style.opacity = '0';
    for (const en of enemies) {
      const e = en.e;
      if (e.dead) continue;
      e.x = en.home.x;
      e.z = en.home.z;
      if (e.type === 'shadow') e.cooldown = 0;
      else {
        e.state = 'stalk';
        e.t = 1.5;
      }
    }
    showMsg(run.dropped
      ? 'ろうそくの火のそばで目を覚ました。\n落としたソウルは、まだあの場所に残っている。'
      : 'ろうそくの火のそばで目を覚ました。', 4);
  }

  function startSwing() {
    swingT = 0;
    hitDone = false;
    attackCd = ATTACK_COOLDOWN;
    dsSound.play('hit', { swing: true });
  }

  function resolveHit() {
    hitDone = true;
    const p = playerView();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (boss && bossSeen && !boss.defeated && boss.state === 'down'
      && (inCone(p, boss.target, MARK_REACH, ATTACK_ANGLE) || distance(p, boss.target) < 0.9)) {
      const r = hitBossMark(boss, p);
      if (r.accepted) {
        bossFlash = 0.3;
        dsSound.play('hit', { strength: 1.4 });
        if (r.defeated) {
          markBossDefeated(run);
          dsSound.play('door');
          showMsg('巨大な手は、ゆっくりと天井の闇へ消えていった。\n……外への扉の向こうから、冷たい風が吹いてくる。', 6);
        } else if (r.phaseCleared) {
          showMsg('手首の印を打ちすえると、巨大な手は天井へ引っ込んだ。', 3);
        }
      }
    }
    for (const en of enemies) {
      const e = en.e;
      if (e.dead || !inCone(p, e, ATTACK_RANGE, ATTACK_ANGLE)) continue;
      const r = hitEnemy(e);
      if (!r.hit) continue;
      en.flash = 0.2;
      dsSound.play('hit', { strength: 1 });
      if (e.type === 'cat') {
        e.state = 'recover';
        e.t = 0.8;
      } else {
        e.cooldown = Math.max(e.cooldown, 0.9);
      }
      const q = slideMove(e, { x: e.x + fx * 0.4, z: e.z + fz * 0.4 }, { r: ENEMY_RADIUS, basementOpen: basementOpen() });
      e.x = q.x;
      e.z = q.z;
      if (r.dead) addSouls(run, r.souls);
    }
  }

  function moveBy(dx, dz) {
    run.pos = slideMove(run.pos, { x: run.pos.x + dx, z: run.pos.z + dz }, { basementOpen: basementOpen() });
  }

  // ---- 1フレーム分の遊び ----
  function updatePlay(d) {
    dsSound.tick(d);
    updatePuzzle(d);
    updateScares(d);
    hurtT = Math.max(0, hurtT - d);
    if (deadT > 0) {
      lastMoving = false;
      deadT -= d;
      if (deadT <= 0) respawn();
      return;
    }
    const busy = safeUi;
    const consume = () => (input && typeof input.consumeDrag === 'function' ? input.consumeDrag() : 0);
    if (!busy) {
      const turn = (isDown('ArrowLeft') ? 1 : 0) - (isDown('ArrowRight') ? 1 : 0);
      yaw += turn * KEY_TURN * d;
      const drag = consume();
      if (!locked) yaw -= drag * 0.006;
    } else {
      consume();
    }
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let mx = 0;
    let mz = 0;
    if (!busy) {
      const iy = (isDown('KeyW') ? 1 : 0) - (isDown('KeyS') ? 1 : 0);
      const ix = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);
      mx = fx * iy - fz * ix;
      mz = fz * iy + fx * ix;
    }
    const len = Math.hypot(mx, mz);
    const moving = len > 0 && rollT <= 0;
    const running = moving && isDown('ShiftLeft', 'ShiftRight');
    const wasLight = isLightOn(run);
    tickPlayer(run, d, { running });
    if (wasLight && !isLightOn(run) && run.battery <= 0) {
      dsSound.play('click');
      showMsg('懐中電灯が、ふっと消えた。電池が切れた。', 4);
    }
    // 回避
    if (!busy && rollT <= 0 && pressed('Space') && roll(run)) {
      rollT = ROLL_TIME;
      rollDir = len > 0 ? { x: mx / len, z: mz / len } : { x: fx, z: fz };
      swingT = -1;
      dsSound.play('roll');
    }
    if (rollT > 0) {
      rollT = Math.max(0, rollT - d);
      moveBy(rollDir.x * ROLL_SPEED * d, rollDir.z * ROLL_SPEED * d);
    } else if (moving) {
      const sp = (run.running ? RUN_SPEED : WALK_SPEED) * d;
      moveBy((mx / len) * sp, (mz / len) * sp);
    }
    lastMoving = moving;
    // 懐中電灯
    if (!busy && pressed('KeyF')) {
      const before = run.flashlightOn;
      const on = toggleFlashlight(run);
      dsSound.play('click');
      if (!on && !before) showMsg('電池が切れている。', 2);
    }
    // 攻撃
    attackCd = Math.max(0, attackCd - d);
    if (!busy && (pressed('KeyJ') || attackQueued) && attackCd <= 0 && rollT <= 0) startSwing();
    attackQueued = false;
    if (swingT >= 0) {
      swingT += d;
      if (!hitDone && swingT >= ATTACK_HIT_AT) resolveHit();
      if (swingT >= SWING_TIME) swingT = -1;
    }
    // 調べる
    updateFocus();
    if (!busy && focus && pressed('KeyE')) focus.use();
    if (phase !== 'play') return;
    // 敵
    stepEnemies(d);
    if (deadT > 0) return;
    // ボス
    const here = roomAt(run.pos.x, run.pos.z);
    if (here === 'basement') basementT += d;
    if (!bossSeen && here === 'basement' && run.pos.z < -4.6 && boss && !boss.defeated) {
      bossSeen = true;
      dsSound.play('bgm', { kind: 'thump' });
      showMsg('天井の闇の中で、何かが動いた。', 3);
      queueScare('basement', 1.0);
    }
    if (bossSeen && boss && !boss.defeated && here === 'basement') {
      const prevState = boss.state;
      const res = stepBoss(boss, d, playerView());
      if (boss.state === 'reach' && prevState !== 'reach') bossReachTotal = Math.max(0.1, boss.t);
      if (boss.state === 'down' && prevState === 'reach') dsSound.play('hit', { strength: 1.6 });
      if (res.damage > 0) hurt(res.damage);
      if (deadT > 0) return;
    }
    // 落としたソウル
    const got = recoverSouls(run);
    if (got > 0) {
      dsSound.play('click');
      showMsg(`落としたソウル（${got}）を取り戻した。`, 3);
    }
    // 鼓動・足音・時計
    const near = nearestDistance(run.pos, [
      ...enemies.filter((en) => !en.e.dead && roomAt(en.e.x, en.e.z) === here).map((en) => en.e),
      ...(bossSeen && boss && !boss.defeated && here === 'basement' ? [boss.target] : []),
    ]);
    const hb = heartbeatParams(near);
    auHeartT -= d;
    if (auHeartT <= 0) {
      if (near !== null && near < 12) dsSound.play('heartbeat', { volume: hb.volume });
      auHeartT = heartbeatInterval(hb.bpm);
    }
    if (lastMoving) {
      auStepT -= d;
      if (auStepT <= 0) {
        dsSound.play('footstep', { material: materialAt(run.pos.x, run.pos.z) || 'wood', running: run.running });
        auStepT = footstepInterval(run.running);
      }
    } else {
      auStepT = 0.1;
    }
    tickT -= d;
    if (tickT <= 0) {
      tickT = 1;
      // 止まった柱時計のそばでは、どこかの時計の音も聞こえなくなる
      if (Math.hypot(run.pos.x - 4.3, run.pos.z + 1.8) > 5) dsSound.play('bgm', { kind: 'tick', vol: 0.05 });
    }
    auLast = here;
    // 暗闇の驚かせ・電気の驚かせ
    if (!isLightOn(run) && run.battery <= 0 && near !== null && near < 5) queueScare('dark', 0.3);
    if (run.power && powerT > 30 && here === 'corridor' && !pendingScare
      && !run.scareKinds.includes('lights') && run.scares < MAX_SCARES && fxRng() < d * 0.15) {
      lampsOut = 2.4;
      queueScare('lights', 0.8);
    }
  }

  // ---- 見た目 ----
  function syncVisuals(d) {
    if (!run || !rig) return;
    const dying = deadT > DEATH_TIME - DYING_TIME;
    const at = dying && deathAt ? deathAt : run.pos;
    rig.root.visible = !(deadT > 0 && !dying);
    rig.root.rotation.order = 'YXZ';
    rig.root.position.set(at.x, 0, at.z);
    rig.root.rotation.y = yaw;
    let lean = 0;
    let sq = 1;
    if (dying) {
      lean = -1.45 * Math.min(1, (DEATH_TIME - deadT) / 0.4);
    } else if (rollT > 0) {
      const k = 1 - rollT / ROLL_TIME;
      lean = 1.3 * Math.sin(Math.PI * k);
      sq = 1 - 0.35 * Math.sin(Math.PI * k);
    }
    rig.root.rotation.x = lean;
    rig.root.scale.set(1, sq, 1);
    stepAnim(anim, {
      moving: lastMoving, airborne: false, dt: d, dash: !!run.running,
    });
    rig.apply(anim);
    // 燭台
    if (weapon) {
      if (swingT >= 0) {
        const k = Math.min(1, swingT / SWING_TIME);
        weapon.rotation.x = k < 0.35 ? -0.35 - 1.5 * (k / 0.35) : -1.85 + 3.1 * ((k - 0.35) / 0.65);
      } else {
        weapon.rotation.x += (-0.35 - weapon.rotation.x) * Math.min(1, d * 10);
      }
    }
    // 懐中電灯
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (isLightOn(run) && run.battery < 15) {
      flickT -= d;
      if (flickT <= 0) {
        flickOn = fxRng() > 0.25;
        flickT = flickOn ? 0.2 + fxRng() * 1.2 : 0.05 + fxRng() * 0.12;
      }
    } else {
      flickOn = true;
    }
    const lightsFail = lampsOut > 0 && lampsOut < 1.8 && Math.sin(t * 37) > 0.1;
    if (spot) {
      spot.intensity = isLightOn(run) && flickOn && !lightsFail && rig.root.visible ? DS_LIGHT.intensity : 0;
      spot.distance = DS_LIGHT.range * (run.lightScale > 0 ? run.lightScale : 1);
      spot.angle = DS_LIGHT.halfAngle;
      spot.position.set(at.x + fx * 0.3, 1.25, at.z + fz * 0.3);
      const dy = -0.15 - pitch * 0.6;
      spot.target.position.set(at.x + fx * 4.3, 1.25 + dy * 4, at.z + fz * 4.3);
      spot.target.updateMatrixWorld();
    }
    if (fill) fill.position.set(at.x, 1.8, at.z);
    // 敵
    for (const en of enemies) {
      const e = en.e;
      const m = en.mesh;
      if (e.dead && en.fade >= 1) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const jit = en.flash > 0 ? (Math.random() - 0.5) * 0.08 : 0;
      m.position.set(e.x + jit, -en.fade * 0.6, e.z + jit);
      m.scale.setScalar(Math.max(0.05, 1 - en.fade * 0.9));
      if (e.type === 'shadow') {
        m.rotation.y = Math.atan2(run.pos.x - e.x, run.pos.z - e.z);
        m.rotation.z = e.frozen ? 0 : Math.sin(t * 1.3 + en.bob) * 0.05;
      } else {
        m.rotation.y = e.state === 'leap' || e.state === 'windup'
          ? Math.atan2(e.dirX, e.dirZ)
          : Math.atan2(run.pos.x - e.x, run.pos.z - e.z);
        if (e.state === 'windup') m.scale.y *= 0.75;
        if (e.state === 'leap') m.position.y += Math.sin(Math.min(1, 1 - e.t / CAT_LEAP_TIME) * Math.PI) * 0.4;
      }
    }
    updateHand(d);
    // 落としたソウル
    if (soulDrop) {
      if (run.dropped) {
        soulDrop.visible = true;
        soulDrop.position.set(run.dropped.x, 0, run.dropped.z);
        for (let i = 0; i < 7; i++) {
          const a = t * 1.3 + (i / 7) * Math.PI * 2;
          const c = soulDrop.children[i];
          c.position.set(Math.cos(a) * 0.25, 0.3 + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.25);
        }
      } else {
        soulDrop.visible = false;
      }
    }
    // ろうそくの火のゆらぎ
    for (const f of flames) {
      f.t -= d;
      if (f.t <= 0) {
        f.target = 0.75 + fxRng() * 0.35;
        f.t = 0.05 + fxRng() * 0.15;
      }
      f.level += (f.target - f.level) * Math.min(1, d * 8);
      f.light.intensity = 1.2 * f.level;
      f.flame.scale.y = 1.7 * f.level;
    }
    // 地下室の扉
    if (doorPivot) {
      const target = run.basementOpen ? 1.6 : 0;
      doorPivot.rotation.y += (target - doorPivot.rotation.y) * Math.min(1, d * 1.2);
    }
    if (hud) {
      hud.hurt.style.opacity = String(Math.min(1, hurtT * 2));
      if (deadT <= 0) hud.death.style.opacity = '0';
    }
    renderBossBar();
  }

  function placeCamera() {
    if (!run) return;
    const dying = deadT > DEATH_TIME - DYING_TIME;
    const at = dying && deathAt ? deathAt : run.pos;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const ty = 1.45;
    const dist = 2.4;
    const back = Math.cos(pitch) * dist;
    const up = Math.sin(pitch) * dist;
    let k = 1;
    for (let i = 1; i <= 20; i++) {
      const s = i / 20;
      if (!isWalkable(at.x - fx * back * s, at.z - fz * back * s, { r: 0.15, basementOpen: true, obstacles: false })) {
        k = Math.max(0.12, (i - 1) / 20);
        break;
      }
    }
    const cy = Math.max(0.3, Math.min(WALL_H - 0.2, ty + up * k + 0.25));
    camera.position.set(at.x - fx * back * k, cy, at.z - fz * back * k);
    camera.lookAt(at.x + fx * 1.5, ty - pitch * 1.2, at.z + fz * 1.5);
  }

  // ---- 1プレイの始まりと終わり ----
  function startRun() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 2147483647)) >>> 0;
    run = createRun({
      seed, level: 2, carry, funLevel: 0,
    });
    fxRng = makeRng(seed + 11);
    catRng = makeRng(seed + 23);
    bossRng = makeRng(seed + 37);
    boss = createBoss(run.level, bossRng);
    bossSeen = false;
    bossFlash = 0;
    bossReachTotal = 1.8;
    cleared = false;
    deadT = 0;
    deathAt = null;
    rollT = 0;
    swingT = -1;
    hitDone = true;
    attackCd = 0;
    attackQueued = false;
    hurtT = 0;
    pendingScare = null;
    lastScareAt = -Infinity;
    lampsOut = 0;
    basementT = 0;
    auHeartT = 0;
    auStepT = 0;
    auLast = null;
    tickT = 1;
    yaw = Math.PI / 2;
    pitch = 0.1;
    memoOpen = false;
    if (safeUi) closeSafe();
    safeUi = false;
    safeEntry = '';
    spawnEnemies();
    resetPuzzle();
    resetHand();
    hideScare();
    if (doorPivot) doorPivot.rotation.y = 0;
    if (soulDrop) soulDrop.visible = false;
    if (hud) {
      hud.last = {};
      hud.death.style.opacity = '0';
    }
  }

  function startPlay() {
    if (phase !== 'intro' || leaving) return;
    phase = 'play';
    guard = 0.2;
    ctx.ui.setHint(PLAY_HINT);
    showMsg('……暗い。頼れるのは、懐中電灯の明かりだけだ。', 4);
  }

  function restart() {
    startRun();
    phase = 'play';
    guard = 0.3;
    if (resultPanel) resultPanel.hide();
    ctx.ui.setHint(PLAY_HINT);
    showMsg('……また、この屋敷だ。', 3);
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

  function finish() {
    if (cleared) return;
    cleared = true;
    phase = 'result';
    guard = 0.4;
    memoOpen = false;
    closeSafe();
    releaseLock();
    dsSound.halt();
    hideScare();
    const res = buildResult(run);
    let rewardLine = null;
    try {
      const items = typeof ctx.getItems === 'function' ? ctx.getItems() : null;
      const owned = items && Array.isArray(items.owned) ? items.owned : [];
      if (lanternReward(owned)) {
        const got = ctx.grantGameItem(gameId);
        if (got && got.item && got.isNew) rewardLine = `アイテム獲得：${got.item.name || LANTERN.name}`;
      }
    } catch {
      rewardLine = null;
    }
    if (rewardLine && ctx.ui && typeof ctx.ui.banner === 'function') ctx.ui.banner(rewardLine, 3);
    if (!resultPanel) resultPanel = createResultPanel();
    resultPanel.show(resultView(res, [carryLine, rewardLine]), (id) => {
      if (id === 'again') restart();
      else backToGallery();
    });
    ctx.ui.setHint('←→: 選ぶ　Enter: 決定');
  }

  return {
    enter(params = {}) {
      const p = params && typeof params === 'object' ? params : {};
      if (!world) build();
      gameId = typeof p.gameId === 'string' && p.gameId ? p.gameId : DS_GAME_ID;
      carry = p.carry && typeof p.carry === 'object' ? p.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      leaving = false;
      t = 0;
      guard = 0.3;
      startRun();
      applyMohawkColor(rig, ctx.mohawkColor());
      ctx.setWorld(world);
      mountHud();
      syncVisuals(0);
      placeCamera();
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      listen(true);
      if (!panel) panel = createMinigamePanel();
      if (!resultPanel) resultPanel = createResultPanel();
      resultPanel.hide();
      phase = 'intro';
      panel.show(dsHowto(carryLine), () => startPlay());
    },
    update(dt) {
      if (!world || !run) return;
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.1);
      t += d;
      guard = Math.max(0, guard - d);
      if (phase === 'intro') {
        dsSound.tick(d);
        updatePuzzle(d);
        if (pressed('Escape')) {
          if (panel) panel.hide();
          backToGallery();
          if (!leaving && panel) panel.show(dsHowto(carryLine), () => startPlay());
        } else if (guard <= 0 && pressed('Enter', 'NumpadEnter', 'Space')) {
          if (panel) panel.close();
        }
      } else if (phase === 'play') {
        updatePlay(d);
      } else if (phase === 'result') {
        updatePuzzle(d);
        if (guard <= 0 && resultPanel) {
          if (pressed('ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW')) resultPanel.move(-1);
          if (pressed('ArrowRight', 'ArrowDown', 'KeyD', 'KeyS')) resultPanel.move(1);
          if (pressed('Enter', 'NumpadEnter', 'Space')) resultPanel.confirm();
        }
      }
      syncVisuals(d);
      placeCamera();
      renderHud();
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, run: smokeSummary(run) };
    },
    exit() {
      phase = 'idle';
      listen(false);
      releaseLock();
      dsSound.halt();
      if (safeUi) closeSafe();
      safeUi = false;
      memoOpen = false;
      if (panel) panel.hide();
      if (resultPanel) resultPanel.hide();
      hideScare();
      if (hud && hud.root.parentNode) hud.root.remove();
      ctx.ui.setHint('');
    },
    get pausable() { return phase !== 'intro' && !safeUi && escGuard <= 0; },
    get carry() { return carry; },
  };
}

export default createDarkSoulScene;
