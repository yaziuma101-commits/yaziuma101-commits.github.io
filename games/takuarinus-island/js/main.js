// 起動・場面の切り替え・共有の UI（会話・ヒント・HUD・ポーズ・暗転）・アイテムの持ち込み・おふざけ。
// 場面の登録: scenes.ending = エンディング（先輩の会話で evaluateEnding が start を返したとき）
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { installSafeStorage } from './safe-storage.js';
// ---- モヒカンの色：起動時に保存した色を戻し、付け替えたら保存する（規則は mohawk-color.js） ----
import { loadSelectedColor as restoreSavedMohawk, selectColor as storeMohawkChoice, availableColors } from './mohawk-color.js';
import {
  setDefaultMohawkColor as setBootMohawk, onDefaultMohawkColorChange as watchMohawkColor,
} from './hero-model.js';
import { BOSSES as MOHAWK_BOSSES } from './bosses.js';
import { ownedColorsFrom as mohawkOwnedFrom } from './ending.js';

// 古い「あとから ctx に足す」仕掛けの呼び出し跡（ctx の定義の中に直接書いたので何もしない）
function retiredCtxNoop() {
  return true;
}

function ownedMohawkColorsNow(store) {
  try {
    const prog = loadProgress(store);
    const ids = MOHAWK_BOSSES.filter((b) => isBossDefeated(prog, b.id)).map((b) => b.id);
    return mohawkOwnedFrom(MOHAWK_BOSSES, ids);
  } catch {
    return [];
  }
}

// 保存先を最初に確かめる（iframe の中で localStorage が使えなくても、どのゲームも落ちないように）
const SAFE_STORAGE = installSafeStorage(globalThis);

(() => {
  let store = null;
  try {
    store = globalThis.localStorage || null;
  } catch {
    store = null;
  }
  if (!store) return;
  try {
    setBootMohawk(restoreSavedMohawk(store, ownedMohawkColorsNow(store)));
  } catch {
    // 戻せなければ既定の青
  }
  watchMohawkColor((id) => {
    try {
      storeMohawkChoice(ownedMohawkColorsNow(store), id, store);
    } catch {
      // 保存できなくても付け替えは有効
    }
  });
})();
// ---- 配線の部品（今後のゲームを足すときにも使えるよう公開する） ----
import { createRewardScene as rewardSceneFactory, claimVictory as claimVictoryForWiring } from './scenes/reward.js';
import { createAudioRules as audioRulesFactory } from './audio-rules.js';
import { createAudio as audioFactory } from './audio.js';

/** 効果音：規則（消音・音量の保存つき）と合成器を作る。最初の入力で解除、M で消音 */
export function createSoundKit(storage, env = {}) {
  const rules = audioRulesFactory(storage);
  const audio = audioFactory(rules, env);
  const sfx = (name) => audio.play(name);
  return {
    rules,
    audio,
    sfx,
    onKey(code) {
      audio.unlock();
      if (code === 'KeyM') return audio.toggleMute();
      return null;
    },
    talk: () => sfx('talk'),
    confirm: () => sfx('confirm'),
    dash: () => sfx('dash'),
  };
}

/** 報酬の場面を登録する（scenes.reward = 報酬の場面） */
export function registerRewardScene(scenes, ctx) {
  scenes.reward = rewardSceneFactory(ctx);
  return scenes.reward;
}

/** 勝ちを記録して保存してから、報酬の場面へ進む */
export function settleAndGotoReward(ctx, storage, progress, boss) {
  const r = claimVictoryForWiring(progress, boss);
  saveProgress(storage, r.state);
  ctx.goto('reward', { bossId: boss.id, isNew: r.isNew });
  return r;
}
import {
  loadProgress, saveProgress, mohicanCount, clearProgress, isBossDefeated, collectMohican,
} from './progress.js';
import * as wiringProgress from './progress.js';
import * as wiringEnding from './ending.js';
import * as wiringRegistry from './boss-registry.js';

import { BOSSES, MOHICAN_TOTAL, findBoss } from './bosses.js';
import { getBossModule, bossGameId } from './boss-registry.js';
import {
  ITEMS, resolveCarry, mergeParams, effectSummary,
} from './item-table.js';
import {
  ITEM_STORAGE_KEY, loadItemState, grantItemForClear, createItemState, selectCarry, serializeItems, carryChoices,
} from './item-store.js';
import { createItemUi } from './item-ui.js';
import { createRng, timeSeed } from './seeded-rng.js';
import { gameById } from './game-catalog.js';
import { createAudio } from './audio.js';
import * as AudioRulesMod from './audio-rules.js';
import { musicSceneFor } from './audio-music.js';
import * as InputMod from './input.js';
import {
  closedPause, openPause, pauseInput, canPause, choosePause, standardPauseItems, isPauseSubPanel,
  volumeAdjust, VOLUME_CHANNELS, HOWTO_SECTIONS, RESUME_ID, PAUSE_HUB_ID, PAUSE_SILLY_ID,
  PAUSE_VOLUME_ID, PAUSE_HOWTO_ID, sillyPauseItem, sillyAdjust, SILLY_LEVEL_NAMES,
  scenePauseItems, PAUSE_GALLERY_ID, PAUSE_TITLE_ID,
} from './pause.js';
import { setDefaultMohawkColor, getDefaultMohawkColor } from './hero-model.js';
import {
  SILLY_STORAGE_KEY, loadSillyLevel, serializeSilly, normalizeSillyLevel,
} from './silly-rules.js';
import { createSillyFx } from './silly-fx.js';
import * as TitleMod from './scenes/title.js';
import * as HubMod from './scenes/hub.js';
import * as RoomMod from './scenes/room.js';
import * as RewardSceneMod from './scenes/reward.js';
import * as EndingMod from './scenes/ending.js';
import { createGalleryScene } from './scenes/gallery.js';
import { createConstructionScene } from './scenes/construction.js';
import { createTouchScene } from './scenes/touch.js';
import { createStackScene } from './scenes/stack.js';
import { createShogiScene } from './scenes/shogi.js';
import { createKendamaTopScene as createKendamaScene } from './kendama-top-scene.js';
import { createNovelScene as createNovelScenePlain } from './novel-scene.js';
import { withNovelRoom3d } from './novel-room3d.js';
import { withGameIntro } from './game-intro-ui.js';
import { clearSaveData } from './save-reset.js';
import { smokeProblems } from './smoke-state.js';
import { createOpeningScene } from './scenes/opening.js';
import { createMansionIntroScene } from './scenes/mansion-intro.js';
import { createGalleryModeScene } from './scenes/gallery-mode.js';
import { createAllPaintingsScene } from './scenes/all-paintings.js';
import { withDifficulty, DIFFICULTY_CHOICES } from './hard-mode.js';
import { createChaos, stepChaos } from './hard-chaos.js';
import { loadStory, saveStory, hardUnlocked } from './story.js';
import { reviewSave } from './review-save.js';
import {
  loadPaintings, savePaintings, earnPainting, migratePaintings, PAINTING_TOTAL,
} from './paintings.js';
import { createFindFileScene } from './ff-scene.js';
import { createLeverFighterScene } from './lf-scene.js';
import { createDarkSoulScene } from './ds-scene.js';
import { createKaijuScene } from './kj-scene.js';
import { renderSizeFor } from './ds-visual.js';
import { ENTRANCE_PAINTINGS } from './gallery-data.js';
import { loadLang, installDomTranslation, getLang } from './i18n.js';

