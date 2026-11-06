// 真っ暗ソウルの1プレイの状態と規則（three.js・DOM・Web Audio に依存しない）。
// 状態はプレーンなオブジェクトで、関数はそれを直接変える。
// おふざけ度に関わらず、ふざけた出来事は一切起こさない。
// 体力・攻撃・回避・ソウル・ボスの規則（roll・damagePlayer・handleDeath・addSouls・recoverSouls・
// markBossDefeated・buildResult）はもう無い。敵に捕まったら一発でアウト（ds-escape.js）。
import {
  CANDLES, PLAYER_START, EXIT_POS, EXIT_RADIUS, distance,
} from './ds-map.js';
import { generatePuzzle } from './ds-puzzle.js';
import { applyItemEffects, dsItemFromCarry } from './ds-items.js';

export const STAMINA_MAX = 100;
export const RUN_COST = 20;
/** 捕まって戻った直後に、捕まらない時間（秒） */
export const SPAWN_INVULN = 1.5;
export const BATTERY_FULL_SECONDS = 180;
export const BATTERY_PICKUP = 40;
export const MAX_SCARES = 3;
/** 走っていないときのスタミナの回復（毎秒） */
export const STAMINA_REGEN = 15;

/** 強さ 1〜3 に丸める */
export function normalizeLevel(level) {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(3, n));
}

/** 真っ暗ソウルではおふざけ度に関わらず出来事を出さない（常に空） */
export function dsFunEvents(funLevel) {
  void funLevel;
  return [];
}

export function createRun({
  seed = 1, level = 2, itemId = null, carry = null, funLevel = 0,
} = {}) {
  const start = CANDLES.find((c) => c.id === 'candle-hall');
  const item = typeof itemId === 'string' ? itemId : dsItemFromCarry(carry);
  const fx = applyItemEffects(item);
  const s = {
    seed: Number(seed) >>> 0,
    level: normalizeLevel(level),
    itemId: item,
    puzzle: generatePuzzle(Number(seed) >>> 0),
    stamina: STAMINA_MAX,
    staminaMax: STAMINA_MAX,
    running: false,
    battery: 100,
    flashlightOn: true,
    lightScale: 1,
    /** 足音が届く距離の倍率（デカモヒカンで大きい） */
    noiseScale: 1,
    /** 捕まっても振りほどける残りの回数（必勝ハチマキ） */
    breakFree: 0,
    captures: 0,
    candle: start ? start.id : 'candle-hall',
    pos: { x: PLAYER_START.x, z: PLAYER_START.z },
    invuln: 0,
    time: 0,
    fusesHeld: 0,
    fusesInserted: 0,
    fuseTaken: [],
    power: false,
    hasKey: false,
    safeOpen: false,
    basementOpen: false,
    exited: false,
    scares: 0,
    scareKinds: [],
    memo: [],
    funEvents: dsFunEvents(funLevel),
  };
  s.lightScale = fx.lightScale > 0 ? fx.lightScale : 1;
  s.noiseScale = fx.noiseScale > 0 ? fx.noiseScale : 1;
  s.breakFree = Math.max(0, Math.floor(Number(fx.breakFree) || 0));
  s.battery = Math.max(0, Math.min(100, Number(fx.startBattery)));
  s.staminaMax = Math.max(1, STAMINA_MAX + (Number(fx.staminaBonus) || 0));
  s.stamina = s.staminaMax;
  if (fx.fuseDigitHint) {
    s.memo.push({ source: 'item', room: null, text: `金庫の番号の1桁目は ${s.puzzle.code[0]}` });
  }
  return s;
}

/** 時間を進める（電池・スタミナ・無敵時間） */
export function tickPlayer(s, dt, { running = false } = {}) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  s.time += d;
  s.invuln = Math.max(0, (s.invuln || 0) - d);
  if (s.flashlightOn && s.battery > 0) {
    s.battery = Math.max(0, s.battery - (100 / BATTERY_FULL_SECONDS) * d);
  }
  if (s.battery <= 0) {
    s.battery = 0;
    s.flashlightOn = false;
  }
  if (running && s.stamina > 0) {
    s.stamina = Math.max(0, s.stamina - RUN_COST * d);
    s.running = true;
  } else {
    s.running = false;
    s.stamina = Math.min(s.staminaMax, s.stamina + STAMINA_REGEN * d);
  }
  return s;
}

/** 懐中電灯の切り替え。電池 0 では点けられない。点灯状態を返す */
export function toggleFlashlight(s) {
  if (s.flashlightOn) {
    s.flashlightOn = false;
  } else if (s.battery > 0) {
    s.flashlightOn = true;
  }
  return s.flashlightOn;
}

export function isLightOn(s) {
  return !!s && !!s.flashlightOn && s.battery > 0;
}

export function pickupBattery(s) {
  s.battery = Math.min(100, s.battery + BATTERY_PICKUP);
  return s.battery;
}

