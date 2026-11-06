// モヒカンタッチタッチの場面：土俵で、デカ頭アリヌスとモヒカンの触り合い。足は動かない。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { createAnimState, stepAnim } from '../characters.js';
import { createHeroRig, applyMohawkColor } from '../hero-model.js';
import {
  buildTouchArena, TOUCH_LAYOUT, buildReachArm, createPoser,
} from '../touch-arena.js';
import {
  createMatch, setPosture, startReach, step as stepMatch, MATCH_SECONDS, WIN_POINTS, HIT_AT_RATIO,
  startInterrupt, canPunchReferee, punchReferee, earnsReward,
  HIT_RADIUS, VERT_RADIUS, STAND_HEIGHT, CROUCH_HEIGHT, HAND_HEIGHT, FORWARD_HAND_HEIGHT,
  HAND_LATERAL, LEAN_OFFSET,
} from '../touch-rules.js';
import { mohawkHit, armReachAngles } from '../touch-hit.js';
import {
  createBrawl, stepBrawl, brawlResult, BRAWL_HINT, PUNCH_COOLDOWN,
} from '../touch-brawl.js';
import { touchCarryMods } from '../item-table.js';
import { createTouchAI, DEFAULT_LEVEL, TOUCH_AI_LEVELS } from '../touch-ai.js';
import { planInterrupts } from '../touch-interrupt.js';
import {
  recordTouchResult, recordPunch, refereeHasHelmet, getTouchLevel, setTouchLevel,
} from '../touch-save.js';
import { loadTouchSave, storeTouchSave } from '../progress.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from '../silly-rules.js';
import { gameSfx, ensureGameMusic } from '../audio.js';
import { gameIntroView, INTRO_START_NOTE } from '../game-intro.js';
import { smokeSummary } from '../smoke-state.js';

export const PAUSE_BACK_GALLERY = 'back-gallery';
export const TOUCH_GAME_ID = 'mohi-touch';
export const TOUCH_LEVEL_LABELS = Object.freeze({ easy: 'よわい', normal: 'ふつう', hard: 'つよい' });
/** 相手が手を出す前の「溜め」（見てから避けられるように） */
export const WINDUP_SECONDS = Object.freeze({ easy: 0.4, normal: 0.28, hard: 0.18 });
export const TOUCH_RESULT_LABELS = Object.freeze({
  win: '勝ち！', lose: '負け…', draw: '引き分け', uyamuya: 'うやむや',
});
export const INTERRUPT_TEXT = Object.freeze({
  tangle: 'あっち向いて…ホイ！（手が絡まった！）',
  sneeze: '審判の大くしゃみ！ ハックション！',
  dance: 'なぜか2人で踊りだした！',
});
export const PUNCH_KEY_LABEL = '';
/** 乱闘の土俵の大きさを今の土俵に合わせる倍率 */
const BRAWL_SCALE = 0.65;

/** 手（'L'/'R'）が相手から見てどちらの側（lean の符号）に来るか */
export function handSide(hand) {
  return hand === 'L' ? -1 : 1;
}

/**
 * 手がモヒカンに当たったか。a・d は手を出した瞬間の姿勢。
 * 棒立ちの相手には必ず当たる。外れるのは避けている相手だけ：
 * しゃがんでいるか、手の来る側へ傾いているとき（前のめりの相手は避けられない）。
 */
export function touchMohawkHit(a, d, hand) {
  if (!a || !d) return false;
  const lean = Math.sign(Number(d.lean) || 0);
  // 避けているのは、しゃがむか体を傾けているときだけ（前のめりは避けられない）
  const dodging = !d.forward && (!!d.crouch || lean !== 0);
  // 棒立ちの相手には、手の先がモヒカンの真ん中（狭めた範囲の中心）に届く
  const mohawk = {
    x: 0, y: 0, z: 0, halfWidth: 0.3, height: 0.8, halfDepth: 0.1,
  };
  const tip = { x: 0, y: mohawk.height / 2, z: 0 };
  void hand;
  return mohawkHit({ tip, mohawk, dodge: dodging ? 1 : 0 });
}

/** 姿勢からモデルの傾き（rotation.z、ラジアン）。lean が正なら負の向きに傾ける */
export const LEAN_TILT = 0.35;
export function leanTilt(fighter) {
  if (!fighter) return 0;
  const l = Math.max(-1, Math.min(1, Number(fighter.lean) || 0));
  return l === 0 ? 0 : -l * LEAN_TILT;
}