/** 小説の場面（3Dの勉強部屋で包む） */
function createNovelScene(c) {
  return withNovelRoom3d(createNovelScenePlain(c), c);
}

const FADE_TIME = 0.25;

function byId(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.append(el);
  }
  return el;
}

for (const [k, v] of Object.entries(PALETTE)) document.documentElement.style.setProperty(`--p-${k}`, v);

// ---- 保存先 ----
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
function pickStorage() {
  return SAFE_STORAGE.storage || memoryStorage();
}
const storage = pickStorage();
// 言語（英語ならページの文字を対応表で置き換え続ける。題字は1文字ずつの飾りなので作り直す）
if (loadLang(storage) === 'en') {
  const line1 = document.querySelector('.tl-line1');
  const line2 = document.querySelector('.tl-line2');
  if (line1) line1.textContent = 'Takuarinus and the';
  if (line2) {
    line2.replaceChildren(...['Mo', 'haw', 'k ', 'Is', 'la', 'nd'].map((s) => {
      const sp = document.createElement('span');
      sp.textContent = s;
      return sp;
    }));
  }
  installDomTranslation(document);
}
const getProgress = () => loadProgress(storage);

// ---- 描画 ----
const existingCanvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: existingCanvas || undefined, antialias: true });
// 64 ビット機風：内部 320x240 で描いて、CSS で画面いっぱいに滑らかに引き伸ばす（バイリニア）
const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 240;
renderer.setPixelRatio(1);
renderer.setSize(INTERNAL_WIDTH, INTERNAL_HEIGHT, false);
renderer.domElement.style.width = '100vw';
renderer.domElement.style.height = '100vh';
renderer.domElement.style.display = 'block';
if (!existingCanvas) document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
let activeCamera = camera;
let world = new THREE.Scene();
world.background = new THREE.Color(PALETTE.sky);

// 真っ暗ソウルだけ画面の解像度で描く（ほかの場面は内部 320×240 の引き伸ばし）
let fullResolution = false;
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (fullResolution) {
    const size = renderSizeFor({
      full: true, width: w, height: h, dpr: window.devicePixelRatio || 1,
    });
    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(size.width, size.height, false);
  } else {
    renderer.setPixelRatio(1);
    renderer.setSize(INTERNAL_WIDTH, INTERNAL_HEIGHT, false);
  }
  for (const c of new Set([camera, activeCamera])) {
    if (c && c.isPerspectiveCamera) {
      c.aspect = w / h;
      c.updateProjectionMatrix();
    }
  }
}
window.addEventListener('resize', onResize);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// 空のドーム（上が濃い青、地平線が明るい水色）。霧の影響を受けず、カメラについてくる
function buildSkyDome() {
  const R = 400;
  const geo = new THREE.SphereGeometry(R, 24, 12);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.sky);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, pos.getY(i) / R));
    c.copy(horizon).lerp(top, Math.pow(k, 0.7));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, m);
  dome.name = 'sky-dome';
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.onBeforeRender = (r, s, cam) => {
    if (!cam) return;
    dome.position.copy(cam.position);
    dome.updateMatrixWorld();
  };
  return dome;
}
world.add(buildSkyDome());

const matCache = new Map();
function mat(key) {
  if (matCache.has(key)) return matCache.get(key);
  let color;
  try {
    color = new THREE.Color(PALETTE[key] ?? key);
  } catch {
    color = new THREE.Color(PALETTE.uiText);
  }
  const m = new THREE.MeshLambertMaterial({ color });
  matCache.set(key, m);
  return m;
}

function addLights(w) {
  const hemi = new THREE.HemisphereLight(PALETTE.lightSky, PALETTE.lightGround, 1.4);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.8);
  sun.position.set(20, 40, 15);
  const amb = new THREE.AmbientLight(PALETTE.lightSky, 0.5);
  w.add(hemi, sun, amb);
  return { hemi, sun, amb };
}

const shadowGeo = new THREE.CircleGeometry(0.5, 20);
let shadowMat = null;
function makeShadow(size = 1) {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      color: PALETTE.shadow, transparent: true, opacity: 0.28, depthWrite: false,
    });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(size);
  m.renderOrder = 1;
  return m;
}

// ---- 入力 ----
function fallbackInput() {
  const down = new Set();
  let pressed = new Set();
  let drag = 0;
  let dragging = false;
  let lastX = 0;
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  window.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    drag += e.clientX - lastX;
    lastX = e.clientX;
  });
  return {
    isDown: (...codes) => codes.some((c) => down.has(c)),
    wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
    consumeDrag: () => { const d = drag; drag = 0; return d; },
    reset: () => { down.clear(); pressed.clear(); drag = 0; },
    endFrame: () => { pressed = new Set(); },
  };
}
const isInput = (v) => v && typeof v.isDown === 'function' && typeof v.wasPressed === 'function';
function makeInput() {
  const obj = Object.values(InputMod).find((v) => v && typeof v === 'object' && isInput(v));
  if (obj) return obj;
  const fns = [InputMod.default, ...Object.entries(InputMod)
    .filter(([k, v]) => typeof v === 'function' && /^create/i.test(k)).map(([, v]) => v)];
  for (const fn of fns) {
    if (typeof fn !== 'function') continue;
    try {
      const inp = fn(window, renderer.domElement);
      if (isInput(inp)) return inp;
    } catch (e) {
      console.warn(e);
    }
  }
  return fallbackInput();
}
const input = makeInput();
if (typeof input.consumeDrag !== 'function') input.consumeDrag = () => 0;
if (typeof input.reset !== 'function') input.reset = () => {};
const END_FRAME = ['endFrame', 'update', 'tick', 'nextFrame', 'clearFrame', 'postFrame', 'flush'];
function endInputFrame() {
  for (const k of END_FRAME) {
    if (typeof input[k] === 'function') {
      try { input[k](); } catch { /* 握りつぶす */ }
      return;
    }
  }
}
const pressed = (...codes) => codes.some((c) => input.wasPressed(c));

// ---- 音 ----
function fallbackRules() {
  const state = { unlocked: false, muted: false, volumes: { sfx: 7, music: 5 } };
  return {
    state,
    unlock() { state.unlocked = true; },
    planSfx(e) { return state.unlocked && !state.muted ? { sound: e, gain: state.volumes.sfx / 10 } : null; },
    planMusic(s) { return s && state.unlocked && !state.muted ? { track: s, gain: state.volumes.music / 25 } : null; },
    setVolume(ch, n) { state.volumes[ch] = n; },
    toggleMute() { state.muted = !state.muted; },
  };
}
function makeRules() {
  const io = {
    getItem: (k) => storage.getItem(k),
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k),
    storage,
  };
  const fns = [AudioRulesMod.createAudioRules, ...Object.entries(AudioRulesMod)
    .filter(([k, v]) => typeof v === 'function' && /^create/i.test(k)).map(([, v]) => v)];
  for (const fn of fns) {
    if (typeof fn !== 'function') continue;
    try {
      const r = fn(io);
      if (r && typeof r.planSfx === 'function') return r;
    } catch (e) {
      console.warn(e);
    }
  }
  return fallbackRules();
}
const rules = makeRules();
const audio = createAudio(rules);
const unlockAudio = () => {
  try {
    if (audio.unlock()) audio.refreshMusic();
  } catch { /* 握りつぶす */ }
};
window.addEventListener('keydown', unlockAudio, true);
window.addEventListener('pointerdown', unlockAudio, true);