/** 電気の復旧に要るヒューズの本数 */
export const FUSES_NEEDED = 3;
/** 電気が戻ったときの声のような文字 */
export const POWER_RESTORED_TEXT = 'ほーら、これで明るくなった';

/** ヒューズを拾う。置かれている部屋で、まだ取っていなければ true */
export function pickupFuse(s, roomId) {
  const rooms = s && s.puzzle && Array.isArray(s.puzzle.fuseRooms) ? s.puzzle.fuseRooms : [];
  if (!rooms.includes(roomId) || s.fuseTaken.includes(roomId)) return false;
  s.fuseTaken.push(roomId);
  s.fusesHeld += 1;
  return true;
}

/** 配電盤に持っているヒューズを入れる。3本そろった瞬間だけ出来事を返す */
export function insertFuses(s) {
  const n = Math.max(0, Math.floor(Number(s.fusesHeld) || 0));
  s.fusesInserted += n;
  s.fusesHeld = 0;
  if (s.fusesInserted >= FUSES_NEEDED && !s.power) {
    s.power = true;
    return [{ type: 'power-restored', text: POWER_RESTORED_TEXT, painting: 'akaruku-natta' }];
  }
  return [];
}

/** 配電盤にあと何本足りないか */
export function fusesMissing(s) {
  return Math.max(0, FUSES_NEEDED - (Number(s && s.fusesInserted) || 0));
}

/** 手がかりを調べる。新しければメモに書いて true */
export function discoverClue(s, source) {
  const clues = s && s.puzzle && s.puzzle.clues ? s.puzzle.clues : null;
  const clue = clues && typeof source === 'string' && Object.prototype.hasOwnProperty.call(clues, source)
    ? clues[source] : null;
  if (!clue || s.memo.some((m) => m && m.source === source)) return false;
  s.memo.push({ source, room: clue.room, text: clue.text });
  return true;
}

/** 金庫の番号を試す。'ok' | 'wrong' | 'already' */
export function submitCode(s, code) {
  if (s.safeOpen) return 'already';
  if (typeof code !== 'string' || !/^\d{4}$/.test(code) || code !== s.puzzle.code) return 'wrong';
  s.hasKey = true;
  s.safeOpen = true;
  return 'ok';
}

/** 鍵があれば地下室の扉を開ける */
export function openBasement(s) {
  if (!s.hasKey) return false;
  s.basementOpen = true;
  return true;
}

/** ろうそくで休む（捕まったときに戻る場所を更新し、スタミナを戻す） */
export function restAtCandle(s, candleId) {
  if (!CANDLES.some((c) => c.id === candleId)) return false;
  s.candle = candleId;
  s.stamina = s.staminaMax;
  return true;
}

/** 驚かせてよいか（1プレイで最大3回） */
export function tryScare(s, kind) {
  void kind;
  if (s.scares >= MAX_SCARES) return false;
  s.scares += 1;
  return true;
}

/** 驚かせの出どころ（それぞれ1プレイに1回まで。全部で MAX_SCARES 回まで） */
export const SCARE_KINDS = Object.freeze(['painting', 'basement', 'dark', 'lights']);

/** 出どころつきの驚かせ。同じ出どころは2度目を出さず、全体の上限は tryScare に従う */
export function triggerScare(s, kind) {
  if (!s || !SCARE_KINDS.includes(kind)) return false;
  if (!Array.isArray(s.scareKinds)) s.scareKinds = [];
  if (s.scareKinds.includes(kind)) return false;
  if (!tryScare(s, kind)) return false;
  s.scareKinds.push(kind);
  return true;
}

/** 近づいてくるモヒカンの絵（光を外して戻すたびに1段階ずつ大きくなる） */
export const CREEP_MAX = 6;
export const CREEP_STEP = 0.18;

export function createCreep() {
  return { stage: 0, lit: false, seen: false };
}

/** 照らされているか lit を渡す。消えて→また照らされた瞬間だけ段階を進め、true を返す */
export function stepCreep(c, lit) {
  if (!c) return false;
  const on = !!lit;
  let advanced = false;
  if (on && !c.lit) {
    if (c.seen && c.stage < CREEP_MAX) {
      c.stage += 1;
      advanced = true;
    }
    c.seen = true;
  }
  c.lit = on;
  return advanced;
}

/** 段階 → 絵の中のモヒカンの大きさ（1 + 0.18×段階） */
export function creepScale(stage) {
  const n = Math.max(0, Math.min(CREEP_MAX, Math.floor(Number(stage) || 0)));
  return 1 + CREEP_STEP * n;
}

/** 地下室の出口から外へ出る（地下室の扉が開いていて、出口の近くなら出られる） */
export function tryExit(s) {
  if (!s || !s.basementOpen) return false;
  if (distance(s.pos, EXIT_POS) > EXIT_RADIUS) return false;
  s.exited = true;
  return true;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 秒 → 「m:ss」（1時間を超えたら「h:mm:ss」） */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}