const boneKey = (s) => String(s || '').split(/[:|]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');
/** 主人公のモデルの上腕の骨 {L, R}（読み込み前は空） */
function heroArmBones(rig) {
  const out = {};
  if (!rig || !rig.real || !rig.root) return out;
  rig.root.traverse((o) => {
    if (!o.isBone) return;
    const k = boneKey(o.name);
    if (/^(left|right)(upper)?arm$/.test(k)) out[k.startsWith('left') ? 'L' : 'R'] = out[k.startsWith('left') ? 'L' : 'R'] || o;
    else if (/^upperarm(l|r)$/.test(k)) out[k.endsWith('l') ? 'L' : 'R'] = out[k.endsWith('l') ? 'L' : 'R'] || o;
  });
  return out;
}
/** 殴る動きの当たる瞬間と、結果を出し直す時刻（秒） */
export const PUNCH_IMPACT = 0.25;
export const PUNCH_RESULT_AT = 2.1;

/** 予定 plan の idx 番目が、試合時間 time で始まる時なら返す */
export function nextDueInterrupt(plan, idx, time) {
  const p = Array.isArray(plan) ? plan[idx] : null;
  return p && time >= p.at ? p : null;
}

/** 結果画面の選択肢。負けたときだけ、なぞの選択肢が増える */
export function touchResultChoices(match) {
  const base = [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }];
  return canPunchReferee(match) ? [...base, { id: 'punch', label: '？？？' }] : base;
}

function touchStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function sillyLevelNow() {
  try {
    return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY));
  } catch {
    return 2;
  }
}

export const TOUCH_HOWTO = Object.freeze({
  title: 'モヒカンタッチタッチ',
  sub: '相手のモヒカンをたくさん触った方が勝ち！ 足はその場から動かない',
  rows: Object.freeze([
    Object.freeze(['A / D', '体を左右に傾けて避ける']),
    Object.freeze(['S', 'しゃがんで避ける']),
    Object.freeze(['W', '前のめり（届きやすいが避けにくい）']),
    Object.freeze(['J / 左クリック', '左手でモヒカンをタッチ']),
    Object.freeze(['K', '右手でモヒカンをタッチ']),
    Object.freeze(['Esc', 'ポーズ（館に戻る）']),
  ]),
  note: INTRO_START_NOTE,
});

/** 強さを添えた遊び方 */
export function touchHowto(level = DEFAULT_LEVEL, carryLine = null, locked = false) {
  const label = TOUCH_LEVEL_LABELS[level] || TOUCH_LEVEL_LABELS[DEFAULT_LEVEL];
  const intro = gameIntroView(TOUCH_GAME_ID, { carryLine }) || {};
  return {
    ...TOUCH_HOWTO,
    sub: `${TOUCH_HOWTO.sub}（60秒・${WIN_POINTS}点先取）`,
    lines: Array.isArray(intro.lines) ? intro.lines : [],
    win: `勝ち方：60秒のうちに、相手のモヒカンを多くタッチした方の勝ち（${WIN_POINTS}点先取）`,
    carry: intro.carry || null,
    note: locked ? `強さ：${label}　${TOUCH_HOWTO.note}` : `強さ：${label}（1 よわい／2 ふつう／3 つよい）　${TOUCH_HOWTO.note}`,
  };
}

export function heroPostureFromKeys({
  a = false, d = false, s = false, w = false,
} = {}) {
  return { lean: (d ? 1 : 0) - (a ? 1 : 0), crouch: !!s, forward: !!w };
}

/** 手の伸び（0→1→0）。伸ばしていない手は 0 */
export function reachExtension(fighter, hand) {
  if (!fighter || !fighter.reach || fighter.reach.hand !== hand) return 0;
  const rs = fighter.mods.reachSeconds;
  const hit = rs * HIT_AT_RATIO;
  const t = fighter.reach.t;
  return t < hit ? t / hit : Math.max(0, 1 - (t - hit) / (rs - hit));
}

/** AI の判断を試合に当てる（溜めを使わない場合）。何かしたら true */
export function applyAiDecision(match, d) {
  if (!d || d.type === 'idle') return false;
  if (d.posture) setPosture(match, 'rival', d.posture);
  if (d.type === 'attack') return startReach(match, 'rival', d.hand);
  return true;
}

export function touchHud(match, level = DEFAULT_LEVEL) {
  const left = Math.max(0, Math.ceil(MATCH_SECONDS - match.time - 1e-9));
  const label = TOUCH_LEVEL_LABELS[level] || '';
  return `のこり ${left}秒　あなた ${match.score.hero} − ${match.score.rival} デカ頭　${WIN_POINTS}点先取・${label}`;
}

export function touchResultView(match) {
  const result = match.result || 'draw';
  let reason = match.endReason === 'points' ? `${WIN_POINTS}点先取` : '時間切れ';
  if (result === 'uyamuya') reason = '審判が吹っ飛んで、判定はうやむやに';
  return {
    title: TOUCH_RESULT_LABELS[result] || '…',
    tone: result === 'win' ? 'good' : result === 'lose' ? 'bad' : '',
    score: `あなた ${match.score.hero} − ${match.score.rival} デカ頭アリヌス`,
    reason,
    prompt: canPunchReferee(match) ? PUNCH_KEY_LABEL : null,
  };
}