function probeVolume(ch) {
  try {
    const st = rules.state || {};
    const cand = [st.volumes && st.volumes[ch], st.volume && st.volume[ch], st[ch],
      typeof rules.getVolume === 'function' ? rules.getVolume(ch) : undefined];
    const n = cand.find((x) => typeof x === 'number' && Number.isFinite(x));
    return n === undefined ? 7 : n;
  } catch {
    return 7;
  }
}
const volumes = Object.fromEntries(VOLUME_CHANNELS.map((c) => [c.id, probeVolume(c.id)]));

// ---- おふざけ ----
function readSilly() {
  try {
    const t = storage.getItem(SILLY_STORAGE_KEY);
    return loadSillyLevel(t ? JSON.parse(t) : null);
  } catch {
    return loadSillyLevel(null);
  }
}
let sillyLevel = readSilly();
audio.setSillyLevel(sillyLevel);
const silly = createSillyFx({ getLevel: () => sillyLevel, rng: createRng(timeSeed()) });
function setSillyLevel(n) {
  sillyLevel = normalizeSillyLevel(n);
  audio.setSillyLevel(sillyLevel);
  try { storage.setItem(SILLY_STORAGE_KEY, JSON.stringify(serializeSilly(sillyLevel))); } catch { /* 握りつぶす */ }
  return sillyLevel;
}

function sfx(event) {
  let ok = false;
  try { ok = audio.play(event); } catch { ok = false; }
  const e = String(event || '');
  if (/land/i.test(e)) silly.land();
  else if (/^(hit|damage|hurt|ouch)/i.test(e)) silly.hit();
  return ok;
}

// ---- モヒカンの付け替えの色 ----
// 付け替えの色の保存名（以前は他のモジュールから探していたが、実際はいつもこの名前だった）
const COLOR_KEY = 'takuarinus.mohawk.v1';
function readSavedColor() {
  try {
    const t = storage.getItem(COLOR_KEY);
    if (t == null) return null;
    let v = t;
    try { v = JSON.parse(t); } catch { v = t; }
    if (v && typeof v === 'object') v = v.color ?? v.id ?? v.mohawk ?? v.current ?? null;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
{
  // 持っている色だけ付ける（進行が消えて色の保存だけ残ると、未獲得の色で始まっていた）
  const c = readSavedColor();
  if (c && availableColors(ownedMohawkColorsNow(storage)).includes(c)) setDefaultMohawkColor(c);
}
function setMohawkColor(id) {
  const c = setDefaultMohawkColor(id);
  try { storage.setItem(COLOR_KEY, JSON.stringify({ v: 1, color: c })); } catch { /* 握りつぶす */ }
  return c;
}

// ---- UI ----
const hudEl = byId('ui-hud');
const hintEl = byId('ui-hint');
const toastEl = byId('ui-toast');
// 高難易度で遊んでいる間の印（画面の縁を赤く・下の札に何が変わるかを書く）
const hardFrameEl = document.createElement('div');
hardFrameEl.id = 'hard-frame';
hardFrameEl.className = 'hidden';
// 説明の帯（#hard-badge）は操作の説明と重なるので出さない（依頼者の指摘 2026-11-04）。赤い縁だけ残す
document.body.append(hardFrameEl);
// 高難易度の派手さ: 縁から火花が飛び、ときどき画面が揺れる（hard-chaos.js がいつ出すかを決める）
let chaos = null;
function tickChaos(dt) {
  const on = !hardFrameEl.classList.contains('hidden') && !paused;
  if (!on) {
    if (chaos) {
      chaos = null;
      renderer.domElement.style.transform = '';
    }
    return;
  }
  if (!chaos) chaos = createChaos();
  const r = stepChaos(chaos, dt, currentName);
  for (const s of r.sparks) {
    const el = document.createElement('i');
    el.className = `hard-spark hard-spark-${s.hue}`;
    el.style.left = `${(s.x * 100).toFixed(1)}%`;
    el.style.top = `${(s.y * 100).toFixed(1)}%`;
    el.style.width = el.style.height = `${s.size}px`;
    el.addEventListener('animationend', () => el.remove());
    hardFrameEl.append(el);
  }
  const k = r.shake * 9;
  renderer.domElement.style.transform = k > 0.2
    ? `translate(${((Math.random() - 0.5) * k).toFixed(1)}px, ${((Math.random() - 0.5) * k).toFixed(1)}px) rotate(${((Math.random() - 0.5) * k * 0.08).toFixed(2)}deg)`
    : '';
}
/** 印を出さない場面（島・館・タイトル・演出） */
const HARD_CALM_SCENES = Object.freeze([
  'title', 'hub', 'gallery', 'reward', 'ending', 'opening', 'gallerymode', 'allpaintings', 'construction',
  'mansionintro',
]);
toastEl.classList.add('hidden');
const fadeEl = byId('ui-fade');
const dlgEl = byId('ui-dialog');
dlgEl.textContent = '';
dlgEl.classList.add('hidden');
const dlgName = document.createElement('div');
dlgName.className = 'dlg-name';
const dlgText = document.createElement('div');
dlgText.className = 'dlg-text';
const dlgChoices = document.createElement('ul');
dlgChoices.className = 'dlg-choices hidden';
const dlgNext = document.createElement('div');
dlgNext.className = 'dlg-next';
dlgNext.textContent = '▼';
dlgEl.append(dlgName, dlgText, dlgChoices, dlgNext);
const pauseEl = byId('ui-pause');
pauseEl.className = 'hidden';
const itemUi = createItemUi();

let dialog = { open: false, name: '', lines: [], i: 0, onClose: null, choices: null, sel: 0, onChoose: null };
let toastTimer = null;

function setHint(text) {
  hintEl.textContent = text ? String(text) : '';
  hintEl.classList.toggle('hidden', !text);
}
function toast(text, sec = 2) {
  if (!text) return;
  // タイトルでは大きな題字に重ならないよう、画面のいちばん上に出す
  toastEl.classList.toggle('on-title', currentName === 'title');
  toastEl.textContent = String(text);
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), sec * 1000);
}
const HUD_SCENES = Object.freeze(['hub', 'gallery', 'room', 'reward']);
function refreshHud() {
  // モヒカンの数は島を歩く場面だけに出す（ゲームの中では上の帯に重なっていた）
  const show = HUD_SCENES.includes(currentName);
  hudEl.classList.toggle('hidden', !show);
  if (show) hudEl.textContent = `モヒカン ${mohicanCount(getProgress())} / ${MOHICAN_TOTAL}`;
}
function renderDialog() {
  dlgName.textContent = dialog.name || '';
  dlgName.classList.toggle('hidden', !dialog.name);
  dlgText.textContent = dialog.lines[dialog.i] ?? '';
  const last = dialog.i >= dialog.lines.length - 1;
  const showChoices = last && Array.isArray(dialog.choices) && dialog.choices.length > 0;
  dlgChoices.textContent = '';
  if (showChoices) {
    dialog.choices.forEach((c, i) => {
      const li = document.createElement('li');
      li.textContent = typeof c === 'string' ? c : (c && c.label) || '';
      if (i === dialog.sel) li.classList.add('sel');
      li.addEventListener('click', (e) => { e.stopPropagation(); chooseDialog(i); });
      dlgChoices.append(li);
    });
  }
  dlgChoices.classList.toggle('hidden', !showChoices);
  dlgNext.classList.toggle('hidden', showChoices);
}
function openDialog({ name = '', lines = [], onClose = null, choices = null, onChoose = null } = {}) {
  const list = (Array.isArray(lines) ? lines : [lines]).map((s) => String(s ?? ''));
  dialog = {
    open: true, name, lines: list.length ? list : [''], i: 0, onClose, choices, sel: 0, onChoose,
  };
  renderDialog();
  dlgEl.classList.remove('hidden');
  sfx('talk');
  silly.squash(silly.getFocus());
}
function closeDialog() {
  if (!dialog.open) return;
  const cb = dialog.onClose;
  dialog = { ...dialog, open: false, onClose: null };
  dlgEl.classList.add('hidden');
  if (typeof cb === 'function') {
    try { cb(); } catch (e) { console.warn(e); }
  }
}
function chooseDialog(i) {
  const cb = dialog.onChoose;
  const c = dialog.choices ? dialog.choices[i] : null;
  dialog.onChoose = null;
  closeDialog();
  if (typeof cb === 'function') {
    try { cb(i, c); } catch (e) { console.warn(e); }
  }
}
function advanceDialog() {
  if (dialog.i < dialog.lines.length - 1) {
    dialog.i += 1;
    renderDialog();
    sfx('talk');
  } else {
    closeDialog();
  }
}
dlgEl.addEventListener('pointerdown', () => {
  if (!dialog.open) return;
  const last = dialog.i >= dialog.lines.length - 1;
  if (!(last && dialog.choices)) advanceDialog();
});
function updateDialog() {
  const last = dialog.i >= dialog.lines.length - 1;
  if (last && Array.isArray(dialog.choices) && dialog.choices.length) {
    const n = dialog.choices.length;
    if (pressed('ArrowUp', 'KeyW')) { dialog.sel = (dialog.sel + n - 1) % n; renderDialog(); }
    if (pressed('ArrowDown', 'KeyS')) { dialog.sel = (dialog.sel + 1) % n; renderDialog(); }
    if (pressed('Enter', 'NumpadEnter', 'KeyE', 'Space')) chooseDialog(dialog.sel);
    return;
  }
  if (pressed('Enter', 'NumpadEnter', 'KeyE', 'Space')) advanceDialog();
}