function makeEl(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function findOrMake(doc, id) {
  if (!doc || !doc.body) return null;
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement('div');
    el.id = id;
    el.className = 'hidden';
    doc.body.append(el);
  }
  return el;
}

const defaultDoc = () => (typeof document !== 'undefined' ? document : null);

/** 遊び方のパネル（#mg-howto）。最初に使うときに要素を探す・作る */
export function createMinigamePanel(env = {}) {
  const doc = env.doc || defaultDoc();
  let root = null;
  let open = false;
  let cb = null;

  function ensure() {
    if (root) return root;
    root = findOrMake(doc, 'mg-howto');
    if (root) root.addEventListener('click', () => close());
    return root;
  }
  function show(info, onClose) {
    if (!ensure()) {
      if (typeof onClose === 'function') onClose();
      return;
    }
    cb = onClose;
    open = true;
    const panel = makeEl(doc, 'div', 'mg-panel');
    panel.append(makeEl(doc, 'h2', '', info.title || ''));
    if (info.sub) panel.append(makeEl(doc, 'p', 'mg-sub', info.sub));
    for (const line of Array.isArray(info.lines) ? info.lines : []) {
      if (line) panel.append(makeEl(doc, 'p', 'mg-desc', line));
    }
    const rows = Array.isArray(info.rows) ? info.rows : [];
    if (rows.length) {
      const dl = makeEl(doc, 'dl', '');
      for (const [k, v] of rows) dl.append(makeEl(doc, 'dt', '', k), makeEl(doc, 'dd', '', v));
      panel.append(dl);
    }
    if (info.win) panel.append(makeEl(doc, 'p', 'mg-win', info.win));
    if (info.carry) panel.append(makeEl(doc, 'p', 'mg-carry', info.carry));
    if (info.note) panel.append(makeEl(doc, 'p', 'mg-note', info.note));
    root.replaceChildren(panel);
    root.classList.remove('hidden');
  }
  function close() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    const f = cb;
    cb = null;
    if (typeof f === 'function') f();
  }
  function hide() {
    open = false;
    cb = null;
    if (root) root.classList.add('hidden');
  }
  return {
    show, close, hide, isOpen: () => open,
  };
}

/** 結果のパネル（#mg-result）。choices: [{id,label}]。選ぶと onPick(id) */
export function createResultPanel(env = {}) {
  const doc = env.doc || defaultDoc();
  let root = null;
  let open = false;
  let view = null;
  let pick = null;
  let sel = 0;
  let buttons = [];

  function mark() {
    buttons.forEach((b, i) => b.classList.toggle('sel', i === sel));
  }
  function show(v, onPick) {
    view = v;
    pick = onPick;
    sel = 0;
    open = true;
    buttons = [];
    root = root || findOrMake(doc, 'mg-result');
    if (!root) return;
    const panel = makeEl(doc, 'div', 'mg-panel');
    panel.append(makeEl(doc, 'h2', v.tone ? `mg-${v.tone}` : '', v.title || ''));
    for (const line of v.lines || []) panel.append(makeEl(doc, 'p', 'mg-line', line));
    if (v.prompt) panel.append(makeEl(doc, 'p', 'mg-prompt', v.prompt));
    const row = makeEl(doc, 'div', 'mg-choices');
    (v.choices || []).forEach((c, i) => {
      const b = makeEl(doc, 'button', 'mg-choice', c.label);
      b.type = 'button';
      b.addEventListener('mouseenter', () => { sel = i; mark(); });
      b.addEventListener('click', () => choose(i));
      row.append(b);
      buttons.push(b);
    });
    panel.append(row);
    root.replaceChildren(panel);
    root.classList.remove('hidden');
    mark();
  }
  function hide() {
    open = false;
    if (root) root.classList.add('hidden');
  }
  function choose(i) {
    if (!open || !view) return;
    const c = (view.choices || [])[i];
    if (!c) return;
    hide();
    if (typeof pick === 'function') pick(c.id);
  }
  return {
    show,
    hide,
    isOpen: () => open,
    selected: () => sel,
    move(delta) {
      const n = view && view.choices ? view.choices.length : 0;
      if (!open || !n) return;
      sel = (((sel + delta) % n) + n) % n;
      mark();
    },
    confirm() { choose(sel); },
  };
}

/** 画面中央の大きな文字（#mg-pop） */
export function createPopText(env = {}) {
  const doc = env.doc || defaultDoc();
  let el = null;
  const get = () => {
    if (el || !doc || !doc.body) return el;
    el = doc.getElementById('mg-pop');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'mg-pop';
      doc.body.append(el);
    }
    return el;
  };
  return {
    show(text, tone = '') {
      const e = get();
      if (!e) return;
      e.textContent = text;
      e.className = '';
      void e.offsetWidth; // アニメーションをやり直す
      e.className = `show ${tone}`.trim();
    },
    hide() {
      const e = get();
      if (e) {
        e.className = '';
        e.textContent = '';
      }
    },
  };
}

function createHud(env = {}) {
  const doc = env.doc || defaultDoc();
  let el = null;
  let last = '';
  const get = () => {
    if (!el && doc) el = doc.getElementById('mg-hud');
    return el;
  };
  return {
    show(text) {
      const e = get();
      if (!e) return;
      if (text !== last) {
        e.textContent = text;
        last = text;
      }
      e.classList.remove('hidden');
    },
    hide() {
      const e = get();
      if (e) e.classList.add('hidden');
    },
  };
}

/** 画面に重ねる文字の箱（無ければ作る） */
export function createTextBox(id, env = {}) {
  const doc = env.doc || defaultDoc();
  let el = null;
  const get = () => {
    if (!el) el = findOrMake(doc, id);
    return el;
  };
  return {
    show(text) {
      const e = get();
      if (!e) return;
      e.textContent = text;
      e.classList.remove('hidden');
    },
    hide() {
      const e = get();
      if (e) e.classList.add('hidden');
    },
  };
}

/** 押しっぱなしのキーと、J/K・左クリックの押し下げ */
export function createKeyTracker(env = {}) {
  const win = env.win || (typeof window !== 'undefined' ? window : null);
  const held = new Set();
  let presses = { L: false, R: false };
  let on = false;
  const onDown = (e) => {
    held.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyJ') presses.L = true;
    else if (e.code === 'KeyK') presses.R = true;
  };
  const onUp = (e) => held.delete(e.code);
  const onBlur = () => held.clear();
  const onPointer = (e) => {
    if (e.button !== 0) return;
    const tg = e.target;
    if (tg && typeof tg.closest === 'function' && tg.closest('#mg-howto, #mg-result, #pause, #title, button')) return;
    presses.L = true;
  };
  return {
    attach() {
      if (on || !win) return;
      on = true;
      win.addEventListener('keydown', onDown);
      win.addEventListener('keyup', onUp);
      win.addEventListener('blur', onBlur);
      win.addEventListener('pointerdown', onPointer);
    },
    detach() {
      if (!on || !win) return;
      on = false;
      win.removeEventListener('keydown', onDown);
      win.removeEventListener('keyup', onUp);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('pointerdown', onPointer);
      held.clear();
      presses = { L: false, R: false };
    },
    isDown: (code) => held.has(code),
    take() {
      const p = presses;
      presses = { L: false, R: false };
      return p;
    },
    flush() { presses = { L: false, R: false }; },
  };
}