// ---- ctx の守り（未定義のものは何もしない） ----
const NOOP = (() => {
  const fn = () => undefined;
  let p = null;
  p = new Proxy(fn, {
    get(t, k) {
      if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return undefined;
      return p;
    },
    apply() { return undefined; },
  });
  return p;
})();
function guarded(obj, label) {
  const warned = new Set();
  return new Proxy(obj, {
    get(t, k, r) {
      if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return Reflect.get(t, k, r);
      if (!warned.has(k)) {
        warned.add(k);
        console.warn(`${label}.${String(k)} は未定義のため何もしません`);
      }
      return NOOP;
    },
  });
}

const ui = guarded({
  openDialog,
  closeDialog,
  // 館・ハブ・部屋が呼ぶ（会話中は frame が場面を止めるので今は届かないが、未定義の警告を出さないよう置く）
  advanceDialog,
  isDialogOpen: () => dialog.open,
  isOpen: () => dialog.open,
  setHint,
  refreshHud,
  toast,
  showMessage: toast,
  banner: (text, sec = 3) => itemUi.banner(text, sec),
}, 'ui');

// ---- アイテム（獲得・持ち込み） ----
let lastWin = null;
// 直前に選んだ持ち込み（結果画面に効果名を出すため）
let lastCarry = null;