export function createTouchScene(ctx) {
  const { THREE, mat, camera, input } = ctx;
  let arena = null;
  let rig = null;
  let anim = null;
  let heroPivot = null;
  let armBones = null;
  let brawl = null;
  let punchReach = 0;
  let heroPoser = null;
  let rivalPoser = null;
  let panel = null;
  let resultPanel = null;
  let pop = null;
  let hud = null;
  let keys = null;
  let phase = 'howto';
  let gameId = TOUCH_GAME_ID;
  let carry = {};
  let level = DEFAULT_LEVEL;
  let match = null;
  let ai = null;
  let t = 0;
  let phaseT = 0;
  let guard = 0;
  let leaving = false;
  let windup = null;
  let hold = 0;
  let rivalBonk = 0;
  let refFlag = null;
  let saidGo = false;
  let save = {};
  let plan = [];
  let planIdx = 0;
  let punchedFx = false;
  let banner = null;
  let carryLine = null;
  let rewardLine = null;

  function grantReward() {
    const got = ctx.grantGameItem(TOUCH_GAME_ID);
    if (got && got.item && got.isNew) rewardLine = `アイテム獲得：${got.item.name}`;
  }

  function resultExtras() {
    return [carryLine, rewardLine].filter((s) => typeof s === 'string' && s);
  }

  function persist(next) {
    if (!next) return;
    save = next;
    const s = touchStorage();
    if (s) storeTouchSave(s, save);
  }

  function readSave() {
    const s = touchStorage();
    return s ? loadTouchSave(s) : save;
  }

  function build() {
    arena = buildTouchArena(THREE, {
      mat,
      addLights: (w) => ctx.addLights(w),
      makeShadow: (r) => ctx.makeShadow(r),
    });
    heroPivot = new THREE.Group();
    heroPivot.position.set(TOUCH_LAYOUT.hero.x, arena.floorY, TOUCH_LAYOUT.hero.z);
    arena.world.add(heroPivot);
    rig = createHeroRig(THREE, mat);
    rig.root.rotation.y = Math.PI;
    heroPivot.add(rig.root);
    const sh = ctx.makeShadow(1.1);
    sh.position.set(TOUCH_LAYOUT.hero.x, arena.floorY + 0.02, TOUCH_LAYOUT.hero.z);
    arena.world.add(sh);
    heroPoser = createPoser(heroPivot, { forwardSign: -1 });
    rivalPoser = createPoser(arena.rival.root, { forwardSign: 1 });
    anim = createAnimState();
  }

  function placeCamera() {
    const sway = Math.sin(t * 0.4) * 0.15;
    const near = phase === 'result' || phase === 'finish' ? 0.5 : 0;
    camera.position.set(1.3 + sway, 3.5 - near * 0.4, 4.2 - near);
    camera.lookAt(0, 2.0, -0.6);
  }

  function backToGallery() {
    if (leaving) return;
    leaving = true;
    if (!ctx.returnToGallery(gameId)) leaving = false;
  }

  function startRound() {
    match = createMatch(touchCarryMods(carry));
    rewardLine = null;
    const seed = Date.now() >>> 0;
    ai = createTouchAI({ seed, level });
    plan = planInterrupts({ seed, silliness: sillyLevelNow() });
    planIdx = 0;
    punchedFx = false;
    arena.resetReferee();
    arena.setRefereeHelmet(refereeHasHelmet(save));
    if (banner) banner.hide();
    windup = null;
    brawl = null;
    hold = 0;
    rivalBonk = 0;
    refFlag = null;
    saidGo = false;
    phase = 'ready';
    phaseT = 0;
    if (keys) keys.flush();
    pop.show('はっけよい…');
    ctx.ui.setHint('A/D: 傾く　S: しゃがむ　W: 前のめり　J・左クリック / K: タッチ　Esc: ポーズ');
  }

  function showResult() {
    phase = 'result';
    guard = 0.4;
    const v = touchResultView(match);
    const lines = [v.score, v.reason];
    if (match.brawled) lines.push(match.result === 'win' ? '乱闘で相手を気絶させた！' : '乱闘で気絶させられた…');
    resultPanel.show({
      title: v.title,
      tone: v.tone,
      lines: [...lines, ...resultExtras()],
      choices: touchResultChoices(match),
    }, (id) => {
      if (id === 'again') startRound();
      else if (id === 'punch') doPunch();
      else backToGallery();
    });
    ctx.ui.setHint('←→ で選ぶ ／ Enter で決定');
  }

  function startBrawl() {
    brawl = createBrawl({ seed: Date.now() >>> 0 });
    phase = 'brawl';
    phaseT = 0;
    keys.flush();
    pop.show('乱闘だ！', 'bad');
    ctx.ui.setHint(BRAWL_HINT);
  }

  function brawlStep(d) {
    const k = keys;
    const pr = k.take();
    const prevRivalHits = brawl.rival.hits;
    brawl = stepBrawl(brawl, {
      moveX: (k.isDown('KeyD') || k.isDown('ArrowRight') ? 1 : 0) - (k.isDown('KeyA') || k.isDown('ArrowLeft') ? 1 : 0),
      moveZ: (k.isDown('KeyS') || k.isDown('ArrowDown') ? 1 : 0) - (k.isDown('KeyW') || k.isDown('ArrowUp') ? 1 : 0),
      punch: pr.L || pr.R,
    }, d);
    if (pr.L || pr.R) punchReach = 1;
    for (const e of brawl.events) {
      if (e === 'heroHit') { gameSfx('refPunch'); pop.show('ボコッ！', 'good'); arena.cheer(1); }
      else if (e === 'rivalHit') { gameSfx('touch'); pop.show('いてっ！', 'bad'); }
    }
    if (brawl.rival.hits !== prevRivalHits) rivalBonk = 0.5;
    const r = brawlResult(brawl);
    if (r) {
      match.result = r;
      match.winner = r === 'win' ? 'hero' : 'rival';
      match.brawled = true;
      try { persist(recordTouchResult(save, r)); } catch { /* 遊べる */ }
      if (r === 'win') grantReward();
      pop.show(r === 'win' ? 'ノックアウト！' : 'きゅう…', r === 'win' ? 'good' : 'bad');
      phase = 'finish';
      phaseT = 0;
    }
  }

  /** 負けの判定のあと、F で審判に手を出す（そのあと乱闘） */
  function doPunch() {
    if (!punchReferee(match)) return false;
    resultPanel.hide();
    try {
      persist(recordPunch(save));
    } catch (err) {
      console.warn('殴った回数を保存できません:', err);
    }
    phase = 'punch';
    phaseT = 0;
    punchedFx = false;
    ctx.ui.setHint('');
    return true;
  }

  function snapFighters() {
    const s = {};
    for (const w of ['hero', 'rival']) {
      const f = match.fighters[w];
      s[w] = {
        lean: f.lean, crouch: f.crouch, forward: f.forward, mods: f.mods,
      };
    }
    return s;
  }

  function handleEvents(evs, snap) {
    for (const e of evs) {
      if (e.type === 'touch' && snap && !touchMohawkHit(snap[e.by], snap[e.target], e.hand)) {
        match.score[e.by] = Math.max(0, match.score[e.by] - (e.points || 1));
        match.fighters[e.target].stagger = 0;
        gameSfx('whiff');
        if (e.by === 'hero') pop.show('スカッ');
        else pop.show('かわした！', 'good');
        continue;
      }
      if (e.type === 'end') {
        const h = match.score.hero;
        const r = match.score.rival;
        match.result = h > r ? 'win' : h < r ? 'lose' : 'draw';
        match.winner = h > r ? 'hero' : h < r ? 'rival' : null;
        e.result = match.result;
      }
      if (e.type === 'touch') {
        gameSfx('touch');
        if (e.by === 'hero') {
          pop.show(e.points > 1 ? 'ダブルタッチ！' : 'タッチ！', 'good');
          rivalBonk = 0.5;
        } else {
          pop.show('タッチされた！', 'bad');
        }
        refFlag = { side: e.by === 'hero' ? -1 : 1, t: 0.7 };
        arena.cheer(1);
      } else if (e.type === 'forgiven') {
        gameSfx('whiff');
        pop.show('帳消し！', 'good');
      } else if (e.type === 'whiff') {
        gameSfx('whiff');
        if (e.by === 'hero') pop.show(e.reason === 'out-of-reach' ? 'とどかない！' : 'スカッ');
        else if (e.reason === 'dodged') pop.show('かわした！', 'good');
      } else if (e.type === 'end') {
        phase = 'finish';
        phaseT = 0;
        windup = null;
        if (banner) banner.hide();
        try {
          persist(recordTouchResult(save, e.result));
        } catch (err) {
          console.warn('結果を保存できません:', err);
        }
        if (earnsReward(match)) grantReward();
        pop.show('しょうぶあり！', e.result === 'win' ? 'good' : e.result === 'lose' ? 'bad' : '');
        arena.cheer(1.5);
      }
    }
  }

  function playStep(d) {
    const k = keys;
    const due = nextDueInterrupt(plan, planIdx, match.time);
    if (due && !match.interrupt) {
      planIdx += 1;
      if (startInterrupt(match, due.kind, due.seconds)) {
        windup = null;
        banner.show(INTERRUPT_TEXT[due.kind] || 'なにか起きた！');
        arena.cheer(1);
      }
    }
    if (match.interrupt) {
      k.take();
      const sn = snapFighters();
      handleEvents(stepMatch(match, d), sn);
      if (!match.interrupt) banner.hide();
      return;
    }
    const pos = heroPostureFromKeys({
      a: k.isDown('KeyA') || k.isDown('ArrowLeft'),
      d: k.isDown('KeyD') || k.isDown('ArrowRight'),
      s: k.isDown('KeyS') || k.isDown('ArrowDown'),
      w: k.isDown('KeyW') || k.isDown('ArrowUp'),
    });
    if (match.fighters.hero.reach) setPosture(match, 'hero', { forward: pos.forward });
    else setPosture(match, 'hero', pos);
    const pr = k.take();
    if (pr.L) startReach(match, 'hero', 'L');
    else if (pr.R) startReach(match, 'hero', 'R');

    const rv = match.fighters.rival;
    const dec = ai.think(match, d);
    if (dec.type === 'attack') {
      if (!windup && !rv.reach && rv.stagger <= 0) {
        setPosture(match, 'rival', dec.posture);
        windup = { hand: dec.hand, t: WINDUP_SECONDS[level] || 0.28 };
        hold = windup.t + 0.5;
      }
    } else if (dec.type !== 'idle' && !windup) {
      applyAiDecision(match, dec);
      hold = dec.type === 'dodge' ? 0.55 : 0.4;
    }
    if (windup) {
      windup.t -= d;
      if (rv.stagger > 0) windup = null;
      else if (windup.t <= 0) {
        startReach(match, 'rival', windup.hand);
        windup = null;
      }
    }
    hold -= d;
    if (hold <= 0 && !windup && !rv.reach && (rv.lean || rv.crouch || rv.forward)) {
      setPosture(match, 'rival', { lean: 0, crouch: false, forward: false });
    }
    const sn = snapFighters();
    handleEvents(stepMatch(match, d), sn);
  }

  /** 主人公のモデルの腕の骨を armReachAngles で回す */
  function poseHeroArms(ext) {
    if (!armBones || (!armBones.L && !armBones.R)) armBones = heroArmBones(rig);
    for (const hand of ['L', 'R']) {
      const b = armBones[hand];
      const e = ext[hand] || 0;
      if (!b || !(e > 0)) continue;
      const a = armReachAngles(e);
      b.rotateX(a.shoulderX);
    }
  }

  function poseRivalArm(arm, side, ext, wind) {
    arm.rotation.x = -2.2 * ext + (wind ? 0.7 : 0);
    arm.rotation.z = side * 0.3 * (1 - ext);
    arm.scale.y = 1 + 3 * ext;
  }

  function animate(d) {
    const H = match ? match.fighters.hero : null;
    const R = match ? match.fighters.rival : null;
    heroPoser.update(H, d, t);
    rivalPoser.update(R, d, t);
    const ext = { L: reachExtension(H, 'L'), R: reachExtension(H, 'R') };
    const rv = arena.rival;
    if (phase === 'brawl' && brawl) {
      punchReach = Math.max(0, punchReach - d * 3);
      const bh = brawl.hero;
      const br = brawl.rival;
      heroPivot.position.set(bh.x * BRAWL_SCALE, arena.floorY, bh.z * BRAWL_SCALE);
      heroPivot.rotation.y = Math.atan2(-(br.x - bh.x), -(br.z - bh.z));
      heroPivot.rotation.z = bh.stagger > 0 ? Math.sin(t * 30) * 0.3 : 0;
      rv.root.position.set(br.x * BRAWL_SCALE, arena.floorY, br.z * BRAWL_SCALE);
      rv.root.rotation.y = Math.atan2(bh.x - br.x, bh.z - br.z);
      rv.root.rotation.z = br.ko ? Math.PI / 2 : (br.stagger > 0 ? Math.sin(t * 30) * 0.3 : 0);
      const rp = br.cooldown > 0 ? br.cooldown / 0.9 : 0;
      poseRivalArm(rv.armR, 1, rp, false);
      poseRivalArm(rv.armL, -1, 0, false);
      if (rivalBonk > 0) rivalBonk = Math.max(0, rivalBonk - d);
      stepAnim(anim, { moving: false, airborne: false, dt: d });
      rig.apply(anim);
      poseHeroArms({ L: 0, R: Math.max(punchReach, bh.cooldown > 0 ? bh.cooldown / PUNCH_COOLDOWN : 0) });
      return;
    }
    poseRivalArm(rv.armL, -1, reachExtension(R, 'L'), windup && windup.hand === 'L');
    poseRivalArm(rv.armR, 1, reachExtension(R, 'R'), windup && windup.hand === 'R');
    const it = match && match.interrupt ? match.interrupt.kind : null;
    let yaw = 0;
    let lunge = 0;
    rv.head.rotation.y = 0;
    rv.root.rotation.y = 0;
    arena.referee.head.rotation.x = 0;
    if (it === 'tangle') {
      const w = Math.sin(t * 14);
      ext.L = 0.8 + 0.15 * w;
      ext.R = 0.8 - 0.15 * w;
      poseRivalArm(rv.armL, -1, 0.7 + 0.2 * w, false);
      poseRivalArm(rv.armR, 1, 0.7 - 0.2 * w, false);
      rv.head.rotation.y = (Math.sin(t * 2.5) > 0 ? 1 : -1) * 0.7;
    } else if (it === 'dance') {
      yaw = Math.sin(t * 7) * 0.5;
      rv.root.rotation.y = -yaw;
    } else if (it === 'sneeze') {
      arena.referee.head.rotation.x = Math.max(0, Math.sin(t * 9)) * 0.6;
    }
    if (phase === 'punch') {
      yaw = (-Math.PI / 2) * Math.min(1, phaseT / 0.15);
      lunge = 0.5 * Math.min(1, phaseT / PUNCH_IMPACT);
      ext.R = phaseT < 0.45 ? Math.min(1, phaseT / PUNCH_IMPACT) : Math.max(0, 1 - (phaseT - 0.45) / 0.25);
    }
    heroPivot.rotation.y = yaw;
    heroPivot.rotation.z = leanTilt(H);
    heroPivot.position.x = TOUCH_LAYOUT.hero.x + lunge;
    heroPivot.position.z = TOUCH_LAYOUT.hero.z;
    rv.root.position.x = TOUCH_LAYOUT.rival.x;
    rv.root.position.z = TOUCH_LAYOUT.rival.z;
    rv.root.rotation.z = leanTilt(R);
    if (rivalBonk > 0) {
      rivalBonk = Math.max(0, rivalBonk - d);
      rv.mohawk.scale.set(1, 1 + Math.sin(rivalBonk * 40) * 0.25 * (rivalBonk / 0.5), 1);
    } else {
      rv.mohawk.scale.set(1, 1, 1);
    }
    if (refFlag) {
      refFlag.t -= d;
      arena.referee.arm.rotation.z = refFlag.side * 1.2;
      if (refFlag.t <= 0) refFlag = null;
    }
    const over = match && match.over && (phase === 'finish' || phase === 'result');
    const hop = Math.abs(Math.sin(t * 9)) * 0.25;
    heroPivot.position.y = arena.floorY + (over && match.winner === 'hero' ? hop : 0);
    rv.root.position.y = arena.floorY + (over && match.winner === 'rival' ? hop : 0);
    stepAnim(anim, { moving: false, airborne: false, dt: d });
    rig.apply(anim);
    poseHeroArms(ext);
  }

  function onHowtoClosed() {
    startRound();
  }

  return {
    enter(params = {}) {
      if (!arena) build();
      gameId = typeof params.gameId === 'string' && params.gameId ? params.gameId : TOUCH_GAME_ID;
      carry = params.carry && typeof params.carry === 'object' ? params.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      rewardLine = null;
      leaving = false;
      t = 0;
      phaseT = 0;
      guard = 0.3;
      phase = 'howto';
      match = null;
      windup = null;
      brawl = null;
      armBones = null;
      save = readSave();
      level = carry.hard ? 'hard' : getTouchLevel(save);
      arena.resetReferee();
      arena.setRefereeHelmet(refereeHasHelmet(save));
      heroPivot.rotation.y = 0;
      heroPivot.position.x = TOUCH_LAYOUT.hero.x;
      Object.assign(anim, createAnimState());
      heroPoser.reset();
      rivalPoser.reset();
      applyMohawkColor(rig, ctx.mohawkColor());
      ctx.setWorld(arena.world);
      placeCamera();
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      if (!panel) panel = createMinigamePanel();
      if (!resultPanel) resultPanel = createResultPanel();
      if (!pop) pop = createPopText();
      if (!hud) hud = createHud();
      if (!keys) keys = createKeyTracker();
      if (!banner) banner = createTextBox('mg-banner');
      banner.hide();
      resultPanel.hide();
      hud.hide();
      pop.hide();
      keys.attach();
      panel.show(touchHowto(level, carryLine, !!carry.hard), onHowtoClosed);
    },
    update(dt) {
      if (!arena) return;
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.1);
      if (dt > 0.25 && keys) keys.flush();
      t += d;
      phaseT += d;
      guard = Math.max(0, guard - d);
      arena.update(t, d);
      ensureGameMusic('touch');
      if (phase === 'howto') {
        // 高難易度は「つよい」で固定（数字キーで弱められない・ふつうの段の保存も変えない）
        const picks = carry.hard ? [] : [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2'], ['Digit3', 'Numpad3']];
        picks.forEach((codes, i) => {
          if (input.wasPressed(...codes) && TOUCH_AI_LEVELS[i] !== level) {
            level = TOUCH_AI_LEVELS[i];
            try {
              persist(setTouchLevel(save, level));
            } catch {
              // 強さの保存に失敗しても遊べる
            }
            panel.show(touchHowto(level, carryLine, !!carry.hard), onHowtoClosed);
          }
        });
        if (guard <= 0 && input.wasPressed('Enter', 'NumpadEnter', 'Space')) panel.close();
      } else if (phase === 'ready') {
        if (!saidGo && phaseT >= 1.1) {
          saidGo = true;
          pop.show('のこった！', 'good');
        }
        if (phaseT >= 1.5) {
          phase = 'play';
          keys.flush();
        }
      } else if (phase === 'play') {
        playStep(d);
      } else if (phase === 'finish') {
        if (phaseT >= 1.3) showResult();
      } else if (phase === 'punch') {
        if (!punchedFx && phaseT >= PUNCH_IMPACT) {
          punchedFx = true;
          gameSfx('refPunch');
          arena.launchReferee();
          pop.show('ズコー！', 'zuko');
          arena.cheer(1.5);
        }
        if (phaseT >= PUNCH_RESULT_AT) startBrawl();
      } else if (phase === 'brawl') {
        brawlStep(d);
      } else if (phase === 'result' && guard <= 0) {
        if (input.wasPressed('KeyF') && canPunchReferee(match)) doPunch();
        if (input.wasPressed('ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW')) resultPanel.move(-1);
        if (input.wasPressed('ArrowRight', 'ArrowDown', 'KeyD', 'KeyS')) resultPanel.move(1);
        if (input.wasPressed('Enter', 'NumpadEnter', 'Space')) resultPanel.confirm();
      }
      if (match && (phase === 'play' || phase === 'ready' || phase === 'finish')) hud.show(touchHud(match, level));
      else hud.hide();
      animate(d);
      placeCamera();
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, match: smokeSummary(match), carry: smokeSummary(carry) };
    },
    exit() {
      if (panel) panel.hide();
      if (resultPanel) resultPanel.hide();
      if (hud) hud.hide();
      if (pop) pop.hide();
      if (banner) banner.hide();
      if (keys) keys.detach();
      ctx.ui.setHint('');
    },
    pauseItems() {
      return [{ id: PAUSE_BACK_GALLERY, label: '館に戻る' }];
    },
    onPauseAction(id) {
      if (id === PAUSE_BACK_GALLERY) backToGallery();
    },
    get carry() { return carry; },
  };
}