function clearedGameIds(exclude = null) {
  const prog = getProgress();
  return BOSSES.filter((b) => isBossDefeated(prog, b.id))
    .map((b) => bossGameId(b.id))
    .filter((g) => g && g !== exclude);
}
function readItemsRaw() {
  try {
    const t = storage.getItem(ITEM_STORAGE_KEY);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
function loadItems(exclude = null) {
  return loadItemState(readItemsRaw(), { clearedGames: clearedGameIds(exclude) });
}
function saveItems(state) {
  try { storage.setItem(ITEM_STORAGE_KEY, JSON.stringify(serializeItems(state))); } catch { /* 握りつぶす */ }
}
// ---- 絵の入手（勝つと1枚。高難易度で勝つともう1枚） ----
/** いま遊んでいるのが高難易度か（段階4で入口から立てる） */
let playingHard = false;
/** 高難易度で遊んでいるゲーム（印の札に違いを書くため） */
let hardGameId = null;
function readPaintings() {
  // これまでのセーブで勝っていたゲームの絵は、最初に読んだときに渡しておく
  const owned = loadItems().owned;
  const cleared = ITEMS.filter((i) => owned.includes(i.id)).map((i) => i.fromGame);
  return migratePaintings(loadPaintings(storage), cleared);
}
function awardPainting(gameId) {
  try {
    const r = earnPainting(readPaintings(), gameId, playingHard ? 'hard' : 'normal');
    savePaintings(storage, r.state);
    if (r.isNew && r.reward) {
      const n = r.state.earned.length;
      toast(`★ 絵を手に入れた！（${n}/${PAINTING_TOTAL}） タイトルの「ギャラリー」で見られます`, 4);
    }
    return r;
  } catch (e) {
    console.warn('絵を記録できませんでした', e);
    return null;
  }
}

/** ボス撃破でそのゲームのアイテムを獲得・保存する */
function grantBossItem(bossId) {
  const gameId = bossGameId(bossId);
  if (!gameId) return null;
  const before = loadItems(gameId);
  const after = grantItemForClear(before, gameId);
  saveItems(after);
  awardPainting(gameId);
  const item = ITEMS.find((i) => i.fromGame === gameId) || null;
  return { item, isNew: !!item && !before.owned.includes(item.id), state: after };
}
/** ゲームに入る前に持ち込むアイテムを選ぶ。go({params, result, announce}) を呼ぶ */
function chooseCarry(gameId, go) {
  const state = loadItems();
  saveItems(state);
  const start = (s, difficulty) => {
    const result = resolveCarry(s.carry, gameId, createRng(timeSeed()));
    lastCarry = { gameId, result };
    playingHard = difficulty === 'hard';
    hardGameId = playingHard ? gameId : null;
    // 高難易度は、持ち込みの値の上に不利な値を重ねる（hard-mode.js）
    const params = withDifficulty(mergeParams(result.effects), gameId, difficulty);
    const announce = () => {
      const text = result.banner || result.line;
      const head = playingHard ? '高難易度！' : '';
      if (text || head) itemUi.banner([head, text].filter(Boolean).join('　'), 3);
    };
    try {
      go({ params, result, announce });
    } catch (e) {
      console.warn(e);
    }
  };
  // クリア後は、持ち込みを選んだあとに難易度を選ぶ（やめたら ふつう）
  const finish = (s) => {
    if (!hardUnlocked(loadStory(storage))) {
      start(s, 'normal');
      return;
    }
    input.reset();
    itemUi.choose({ title: '難易度をえらぶ', choices: [...DIFFICULTY_CHOICES], index: 0 }, (id) => {
      input.reset();
      start(s, id === 'hard' ? 'hard' : 'normal');
    });
  };
  if (!state.owned.length) {
    finish(state);
    return;
  }
  const game = gameById(gameId);
  const { choices, index } = carryChoices(state);
  itemUi.choose({ title: `「${game ? game.title : gameId}」に持ち込むアイテム`, choices, index }, (id) => {
    let s = state;
    try { s = selectCarry(state, id); } catch { s = selectCarry(state, null); }
    saveItems(s);
    input.reset();
    finish(s);
  });
}
function claimBossVictory(bossArg) {
  const boss = typeof bossArg === 'string' ? findBoss(bossArg) : bossArg;
  if (!boss) return null;
  try {
    const r = RewardSceneMod.claimVictory(getProgress(), boss);
    saveProgress(storage, r.state);
    lastWin = { bossId: boss.id, isNew: r.isNew };
    refreshHud();
    return r;
  } catch (e) {
    console.warn(e);
    return null;
  }
}
function acceptWin(bossArg, isNew) {
  const boss = typeof bossArg === 'string' ? findBoss(bossArg) : bossArg;
  if (!boss) return;
  if (!isBossDefeated(getProgress(), boss.id)) claimBossVictory(boss);
  lastWin = { bossId: boss.id, isNew: isNew !== false };
}
/** 報酬の場面で「新しく手に入れたか」を確定する */
function settleWin(bossArg, hint) {
  const boss = typeof bossArg === 'string' ? findBoss(bossArg) : bossArg;
  if (!boss) return false;
  if (lastWin && lastWin.bossId === boss.id) {
    const n = lastWin.isNew !== false;
    lastWin = null;
    return n;
  }
  if (!isBossDefeated(getProgress(), boss.id)) {
    const r = claimBossVictory(boss);
    lastWin = null;
    return r ? r.isNew : true;
  }
  return hint === true;
}
function finishMinigame(bossArg, { won = false } = {}) {
  const boss = typeof bossArg === 'string' ? findBoss(bossArg) : bossArg;
  if (!boss) return goto('hub', {});
  if (won) {
    if (!lastWin || lastWin.bossId !== boss.id) claimBossVictory(boss);
    const isNew = lastWin ? lastWin.isNew !== false : true;
    lastWin = null;
    return goto('reward', { bossId: boss.id, isNew });
  }
  lastWin = null;
  return goto('room', { bossId: boss.id, returning: true });
}
function resetSave() {
  clearProgress(storage);
  try { storage.removeItem(ITEM_STORAGE_KEY); } catch { /* 握りつぶす */ }
  refreshHud();
}

// ---- 場面 ----
function sceneFactory(mod, name) {
  const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
  const hit = fns.find(([k]) => /^create\w*Scene$/.test(k)) || fns.find(([k]) => /^create/.test(k))
    || (typeof mod.default === 'function' ? ['default', mod.default] : null);
  if (!hit) throw new Error(`場面 ${name} の作り方が見つかりません`);
  return hit[1];
}

function createMinigameScene() {
  const cache = new Map();
  let cur = null;
  return {
    enter(params = {}) {
      const id = params.bossId;
      const mod = getBossModule(id);
      const boss = findBoss(id);
      if (!mod || typeof mod.createMinigame !== 'function') {
        console.warn('ミニゲームがありません:', id);
        cur = null;
        goto('hub', {});
        return;
      }
      let inst = cache.get(id);
      if (!inst) {
        inst = mod.createMinigame(ctx, Object.assign({}, boss || {}, params, { boss, params }));
        cache.set(id, inst);
      }
      cur = inst;
      // 入るたびの持ち込みを arg.params で渡す（作るのは初回だけなので、options.params は最初の持ち込みのまま残る）
      if (inst && typeof inst.enter === 'function') inst.enter({ ...params, boss, params });
    },
    update(dt) {
      if (cur && typeof cur.update === 'function') cur.update(dt);
    },
    exit() {
      const c = cur;
      cur = null;
      if (c && typeof c.exit === 'function') c.exit();
    },
    get pausable() { return cur ? cur.pausable !== false : true; },
    smokeState() { return cur && typeof cur.smokeState === 'function' ? cur.smokeState() : null; },
    pauseItems() { return extraItems(cur); },
    onPauseAction(id) { runPauseAction(cur, id); },
  };
}

/** 部屋に入ったときの紹介の設定（ctx は呼ばれる時点で定義済み） */
function introOpts(kind, gameId = null) {
  return {
    kind,
    gameId,
    input,
    returnToGallery: (id) => ctx.returnToGallery(id),
    carryLineFor: (id) => ctx.carryEffectFor(id),
  };
}

// 部屋の場面（紹介で包む前の形）: touch: () => createTouchScene(ctx) ／ stack: () => createStackScene(ctx)
// 実際の登録では withGameIntro で包み、入ったときに最初にゲームの紹介を出す
const FACTORIES = {
  title: () => sceneFactory(TitleMod, 'title')(ctx),
  hub: () => sceneFactory(HubMod, 'hub')(ctx),
  room: () => sceneFactory(RoomMod, 'room')(ctx),
  reward: () => RewardSceneMod.createRewardScene(ctx),
  ending: () => sceneFactory(EndingMod, 'ending')(ctx),
  opening: () => createOpeningScene(ctx),
  gallerymode: () => createGalleryModeScene(ctx),
  allpaintings: () => createAllPaintingsScene(ctx),
  mansionintro: () => createMansionIntroScene(ctx),
  minigame: () => createMinigameScene(),
  gallery: () => createGalleryScene(ctx),
  construction: () => withGameIntro(createConstructionScene(ctx), introOpts('construction')),
  touch: () => withGameIntro(createTouchScene(ctx), introOpts('game', 'mohi-touch')),
  stack: () => withGameIntro(createStackScene(ctx), introOpts('game', 'blowaway')),
  shogi: () => createShogiScene(ctx),
  kendama: () => withGameIntro(createKendamaScene(ctx), introOpts('game', 'kendama')),
  novel: () => withGameIntro(createNovelScene(ctx), introOpts('game', 'novel-chicken')),
  findfile: () => withGameIntro(createFindFileScene(ctx), introOpts('game', 'find-file')),
  leverfighter: () => withGameIntro(createLeverFighterScene(ctx), introOpts('game', 'lever-fighter')),
  darksoul: () => withGameIntro(createDarkSoulScene(ctx), introOpts('game', 'dark-soul')),
  kaijuBattle: () => withGameIntro(createKaijuScene(ctx), introOpts('game', 'kaiju')),
};
const sceneCache = new Map();
function getScene(name) {
  if (sceneCache.has(name)) return sceneCache.get(name);
  const make = FACTORIES[name];
  if (!make) return null;
  try {
    const s = make();
    sceneCache.set(name, s);
    return s;
  } catch (e) {
    console.error(`場面 ${name} を作れません`, e);
    return null;
  }
}
const scenes = new Proxy({}, {
  get: (t, k) => (typeof k === 'string' && FACTORIES[k] ? getScene(k) : undefined),
  has: (t, k) => typeof k === 'string' && k in FACTORIES,
});

let current = null;
let currentName = null;
let currentParams = {};
let trans = null;
let paused = false;
let pause = closedPause();
let panel = null;
let panelSel = 0;

function musicFor(name, params) {
  const m = musicSceneFor(name, params);
  if (m) return m;
  return ['gallery', 'construction', 'touch', 'stack', 'shogi', 'kendama', 'novel', 'findfile', 'kaijuBattle'].includes(name) ? 'hub' : null;
}

/** 場面に入る。入れなければ false（壊れた場面を current に残さない） */
function enterScene(name, params) {
  const s = getScene(name);
  if (!s) return false;
  activeCamera = camera;
  current = s;
  currentName = name;
  if (toastEl) toastEl.classList.toggle('on-title', name === 'title');
  // 島・館に戻ったら高難易度は終わり。ゲームの場面の間だけ印を出す
  if (name === 'hub' || name === 'gallery' || name === 'title') {
    playingHard = false;
    hardGameId = null;
  }
  const hardOn = playingHard && !HARD_CALM_SCENES.includes(name);
  hardFrameEl.classList.toggle('hidden', !hardOn);
  currentParams = params && typeof params === 'object' ? params : {};
  try {
    if (typeof s.enter === 'function') s.enter(params);
  } catch (e) {
    console.error(`場面 ${name} に入れません`, e);
    return false;
  }
  return true;
}

function switchScene(name, params = {}, depth = 0) {
  if (current && typeof current.exit === 'function') {
    try { current.exit(); } catch (e) { console.warn(e); }
  }
  // 前の場面の会話は持ち越さない（開いたままだと次の場面が動かない）
  if (dialog.open) {
    dialog = { ...dialog, open: false, onClose: null, onChoose: null };
    dlgEl.classList.add('hidden');
  }
  silly.clear();
  setHint('');
  if (fullResolution) {
    fullResolution = false;
    onResize();
  }
  if (!enterScene(name, params)) {
    // 入れなかった場面は残さない（動けない固まりを防ぐ）。島へ、だめならタイトルへ戻す
    current = null;
    currentName = null;
    if (depth >= 2) return;
    if (name !== 'hub') switchScene('hub', {}, depth + 1);
    else switchScene('title', {}, depth + 1);
    return;
  }
  try { audio.music(musicFor(name, params)); } catch { /* 握りつぶす */ }
  refreshHud();
}

function goto(name, params = {}) {
  if (trans && trans.phase === 'out') return false;
  if (!FACTORIES[name]) {
    console.warn('未知の場面:', name);
    return false;
  }
  if (paused) closePauseMenu();
  const startT = trans && trans.phase === 'in' ? FADE_TIME - trans.t : 0;
  trans = { phase: 'out', t: Math.max(0, startT), name, params: params || {} };
  return true;
}

function stepTransition(dt) {
  trans.t += dt;
  if (trans.phase === 'out') {
    fadeEl.style.opacity = String(Math.min(1, trans.t / FADE_TIME));
    if (trans.t >= FADE_TIME) {
      const { name, params } = trans;
      trans = { phase: 'in', t: 0 };
      switchScene(name, params);
    }
  } else {
    fadeEl.style.opacity = String(Math.max(0, 1 - trans.t / FADE_TIME));
    if (trans.t >= FADE_TIME && trans.phase === 'in') {
      fadeEl.style.opacity = '0';
      trans = null;
    }
  }
}

// ---- ポーズ ----
function extraItems(scene) {
  if (!scene) return [];
  try {
    const p = scene.pauseItems;
    const list = typeof p === 'function' ? p.call(scene) : p;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function runPauseAction(scene, id) {
  if (!scene) return;
  const fn = scene.onPauseAction || scene.onPause || scene.pauseAction;
  if (typeof fn === 'function') {
    try { fn.call(scene, id); } catch (e) { console.warn(e); }
  }
}
// 場面が足した項目（run を持つものはここから呼ぶ。openPause は id と label だけ残すため）
let pauseExtras = new Map();
function openPauseMenu() {
  const extra = extraItems(current);
  pauseExtras = new Map(extra.filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e]));
  // 戻る項目は場面ごとに1つだけ（場面が持っていれば共通の「ハブへ戻る」は出さない）
  pause = openPause(scenePauseItems(currentName, extra, {
    galleryScenes: [...Object.values(ctx.readyRooms || {}), 'construction'],
  }));
  paused = true;
  panel = null;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  renderPause();
}
function closePauseMenu() {
  paused = false;
  panel = null;
  pause = closedPause();
  renderPause();
  input.reset();
}
function doPauseAction(id, before) {
  sfx('confirm');
  if (isPauseSubPanel(id)) {
    pause = before;
    panel = id;
    panelSel = 0;
    renderPause();
    return;
  }
  closePauseMenu();
  if (id === PAUSE_HUB_ID) goto('hub', currentName === 'gallery' ? { fromGallery: true } : {}); // 館からは館の前に出る
  else if (id === PAUSE_TITLE_ID) goto('title', {});
  else if (id === PAUSE_GALLERY_ID) {
    let gid = currentParams && typeof currentParams.gameId === 'string' ? currentParams.gameId : null;
    if (!gid) {
      const rr = ctx.readyRooms || {};
      gid = Object.keys(rr).find((k) => rr[k] === currentName) || null;
    }
    try {
      if (!ctx.returnToGallery(gid)) goto('gallery', {});
    } catch (e) {
      console.warn(e);
    }
  } else if (id !== RESUME_ID) {
    const ex = pauseExtras.get(id);
    if (ex && typeof ex.run === 'function') {
      try { ex.run(); } catch (e) { console.warn(e); }
    } else {
      runPauseAction(current, id);
    }
  }
}
function updatePause() {
  const up = pressed('ArrowUp', 'KeyW');
  const down = pressed('ArrowDown', 'KeyS');
  const left = pressed('ArrowLeft', 'KeyA');
  const right = pressed('ArrowRight', 'KeyD');
  const enter = pressed('Enter', 'NumpadEnter', 'Space', 'KeyE');
  const esc = pressed('Escape', 'Backspace');
  if (panel) {
    if (esc || enter) {
      panel = null;
      renderPause();
      return;
    }
    if (panel === PAUSE_VOLUME_ID) {
      const n = VOLUME_CHANNELS.length;
      if (up) panelSel = (panelSel + n - 1) % n;
      if (down) panelSel = (panelSel + 1) % n;
      const d = (right ? 1 : 0) - (left ? 1 : 0);
      if (d) {
        const ch = VOLUME_CHANNELS[panelSel].id;
        volumes[ch] = volumeAdjust(volumes[ch], d);
        try { audio.setVolume(ch, volumes[ch]); } catch { /* 握りつぶす */ }
        sfx('confirm');
      }
      if (up || down || d) renderPause();
    } else if (panel === PAUSE_SILLY_ID) {
      const d = (right || up ? 1 : 0) - (left || down ? 1 : 0);
      if (d) {
        setSillyLevel(sillyAdjust(sillyLevel, d));
        if (sillyLevel > 0) audio.playSilly('boing');
        renderPause();
      }
    }
    return;
  }
  const before = pause;
  const r = pauseInput(pause, { up, down, enter, esc });
  pause = r.state;
  if (r.action) {
    if (r.action === RESUME_ID) closePauseMenu();
    else doPauseAction(r.action, before);
  } else if (r.state !== before) {
    renderPause();
  }
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function renderPause() {
  pauseEl.textContent = '';
  if (!paused || !pause.open) {
    pauseEl.className = 'hidden';
    return;
  }
  pauseEl.className = '';
  const box = el('div', 'pause-panel');
  if (!panel) {
    box.append(el('h2', '', 'ポーズ'));
    const ul = el('ul', 'pause-list');
    pause.items.forEach((it, i) => {
      const li = el('li', i === pause.sel ? 'sel' : '', it.label);
      li.addEventListener('click', () => {
        const before = pause;
        const r = choosePause(pause, i);
        pause = r.state;
        if (!r.action) return;
        if (r.action === RESUME_ID) closePauseMenu();
        else doPauseAction(r.action, before);
      });
      ul.append(li);
    });
    box.append(ul, el('p', 'pause-note', '↑↓: 選ぶ　Enter: 決定　Esc: 再開'));
  } else if (panel === PAUSE_HOWTO_ID) {
    box.append(el('h2', '', 'あそびかた'));
    const wrap = el('div', 'howto');
    for (const s of HOWTO_SECTIONS) {
      wrap.append(el('h3', '', s.title));
      const dl = el('dl', '');
      for (const [k, v] of s.rows) dl.append(el('dt', '', k), el('dd', '', v));
      wrap.append(dl);
    }
    box.append(wrap, el('p', 'pause-note', 'Esc / Enter: もどる'));
  } else if (panel === PAUSE_VOLUME_ID) {
    box.append(el('h2', '', '音量'));
    const ul = el('ul', 'pause-list');
    VOLUME_CHANNELS.forEach((c, i) => {
      const v = volumes[c.id];
      ul.append(el('li', i === panelSel ? 'sel' : '', `${c.label}　${'■'.repeat(v)}${'□'.repeat(10 - v)}`));
    });
    box.append(ul, el('p', 'pause-note', '↑↓: 選ぶ　←→: 音量　Esc: もどる'));
  } else if (panel === PAUSE_SILLY_ID) {
    box.append(el('h2', '', 'おふざけ度'));
    const row = el('div', 'silly-row');
    SILLY_LEVEL_NAMES.forEach((name, i) => {
      const b = el('button', i === sillyLevel ? 'sel' : '', name);
      b.addEventListener('click', () => {
        setSillyLevel(i);
        renderPause();
      });
      row.append(b);
    });
    box.append(row, el('p', 'pause-note', '0 なら今までどおり静か。←→: 変える　Esc: もどる'));
  }
  pauseEl.append(box);
}

// ---- ctx ----
const ctx = guarded({
  // <scene-ctx-direct>
  // ボスに話しかけたあとのミニゲーム開始。場面のキーは 'minigame'。移れたら true、移れなければ false
  startMinigame(boss, params) {
    const bossId = typeof boss === 'string' ? boss : (boss && typeof boss.id === 'string' ? boss.id : '');
    if (!bossId) return false;
    const extra = params && typeof params === 'object' ? params : {};
    try {
      return !!ctx.goto('minigame', { ...extra, bossId });
    } catch (e) {
      return false;
    }
  },
  // エンディングを見た印が保存されていれば true
  isCleared() {
    try {
      if (!storage) return false;
      const v = storage.getItem('takuarinus-cleared');
      return v !== null && v !== undefined && v !== '' && v !== '0' && v !== 'false';
    } catch (e) {
      return false;
    }
  },
  // エンディングを見た印を保存する
  markCleared() {
    try {
      if (!storage) return false;
      storage.setItem('takuarinus-cleared', '1');
      return true;
    } catch (e) {
      return false;
    }
  },
  // 確認用: 選んだ段（review-save.js）までクリアした状態を保存する。音量・おふざけ度は触らない
  applyReviewSave(presetId) {
    const plan = reviewSave(presetId);
    if (!plan) return false;
    try {
      let prog = getProgress();
      for (const m of plan.mohicans) prog = collectMohican(prog, m).state;
      saveProgress(storage, prog);
      // 前に選んだ段のアイテムを残さない（残ると、勝ったゲームの絵がそこから戻ってしまう）
      let items = createItemState();
      for (const g of plan.games) items = grantItemForClear(items, g);
      saveItems(items);
      savePaintings(storage, { earned: plan.paintings });
      saveStory(storage, plan.story);
      if (plan.cleared) storage.setItem('takuarinus-cleared', '1');
      else storage.removeItem('takuarinus-cleared');
      refreshHud();
      return true;
    } catch (e) {
      console.warn('確認用のセーブを書けませんでした', e);
      return false;
    }
  },
  // 進行・クリアの印・付け替えの色・アイテムの保存を消す（音量・おふざけ度・他のアプリのキーは残す）
  clearData() {
    // ゲームが使っている保存先（localStorage が使えないときは記憶の中の代わり）を消す
    const store = storage;
    if (!store) return false;
    try {
      clearSaveData(store);
    } catch (e) {
      return false;
    }
    try {
      if (typeof setDefaultMohawkColor === 'function') setDefaultMohawkColor('blue');
    } catch (e) {
      // 握りつぶす
    }
    return true;
  },
  // 場面からポーズを開く（ポーズが閉じているときだけ Esc を1回押したことにする）
  requestPause() {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') return false;
      const el = document.getElementById('pause');
      if (el && !el.classList.contains('hidden')) return true;
      const now = Date.now();
      if (window.__takuarinusPauseReqAt && now - window.__takuarinusPauseReqAt < 800) return false;
      window.__takuarinusPauseReqAt = now;
      const opts = { code: 'Escape', key: 'Escape', bubbles: true };
      window.dispatchEvent(new KeyboardEvent('keydown', opts));
      window.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    } catch (e) {
      return false;
    }
  },
  // </scene-ctx-direct>
  /** 絵画の館に戻る。gameId か絵の id を渡すと、その絵の前に立つ。移れたら true */
  returnToGallery(gameOrPainting) {
    const key = typeof gameOrPainting === 'string' ? gameOrPainting : '';
    const p = key ? ENTRANCE_PAINTINGS.find((x) => x.id === key || x.gameId === key) : null;
    try {
      return !!goto('gallery', p ? { fromPainting: p.id } : {});
    } catch (err) {
      console.warn('館に戻れませんでした', err);
      return false;
    }
  },
  // 持ち込みの値は場面の引数（arg）から渡る。ここは既定の空（見張りの警告を出さないための定義）
  itemParams: null,
  carryParams: null,
  THREE,
  renderer,
  camera,
  get canvas() { return renderer.domElement; },
  input,
  mat,
  PALETTE,
  palette: PALETTE,
  addLights,
  makeShadow,
  setWorld(w) { if (w) world = w; },
  getWorld: () => world,
  setCamera(c) { activeCamera = c || camera; onResize(); },
  resetCamera() { activeCamera = camera; },
  /** 画面の解像度で描く（true）か、内部 320×240 の引き伸ばしに戻す（false） */
  setFullResolution(on) {
    fullResolution = !!on;
    onResize();
    return fullResolution;
  },
  goto,
  ui,
  audio,
  sfx,
  music: (s) => audio.music(s),
  storySfx: (name) => audio.playStory(name),
  /** 手に入れた絵の状態（ギャラリーと館が読む） */
  paintings: () => readPaintings(),
  storage,
  getProgress,
  get progress() { return getProgress(); },
  saveProgress: (s) => { const ok = saveProgress(storage, s); refreshHud(); return ok; },
  clearProgress: resetSave,
  resetSave,
  mohicanCount: () => mohicanCount(getProgress()),
  MOHICAN_TOTAL,
  bosses: BOSSES,
  findBoss,
  getBossModule,
  isBossDefeated: (id) => isBossDefeated(getProgress(), id),
  mohawkColor: () => getDefaultMohawkColor(),
  setMohawkColor,
  silly,
  sillyLevel: () => sillyLevel,
  setSillyLevel,
  scenes,
  readyRooms: {
    'mohi-touch': 'touch', blowaway: 'stack', 'super-shogi': 'shogi', kendama: 'kendama', 'novel-chicken': 'novel',
    'find-file': 'findfile',
    'lever-fighter': 'leverfighter',
    'dark-soul': 'darksoul',
    'kaiju': 'kaijuBattle',
  },
  chooseCarry,
  grantBossItem,
  /** 部屋のゲーム（タッチタッチ・吹っ飛ばし）に勝ったとき、そのゲームのアイテムを獲得・保存する（重複しない） */
  grantGameItem(gameId) {
    const item = ITEMS.find((i) => i.fromGame === gameId) || null;
    if (!item) return null;
    try {
      const before = loadItems();
      const after = grantItemForClear(before, gameId);
      saveItems(after);
      awardPainting(gameId);
      return { item, isNew: !before.owned.includes(item.id), state: after };
    } catch (err) {
      console.warn('アイテムを獲得できませんでした', err);
      return null;
    }
  },
  /** 直前に持ち込んだアイテムの効果の一行（「アイテム効果：〜（有利）」）。無ければ null */
  carryEffectFor(gameId) {
    if (!lastCarry) return null;
    if (gameId && lastCarry.gameId !== gameId) return null;
    try {
      return effectSummary(lastCarry.result);
    } catch {
      return null;
    }
  },
  getItems: () => loadItems(),
  finishMinigame,
  claimVictory: claimBossVictory,
  recordWin: claimBossVictory,
  acceptWin,
  settleWin,
  isDialogOpen: () => dialog.open,
  isPaused: () => paused,
  currentScene: () => currentName,
}, 'ctx');

// ---- 試し遊び用の入口（自動の画面チェック用。window.__smoke から使う。ふだんの遊び方には関わらない） ----
/**
 * 2体目以降のボスの部屋とミニゲーム（'room@race' のように 場面@ボス）。
 * 以前は1体目（パズル）しか試し遊びで通らず、レースのタイヤの色の欠落などが見逃されていた
 */
const SMOKE_BOSS_SCENES = Object.freeze(BOSSES.slice(1).flatMap((b) => [`room@${b.id}`, `minigame@${b.id}`]));
function smokeParams(name, bossId = null) {
  const boss = bossId || (BOSSES[0] ? BOSSES[0].id : null);
  if (name === 'room' || name === 'minigame') return { bossId: boss };
  if (name === 'reward') return { bossId: boss, isNew: false };
  if (name === 'construction') return { gameId: 'kaiju' };
  const rr = ctx.readyRooms || {};
  const gameId = Object.keys(rr).find((k) => rr[k] === name);
  return gameId ? { gameId } : {};
}
let smokeEntered = null;
let smokeClock = 0;
/** 場面へ直接入る（暗転・持ち込みの選択は通さない）。入れたら true */
function smokeGoto(full) {
  if (typeof full !== 'string') return false;
  const [name, bossId] = full.split('@');
  if (bossId && !BOSSES.some((b) => b.id === bossId)) return false;
  if (!Object.prototype.hasOwnProperty.call(FACTORIES, name)) return false;
  if (paused) closePauseMenu();
  if (dialog.open) {
    dialog = {
      ...dialog, open: false, onClose: null, onChoose: null,
    };
    dlgEl.classList.add('hidden');
  }
  const params = smokeParams(name, bossId || null);
  // 報酬の場面に直接入っても、モヒカンを獲得したことにはしない
  if (name === 'reward' && params.bossId) lastWin = { bossId: params.bossId, isNew: false };
  trans = null;
  fadeEl.style.opacity = '0';
  switchScene(name, params);
  smokeEntered = full;
  smokeClock = 0;
  return currentName === name;
}
/** 試し遊びが読む状態。scene は goto した名前（'minigame@race' も）、t は場面の更新が回った秒 */
function smokeState() {
  const base = smokeEntered ? smokeEntered.split('@')[0] : null;
  const scene = base && base === currentName ? smokeEntered : currentName;
  const keyName = scene === 'minigame' || scene === 'room' ? `${scene}@${BOSSES[0] ? BOSSES[0].id : ''}` : scene;
  let game = null;
  const problems = [];
  try {
    game = current && typeof current.smokeState === 'function' ? current.smokeState() : null;
  } catch (e) {
    problems.push(`smokeState() が失敗: ${e && e.message ? e.message : e}`);
  }
  problems.push(...smokeProblems(keyName, game));
  return {
    scene, t: Math.round(smokeClock * 1000) / 1000, paused, dialog: dialog.open, game, problems,
  };
}
try {
  window.__smoke = Object.freeze({
    // いまの場面の主な状態（試し遊びが入った直後と操作の後に読む）
    state: () => {
      try {
        return smokeState();
      } catch (e) {
        return { scene: currentName, t: smokeClock, problems: [`state() が失敗: ${e && e.message ? e.message : e}`] };
      }
    },
    // 入れる場面の名前の一覧と、いまの場面（真っ暗ソウルは 'darksoul'）
    scenes: () => [...Object.keys(FACTORIES), ...SMOKE_BOSS_SCENES],
    // 真っ暗ソウルへ直接入る（紹介の画面から始まる）
    darkSoul: () => {
      try {
        return smokeGoto('darksoul');
      } catch (e) {
        console.warn(e);
        return false;
      }
    },
    current: () => currentName,
    goto: (name) => {
      try {
        return smokeGoto(name);
      } catch (e) {
        console.warn(e);
        return false;
      }
    },
  });
} catch {
  // 置けなくても遊べる
}

// ---- ループ ----
let last = performance.now();
let errCount = 0;
function safeUpdate(dt) {
  try {
    if (current && typeof current.update === 'function') current.update(dt);
    smokeClock += dt;
  } catch (e) {
    if (errCount++ < 5) console.error(e);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  try { audio.tick(); } catch { /* 握りつぶす */ }
  if (pressed('KeyM') && !itemUi.isOpen()) {
    try { toast(audio.toggleMute() ? '消音' : '音あり', 1.2); } catch { /* 握りつぶす */ }
  }
  if (trans) stepTransition(dt);
  try { tickChaos(dt); } catch { /* 握りつぶす */ }
  if (trans && trans.phase === 'out') {
    // 画面の切り替え中は場面を止める
  } else if (paused) {
    updatePause();
  } else if (itemUi.isOpen()) {
    // 持ち込むアイテムを選んでいる間は場面を止める
  } else if (dialog.open) {
    updateDialog();
    smokeClock += dt;
  } else if (pressed('Escape') && canPause({
    pausable: currentName !== 'title' && !(current && current.pausable === false),
    dialogOpen: dialog.open,
    transitioning: !!trans,
  })) {
    openPauseMenu();
  } else {
    safeUpdate(dt);
  }
  if (!paused) silly.update(dt);
  silly.beforeRender(activeCamera);
  try { renderer.render(world, activeCamera); } catch (e) { if (errCount++ < 5) console.error(e); }
  silly.afterRender(activeCamera);
  endInputFrame();
}

fadeEl.style.opacity = '0';
setHint('');
switchScene('title', {});
requestAnimationFrame(frame);
