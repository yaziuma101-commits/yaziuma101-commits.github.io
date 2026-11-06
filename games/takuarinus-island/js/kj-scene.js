// 怪獣大決戦の場面（メガネ星人の絵から）。
// 巨大化したヌスが、ミニチュアの市街地をゆっくり歩く。文字は HTML で重ねる。
// Esc のポーズの「館に戻る」は main.js の readyRooms から自動で出る。
import { PALETTE } from './palette.js';
import { createHeroRig, applyMohawkColor } from './hero-model.js';
import { createAnimState, stepAnim, HERO_HEIGHT } from './characters.js';
import { createMinigamePanel, createResultPanel } from './scenes/touch.js';
import { createRng } from './seeded-rng.js';
import {
  makeMods, stepWalk, footstepCount, MAX_DT, STRIDE, formatDamage,
  createMelee, stepMelee, FULL_P, stepProgress, inReach, attackHits, damageAfterGuard,
  playerMaxHp, CHOP_RANGE, createBeam, stepBeam, BEAM, buildResult, judge, WALK_SPEED,
  titleState,
} from './kj-rules.js';
import {
  createEnemy, stepEnemy, damageEnemy, staggerEnemy,
} from './kj-ai.js';
import {
  reactionForHit, startReaction, stepReaction, reactionPose, reactLocked, createReaction, fallFootprint,
  DOWN_IMPACT_DAMAGE, SLIDE_CRASH_DPS, IMPACT_SHAKE, LANDING_SHAKE,
} from './kj-react.js';
import {
  swingPose, combinePose, createFollow, startFollow, stepFollow, followPose, followStrength,
} from './kj-swing.js';
import {
  createRoar, startRoar, stepRoar, isRoaring, createRoarTimer, stepRoarTimer,
  motionTargets, stepWeights, kaijuPose,
} from './kj-motion.js';
import { drawingUrl } from './gallery-data.js';
import { foeAttackPose, foeLensState, FOE_TAIL_SHAPE } from './kj-foe-design.js';
import { buildFoeKaiju } from './kj-foe-model.js';
import { buildDrawingFrame } from './drawing-frame.js';
import {
  tailDims, tailPose, tailPoints, tailToWorld, tailTipHits, tailBuildingsHit, tailSwingState, tailSweeping,
  TAIL_SWEEP_DPS,
} from './kj-tail.js';
import {
  createSideCam, stepSideCam, sideCamPose, sideCamOccluders, SIDE_CAM,
} from './kj-camera.js';
import {
  createCity, totalDamage, damageBuilding, buildingsInReach, BODY_DAMAGE_PER_SEC,
  ARENA_RADIUS, PLAYER_START, ENEMY_START, ROAD_HALF,
} from './kj-city.js';
import {
  kjSfx, gameCharge as kjChargeSound, ensureGameMusic as kjEnsureMusic, stopGameMusic as kjStopMusic,
} from './audio.js';
import {
  KJ_MUSIC as KJ_MARCH_TRACK, KJ_FANFARE as KJ_FANFARE_TRACK, kjRoarFor, kjJingleFor,
} from './kj-music.js';
import { HARD_FOE } from './hard-mode.js';
import { smokeSummary } from './smoke-state.js';

const freshMelee = () => ({ punch: createMelee(), kick: createMelee(), tail: createMelee() });

/** 土煙の柔らかい丸（白→透明。色はスプライトの材質で付ける） */
function dustTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 31);
  grad.addColorStop(0, 'white');
  grad.addColorStop(1, 'transparent');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const KJ_GAME_ID = 'kaiju';
export const KJ_SCENE = 'kaijuBattle';
/** 巨大ヌスの高さ（ワールド単位。ビルくらい） */
export const KJ_HERO_HEIGHT = 24;
/** カメラ：後方・低い位置から見上げる */
export const KJ_CAMERA = Object.freeze({
  back: 40, height: 6, lookY: 16, follow: 1.6, near: 1,
});
const SHAKE_SEC = 0.3;
const SHAKE_AMP = 0.7;
const MOUSE_TURN = 0.025;
const WALK_LIMIT = ARENA_RADIUS + 8;
const PLAY_HINT = 'W/S: 前後　A/D: 横歩き　Q/E・マウス: 向き　F: パンチ　G: キック　H: しっぽ　R: 光線（溜めて離す）　Space: 踏ん張る　Esc: ポーズ';
const MELEE_KINDS = Object.freeze(['punch', 'kick', 'tail']);
/** 押している間だけ動作が進むキー */
export const KJ_MELEE_KEYS = Object.freeze({ punch: 'KeyF', kick: 'KeyG', tail: 'KeyH' });
const MELEE_LABEL = Object.freeze({ punch: 'パンチ', kick: 'キック', tail: 'しっぽ' });
/** 動作中の歩く速さの倍率 */
export const ACTION_WALK_MUL = 0.5;
/** 建物に当たったときのダメージ倍率（街は崩れやすくする） */
export const BUILDING_HIT_MUL = 2;
const WOBBLE_SEC = 0.35;
const WOBBLE_AMP = 0.5;
const DEBRIS_MAX = 96;
const DUST_MAX = 48;
const DEBRIS_GRAVITY = 30;
const DEBRIS_COUNT = Object.freeze({ office: 16, house: 10, water: 8, pole: 3 });
const DUST_COUNT = Object.freeze({ office: 10, house: 6, water: 5, pole: 2 });
/** メガネ星人の当たりの半径 */
export const ENEMY_RADIUS = 3;
const ENEMY_TURN = 0.7;
const MIN_SEPARATION = 8;
/** 全力ヒットで敵が下がる距離・被弾で主人公が下がる距離 */
export const ENEMY_KNOCKBACK = 6;
export const HERO_KNOCKBACK = 4;
const KNOCK_SPEED = 14;
/** 倒れ込んだ先の建物へのダメージ */
export const FALL_IN_DAMAGE = 15;
const ENEMY_BEAM_LEN = 140;
const ENEMY_BEAM_SEC = 0.45;
export const KJ_GUARD_KEY = 'Space';
const WARN_TEXT = Object.freeze({
  chop: 'チョップが来る！ 踏ん張れ（Space）',
  beam: 'メガネ光線が来る！ 横へよけるか踏ん張れ',
  smash: '大振りが来る！ 離れるか踏ん張れ',
});

/** 光線のキー（押している間ゆっくり溜まり、離すと撃つ） */
export const KJ_BEAM_KEY = 'KeyR';
const HERO_BEAM_LEN = 150;
const HERO_BEAM_SEC = 0.55;
/** 勝敗が決まってから結果を出すまでの秒数（去っていく演出） */
export const KJ_END_SEC = 5;
const END_SKY_SEC = 2.5;
const LEAVE_TURN = 1.6;
const LEAVE_SPEED = WALK_SPEED * 1.2;
const ENEMY_LEAVE_SPEED = 3;

/** 被害額のランク（0〜2）のコメント */
export const KJ_RANK_COMMENTS = Object.freeze([
  'まだまだ控えめ。もっと街を壊してもいい',
  'なかなかの暴れっぷり！',
  'まさに昭和の大怪獣！',
]);

/** 持ち込みの params → 怪獣大決戦の mods（体力・パンチ・光線の溜め・歩く速さ）。範囲は kj-rules.js で丸める */
export function kjModsFromCarry(carry) {
  return makeMods(carry && typeof carry === 'object' ? carry : null);
}

/** 勝つたびに強さが1つ上がる（上限3）。負けたら据え置き */
export function kjNextLevel(level, outcome) {
  const lv = Math.max(1, Math.min(3, Math.round(Number(level)) || 1));
  return outcome === 'win' ? Math.min(3, lv + 1) : lv;
}

/** 怪獣の強さの保存（再読み込みで強さ1に戻っていた）。名前が takuarinus で始まるので「データを消す」で消える */
export const KJ_STORAGE_KEY = 'takuarinus-kaiju-v1';

/** 保存の文字列から強さ（1〜3）。壊れていれば 1 */
export function parseKjLevel(text) {
  try {
    const o = JSON.parse(String(text));
    const lv = Math.round(Number(o && o.level));
    return lv >= 1 && lv <= 3 ? lv : 1;
  } catch {
    return 1;
  }
}

export function serializeKjLevel(level) {
  return JSON.stringify({ v: 1, level: kjNextLevel(level, 'keep') });
}

function kjStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** 結果画面の中身（buildResult の結果から） */
export function kjResultView(res, { level = 1, nextLevel = level, extra = [] } = {}) {
  const r = res && typeof res === 'object' ? res : {};
  const win = r.outcome === 'win';
  const rank = Math.max(0, Math.min(2, Math.round(Number(r.rank)) || 0));
  const time = Number.isFinite(Number(r.timeSec)) ? Number(r.timeSec).toFixed(1) : '0.0';
  const lines = [
    `戦った時間：${time}秒`,
    `残り体力：${Math.round(Number(r.hpLeft) || 0)} / ${Math.round(Number(r.hpMax) || 0)}`,
    `被害額：${r.damageText || '0円'}`,
    KJ_RANK_COMMENTS[rank],
    `メガネ星人の強さ：${level}`,
  ];
  if (win) lines.push(nextLevel > level ? `次のメガネ星人は強さ${nextLevel}で現れる！` : 'メガネ星人はこれ以上強くならない。');
  for (const s of Array.isArray(extra) ? extra : []) if (typeof s === 'string' && s) lines.push(s);
  return {
    title: win ? '勝利！ メガネ星人を倒した' : '敗北… メガネ星人は去っていった',
    tone: win ? 'good' : 'bad',
    outcome: r.outcome,
    lines,
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}

/** 紹介の画面の中身 */
export function kjHowto(carryLine = null) {
  return {
    title: '怪獣大決戦',
    sub: '巨大化したヌスが、ミニチュアの街でメガネ星人と戦う！',
    lines: [
      'ヌスはビルほどの大きさの怪獣になった。体が大きいので、動きはとてもゆったりしている。',
      'キーを押している間だけ、動作がゆっくり進む。ロボットを操るつもりで動かそう。',
      'F・G・H を押し続けると、パンチ・キック・しっぽが伸び切って大きな一撃になる。途中で離すと戻ってしまう。',
      'ビルは殴っても、ぶつかっても崩れる。被害額が多いほど昭和の大怪獣らしい！',
      'メガネ星人もゆっくり近づき、チョップやメガネ光線を撃ってくる。溜めの動きが見えたら Space で踏ん張るか、横へ歩いてかわそう。',
      '伸び切った一撃が当たると、メガネ星人はよろけて後ろのビルに倒れ込む。体力が半分を切ると、メガネを外して本気になる！',
      '強い一撃を受けた方は吹き飛んで地面を滑り、倒れて地響きを立てる。起き上がるまでは動けない。倒れた先のビルも巻き込んで崩れる。',
    ],
    rows: [
      ['W / S', 'ゆっくり前へ・後ろへ歩く'],
      ['A / D', '横へ歩く'],
      ['Q / E・マウス', '向きを変える（クリックで視点を固定）'],
      ['F', 'パンチ（押している間、腕をゆっくり引いて前へ伸ばす）'],
      ['G', 'キック（押している間、足をゆっくり上げて前へ）'],
      ['H', 'しっぽ（押している間、体をひねって振る。周りのビルも巻き込む）'],
      ['Space', '踏ん張る（押している間ゆっくり構え、受けるダメージが減る）'],
      ['R', '光線（押している間ゆっくり溜まり、離すと撃つ。溜めるほど強い。撃った後はしばらく撃てない）'],
      ['Esc', 'ポーズ（館に戻る）'],
    ],
    win: '勝ち方：メガネ星人の体力を0にする。',
    carry: typeof carryLine === 'string' && carryLine ? carryLine : '持ち込み：なし',
    note: 'Enter / Space で始める　Esc で館に戻る',
  };
}

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---- タイトル演出・街の看板・古いフィルムの質感（規則は純関数。DOM・three.js は場面の中だけ） ----
/** 街の看板に貼る絵（館の飾りの絵。ファイルは書き換えない） */
export const KJ_SIGN_DRAWINGS = Object.freeze(['chibimohi-to.webp', 'trump-card.webp', 'sankyoudai.webp']);
/** 古いフィルムの上掛け（粒子は 12fps で描き直す。ちらつきは弱く） */
export const KJ_FILM = Object.freeze({
  fps: 12, flickerMin: 0.04, flickerMax: 0.08, grainW: 160, grainH: 120,
});
const KJ_TITLE_NAME = '怪獣大決戦';
const kjClamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};
const kjSmooth = (a, b, x) => {
  const k = kjClamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** タイトル演出の見た目（進み具合 0〜1 → 各要素の濃さ・ぼかし・大きさ） */
export function kjTitleView(progress) {
  const p = kjClamp01(progress);
  return {
    bg: kjSmooth(0, 0.12, p),
    silOpacity: kjSmooth(0.05, 0.3, p),
    silBlur: 1 + 23 * (1 - kjSmooth(0.08, 0.5, p)),
    rise: 30 * (1 - kjSmooth(0.05, 0.45, p)),
    nameOpacity: kjSmooth(0.35, 0.52, p),
    nameScale: 1.8 - 0.8 * kjSmooth(0.35, 0.55, p),
    nameBlur: 14 * (1 - kjSmooth(0.35, 0.55, p)),
    subOpacity: kjSmooth(0.58, 0.7, p),
    fade: 1 - kjSmooth(0.9, 1, p),
  };
}

/** ちらつきの不透明度（乱数 0〜1 → 0.04〜0.08） */
export function filmFlicker(r) {
  return KJ_FILM.flickerMin + (KJ_FILM.flickerMax - KJ_FILM.flickerMin) * kjClamp01(r);
}

/** 粒子を描き直すか（12fps）。{draw, acc} */
export function filmStep(acc, dt) {
  const d = Number.isFinite(Number(dt)) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
  const a = (Number.isFinite(Number(acc)) && acc > 0 ? acc : 0) + d;
  const step = 1 / KJ_FILM.fps;
  if (a >= step) return { draw: true, acc: a % step };
  return { draw: false, acc: a };
}

/** 看板を貼る建物（大通りに近いビルから順に）。dir は看板の向く方向（大通りと始まりの地点の方） */
export function kjSignPlan(city, files = KJ_SIGN_DRAWINGS) {
  const list = (Array.isArray(city) ? city : []).filter((b) => b && !b.collapsed && (b.type === 'office' || b.type === 'house'));
  const key = (b) => Math.abs(b.x) + Math.abs(b.z) * 0.25;
  const sorted = list.slice().sort((a, b) => {
    const ta = a.type === 'office' ? 0 : 1;
    const tb = b.type === 'office' ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return key(a) - key(b) || String(a.id).localeCompare(String(b.id));
  });
  return sorted.slice(0, files.length).map((b, i) => {
    const wx = -b.x;
    const wz = -30;
    const len = Math.hypot(wx, wz) || 1;
    return { buildingId: b.id, file: files[i], dir: { x: wx / len, z: wz / len } };
  });
}

const TITLE_SKYLINE = Object.freeze([
  [0, 9, 22], [8, 7, 34], [14, 6, 26], [21, 8, 44], [30, 6, 30], [37, 9, 38], [47, 7, 28],
  [55, 8, 46], [64, 6, 24], [71, 9, 36], [81, 7, 30], [89, 11, 40],
]);
const CH_TILT = Object.freeze([[0, -4], [-6, 3], [4, -2], [-3, 5], [5, -3]]);

/** タイトルの上掛け（#kj-title） */
function createTitleOverlay(onClick) {
  let el = null;
  function mk(cls, parent, text) {
    const e = document.createElement('div');
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  }
  function build() {
    el = document.createElement('div');
    el.id = 'kj-title';
    el.addEventListener('click', () => {
      if (typeof onClick === 'function') onClick();
    });
    mk('kj-tt-psy', el);
    mk('kj-tt-rings', el);
    const sil = mk('kj-tt-sil', el);
    const sky = mk('kj-tt-skyline', sil);
    for (const [l, w, h] of TITLE_SKYLINE) {
      const b = mk('kj-tt-bldg', sky);
      b.style.left = `${l}%`;
      b.style.width = `${w}%`;
      b.style.height = `${h}vmin`;
    }
    const mon = mk('kj-tt-mon', sil);
    mk('kj-tt-mon-hawk', mon);
    mk('kj-tt-mon-body', mon);
    mk('kj-tt-mon-arm', mon);
    const al = mk('kj-tt-alien', sil);
    mk('kj-tt-alien-body', al);
    mk('kj-tt-alien-head', al);
    mk('kj-tt-alien-lens kj-tt-lens-l', al);
    mk('kj-tt-alien-lens kj-tt-lens-r', al);
    const name = mk('kj-tt-name', el);
    [...KJ_TITLE_NAME].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'kj-tt-ch';
      s.textContent = ch;
      const [dy, rot] = CH_TILT[i % CH_TILT.length];
      s.style.transform = `translateY(${dy}%) rotate(${rot}deg)`;
      name.append(s);
    });
    mk('kj-tt-sub', el, 'ヌス　対　メガネ星人');
    mk('kj-tt-skip', el, 'Enter: とばす');
  }
  return {
    show() {
      if (typeof document === 'undefined' || !document.body) return;
      if (!el) build();
      if (el.parentNode !== document.body) document.body.appendChild(el);
    },
    render(v) {
      if (!el || !v) return;
      const s = el.style;
      s.setProperty('--kj-tt-bg', v.bg.toFixed(3));
      s.setProperty('--kj-tt-silop', v.silOpacity.toFixed(3));
      s.setProperty('--kj-tt-silblur', `${v.silBlur.toFixed(1)}px`);
      s.setProperty('--kj-tt-rise', `${v.rise.toFixed(2)}vh`);
      s.setProperty('--kj-tt-name', v.nameOpacity.toFixed(3));
      s.setProperty('--kj-tt-scale', v.nameScale.toFixed(3));
      s.setProperty('--kj-tt-nblur', `${v.nameBlur.toFixed(1)}px`);
      s.setProperty('--kj-tt-sub', v.subOpacity.toFixed(3));
      s.setProperty('--kj-tt-fade', v.fade.toFixed(3));
    },
    hide() {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

/** 古いフィルムの上掛け（#kj-film：粒子・ちらつき・傷・周辺の暗さ。3D の画面はわずかに色あせる） */
function createFilmOverlay(ctx) {
  let el = null;
  let g = null;
  let img = null;
  let flick = null;
  let scratch = null;
  let acc = 0;
  let canvas = null;
  function build() {
    el = document.createElement('div');
    el.id = 'kj-film';
    flick = document.createElement('div');
    flick.className = 'kj-film-flick';
    const grain = document.createElement('canvas');
    grain.className = 'kj-film-grain';
    grain.width = KJ_FILM.grainW;
    grain.height = KJ_FILM.grainH;
    scratch = document.createElement('div');
    scratch.className = 'kj-film-scratch';
    const vig = document.createElement('div');
    vig.className = 'kj-film-vig';
    el.append(flick, grain, scratch, vig);
    try {
      g = grain.getContext('2d');
      img = g ? g.createImageData(KJ_FILM.grainW, KJ_FILM.grainH) : null;
    } catch {
      g = null;
      img = null;
    }
  }
  function draw() {
    if (g && img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 256) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    if (flick) flick.style.opacity = filmFlicker(Math.random()).toFixed(3);
    if (scratch) {
      const on = Math.random() < 0.15;
      scratch.style.opacity = on ? '0.18' : '0';
      if (on) scratch.style.left = `${(5 + Math.random() * 90).toFixed(1)}%`;
    }
  }
  return {
    mount() {
      if (typeof document === 'undefined' || !document.body) return;
      if (!el) build();
      if (el.parentNode !== document.body) document.body.appendChild(el);
      try {
        canvas = ctx.canvas || null;
      } catch {
        canvas = null;
      }
      if (canvas && canvas.classList) canvas.classList.add('kj-filmed');
      acc = 0;
      draw();
    },
    tick(dt) {
      if (!el || !el.parentNode) return;
      const r = filmStep(acc, dt);
      acc = r.acc;
      if (r.draw) draw();
    },
    unmount() {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      if (canvas && canvas.classList) canvas.classList.remove('kj-filmed');
    },
  };
}

/** 場面（タイトル演出と古いフィルムの質感で包む） */
export function createKaijuScene(ctx) {
  const hooks = {};
  const base = createKaijuSceneBase(ctx, hooks);
  let titleOn = false;
  let titleT = 0;
  let titleSkip = false;
  let titleGuard = 0;
  let prevPhase = null;
  let lastOutcome = null;
  const hookVal = (name, def) => {
    try {
      return typeof hooks[name] === 'function' ? hooks[name]() : def;
    } catch {
      return def;
    }
  };
  const titleUi = createTitleOverlay(() => {
    if (titleOn && titleGuard <= 0) titleSkip = true;
  });
  const film = createFilmOverlay(ctx);
  /** 咆哮（動きと音を合わせる。場面の仕組みが無ければ音だけ） */
  const roarNow = (who, delay = 0) => {
    if (typeof hooks.roar === 'function') {
      try {
        hooks.roar(who, delay);
        return;
      } catch (err) {
        console.warn(err);
      }
    }
    kjSfx(kjRoarFor(who), delay);
  };
  const phaseNow = () => {
    try {
      return typeof hooks.getPhase === 'function' ? hooks.getPhase() : null;
    } catch {
      return null;
    }
  };
  const pressedKey = (...c) => !!ctx.input && typeof ctx.input.wasPressed === 'function' && !!ctx.input.wasPressed(...c);
  function beginTitle() {
    titleOn = true;
    titleT = 0;
    titleSkip = false;
    titleGuard = 0.35;
    titleUi.show();
    titleUi.render(kjTitleView(0));
    kjEnsureMusic(KJ_FANFARE_TRACK);
    ctx.ui.setHint('Enter / Space / クリック: とばす');
  }
  function endTitle(quiet = false) {
    const was = titleOn;
    titleOn = false;
    titleUi.hide();
    if (!quiet && was) ctx.ui.setHint(PLAY_HINT);
  }
  const enter = (...a) => {
    endTitle(true);
    lastOutcome = null;
    const r = typeof base.enter === 'function' ? base.enter(...a) : undefined;
    prevPhase = phaseNow();
    film.mount();
    return r;
  };
  const update = (dt) => {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    film.tick(d);
    if (titleOn) {
      kjEnsureMusic(KJ_FANFARE_TRACK);
      titleT += d;
      titleGuard = Math.max(0, titleGuard - d);
      if (titleGuard <= 0 && pressedKey('Enter', 'NumpadEnter', 'Space')) titleSkip = true;
      const st = titleState(titleT, titleSkip);
      titleUi.render(kjTitleView(st.progress));
      if (st.done) {
        endTitle();
        // 戦いの始まり：行進曲と、ヌスとメガネ星人の咆哮
        kjEnsureMusic(KJ_MARCH_TRACK);
        roarNow('hero', 0);
        roarNow('foe', 1.4);
      }
      return undefined;
    }
    const w0 = Number(hookVal('getWalked', 0)) || 0;
    const r = typeof base.update === 'function' ? base.update(dt) : undefined;
    // 攻撃を受けた側の大きなリアクション（場面のほかの更新のあとで、位置と傾きを重ねる）
    if (typeof hooks.postReact === 'function') {
      try {
        hooks.postReact(d);
      } catch (err) {
        console.warn(err);
      }
    }
    // メガネ星人の怪獣の姿（予備動作・レンズの光・割れたレンズ・足取り）を、動きを重ねる前に付ける
    if (typeof hooks.postFoeModel === 'function') {
      try {
        hooks.postFoeModel(d);
      } catch (err) {
        console.warn(err);
      }
    }
    // 怪獣らしい動き（足取り・呼吸・爪の構え・首振り・咆哮）を重ねる
    if (typeof hooks.postMotion === 'function') {
      try {
        hooks.postMotion(d);
      } catch (err) {
        console.warn(err);
      }
    }
    // 二体を横から映すカメラ（場面のほかの更新のあとで、位置と向きを決める）
    if (typeof hooks.postCamera === 'function') {
      try {
        hooks.postCamera(d);
      } catch (err) {
        console.warn(err);
      }
    }
    const w1 = Number(hookVal('getWalked', 0)) || 0;
    // 一歩ごとの地響き
    if (w1 > w0 && footstepCount(w0, w1) > 0) kjSfx('kjStep');
    const ph = phaseNow();
    // 紹介が閉じて戦いが始まるときだけ（結果の「もう一度」はすぐ戦いから）
    if (ph === 'play' && prevPhase !== 'play' && prevPhase !== 'result') beginTitle();
    prevPhase = ph;
    const outcome = hookVal('getOutcome', null);
    if (outcome && !lastOutcome) {
      // 勝敗が決まった：行進曲を止め、勝った方の咆哮とジングル
      kjStopMusic(KJ_MARCH_TRACK);
      kjChargeSound(null);
      roarNow(outcome === 'win' ? 'hero' : 'foe', 0);
      kjSfx(kjJingleFor(outcome), 1.1);
    }
    lastOutcome = outcome;
    if (!titleOn && ph === 'play' && !outcome) kjEnsureMusic(KJ_MARCH_TRACK);
    return r;
  };
  const exit = (...a) => {
    endTitle(true);
    film.unmount();
    kjStopMusic(KJ_MARCH_TRACK);
    kjStopMusic(KJ_FANFARE_TRACK);
    kjChargeSound(null);
    return typeof base.exit === 'function' ? base.exit(...a) : undefined;
  };
  return new Proxy(base, {
    get(t, k) {
      if (k === 'enter') return enter;
      if (k === 'update') return update;
      if (k === 'exit') return exit;
      if (k === 'pausable') return titleOn ? false : Reflect.get(t, k, t);
      if (k === 'titleActive') return titleOn;
      return Reflect.get(t, k, t);
    },
  });
}

function createKaijuSceneBase(ctx, hooks = {}) {
  const { THREE, camera } = ctx;
  const input = ctx.input;
  let world = null;
  let rig = null;
  let heroShadow = null;
  let cityGroup = null;
  let tex = null;
  let mats = null;
  let geo = null;
  const disposables = [];
  const anim = createAnimState();
  let panel = null;
  let root = null;
  let damageEl = null;
  let phase = 'idle'; // idle | intro | play
  let t = 0;
  let guard = 0;
  let leaving = false;
  let gameId = KJ_GAME_ID;
  let carry = {};
  let carryLine = null;
  let mods = makeMods();
  let city = [];
  let cityMeshes = new Map();
  let pose = { x: PLAYER_START.x, z: PLAYER_START.z, heading: 0 };
  let walked = 0;
  let moving = false;
  let camYaw = 0;
  let shakeT = 0;
  let mouseDX = 0;
  let listening = false;
  let oldNear = null;
  let heroHolder = null;
  let melee = freshMelee();
  // 大振り：離したときの進み具合と、振り抜いた後に体が流れる様子（規則は kj-swing.js）
  let swingRelease = { punch: 0, kick: 0, tail: 0 };
  let follow = createFollow();
  let bones = null;
  let shakeAmp = SHAKE_AMP;
  let cityIndex = new Map();
  let wireMap = new Map();
  let collapsing = [];
  const wobbles = new Map();
  let fxGroup = null;
  const debrisPool = [];
  const dustPool = [];
  let debrisIdx = 0;
  let dustIdx = 0;
  let lastDamage = 0;
  let actionEl = null;
  let actionLabel = null;
  let actionFill = null;
  const tmpAxis = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQP = new THREE.Quaternion();
  const tmpQT = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  // ---- メガネ星人との戦い ----
  let kjLevel = (() => {
    const s = kjStorage();
    try { return s ? parseKjLevel(s.getItem(KJ_STORAGE_KEY)) : 1; } catch { return 1; }
  })();
  let enemy = null;
  let enemyPose = { x: ENEMY_START.x, z: ENEMY_START.z, heading: Math.PI };
  let alien = null;
  let heroHp = 100;
  let heroMax = 100;
  let guardP = 0;
  let knocks = [];
  let fightOver = null;
  let beamFx = null;
  let glassesFall = null;
  let enemyHurtT = 0;
  let enemyWalked = 0;
  let heroDownT = 0;
  let gaugeEls = null;
  let warnEl = null;
  let hurtEl = null;
  // ---- 攻撃を受けた側の大きなリアクション（規則は kj-react.js） ----
  let heroReact = createReaction();
  let foeReact = createReaction();
  let heroHpSeen = 100;
  let heroTiltOn = false;
  let foeTiltOn = false;
  let reactDustT = 0;
  // ---- 光線・勝敗・結果 ----
  let beam = createBeam();
  let heroBeam = null;
  let lights = null;
  let skyBase = null;
  let skyFrom = null;
  let skyTo = null;
  let fightT = 0;
  let endT = 0;
  let leaveHeading = 0;
  let resultPanel = null;
  let beamEl = null;
  let beamLabel = null;
  let beamFill = null;
  const endCam = new THREE.Vector3();
  const endLook = new THREE.Vector3();

  const rawIsDown = (...c) => !!input && typeof input.isDown === 'function' && !!input.isDown(...c);
  // 倒れている・起き上がる・吹き飛んでいる間は、操作を受け付けない
  const isDown = (...c) => !heroLockedNow() && rawIsDown(...c);
  const pressed = (...c) => !!input && typeof input.wasPressed === 'function' && !!input.wasPressed(...c);
  const paused = () => typeof ctx.isPaused === 'function' && !!ctx.isPaused();
  hooks.getPhase = () => phase;
  hooks.getWalked = () => walked;
  hooks.getOutcome = () => (fightOver ? (judge(heroHp, enemy ? enemy.hp : 1) || 'win') : null);

  // ---- 横から見るカメラ（二体を結ぶ線の横、やや低い位置から見上げる。規則は kj-camera.js） ----
  // 向きを変える操作は体の向きだけを変え、カメラは二体の位置だけで決まる
  let sideCam = createSideCam();
  const fadeCache = new Map();
  const faded = new Map();
  let fadeCityRef = null;
  function fadeMat(m) {
    if (!m || typeof m.clone !== 'function') return m;
    let fm = fadeCache.get(m);
    if (!fm) {
      fm = m.clone();
      fm.transparent = true;
      fm.opacity = SIDE_CAM.fadeOpacity;
      fm.depthWrite = false;
      fadeCache.set(m, fm);
    }
    if (fm.map !== m.map) {
      fm.map = m.map;
      fm.needsUpdate = true;
    }
    return fm;
  }
  function setFade(mesh, on) {
    if (!mesh || typeof mesh.traverse !== 'function') return;
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        if (o.userData.kjOrigMat === undefined) o.userData.kjOrigMat = o.material;
        const orig = o.userData.kjOrigMat;
        o.material = Array.isArray(orig) ? orig.map(fadeMat) : fadeMat(orig);
      } else if (o.userData.kjOrigMat !== undefined) {
        o.material = o.userData.kjOrigMat;
        delete o.userData.kjOrigMat;
      }
    });
  }
  function clearFades() {
    for (const m of faded.values()) setFade(m, false);
    faded.clear();
  }
  /** カメラと二体の間のビルは半透明にして、二体が隠れないようにする */
  function refreshFades(ids) {
    if (fadeCityRef !== cityMeshes) {
      clearFades();
      for (const fm of fadeCache.values()) {
        try {
          fm.dispose();
        } catch {
          // 握りつぶす
        }
      }
      fadeCache.clear();
      fadeCityRef = cityMeshes;
    }
    const want = new Set(ids);
    for (const [id, m] of faded) {
      if (!want.has(id) || cityMeshes.get(id) !== m) {
        setFade(m, false);
        faded.delete(id);
      }
    }
    for (const id of want) {
      if (faded.has(id)) continue;
      const m = cityMeshes.get(id);
      if (m) {
        setFade(m, true);
        faded.set(id, m);
      }
    }
  }
  hooks.postCamera = (dt) => {
    const live = (phase === 'play' || phase === 'intro') && !fightOver;
    if (!live) {
      sideCam = createSideCam();
      if (faded.size) clearFades();
      return;
    }
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    sideCam = stepSideCam(sideCam, pose, enemyPose, d, {
      heading: pose.heading,
      fov: Number(camera.fov) || SIDE_CAM.fov,
      aspect: Number(camera.aspect) || SIDE_CAM.aspect,
    });
    const cp = sideCamPose(sideCam);
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      const a = (Number(shakeAmp) || SHAKE_AMP) * Math.min(1, shakeT / SHAKE_SEC);
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    camera.position.set(cp.pos.x + sx, cp.pos.y + sy, cp.pos.z);
    camera.lookAt(cp.look.x + sx * 0.5, cp.look.y + sy * 0.5, cp.look.z);
    refreshFades(sideCamOccluders(sideCam, city, pose, enemyPose));
  };

  // ---- 攻撃を受けた側の大きなリアクション（よろけ・のけぞり・吹き飛び・ダウン） ----
  const KJ_ALIEN_HEIGHT = 30;
  function heroLockedNow() {
    return phase === 'play' && !fightOver && reactLocked(heroReact);
  }
  function impactFx(x, z, level) {
    shake(IMPACT_SHAKE[level] || 0.5);
    spawnDust(x, z, 4, level === 'down' ? 4 : 2, 2);
  }
  /** メガネ星人が主人公の攻撃を受けた */
  function reactFoe(kind, hit) {
    if (fightOver || !enemy || enemy.hp <= 0 || !hit) return;
    const level = reactionForHit({ attack: kind, damage: hit.damage, full: !!hit.full, guardP: 0 });
    const next = startReaction(foeReact, {
      level, dirX: enemyPose.x - pose.x, dirZ: enemyPose.z - pose.z, damage: hit.damage,
    });
    if (next === foeReact) return;
    foeReact = next;
    // 動けない反応のときは、溜めていた攻撃も止まる
    if (reactLocked(foeReact)) staggerEnemy(enemy);
    impactFx(enemyPose.x, enemyPose.z, level);
  }
  /** 主人公がメガネ星人の攻撃を受けた（体力の減り方と、いまの攻撃の種類で決める） */
  function onHeroHurt(dmg) {
    const attack = enemy && enemy.attack ? enemy.attack : 'chop';
    const level = reactionForHit({ attack, damage: dmg, full: false, guardP });
    const next = startReaction(heroReact, {
      level, dirX: pose.x - enemyPose.x, dirZ: pose.z - enemyPose.z, damage: dmg,
    });
    if (next === heroReact) return;
    heroReact = next;
    if (reactLocked(heroReact)) {
      // 途中の動作と光線の溜めは取り消す（離したことにして暴発させない）
      melee = freshMelee();
      swingRelease = { punch: 0, kick: 0, tail: 0 };
      follow = createFollow();
      beam = { charge: 0, cooldown: beam.cooldown, pressed: false };
      guardP = 0;
      kjChargeSound(null);
    }
    impactFx(pose.x, pose.z, level);
  }
  /** 吹き飛ぶ向きへ体を傾ける（向きは場面が付けた回転のまま、その場の前後左右に分けて足す） */
  function applyTilt(obj, st, wasOn) {
    if (!obj || !obj.rotation) return false;
    const p = reactionPose(st);
    if (!(p.tilt > 1e-4)) {
      if (wasOn) {
        obj.rotation.x = 0;
        obj.rotation.z = 0;
        obj.rotation.order = 'XYZ';
      }
      return false;
    }
    if (obj.rotation.order !== 'YXZ') obj.rotation.order = 'YXZ';
    const h = obj.rotation.y;
    const fw = st.dirX * Math.sin(h) + st.dirZ * Math.cos(h);
    const rt = st.dirX * Math.cos(h) - st.dirZ * Math.sin(h);
    obj.rotation.x = p.tilt * fw;
    obj.rotation.z = -p.tilt * rt;
    return true;
  }
  /** 反応を1フレーム進める。滑った先・倒れた先の建物を巻き込む */
  function advanceReaction(st, d, isHero, dustNow) {
    if (!st || st.phase === 'idle') return st;
    const r = stepReaction(st, d);
    const P = isHero ? pose : enemyPose;
    let x = P.x;
    let z = P.z;
    if (r.slide > 0) {
      x += r.state.dirX * r.slide;
      z += r.state.dirZ * r.slide;
      const rr = Math.hypot(x, z);
      if (rr > WALK_LIMIT) {
        x = (x / rr) * WALK_LIMIT;
        z = (z / rr) * WALK_LIMIT;
      }
      for (const b of buildingsInReach(city, 'body', x, z, 0)) damageCity(b.id, SLIDE_CRASH_DPS * d);
      if (dustNow) spawnDust(x, z, 3, 1, 0);
      if (isHero) pose = { ...pose, x, z };
      else enemyPose = { ...enemyPose, x, z };
    }
    for (const ev of r.events) {
      if (ev === 'landed') {
        const fp = fallFootprint(x, z, r.state.dirX, r.state.dirZ, isHero ? KJ_HERO_HEIGHT : KJ_ALIEN_HEIGHT);
        for (const b of buildingsInReach(city, 'body', fp.x, fp.z, 0)) damageCity(b.id, DOWN_IMPACT_DAMAGE);
        spawnDust(fp.x, fp.z, 10, 8, 1);
        shake(LANDING_SHAKE);
        kjSfx('kjStep');
        kjSfx('kjKick', 0.05);
      } else if (ev === 'rise') {
        kjSfx(isHero ? 'kjStep' : 'kjFoeStep');
      }
    }
    return r.state;
  }
  function clearReactions() {
    heroReact = createReaction();
    foeReact = createReaction();
    heroTiltOn = applyTilt(heroHolder, heroReact, heroTiltOn);
    foeTiltOn = applyTilt(alien ? alien.root : null, foeReact, foeTiltOn);
  }
  hooks.postReact = (dt) => {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    if (phase !== 'play' || fightOver || !enemy) {
      if (heroReact.phase !== 'idle' || foeReact.phase !== 'idle' || heroTiltOn || foeTiltOn) clearReactions();
      heroHpSeen = heroHp;
      follow = createFollow();
      return;
    }
    if (heroHp < heroHpSeen - 1e-6) onHeroHurt(heroHpSeen - heroHp);
    heroHpSeen = heroHp;
    reactDustT -= d;
    const dustNow = reactDustT <= 0;
    heroReact = advanceReaction(heroReact, d, true, dustNow);
    foeReact = advanceReaction(foeReact, d, false, dustNow);
    if (dustNow) reactDustT = 0.12;
    heroTiltOn = applyTilt(heroHolder, heroReact, heroTiltOn);
    foeTiltOn = applyTilt(alien ? alien.root : null, foeReact, foeTiltOn);
  };
  // ---- 怪獣らしい動き（重い足取り・呼吸・爪の構え・首振り・咆哮。規則は kj-motion.js） ----
  // 場面が毎フレーム付けた姿勢の上に「差分」として重ねる（自分の足した分は次のフレームで差し引く）
  const mAxisR = new THREE.Vector3();
  const mAxisF = new THREE.Vector3();
  const mAxisU = new THREE.Vector3();
  const mQH = new THREE.Quaternion();
  const mQW = new THREE.Quaternion();
  const mQ2 = new THREE.Quaternion();
  const mQP = new THREE.Quaternion();
  const mQB = new THREE.Quaternion();
  const mV1 = new THREE.Vector3();
  const mV2 = new THREE.Vector3();
  const layerVals = new WeakMap();
  const layerQuats = new WeakMap();
  const NO_ENEMY = {};
  let motionEnemy = NO_ENEMY;
  let motionT = 0;
  let heroRoar = createRoar();
  let foeRoar = createRoar();
  let heroRoarTimer = createRoarTimer(1);
  let foeRoarTimer = createRoarTimer(2);
  let heroMW = { gait: 0, idle: 1, claw: 1 };
  let foeMW = { gait: 0, idle: 1, claw: 1 };
  const heroSeen = {
    x: 0, z: 0, ok: false, walked: 0, extra: 0,
  };
  const foeSeen = {
    x: 0, z: 0, ok: false, walked: 0, extra: 0,
  };
  let foeDownSeen = false;
  let heroDownSeen = false;
  let mBones = null;

  /** obj[group][axis] に off を足す（前のフレームに自分が足した分は差し引く） */
  function layerValue(obj, group, axis, off) {
    if (!obj || !obj[group]) return;
    let m = layerVals.get(obj);
    if (!m) {
      m = {};
      layerVals.set(obj, m);
    }
    const key = `${group}.${axis}`;
    const st = m[key];
    const cur = obj[group][axis];
    const o = Number.isFinite(off) ? off : 0;
    const base = st && cur === st.written ? cur - st.off : cur;
    const v = base + o;
    obj[group][axis] = v;
    m[key] = { written: obj[group][axis], off: o };
  }

  /** 骨をワールドの回転 worldQ だけ回す（前のフレームに自分が回した分は戻してから） */
  function layerBone(bone, worldQ) {
    if (!bone || !bone.parent) return;
    const st = layerQuats.get(bone);
    if (st && bone.quaternion.equals(st.written)) mQB.copy(st.delta).invert().multiply(bone.quaternion);
    else mQB.copy(bone.quaternion);
    bone.parent.getWorldQuaternion(mQP);
    const delta = st ? st.delta : new THREE.Quaternion();
    delta.copy(mQP).invert().multiply(worldQ).multiply(mQP);
    bone.quaternion.copy(delta).multiply(mQB);
    const written = st ? st.written : new THREE.Quaternion();
    written.copy(bone.quaternion);
    if (!st) layerQuats.set(bone, { delta, written });
  }

  function motionBones() {
    if (mBones) return mBones;
    if (!rig || !rig.real) return null;
    const map = new Map();
    const key = (s) => String(s || '').split(/[:|]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    rig.root.traverse((o) => {
      if (!o.isBone) return;
      const k = key(o.name);
      if (k && !map.has(k)) map.set(k, o);
    });
    const pickB = (...names) => {
      for (const n of names) if (map.has(n)) return map.get(n);
      return null;
    };
    mBones = {
      head: pickB('head', 'neck', 'neck1'),
      arms: [
        { upper: pickB('upperarml', 'leftupperarm', 'leftarm'), fore: pickB('lowerarml', 'leftlowerarm', 'leftforearm') },
        { upper: pickB('upperarmr', 'rightupperarm', 'rightarm'), fore: pickB('lowerarmr', 'rightlowerarm', 'rightforearm') },
      ],
    };
    return mBones;
  }

  /** 新しい戦いになったら動きの状態を最初に戻す */
  function syncMotion() {
    if (enemy === motionEnemy) return;
    motionEnemy = enemy;
    const sd = enemy && Number.isFinite(Number(enemy.seed)) ? Number(enemy.seed) >>> 0 : 7;
    heroRoar = createRoar();
    foeRoar = createRoar();
    heroRoarTimer = createRoarTimer((sd ^ 5369127) >>> 0);
    foeRoarTimer = createRoarTimer((sd ^ 3095441) >>> 0);
    heroSeen.ok = false;
    foeSeen.ok = false;
    heroSeen.extra = 0;
    foeSeen.extra = 0;
    foeDownSeen = false;
    heroDownSeen = false;
  }

  /** 咆哮を始める（動きと音を合わせる）。もう吠えていれば false */
  function roarFor(who, delay = 0) {
    syncMotion();
    const foe = who === 'foe';
    const cur = foe ? foeRoar : heroRoar;
    if (isRoaring(cur)) return false;
    const next = startRoar(cur, delay);
    if (foe) foeRoar = next;
    else heroRoar = next;
    kjSfx(kjRoarFor(foe ? 'foe' : 'hero'), Math.max(0, Number(delay) || 0));
    return true;
  }
  hooks.roar = roarFor;

  /** 歩いた距離（足音と同じ距離を使い、演出で動いた分は足す）と速さ */
  function trackMove(seen, p, walkedNow, locked, d) {
    let move = 0;
    if (seen.ok) {
      move = Math.hypot(p.x - seen.x, p.z - seen.z);
      if (move > 6) move = 0;
    }
    const w = Number(walkedNow) || 0;
    if (seen.ok && w === seen.walked && !locked) seen.extra += move;
    seen.x = p.x;
    seen.z = p.z;
    seen.ok = true;
    seen.walked = w;
    return { dist: w + seen.extra, speed: d > 0 ? move / d : 0 };
  }

  function applyHeroMotion(p) {
    const body = rig.body || rig.root;
    layerValue(body, 'position', 'x', p.sway);
    layerValue(body, 'position', 'y', p.bob);
    layerValue(body, 'rotation', 'z', p.roll);
    layerValue(body, 'rotation', 'x', p.lean);
    const B = motionBones();
    if (!B) return;
    heroHolder.getWorldQuaternion(mQH);
    mAxisR.set(1, 0, 0).applyQuaternion(mQH);
    mAxisF.set(0, 0, 1).applyQuaternion(mQH);
    mAxisU.set(0, 1, 0).applyQuaternion(mQH);
    if (B.head) {
      mQW.setFromAxisAngle(mAxisR, -p.headUp);
      mQ2.setFromAxisAngle(mAxisU, p.headYaw);
      mQW.multiply(mQ2);
      layerBone(B.head, mQW);
    }
    heroHolder.getWorldPosition(mV2);
    B.arms.forEach((arm, i) => {
      if (!arm.upper) return;
      arm.upper.getWorldPosition(mV1);
      const s = Math.sign(mV1.sub(mV2).dot(mAxisR)) || (i === 0 ? 1 : -1);
      mQW.setFromAxisAngle(mAxisF, s * (p.armsOut - p.armIn));
      mQ2.setFromAxisAngle(mAxisR, -(p.armFwd + p.armSwing * s));
      mQW.multiply(mQ2);
      layerBone(arm.upper, mQW);
      if (arm.fore) {
        mQW.setFromAxisAngle(mAxisR, -p.elbow);
        layerBone(arm.fore, mQW);
      }
    });
  }

  function applyFoeMotion(p) {
    const parts = alien && alien.root && alien.root.userData ? alien.root.userData.kjMotion : null;
    if (!parts) return;
    const { lean, head, arms } = parts;
    layerValue(lean, 'position', 'x', p.sway * 0.8);
    layerValue(lean, 'position', 'y', p.bob * 0.8);
    layerValue(lean, 'rotation', 'z', p.roll);
    layerValue(lean, 'rotation', 'x', p.lean);
    if (head) {
      layerValue(head, 'rotation', 'y', p.headYaw);
      layerValue(head, 'rotation', 'x', -p.headUp);
    }
    for (const a of Array.isArray(arms) ? arms : []) {
      if (!a || !a.shoulder) continue;
      layerValue(a.shoulder, 'rotation', 'x', -(p.armFwd + p.armSwing * a.side) - p.elbow * 0.3);
      layerValue(a.shoulder, 'rotation', 'z', a.side * (p.armsOut - p.armIn));
    }
  }

  hooks.postMotion = (dt) => {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    if (!rig || !heroHolder) return;
    syncMotion();
    motionT += d;
    const outcome = typeof hooks.getOutcome === 'function' ? hooks.getOutcome() : null;
    const live = phase === 'play' && !fightOver;

    // ---- ヌス ----
    const hLocked = reactLocked(heroReact);
    const hMove = trackMove(heroSeen, heroHolder.position, walked, hLocked, d);
    const hActing = !!activeKind() || beam.charge > 0 || guardP > 0 || !!(follow && follow.kind);
    heroMW = stepWeights(heroMW, motionTargets({
      moving: hMove.speed > 0.5, acting: hActing, locked: hLocked, gone: outcome === 'lose',
    }), d);
    // 攻撃を始めたら咆哮はやめる（腕の動きを邪魔しない）
    if (hActing && isRoaring(heroRoar)) heroRoar = createRoar();

    // ---- メガネ星人 ----
    const fLocked = reactLocked(foeReact);
    const fPos = alien && alien.root ? alien.root.position : enemyPose;
    const fMove = trackMove(foeSeen, fPos, enemyWalked, fLocked, d);
    const fActing = !!enemy && enemy.phase !== 'approach';
    foeMW = stepWeights(foeMW, motionTargets({
      moving: fMove.speed > 0.5, acting: fActing, locked: fLocked, gone: outcome === 'win',
    }), d);
    if (fActing && isRoaring(foeRoar)) foeRoar = createRoar();

    // ---- 咆哮：一定の間隔と、相手を倒したとき ----
    if (live) {
      const hr = stepRoarTimer(heroRoarTimer, d, hActing || hLocked || isRoaring(heroRoar));
      heroRoarTimer = hr.state;
      if (hr.roar) roarFor('hero', 0);
      const fr = stepRoarTimer(foeRoarTimer, d, !enemy || fActing || fLocked || isRoaring(foeRoar));
      foeRoarTimer = fr.state;
      if (fr.roar) roarFor('foe', 0);
      const fDown = foeReact.level === 'down' && foeReact.phase !== 'idle';
      if (fDown && !foeDownSeen && !hActing) roarFor('hero', 0.8);
      foeDownSeen = fDown;
      const hDown = heroReact.level === 'down' && heroReact.phase !== 'idle';
      if (hDown && !heroDownSeen && !fActing) roarFor('foe', 0.8);
      heroDownSeen = hDown;
    }
    heroRoar = stepRoar(heroRoar, d);
    foeRoar = stepRoar(foeRoar, d);

    applyHeroMotion(kaijuPose({
      walked: hMove.dist, t: motionT, ...heroMW, roar: heroRoar, react: reactionPose(heroReact), offset: 0,
    }));
    applyFoeMotion(kaijuPose({
      walked: fMove.dist, t: motionT, ...foeMW, roar: foeRoar, react: reactionPose(foeReact), offset: 1.9,
    }));
    updateTails(hMove.dist, fMove.dist, d);
  };

  // ---- しっぽ（腰から生える節。歩くと揺れ、しっぽ攻撃で大きく振られる。規則は kj-tail.js） ----
  const heroTailDims = tailDims(KJ_HERO_HEIGHT, 'hero');
  const foeTailDims = tailDims(KJ_ALIEN_HEIGHT, FOE_TAIL_SHAPE);
  let heroTail = null;
  let foeTail = null;

  /** しっぽの3D（付け根ごと回る入れ物 → 節の鎖。節は -z へ伸びる） */
  function buildTail(dims, bodyMat, plateMat) {
    const pivot = new THREE.Group();
    const base = new THREE.Group();
    base.position.set(0, dims.baseY, -dims.baseBack);
    pivot.add(base);
    const segs = [];
    let parent = base;
    dims.segments.forEach((s, i) => {
      const g = new THREE.Group();
      g.rotation.order = 'YXZ';
      if (i > 0) g.position.z = -dims.segments[i - 1].len;
      const cg = new THREE.CylinderGeometry(s.r1, s.r0, s.len, 10);
      cg.rotateX(-Math.PI / 2);
      cg.translate(0, 0, -s.len / 2);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(s.r0, 10, 8), bodyMat);
      g.add(new THREE.Mesh(cg, bodyMat), joint);
      if (plateMat && s.r0 > 0.6) {
        // 背中のモヒカン色の小さな背びれ
        const plate = new THREE.Mesh(new THREE.ConeGeometry(s.r0 * 0.45, s.r0 * 1.1, 4), plateMat);
        plate.scale.x = 0.35;
        plate.position.set(0, s.r0 * 0.95, -s.len * 0.4);
        g.add(plate);
      }
      if (i === dims.segments.length - 1) {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(s.r1, 8, 6), bodyMat);
        tip.position.z = -s.len;
        g.add(tip);
      }
      parent.add(g);
      segs.push(g);
      parent = g;
    });
    return { pivot, segs };
  }

  function applyTail(tail, tp) {
    if (!tail || !tp) return;
    tail.pivot.rotation.y = tp.twist;
    tail.segs.forEach((g, i) => g.rotation.set(tp.pitches[i] || 0, tp.yaws[i] || 0, 0));
  }

  function heroTailPoseAt(kind, p, pressedNow, releasedAt, walkedDist, withFollow) {
    const st = tailSwingState({
      kind, p, pressed: pressedNow, releasedAt, follow: withFollow ? follow : null,
    });
    return tailPose({
      walked: walkedDist, t: motionT, gait: heroMW.gait, idle: heroMW.idle, ...st, offset: 0,
    }, heroTailDims);
  }

  function heroTailNow(walkedDist) {
    const kind = activeKind();
    return heroTailPoseAt(
      kind,
      kind ? melee[kind].p : 0,
      kind ? melee[kind].pressed : true,
      kind ? swingRelease[kind] : null,
      walkedDist,
      true,
    );
  }

  function heroTailWorld(tp) {
    return tailPoints(heroTailDims, tp).map((q) => tailToWorld(q, pose.x, pose.z, pose.heading));
  }

  /** しっぽ攻撃が当たった瞬間のしっぽ（伸び切った位置。途中で離したときは離した位置） */
  function heroTailHitPoints(hit) {
    const p = hit && hit.full ? melee.tail.p : swingRelease.tail;
    return heroTailWorld(heroTailPoseAt('tail', p, true, null, walked + heroSeen.extra, false));
  }

  function updateTails(heroDist, foeDist, d) {
    if (heroTail) {
      const tp = heroTailNow(heroDist);
      applyTail(heroTail, tp);
      // 振っている最中に先が触れた建物も、少しずつ崩れる
      if (phase === 'play' && !fightOver && d > 0 && tailSweeping(melee.tail.p, melee.tail.pressed)) {
        for (const b of tailBuildingsHit(city, heroTailWorld(tp))) damageCity(b.id, TAIL_SWEEP_DPS * d);
      }
    }
    if (foeTail) {
      applyTail(foeTail, tailPose({
        walked: foeDist, t: motionT, gait: foeMW.gait, idle: foeMW.idle, offset: 1.9,
      }, foeTailDims));
    }
  }

  // ---- メガネ星人の怪獣の姿（前かがみの大怪獣。規則は kj-foe-design.js、組み立ては kj-foe-model.js） ----
  // 古い細身の体は残したまま見えなくし（場面のほかの処理が触っても壊れないように）、その上に怪獣の体を載せる
  let foeKaiju = null;
  let foeShadowMat;
  const FOE_HURT_SEC = 0.3;
  const foeTrack = {
    x: 0, z: 0, ok: false, walked: 0, hp: null, hurt: 0, enemy: null,
  };
  function keepFoeParts(obj) {
    if (obj && typeof obj.traverse === 'function') obj.traverse((o) => { o.userData.kjKeep = true; });
  }
  function isFoeShadow(o) {
    if (foeShadowMat === undefined) {
      try {
        foeShadowMat = ctx.makeShadow(1).material || null;
      } catch {
        foeShadowMat = null;
      }
    }
    return !!foeShadowMat && o.material === foeShadowMat;
  }
  function hideOldFoe(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    if (obj.isObject3D) {
      if (obj.isScene || obj === world || obj === cityGroup || obj === heroHolder || obj === fxGroup) return;
      obj.traverse((o) => {
        if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && !o.userData.kjKeep && !isFoeShadow(o)) o.visible = false;
      });
      return;
    }
    const list = Array.isArray(obj) ? obj : Object.values(obj);
    for (const v of list) if (v && typeof v === 'object') hideOldFoe(v, depth + 1);
  }
  function dressFoe(a) {
    if (!a || !a.root) return null;
    let k = null;
    try {
      k = buildFoeKaiju(THREE, { height: KJ_ALIEN_HEIGHT, seed: 7 });
    } catch (err) {
      console.warn('メガネ星人の怪獣の姿を作れません（元の姿を使います）:', err);
      return null;
    }
    hideOldFoe(a.root);
    keepFoeParts(k.root);
    a.root.add(k.root);
    if (!a.root.userData) a.root.userData = {};
    a.root.userData.kjMotion = k.motion;
    return k;
  }
  hooks.postFoeModel = (dt) => {
    if (!alien || !alien.root || !foeKaiju) return;
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    hideOldFoe(alien.root);
    if (glassesFall) hideOldFoe(glassesFall);
    const e = enemy;
    if (e !== foeTrack.enemy) {
      foeTrack.enemy = e;
      foeTrack.hp = e ? e.hp : null;
      foeTrack.hurt = 0;
      foeTrack.ok = false;
    }
    if (e && !e.glassesOff && foeKaiju.broken) foeKaiju.repair();
    if (e && e.glassesOff && !foeKaiju.broken) foeKaiju.breakLenses(world);
    if (e && foeTrack.hp !== null && e.hp < foeTrack.hp - 1e-6) foeTrack.hurt = FOE_HURT_SEC;
    foeTrack.hp = e ? e.hp : null;
    foeTrack.hurt = Math.max(0, foeTrack.hurt - d);
    const p = alien.root.position;
    if (foeTrack.ok) {
      const m = Math.hypot(p.x - foeTrack.x, p.z - foeTrack.z);
      if (m < 6) foeTrack.walked += m;
    }
    foeTrack.x = p.x;
    foeTrack.z = p.z;
    foeTrack.ok = true;
    const lens = foeLensState(e);
    foeKaiju.update({
      pose: foeAttackPose(e),
      glow: lens.glow,
      broken: lens.broken,
      roar: isRoaring(foeRoar),
      walked: foeTrack.walked,
      gait: foeMW ? foeMW.gait : 0,
      hurt: foeTrack.hurt / FOE_HURT_SEC,
    }, d);
  };

  const canvasEl = () => {
    try {
      return ctx.canvas || null;
    } catch {
      return null;
    }
  };

  // ---- 入力（マウスは視点を固定している間だけ） ----
  const onMove = (e) => {
    const c = canvasEl();
    if (c && typeof document !== 'undefined' && document.pointerLockElement === c && !heroLockedNow()) mouseDX += Number(e.movementX) || 0;
  };
  const onClick = () => {
    if (phase !== 'play') return;
    const c = canvasEl();
    if (!c || typeof c.requestPointerLock !== 'function' || document.pointerLockElement === c) return;
    try {
      const r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // 固定できなくてもキーで遊べる
    }
  };
  function listen(on) {
    if (typeof window === 'undefined' || on === listening) return;
    listening = on;
    const c = canvasEl();
    if (on) {
      document.addEventListener('mousemove', onMove);
      if (c) c.addEventListener('click', onClick);
    } else {
      document.removeEventListener('mousemove', onMove);
      if (c) c.removeEventListener('click', onClick);
    }
  }
  function releaseLock() {
    try {
      if (typeof document !== 'undefined' && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    } catch {
      // 握りつぶす
    }
  }

  // ---- 見た目の材料 ----
  function buildMaterials() {
    const rng = createRng(2024);
    const windows = [PALETTE.kjWallA, PALETTE.kjWallB, PALETTE.kjWallC].map((wall) => canvasTex(THREE, 64, 64, (g, w, h) => {
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          g.fillStyle = rng() < 0.22 ? PALETTE.kjWindowLit : PALETTE.kjWindow;
          g.fillRect(c * 16 + 3, r * 16 + 4, 10, 8);
          g.fillStyle = PALETTE.kjRoofFlat;
          g.fillRect(c * 16 + 2, r * 16 + 12, 12, 1);
        }
      }
    }));
    const tiles = canvasTex(THREE, 32, 32, (g, w, h) => {
      g.fillStyle = PALETTE.kjRoof;
      g.fillRect(0, 0, w, h);
      g.fillStyle = PALETTE.kjRoofDark;
      for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) g.fillRect(x, y, 1, 4);
    });
    tiles.repeat.set(0.5, 0.5);
    const road = canvasTex(THREE, 32, 32, (g, w, h) => {
      g.fillStyle = PALETTE.kjRoad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = PALETTE.kjRoadLine;
      g.fillRect(15, 0, 2, 16);
      g.fillRect(0, 0, 1, h);
      g.fillRect(w - 1, 0, 1, h);
    });
    tex = {
      windows, tiles, road, dust: dustTexture(THREE),
    };
    const L = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
    mats = {
      ground: L(PALETTE.kjGround),
      pavement: L(PALETTE.kjPavement, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      road: new THREE.MeshLambertMaterial({
        map: road, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      roofFlat: L(PALETTE.kjRoofFlat),
      houseWall: L(PALETTE.kjHouseWall),
      roof: new THREE.MeshLambertMaterial({ map: tiles }),
      pole: L(PALETTE.kjPole),
      wire: new THREE.LineBasicMaterial({ color: PALETTE.kjWire }),
      tank: L(PALETTE.kjTank),
      tankLeg: L(PALETTE.kjTankLeg),
      mountain: L(PALETTE.kjMountain, { flatShading: true }),
      mountainFar: L(PALETTE.kjMountainFar, { flatShading: true }),
      debris: L(PALETTE.kjDebris),
      rubble: L(PALETTE.kjRubble, { flatShading: true }),
    };
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-4.2, 0);
    roofShape.lineTo(4.2, 0);
    roofShape.lineTo(0, 3.2);
    roofShape.lineTo(-4.2, 0);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 7, bevelEnabled: false });
    roofGeo.translate(0, 0, -3.5);
    geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      roof: roofGeo,
      pole: new THREE.CylinderGeometry(0.3, 0.35, 13, 6),
      bar: new THREE.BoxGeometry(4, 0.4, 0.4),
      leg: new THREE.BoxGeometry(0.5, 10, 0.5),
      tank: new THREE.CylinderGeometry(3.2, 3.2, 5, 10),
      tankTop: new THREE.ConeGeometry(3.4, 2, 10),
      rubble: (() => {
        const g = new THREE.ConeGeometry(1, 1, 7);
        g.translate(0, 0.5, 0);
        return g;
      })(),
    };
  }

  function buildStatic() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.kjSky);
    world.fog = new THREE.Fog(PALETTE.kjFog, 160, 460);
    lights = ctx.addLights(world);
    skyBase = {
      bg: world.background.clone(),
      fog: world.fog.color.clone(),
      sun: lights && lights.sun && lights.sun.color ? lights.sun.color.clone() : null,
    };
    buildMaterials();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mats.ground);
    ground.rotation.x = -Math.PI / 2;
    world.add(ground);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 12, 40), mats.pavement);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.1;
    world.add(pad);
    const len = (ARENA_RADIUS + 12) * 2;
    const roadMat = mats.road.clone();
    roadMat.map = tex.road.clone();
    roadMat.map.repeat.set(1, len / (ROAD_HALF * 2));
    roadMat.map.needsUpdate = true;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.2;
    world.add(road);
    // 遠くの山（作り物らしい角ばった山）
    const rng = createRng(4242);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
      const far = i % 2 === 0;
      const R = far ? 270 + rng() * 30 : 210 + rng() * 30;
      const h = (far ? 70 : 45) + rng() * 35;
      const m = new THREE.Mesh(new THREE.ConeGeometry(45 + rng() * 25, h, 6), far ? mats.mountainFar : mats.mountain);
      m.position.set(Math.cos(a) * R, h / 2 - 2, Math.sin(a) * R);
      m.rotation.y = rng() * Math.PI;
      world.add(m);
    }
    rig = createHeroRig(THREE, ctx.mat, { scale: KJ_HERO_HEIGHT / HERO_HEIGHT });
    // 位置と向きは入れ物、動作の傾き・ひねり・沈みは rig.root に付ける
    heroHolder = new THREE.Group();
    heroHolder.add(rig.root);
    heroShadow = ctx.makeShadow(16);
    heroShadow.position.y = 0.3;
    world.add(heroHolder, heroShadow);
    buildFx();
    alien = buildAlien();
    foeKaiju = dressFoe(alien);
    heroTail = buildTail(
      heroTailDims,
      new THREE.MeshLambertMaterial({ color: PALETTE.heroBody }),
      new THREE.MeshLambertMaterial({ color: PALETTE.heroMohican }),
    );
    heroHolder.add(heroTail.pivot);
    if (alien && alien.root) {
      foeTail = buildTail(
        foeTailDims,
        foeKaiju ? foeKaiju.mats.hide : new THREE.MeshLambertMaterial({ color: PALETTE.kjAlienBody }),
        foeKaiju ? foeKaiju.mats.spike : null,
      );
      alien.root.add(foeTail.pivot);
      keepFoeParts(foeTail.pivot);
    }
    heroBeam = buildHeroBeam();
  }

  // ---- 街（遊ぶたびに作り直す） ----
  function officeMesh(b, rng) {
    const g = new THREE.Group();
    const w = b.radius * 1.3;
    const dp = b.radius * (1.0 + rng() * 0.3);
    const h = KJ_HERO_HEIGHT * (0.5 + rng() * 0.7);
    const map = tex.windows[Math.floor(rng() * tex.windows.length) % tex.windows.length].clone();
    map.repeat.set(Math.max(1, Math.round(w / 3)) / 4, Math.max(1, Math.round(h / 3)) / 4);
    map.needsUpdate = true;
    const side = new THREE.MeshLambertMaterial({ map });
    disposables.push(map, side);
    const body = new THREE.Mesh(geo.box, [side, side, mats.roofFlat, mats.roofFlat, side, side]);
    body.scale.set(w, h, dp);
    body.position.y = h / 2;
    const cap = new THREE.Mesh(geo.box, mats.roofFlat);
    cap.scale.set(w * 0.3, 1.5, dp * 0.3);
    cap.position.set((rng() - 0.5) * w * 0.4, h + 0.75, (rng() - 0.5) * dp * 0.4);
    g.add(body, cap);
    g.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    g.userData.kjSize = { w, h, dp };
    return g;
  }

  function houseMesh(b, rng) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo.box, mats.houseWall);
    body.scale.set(7, 4.5, 6);
    body.position.y = 2.25;
    const roof = new THREE.Mesh(geo.roof, mats.roof);
    roof.position.y = 4.5;
    g.add(body, roof);
    g.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2);
    return g;
  }

  function waterMesh() {
    const g = new THREE.Group();
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(geo.leg, mats.tankLeg);
      leg.position.set(x, 5, z);
      g.add(leg);
    }
    const tank = new THREE.Mesh(geo.tank, mats.tank);
    tank.position.y = 12.5;
    const top = new THREE.Mesh(geo.tankTop, mats.tank);
    top.position.y = 16;
    g.add(tank, top);
    return g;
  }

  function poleMesh() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(geo.pole, mats.pole);
    p.position.y = 6.5;
    const bar = new THREE.Mesh(geo.bar, mats.pole);
    bar.position.y = 12;
    g.add(p, bar);
    return g;
  }

  function addWires(group, poles) {
    const done = new Set();
    for (const a of poles) {
      let best = null;
      let bestD = Infinity;
      for (const b of poles) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (!best || bestD > 50) continue;
      const key = [a.id, best.id].sort().join('|');
      if (done.has(key)) continue;
      done.add(key);
      for (const off of [-1.8, 1.8]) {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const k = i / 8;
          pts.push(new THREE.Vector3(
            a.x + off + (best.x - a.x) * k,
            12.2 - Math.sin(k * Math.PI) * 1.4,
            a.z + (best.z - a.z) * k,
          ));
        }
        const lg = new THREE.BufferGeometry().setFromPoints(pts);
        disposables.push(lg);
        const line = new THREE.Line(lg, mats.wire);
        group.add(line);
        for (const id of [a.id, best.id]) {
          if (!wireMap.has(id)) wireMap.set(id, []);
          wireMap.get(id).push(line);
        }
      }
    }
  }

  /** 看板（館の絵を額に入れて、ビルの壁に貼る。建物と一緒に崩れる） */
  function addSigns() {
    for (const s of kjSignPlan(city)) {
      const m = cityMeshes.get(s.buildingId);
      if (!m) continue;
      const size = (m.userData && m.userData.kjSize) || { w: 7, h: 4.5, dp: 6 };
      const r = m.rotation.y;
      const lx = s.dir.x * Math.cos(r) - s.dir.z * Math.sin(r);
      const lz = s.dir.x * Math.sin(r) + s.dir.z * Math.cos(r);
      const onX = Math.abs(lx) >= Math.abs(lz);
      const span = onX ? size.dp : size.w;
      let fr = null;
      try {
        fr = buildDrawingFrame(THREE, s.file, {
          maxW: Math.max(2, Math.min(9, span * 0.8)),
          maxH: Math.max(2, Math.min(7, size.h * 0.4)),
          frameColor: PALETTE.kjSignFrame,
          border: 0.45,
        });
      } catch (err) {
        console.warn('看板を貼れません:', err);
      }
      if (!fr || !fr.group) continue;
      const y = Math.max(3.5, Math.min(size.h - 3, size.h * 0.6));
      if (onX) {
        const sx = Math.sign(lx) || 1;
        fr.group.position.set(sx * (size.w / 2 + 0.2), y, 0);
        fr.group.rotation.y = (sx * Math.PI) / 2;
      } else {
        const sz = Math.sign(lz) || 1;
        fr.group.position.set(0, y, sz * (size.dp / 2 + 0.2));
        fr.group.rotation.y = sz > 0 ? 0 : Math.PI;
      }
      m.add(fr.group);
    }
  }

  function buildCity(seed) {
    if (cityGroup) world.remove(cityGroup);
    for (const d of disposables.splice(0)) {
      try {
        d.dispose();
      } catch {
        // 握りつぶす
      }
    }
    city = createCity(seed);
    cityGroup = new THREE.Group();
    cityMeshes = new Map();
    cityIndex = new Map();
    wireMap = new Map();
    collapsing = [];
    wobbles.clear();
    lastDamage = 0;
    clearFx();
    city.forEach((b, i) => {
      const rng = createRng((seed + (i + 1) * 7919) >>> 0);
      let m;
      if (b.type === 'office') m = officeMesh(b, rng);
      else if (b.type === 'house') m = houseMesh(b, rng);
      else if (b.type === 'water') m = waterMesh();
      else m = poleMesh();
      m.position.set(b.x, 0, b.z);
      cityGroup.add(m);
      cityMeshes.set(b.id, m);
      cityIndex.set(b.id, i);
    });
    addWires(cityGroup, city.filter((b) => b.type === 'pole'));
    addSigns();
    world.add(cityGroup);
  }

  // ---- HUD ----
  function mountHud() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!root) {
      root = document.createElement('div');
      root.id = 'kj-root';
      const title = document.createElement('div');
      title.className = 'kj-title';
      title.textContent = '怪獣大決戦';
      damageEl = document.createElement('div');
      damageEl.className = 'kj-damage';
      // パンチ・キック・しっぽ（と踏ん張り）の溜めのゲージは出さない。光線と体力のゲージだけ
      const gauges = document.createElement('div');
      gauges.className = 'kj-gauges';
      const mkGauge = (cls, name) => {
        const box = document.createElement('div');
        box.className = `kj-gauge ${cls}`;
        const label = document.createElement('span');
        label.className = 'kj-gauge-name';
        label.textContent = name;
        const bar = document.createElement('div');
        bar.className = 'kj-gauge-bar';
        const lagEl = document.createElement('i');
        lagEl.className = 'kj-gauge-lag';
        const fill = document.createElement('i');
        fill.className = 'kj-gauge-fill';
        bar.append(lagEl, fill);
        box.append(label, bar);
        return {
          box, fill, lagEl, lag: 1,
        };
      };
      gaugeEls = { hero: mkGauge('kj-gauge-hero', 'ヌス'), foe: mkGauge('kj-gauge-foe', 'メガネ星人') };
      const vs = document.createElement('div');
      vs.className = 'kj-vs';
      vs.textContent = 'VS';
      gauges.append(gaugeEls.hero.box, vs, gaugeEls.foe.box);
      warnEl = document.createElement('div');
      warnEl.className = 'kj-warn kj-off';
      hurtEl = document.createElement('div');
      hurtEl.className = 'kj-hurt';
      beamEl = document.createElement('div');
      beamEl.className = 'kj-beam kj-off';
      beamLabel = document.createElement('span');
      beamLabel.className = 'kj-beam-label';
      const beamBar = document.createElement('div');
      beamBar.className = 'kj-beam-bar';
      beamFill = document.createElement('i');
      beamFill.className = 'kj-beam-fill';
      beamBar.append(beamFill);
      beamEl.append(beamLabel, beamBar);
      root.append(hurtEl, gauges, title, damageEl, warnEl, beamEl);
    }
    if (root.parentNode !== document.body) document.body.appendChild(root);
    document.body.classList.add('kj-active');
  }
  function unmountHud() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('kj-active');
  }
  function refreshHud() {
    if (damageEl) {
      const total = totalDamage(city);
      const text = `被害額 ${formatDamage(total)}`;
      if (damageEl.textContent !== text) damageEl.textContent = text;
      if (total > lastDamage) {
        damageEl.classList.remove('kj-bump');
        void damageEl.offsetWidth;
        damageEl.classList.add('kj-bump');
      }
      lastDamage = total;
    }
    if (beamEl) {
      const cd = beam.cooldown > 0;
      beamEl.classList.toggle('kj-off', phase !== 'play' || !!fightOver);
      beamEl.classList.toggle('kj-cool', cd);
      beamEl.classList.toggle('kj-max', !cd && beam.charge >= 1);
      let text = '光線 R';
      if (cd) text = `充填中 ${beam.cooldown.toFixed(1)}秒`;
      else if (beam.charge > 0) text = beam.charge >= 1 ? '光線 最大！' : '光線 溜め中';
      if (beamLabel.textContent !== text) beamLabel.textContent = text;
      const v = cd ? 1 - beam.cooldown / BEAM.COOLDOWN : beam.charge;
      beamFill.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    }
    if (gaugeEls) {
      setGauge(gaugeEls.hero, heroMax > 0 ? heroHp / heroMax : 0);
      setGauge(gaugeEls.foe, enemy && enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1);
    }
    if (warnEl) {
      const w = phase === 'play' && !fightOver && enemy && enemy.phase === 'windup' ? WARN_TEXT[enemy.attack] : null;
      warnEl.classList.toggle('kj-off', !w);
      if (w && warnEl.textContent !== w) warnEl.textContent = w;
    }
  }

  // ---- 動作（押している時間で進み、離すと戻る。規則は kj-rules.js） ----
  /** 進んでいる動作（進み具合 > 0）。無ければ null */
  function activeKind() {
    return MELEE_KINDS.find((k) => melee[k].p > 0) || null;
  }

  function act(d) {
    const busy = activeKind();
    // 踏ん張り（攻撃中は構えられない。構えている間は攻撃できない）
    const beaming = beam.charge > 0 || (beam.pressed && !(beam.cooldown > 0));
    const guardDown = !busy && !beaming && isDown(KJ_GUARD_KEY);
    guardP = stepProgress('guard', guardP, guardDown, d, mods);
    // 1つの動作が進んでいる間は、他の動作のキーは無視する
    const driver = busy || (guardP > 0 || beaming ? null : MELEE_KINDS.find((k) => isDown(KJ_MELEE_KEYS[k]))) || null;
    for (const k of MELEE_KINDS) {
      const down = k === driver && isDown(KJ_MELEE_KEYS[k]);
      const prev = melee[k];
      const r = stepMelee(prev, k, down, d, mods);
      melee[k] = r.state;
      if (prev.pressed && !r.state.pressed) {
        // 離した位置を覚えておき、振り抜いていれば体が流れてよろける
        swingRelease[k] = prev.p;
        const s = followStrength(prev.p);
        if (s > 0) follow = startFollow(follow, k, s);
      }
      if (r.hit) onMeleeHit(k, r.hit);
    }
    follow = stepFollow(follow, d);
    // 光線：押している間ゆっくり溜まり、離すと撃つ（ほかの動作・踏ん張り中は溜められない）
    const beamDown = !driver && guardP <= 0 && isDown(KJ_BEAM_KEY);
    const br = stepBeam(beam, beamDown, d, mods);
    beam = br.state;
    // 溜めている間は上がっていく音（離す・撃つと止まる）
    kjChargeSound(beam.charge > 0 ? beam.charge : null);
    if (br.fired) fireHeroBeam(br.fired);
  }

  /** 光線を撃つ。主人公の右ベクトルへの射影で当たりを決める。通り道のビルも崩れる */
  function fireHeroBeam(fired) {
    if (!fired) return;
    const h = pose.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    let reach = HERO_BEAM_LEN;
    let hitFoe = false;
    if (enemy && enemy.hp > 0) {
      const dx = enemyPose.x - pose.x;
      const dz = enemyPose.z - pose.z;
      const ahead = dx * fx + dz * fz;
      const lateral = dx * rx + dz * rz;
      if (ahead > 0 && attackHits('beam', Math.hypot(dx, dz), lateral)) {
        hitFoe = true;
        reach = ahead;
      }
    }
    for (const b of city.slice()) {
      if (!b || b.collapsed) continue;
      const dx = b.x - pose.x;
      const dz = b.z - pose.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > reach + b.radius) continue;
      if (Math.abs(dx * rx + dz * rz) < BEAM.HALF_WIDTH + b.radius) damageCity(b.id, fired.damage);
    }
    showHeroBeam(reach, fired.charge, hitFoe);
    kjSfx('kjBeamFire');
    shake(0.8 + fired.charge);
    if (hitFoe) {
      ctx.ui.toast(`光線命中！ ${fired.damage}のダメージ`, 1.2);
      hitEnemy({ damage: fired.damage, full: false });
      reactFoe('beam', { damage: fired.damage, full: true });
    } else {
      ctx.ui.toast('光線は外れた…', 1);
    }
  }

  function showHeroBeam(reach, charge, hitFoe) {
    if (!heroBeam) return;
    const hb = heroBeam;
    const h = pose.heading;
    const y0 = KJ_HERO_HEIGHT * 0.7;
    hb.mesh.position.set(pose.x + Math.sin(h) * 3, y0, pose.z + Math.cos(h) * 3);
    const pitch = hitFoe ? Math.atan2(y0 - 18, Math.max(10, reach)) : Math.atan2(y0, Math.max(10, reach));
    hb.mesh.rotation.set(pitch, h, 0);
    hb.len = hitFoe ? reach : Math.hypot(reach, y0);
    hb.width = 1 + 2.2 * Math.max(0, Math.min(1, Number(charge) || 0));
    hb.t = HERO_BEAM_SEC;
    hb.mesh.visible = true;
  }

  function buildHeroBeam() {
    const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.kjHeroBeam, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, beamMat);
    mesh.rotation.order = 'YXZ';
    mesh.visible = false;
    const glowMat = new THREE.SpriteMaterial({
      map: tex.dust, color: PALETTE.kjHeroBeam, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.visible = false;
    world.add(mesh, glow);
    return {
      mesh, mat: beamMat, glow, glowMat, t: 0, width: 2, len: HERO_BEAM_LEN,
    };
  }

  /** 溜めの光（胸の前で大きくなる）と、撃った光線が細くなって消える */
  function updateHeroBeam(d) {
    if (!heroBeam) return;
    const hb = heroBeam;
    const h = pose.heading;
    const ch = phase === 'play' && !fightOver ? beam.charge : 0;
    hb.glow.visible = ch > 0;
    if (ch > 0) {
      hb.glow.position.set(pose.x + Math.sin(h) * 4, KJ_HERO_HEIGHT * 0.7, pose.z + Math.cos(h) * 4);
      const s = 3 + 9 * ch + Math.sin(t * 30) * 0.6 * ch;
      hb.glow.scale.set(s, s, 1);
      hb.glowMat.opacity = 0.35 + 0.55 * ch;
    }
    if (hb.t > 0) {
      hb.t -= d;
      const k = Math.max(0, hb.t / HERO_BEAM_SEC);
      hb.mat.opacity = 0.95 * k;
      const w = hb.width * (0.4 + 0.6 * k);
      hb.mesh.scale.set(w, w, hb.len);
      if (hb.t <= 0) hb.mesh.visible = false;
    }
  }

  function onMeleeHit(kind, hit) {
    // しっぽは、しっぽの先の位置で当たりを取る（規則は kj-tail.js）
    const tailPts = kind === 'tail' ? heroTailHitPoints(hit) : null;
    const targets = tailPts
      ? tailBuildingsHit(city, tailPts)
      : buildingsInReach(city, kind, pose.x, pose.z, pose.heading);
    let fell = 0;
    for (const b of targets) if (damageCity(b.id, hit.damage * BUILDING_HIT_MUL)) fell += 1;
    let foeHit = false;
    const foeInReach = !!enemy && enemy.hp > 0 && (tailPts
      ? tailTipHits(tailPts, enemyPose.x, enemyPose.z, ENEMY_RADIUS)
      : inReach(kind, pose.x, pose.z, pose.heading, enemyPose.x, enemyPose.z, ENEMY_RADIUS));
    if (foeInReach) {
      foeHit = true;
      hitEnemy(hit);
      reactFoe(kind, hit);
    }
    if (foeHit || targets.length) kjSfx(kind === 'punch' ? 'kjPunch' : 'kjKick');
    else kjSfx('kjSwing');
    if (hit.full) shake(fell ? 1.6 : 0.9);
    else if (targets.length) shake(0.6);
    for (const b of targets) {
      const nb = city[cityIndex.get(b.id)];
      if (nb && !nb.collapsed) spawnDust(nb.x, nb.z, nb.radius * 0.6, 2, 3);
    }
  }

  /** 歩いて建物に触れている間は、少しずつ崩れていく */
  function bodyContact(d) {
    if (!moving || !(d > 0)) return;
    for (const b of buildingsInReach(city, 'body', pose.x, pose.z, pose.heading)) {
      damageCity(b.id, BODY_DAMAGE_PER_SEC * d);
    }
  }

  /** 建物にダメージ。崩れた瞬間なら true */
  function damageCity(id, amount) {
    const i = cityIndex.get(id);
    if (i === undefined) return false;
    const r = damageBuilding(city[i], amount);
    city[i] = r.building;
    if (r.collapsedNow) {
      collapseVisual(r.building);
      return true;
    }
    if (!r.building.collapsed && amount > 0) wobbles.set(id, WOBBLE_SEC);
    return false;
  }

  function shake(amp) {
    const cur = shakeT > 0 ? shakeAmp * (shakeT / SHAKE_SEC) : 0;
    if (amp >= cur) {
      shakeAmp = amp;
      shakeT = SHAKE_SEC;
    }
  }

  // ---- 崩れる演出（建物が沈み、破片と土煙） ----
  function buildFx() {
    fxGroup = new THREE.Group();
    const debrisMats = [mats.debris, mats.houseWall, mats.roofFlat, mats.rubble];
    for (let i = 0; i < DEBRIS_MAX; i++) {
      const m = new THREE.Mesh(geo.box, debrisMats[i % debrisMats.length]);
      m.visible = false;
      fxGroup.add(m);
      debrisPool.push({
        m, life: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, size: 1,
      });
    }
    for (let i = 0; i < DUST_MAX; i++) {
      const sm = new THREE.SpriteMaterial({
        map: tex.dust, color: PALETTE.kjDust, transparent: true, depthWrite: false, opacity: 0,
      });
      const sp = new THREE.Sprite(sm);
      sp.visible = false;
      fxGroup.add(sp);
      dustPool.push({
        sp, life: 0, max: 1, size: 1, rise: 0, vx: 0, vz: 0,
      });
    }
    world.add(fxGroup);
  }

  function clearFx() {
    for (const p of debrisPool) {
      p.life = 0;
      p.m.visible = false;
    }
    for (const s of dustPool) {
      s.life = 0;
      s.sp.visible = false;
    }
  }

  function spawnDebris(b, h) {
    if (!debrisPool.length) return;
    const n = DEBRIS_COUNT[b.type] || 6;
    const big = b.type === 'pole' ? 0.4 : 1;
    for (let i = 0; i < n; i++) {
      const p = debrisPool[debrisIdx];
      debrisIdx = (debrisIdx + 1) % debrisPool.length;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * b.radius;
      p.m.position.set(b.x + Math.cos(a) * r, 1 + Math.random() * h * 0.8, b.z + Math.sin(a) * r);
      const sp = 3 + Math.random() * 7;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 4 + Math.random() * 10;
      p.size = (0.7 + Math.random() * 1.6) * big;
      p.m.scale.set(p.size, p.size * (0.5 + Math.random() * 0.8), p.size * (0.6 + Math.random() * 0.6));
      p.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.sx = (Math.random() - 0.5) * 8;
      p.sy = (Math.random() - 0.5) * 8;
      p.sz = (Math.random() - 0.5) * 8;
      p.life = 2.5 + Math.random() * 1.5;
      p.m.visible = true;
    }
  }

  function spawnDust(x, z, r, n, y = 0) {
    if (!dustPool.length) return;
    for (let i = 0; i < n; i++) {
      const s = dustPool[dustIdx];
      dustIdx = (dustIdx + 1) % dustPool.length;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * r;
      s.sp.position.set(x + Math.cos(a) * rr, y + Math.random() * 2, z + Math.sin(a) * rr);
      s.size = r * 0.8 + 3 + Math.random() * 3;
      s.life = 2 + Math.random() * 1.5;
      s.max = s.life;
      s.rise = 1.5 + Math.random() * 2.5;
      s.vx = Math.cos(a) * (1 + Math.random() * 3);
      s.vz = Math.sin(a) * (1 + Math.random() * 3);
      s.sp.scale.set(s.size, s.size, 1);
      s.sp.material.opacity = 0.8;
      s.sp.visible = true;
    }
  }

  function collapseVisual(b) {
    const m = cityMeshes.get(b.id);
    if (!m) return;
    wobbles.delete(b.id);
    m.position.set(b.x, 0, b.z);
    const box = new THREE.Box3().setFromObject(m);
    const h = Math.max(2, Number.isFinite(box.max.y) ? box.max.y : 2);
    const dir = Math.atan2(b.x - pose.x, b.z - pose.z);
    const pole = b.type === 'pole';
    let rubble = null;
    if (!pole && cityGroup) {
      rubble = new THREE.Mesh(geo.rubble, mats.rubble);
      rubble.position.set(b.x, 0, b.z);
      rubble.rotation.y = Math.random() * Math.PI;
      rubble.scale.set(0.01, 0.01, 0.01);
      cityGroup.add(rubble);
    }
    collapsing.push({
      m,
      x: b.x,
      z: b.z,
      r: b.radius,
      h,
      t: 0,
      dur: pole ? 0.9 : 1.7,
      // ヌスから遠ざかる向きへ倒れる
      axis: new THREE.Vector3(Math.cos(dir), 0, -Math.sin(dir)),
      q0: m.quaternion.clone(),
      tilt: pole ? Math.PI * 0.47 : 0.18 + Math.random() * 0.15,
      shrink: pole ? 0 : 0.94,
      rubble,
      rr: b.radius * 0.85,
      rh: Math.min(5, h * 0.2),
      dustT: 0,
      done: false,
    });
    for (const line of wireMap.get(b.id) || []) line.visible = false;
    spawnDebris(b, h);
    spawnDust(b.x, b.z, b.radius, DUST_COUNT[b.type] || 4, h * 0.3);
    shake(pole ? 0.6 : 1.4);
    kjSfx(pole ? 'kjPoleFall' : 'kjCollapse');
  }

  function updateFx(d) {
    if (!(d > 0)) return;
    for (const c of collapsing) {
      if (c.done) continue;
      c.t += d;
      const k = Math.min(1, c.t / c.dur);
      const e = k * k;
      tmpQ.setFromAxisAngle(c.axis, c.tilt * e);
      c.m.quaternion.copy(tmpQ).multiply(c.q0);
      c.m.scale.y = 1 - c.shrink * e;
      const j = (1 - k) * 0.5;
      c.m.position.set(c.x + (Math.random() - 0.5) * j, 0, c.z + (Math.random() - 0.5) * j);
      if (c.rubble) c.rubble.scale.set(c.rr, Math.max(0.01, c.rh * Math.min(1, k * 1.5)), c.rr);
      c.dustT -= d;
      if (c.dustT <= 0 && k < 0.9) {
        c.dustT = 0.15;
        spawnDust(c.x, c.z, c.r, 2, c.h * (1 - e) * 0.5);
      }
      if (k >= 1) c.done = true;
    }
    for (const [id, t] of wobbles) {
      const b = city[cityIndex.get(id)];
      const m = cityMeshes.get(id);
      const nt = t - d;
      if (!b || !m || b.collapsed || nt <= 0) {
        if (b && m && !b.collapsed) m.position.set(b.x, 0, b.z);
        wobbles.delete(id);
        continue;
      }
      const a = WOBBLE_AMP * (nt / WOBBLE_SEC);
      m.position.set(b.x + Math.sin(nt * 70) * a, 0, b.z + Math.cos(nt * 55) * a);
      wobbles.set(id, nt);
    }
    for (const p of debrisPool) {
      if (p.life <= 0) continue;
      p.life -= d;
      p.vy -= DEBRIS_GRAVITY * d;
      const pos = p.m.position;
      pos.x += p.vx * d;
      pos.y += p.vy * d;
      pos.z += p.vz * d;
      const floor = p.m.scale.y * 0.5;
      if (pos.y <= floor) {
        pos.y = floor;
        if (p.vy < -4) p.vy *= -0.3;
        else p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
        p.sx *= 0.7;
        p.sy *= 0.7;
        p.sz *= 0.7;
      } else {
        p.m.rotation.x += p.sx * d;
        p.m.rotation.y += p.sy * d;
        p.m.rotation.z += p.sz * d;
      }
      // 最後は地面に沈んで消える
      if (p.life < 0.5) pos.y -= d * p.size * 2;
      if (p.life <= 0) p.m.visible = false;
    }
    for (const s of dustPool) {
      if (s.life <= 0) continue;
      s.life -= d;
      const k = 1 - Math.max(0, s.life) / s.max;
      s.sp.position.y += s.rise * d;
      s.sp.position.x += s.vx * d;
      s.sp.position.z += s.vz * d;
      const sc = s.size * (1 + 2 * k);
      s.sp.scale.set(sc, sc, 1);
      s.sp.material.opacity = 0.8 * (1 - k);
      if (s.life <= 0) s.sp.visible = false;
    }
  }

  // ---- 主人公の姿勢（骨が見つかれば腕・脚も回す） ----
  function heroBones() {
    if (bones) return bones;
    if (!rig || !rig.real) return null;
    const out = { arm: null, leg: null };
    const key = (s) => String(s || '').split(/[:|]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    rig.root.traverse((o) => {
      if (!o.isBone) return;
      const k = key(o.name);
      if (!out.arm && /^(rightarm|rightupperarm|upperarmr)$/.test(k)) out.arm = o;
      if (!out.leg && /^(rightupleg|rightupperleg|upperlegr|rightthigh|thighr)$/.test(k)) out.leg = o;
    });
    bones = out;
    return bones;
  }

  /** 骨をワールドの軸 axis まわりに angle 回す（親の回転を考えて局所の回転に直す） */
  function rotateBoneWorld(bone, axis, angle) {
    if (!bone || !bone.parent) return;
    bone.parent.getWorldQuaternion(tmpQP);
    tmpQ.setFromAxisAngle(axis, angle);
    tmpQT.copy(tmpQP).invert().multiply(tmpQ).multiply(tmpQP);
    bone.quaternion.premultiply(tmpQT);
  }

  function actionPose() {
    // 動作の姿勢に、振り抜いた後の「体が流れてよろける」を重ねる
    return combinePose(actionPoseBase(), followPose(follow));
  }

  function actionPoseBase() {
    const out = {
      lean: 0, twist: 0, sink: 0, lunge: 0, arm: 0, leg: 0,
    };
    const k = activeKind();
    if (!k && beam.charge > 0) {
      // のけぞって光線を溜める
      out.lean = -0.22 * beam.charge;
      out.sink = 0.8 * beam.charge;
      out.arm = -0.8 * beam.charge;
      return out;
    }
    if (!k) {
      if (guardP > 0) {
        // 腰を落として構える
        out.sink = 2.2 * guardP;
        out.lean = 0.12 * guardP;
        out.arm = -0.6 * guardP;
      }
      return out;
    }
    const p = melee[k].p;
    const hasArm = !!(bones && bones.arm);
    const hasLeg = !!(bones && bones.leg);
    // 大振りの軌道（大きな構え → 振り抜き）を、押している時間の分だけ進む。離したら離した姿勢から戻る
    return swingPose(k, p, {
      returning: !melee[k].pressed, releasedAt: swingRelease[k], hasArm, hasLeg,
    });
  }

  // ---- メガネ星人（行動の規則は kj-ai.js） ----
  function buildAlien() {
    const L = (color) => new THREE.MeshLambertMaterial({ color });
    const bodyMat = L(PALETTE.kjAlienBody);
    const darkMat = L(PALETTE.kjAlienDark);
    const frameMat = L(PALETTE.kjGlassFrame);
    const lensMat = new THREE.MeshBasicMaterial({
      color: PALETTE.kjLens, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.kjEyeRed });
    const faceMat = new THREE.MeshLambertMaterial({ color: PALETTE.kjFace, side: THREE.DoubleSide });
    const root = new THREE.Group();
    const lean = new THREE.Group();
    root.add(lean);
    const legGeo = new THREE.CylinderGeometry(0.7, 0.9, 10, 8);
    legGeo.translate(0, -5, 0);
    const footGeo = new THREE.BoxGeometry(1.8, 0.8, 2.8);
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 1.3, 10, 0);
      const foot = new THREE.Mesh(footGeo, darkMat);
      foot.position.set(0, -9.6, 0.5);
      hip.add(new THREE.Mesh(legGeo, darkMat), foot);
      lean.add(hip);
      legs.push(hip);
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 11, 10), bodyMat);
    torso.position.y = 15.5;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.9, 10), darkMat);
    belt.position.y = 10.6;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.6, 8), bodyMat);
    neck.position.y = 22.2;
    lean.add(torso, belt, neck);
    const armGeo = new THREE.CylinderGeometry(0.5, 0.42, 10, 8);
    armGeo.translate(0, -5, 0);
    const handGeo = new THREE.SphereGeometry(0.85, 10, 8);
    const arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 2.2, 20.4, 0);
      const hand = new THREE.Mesh(handGeo, darkMat);
      hand.position.y = -10.3;
      shoulder.add(new THREE.Mesh(armGeo, bodyMat), hand);
      lean.add(shoulder);
      arms.push({ shoulder, side: s });
    }
    const head = new THREE.Group();
    head.position.y = 26.6;
    // 怪獣らしい動き（kj-motion.js）で回す部品
    root.userData.kjMotion = {
      lean, legs, arms, head,
    };
    const skull = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12), bodyMat);
    skull.scale.set(1, 1.15, 0.9);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMat);
    face.scale.set(5.4, 5.4, 1);
    face.position.set(0, 0, 3.12);
    head.add(skull, face);
    try {
      new THREE.TextureLoader().load(drawingUrl('megane-seijin.webp'), (tx) => {
        tx.colorSpace = THREE.SRGBColorSpace;
        faceMat.map = tx;
        faceMat.needsUpdate = true;
        const img = tx.image || {};
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w > 0 && h > 0) face.scale.set(5.4 * Math.max(0.6, Math.min(1.4, w / h)), 5.4, 1);
      }, undefined, () => console.warn('メガネ星人の絵を読めません'));
    } catch {
      // 絵が無くても板のまま遊べる
    }
    const glasses = new THREE.Group();
    glasses.position.set(0, 0.6, 3.4);
    const ringGeo = new THREE.TorusGeometry(1.25, 0.2, 6, 20);
    const lensGeo = new THREE.CircleGeometry(1.15, 20);
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, frameMat);
      ring.position.x = s * 1.45;
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(s * 1.45, 0, 0.02);
      glasses.add(ring, lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.22), frameMat);
    bridge.position.y = 0.25;
    glasses.add(bridge);
    head.add(glasses);
    const eyeGeo = new THREE.SphereGeometry(0.5, 10, 8);
    const eyes = [-1, 1].map((s) => {
      const m = new THREE.Mesh(eyeGeo, eyeMat);
      m.position.set(s * 1.45, 0.6, 3.25);
      m.visible = false;
      head.add(m);
      return m;
    });
    lean.add(head);
    const shadow = ctx.makeShadow(9);
    shadow.position.y = 0.3;
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.kjBeam, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.order = 'YXZ';
    beam.visible = false;
    world.add(root, shadow, beam);
    return {
      root,
      lean,
      legs,
      arms,
      head,
      glasses,
      glassesHome: glasses.position.clone(),
      eyes,
      lensMat,
      lensBase: new THREE.Color(PALETTE.kjLens),
      lensGlow: new THREE.Color(PALETTE.kjLensGlow),
      shadow,
      beam,
      beamMat,
    };
  }

  function resetAlien() {
    glassesFall = null;
    beamFx = null;
    heroDownT = 0;
    if (!alien) return;
    const a = alien;
    if (a.glasses.parent !== a.head) a.head.add(a.glasses);
    a.glasses.position.copy(a.glassesHome);
    a.glasses.rotation.set(0, 0, 0);
    a.glasses.scale.setScalar(1);
    a.glasses.visible = true;
    for (const e of a.eyes) e.visible = false;
    a.lean.rotation.set(0, 0, 0);
    for (const arm of a.arms) arm.shoulder.rotation.set(0, 0, 0);
    a.lensMat.color.copy(a.lensBase);
    a.lensMat.opacity = 0.55;
    a.beam.visible = false;
  }

  function startFight() {
    // 高難易度: いちばん強い段＋体力・速さ・攻撃の間を強める（依頼者の指摘: 主人公ではなく敵を強く）
    enemy = createEnemy({
      seed: Math.floor(Math.random() * 0x7fffffff) >>> 0,
      level: carry.hard ? 3 : kjLevel,
      power: carry.hard ? HARD_FOE.kaiju : 1,
    });
    enemyPose = {
      x: ENEMY_START.x,
      z: ENEMY_START.z,
      heading: Math.atan2(PLAYER_START.x - ENEMY_START.x, PLAYER_START.z - ENEMY_START.z),
    };
    mods = kjModsFromCarry(carry);
    heroMax = playerMaxHp(mods);
    heroHp = heroMax;
    guardP = 0;
    knocks = [];
    heroReact = createReaction();
    foeReact = createReaction();
    heroHpSeen = heroHp;
    fightOver = null;
    fightT = 0;
    endT = 0;
    beam = createBeam();
    skyFrom = null;
    skyTo = null;
    if (heroBeam) {
      heroBeam.t = 0;
      heroBeam.mesh.visible = false;
      heroBeam.glow.visible = false;
    }
    if (world && skyBase) {
      world.background.copy(skyBase.bg);
      world.fog.color.copy(skyBase.fog);
      if (lights && lights.sun && skyBase.sun) lights.sun.color.copy(skyBase.sun);
    }
    enemyHurtT = 0;
    enemyWalked = 0;
    if (gaugeEls) {
      gaugeEls.hero.lag = 1;
      gaugeEls.foe.lag = 1;
    }
    resetAlien();
  }

  function setGauge(g, v) {
    const val = Math.max(0, Math.min(1, Number(v) || 0));
    g.lag = Math.max(val, Math.min(1, (Number.isFinite(g.lag) ? g.lag : 1) - 0.006));
    g.fill.style.width = `${(val * 100).toFixed(1)}%`;
    g.lagEl.style.width = `${(g.lag * 100).toFixed(1)}%`;
    g.box.classList.toggle('kj-low', val < 0.25);
  }

  function enemyKnocked() {
    return knocks.some((k) => k.who === 'enemy');
  }

  function stepFoe(d) {
    if (!enemy || enemy.hp <= 0) return;
    // 倒れている・起き上がる・吹き飛んでいる間は動けない
    if (reactLocked(foeReact)) return;
    const dx = pose.x - enemyPose.x;
    const dz = pose.z - enemyPose.z;
    const dist = Math.hypot(dx, dz);
    // 主人公の方へゆっくり向き直る（溜めている間は狙いを固定）
    if (enemy.phase !== 'windup') {
      const diff = angDiff(enemyPose.heading, Math.atan2(dx, dz));
      const step = Math.sign(diff) * Math.min(Math.abs(diff), ENEMY_TURN * d);
      enemyPose = { ...enemyPose, heading: enemyPose.heading + step };
    }
    const r = stepEnemy(enemy, d, dist);
    if (r.advance > 0 && !enemyKnocked()) {
      let nx = enemyPose.x + Math.sin(enemyPose.heading) * r.advance;
      let nz = enemyPose.z + Math.cos(enemyPose.heading) * r.advance;
      const rr = Math.hypot(nx, nz);
      if (rr > WALK_LIMIT) {
        nx = (nx / rr) * WALK_LIMIT;
        nz = (nz / rr) * WALK_LIMIT;
      }
      enemyPose = { ...enemyPose, x: nx, z: nz };
      const before = enemyWalked;
      enemyWalked += r.advance;
      if (footstepCount(before, enemyWalked) > 0) {
        shake(0.45);
        kjSfx('kjFoeStep');
      }
      for (const b of buildingsInReach(city, 'body', nx, nz, 0)) damageCity(b.id, BODY_DAMAGE_PER_SEC * d);
    }
    for (const ev of r.events) {
      if (ev.type === 'strike') onStrike(ev);
      else if (ev.type === 'windup') {
        let snd = 'kjFoeWind';
        if (ev.attack === 'beam') snd = 'kjFoeCharge';
        else if (ev.attack === 'smash') snd = kjRoarFor('foe');
        kjSfx(snd);
      }
    }
  }

  function onStrike(ev) {
    const h = enemyPose.heading;
    const hx = pose.x - enemyPose.x;
    const hz = pose.z - enemyPose.z;
    const dist = Math.hypot(hx, hz);
    // 攻撃者の右ベクトルへの射影（横へずれると光線をかわせる）
    const lateral = hx * Math.cos(h) - hz * Math.sin(h);
    const ahead = hx * Math.sin(h) + hz * Math.cos(h);
    if (ev.attack === 'beam') fireEnemyBeam(dist);
    const hits = attackHits(ev.attack, dist, lateral) && (ev.attack !== 'beam' || ahead > 0);
    if (!hits) {
      if (ev.attack === 'beam' || dist < CHOP_RANGE + 6) ctx.ui.toast('かわした！', 1);
      if (ev.attack !== 'beam') kjSfx('kjSwing');
      shake(0.5);
      return;
    }
    const dmg = damageAfterGuard(ev.damage, guardP);
    heroHp = Math.max(0, heroHp - dmg);
    kjSfx(guardP >= 0.9 ? 'kjGuard' : (ev.attack === 'smash' ? 'kjKick' : 'kjPunch'));
    flashHurt();
    shake(guardP >= 0.9 ? 0.9 : 1.8);
    ctx.ui.toast(guardP >= 0.9 ? `踏ん張った！ ${dmg}のダメージ` : `${dmg}のダメージ！`, 1.2);
    knock('hero', Math.sin(h), Math.cos(h), HERO_KNOCKBACK);
    if (heroHp <= 0) endFight('lose');
  }

  function fireEnemyBeam(dist) {
    if (!alien) return;
    alien.head.getWorldPosition(tmpV);
    tmpV.y += 0.6;
    alien.beam.position.copy(tmpV);
    const pitch = Math.atan2(tmpV.y - KJ_HERO_HEIGHT * 0.5, Math.max(10, dist));
    alien.beam.rotation.set(pitch, enemyPose.heading, 0);
    alien.beam.visible = true;
    beamFx = { t: ENEMY_BEAM_SEC };
    kjSfx('kjFoeBeam');
    shake(0.8);
  }

  function hitEnemy(hit) {
    const r = damageEnemy(enemy, hit.damage);
    if (!(r.dealt > 0)) return;
    // メガネを外して本気になる：金属的な咆哮
    if (r.glassesOffNow && !r.defeated) kjSfx(kjRoarFor('foe'), 0.25);
    enemyHurtT = hit.full ? 0.45 : 0.25;
    if (r.glassesOffNow) startGlassesFall();
    if (hit.full) {
      // 全力ヒット：溜めを止めて、主人公の向きへよろけて下がる
      staggerEnemy(enemy);
      knock('enemy', Math.sin(pose.heading), Math.cos(pose.heading), ENEMY_KNOCKBACK);
    }
    if (r.defeated) endFight('win');
  }

  function startGlassesFall() {
    if (!alien || glassesFall) return;
    world.attach(alien.glasses);
    glassesFall = {
      vx: (Math.random() - 0.5) * 4,
      vy: 5,
      vz: (Math.random() - 0.5) * 4,
      spin: 3 + Math.random() * 3,
      rest: false,
    };
    for (const e of alien.eyes) e.visible = true;
    if (enemy && enemy.hp > 0) ctx.ui.toast('メガネ星人がメガネを外した！ 強い攻撃が来るぞ', 2.5);
  }

  function knock(who, dx, dz, dist) {
    knocks = knocks.filter((k) => k.who !== who);
    knocks.push({
      who, dx, dz, left: dist, done: false,
    });
  }

  function stepKnocks(d) {
    if (!knocks.length || !(d > 0)) return;
    for (const k of knocks) {
      const step = Math.min(k.left, KNOCK_SPEED * d);
      k.left -= step;
      const p = k.who === 'enemy' ? enemyPose : pose;
      let nx = p.x + k.dx * step;
      let nz = p.z + k.dz * step;
      const r = Math.hypot(nx, nz);
      if (r > WALK_LIMIT) {
        nx = (nx / r) * WALK_LIMIT;
        nz = (nz / r) * WALK_LIMIT;
      }
      if (k.who === 'enemy') enemyPose = { ...enemyPose, x: nx, z: nz };
      else pose = { ...pose, x: nx, z: nz };
      if (k.left <= 1e-6) {
        k.done = true;
        fallIn(nx, nz);
      }
    }
    knocks = knocks.filter((k) => !k.done);
  }

  /** 下がった先の建物に倒れ込む */
  function fallIn(x, z) {
    for (const b of buildingsInReach(city, 'body', x, z, 0)) damageCity(b.id, FALL_IN_DAMAGE);
    spawnDust(x, z, 6, 4);
    shake(1.2);
  }

  function keepApart() {
    if (!enemy) return;
    const dx = pose.x - enemyPose.x;
    const dz = pose.z - enemyPose.z;
    const dd = Math.hypot(dx, dz);
    if (dd >= MIN_SEPARATION) return;
    const ux = dd > 1e-6 ? dx / dd : -Math.sin(enemyPose.heading);
    const uz = dd > 1e-6 ? dz / dd : -Math.cos(enemyPose.heading);
    pose = { ...pose, x: enemyPose.x + ux * MIN_SEPARATION, z: enemyPose.z + uz * MIN_SEPARATION };
  }

  function flashHurt() {
    if (!hurtEl) return;
    hurtEl.classList.remove('kj-flash');
    void hurtEl.offsetWidth;
    hurtEl.classList.add('kj-flash');
  }

  function relaxActions(d) {
    for (const k of MELEE_KINDS) melee[k] = stepMelee(melee[k], k, false, d, mods).state;
    guardP = stepProgress('guard', guardP, false, d, mods);
  }

  function endFight(outcome) {
    if (fightOver) return;
    fightOver = outcome;
    endT = 0;
    beam = createBeam();
    releaseLock();
    if (enemy && outcome === 'lose') {
      if (enemy.phase === 'windup') staggerEnemy(enemy);
      enemy.attack = null;
    }
    leaveHeading = outcome === 'win'
      ? Math.atan2(pose.x - enemyPose.x, pose.z - enemyPose.z)
      : Math.atan2(enemyPose.x - pose.x, enemyPose.z - pose.z);
    skyFrom = {
      bg: world.background.clone(),
      fog: world.fog.color.clone(),
      sun: lights && lights.sun ? lights.sun.color.clone() : null,
    };
    const win = outcome === 'win';
    skyTo = {
      bg: new THREE.Color(win ? PALETTE.kjSunset : PALETTE.kjDusk),
      fog: new THREE.Color(win ? PALETTE.kjSunsetFog : PALETTE.kjDuskFog),
      sun: new THREE.Color(win ? PALETTE.kjSunsetSun : PALETTE.kjDuskSun),
    };
    const lh = leaveHeading;
    if (win) {
      endCam.set(
        pose.x - Math.sin(lh) * 46 + Math.cos(lh) * 22,
        11,
        pose.z - Math.cos(lh) * 46 - Math.sin(lh) * 22,
      );
    } else {
      endCam.copy(camera.position);
    }
    endLook.set(pose.x, KJ_CAMERA.lookY, pose.z);
    ctx.ui.toast(win ? 'メガネ星人を倒した！' : 'ヌスは力尽きた…', 3);
    ctx.ui.setHint('Enter: 結果へ');
  }

  /** 勝敗が決まったあと：夕焼けになり、勝った方が背を向けて去っていく */
  function stepEnding(d) {
    if (!fightOver) return;
    endT += d;
    const k = Math.min(1, endT / END_SKY_SEC);
    const e = k * k * (3 - 2 * k);
    if (skyFrom && skyTo) {
      world.background.copy(skyFrom.bg).lerp(skyTo.bg, e);
      world.fog.color.copy(skyFrom.fog).lerp(skyTo.fog, e);
      if (lights && lights.sun && skyFrom.sun) lights.sun.color.copy(skyFrom.sun).lerp(skyTo.sun, e);
    }
    if (fightOver === 'win') {
      const diff = angDiff(pose.heading, leaveHeading);
      if (Math.abs(diff) > 0.03) {
        pose = { ...pose, heading: pose.heading + Math.sign(diff) * Math.min(Math.abs(diff), LEAVE_TURN * d) };
      } else if (endT > 0.8) {
        const step = LEAVE_SPEED * d;
        pose = {
          ...pose,
          heading: leaveHeading,
          x: pose.x + Math.sin(leaveHeading) * step,
          z: pose.z + Math.cos(leaveHeading) * step,
        };
        moving = true;
        const before = walked;
        walked += step;
        if (footstepCount(before, walked) > 0) shake(0.45);
      }
    } else if (enemy) {
      const diff = angDiff(enemyPose.heading, leaveHeading);
      if (Math.abs(diff) > 0.03) {
        enemyPose = { ...enemyPose, heading: enemyPose.heading + Math.sign(diff) * Math.min(Math.abs(diff), LEAVE_TURN * d) };
      } else if (endT > 0.8) {
        const step = ENEMY_LEAVE_SPEED * d;
        enemyPose = {
          ...enemyPose,
          heading: leaveHeading,
          x: enemyPose.x + Math.sin(leaveHeading) * step,
          z: enemyPose.z + Math.cos(leaveHeading) * step,
        };
        const before = enemyWalked;
        enemyWalked += step;
        if (footstepCount(before, enemyWalked) > 0) shake(0.35);
      }
    }
    if (endT >= KJ_END_SEC && phase === 'play') showResult();
  }

  /** 終わりの演出のカメラ：止まって、去っていく方を見送る */
  function placeEndCamera(d) {
    camera.position.lerp(endCam, Math.min(1, d * 0.9));
    const f = fightOver === 'win' ? pose : enemyPose;
    const kl = Math.min(1, d * 2.5);
    endLook.x += (f.x - endLook.x) * kl;
    endLook.z += (f.z - endLook.z) * kl;
    endLook.y = KJ_CAMERA.lookY;
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      const a = shakeAmp * (shakeT / SHAKE_SEC);
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    camera.lookAt(endLook.x + sx * 0.5, endLook.y + sy * 0.5, endLook.z);
  }

  function showResult() {
    if (phase !== 'play' || !fightOver) return;
    phase = 'result';
    guard = 0.4;
    releaseLock();
    const res = buildResult({
      outcome: fightOver, timeSec: fightT, hpLeft: heroHp, hpMax: heroMax, damageMan: totalDamage(city),
    });
    const lv = kjLevel;
    kjLevel = kjNextLevel(kjLevel, res.outcome);
    try {
      const s = kjStorage();
      if (s) s.setItem(KJ_STORAGE_KEY, serializeKjLevel(kjLevel));
    } catch {
      // 保存できなくても遊べる
    }
    if (!resultPanel) resultPanel = createResultPanel();
    // 初めて勝ったときだけ「ソフビ怪獣」を獲得（2回目以降は増えない）
    let rewardLine = null;
    if (res.outcome === 'win') {
      try {
        const got = ctx.grantGameItem(KJ_GAME_ID);
        if (got && got.item && got.isNew) {
          rewardLine = `アイテム獲得：${got.item.name}`;
          if (ctx.ui && typeof ctx.ui.banner === 'function') ctx.ui.banner(rewardLine, 3);
        }
      } catch {
        rewardLine = null;
      }
    }
    resultPanel.show(kjResultView(res, { level: lv, nextLevel: kjLevel, extra: [carryLine, rewardLine] }), (id) => {
      if (id === 'again') playAgain();
      else backToGallery();
    });
    ctx.ui.setHint('←→: 選ぶ　Enter: 決定');
  }

  /** 結果の「もう一度」：街を作り直して、すぐ戦いから */
  function playAgain() {
    if (resultPanel) resultPanel.hide();
    resetBattle();
    Object.assign(anim, createAnimState());
    mouseDX = 0;
    phase = 'play';
    guard = 0.3;
    syncHero(0);
    placeCamera(0, true);
    refreshHud();
    ctx.ui.setHint(PLAY_HINT);
  }

  function resetBattle() {
    buildCity((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    pose = { x: PLAYER_START.x, z: PLAYER_START.z, heading: Math.atan2(ENEMY_START.x - PLAYER_START.x, ENEMY_START.z - PLAYER_START.z) };
    walked = 0;
    moving = false;
    camYaw = pose.heading;
    shakeT = 0;
    shakeAmp = SHAKE_AMP;
    melee = freshMelee();
    startFight();
  }

  function updateAlien(d) {
    if (!alien || !enemy) return;
    const a = alien;
    const jit = enemyHurtT > 0 ? enemyHurtT * 1.2 : 0;
    if (enemyHurtT > 0) enemyHurtT = Math.max(0, enemyHurtT - d);
    a.root.position.set(enemyPose.x + (Math.random() - 0.5) * jit, 0, enemyPose.z + (Math.random() - 0.5) * jit);
    a.root.rotation.y = enemyPose.heading;
    a.shadow.position.set(enemyPose.x, 0.3, enemyPose.z);
    const dead = enemy.hp <= 0;
    const k = enemy.phase === 'windup' && enemy.windupDur > 0 ? Math.min(1, enemy.t / enemy.windupDur) : 0;
    let leanT = 0;
    if (dead) leanT = -1.5;
    else if (enemyKnocked()) leanT = -0.35;
    else if (enemy.phase === 'windup' && enemy.attack === 'beam') leanT = -0.12 * k;
    a.lean.rotation.x += (leanT - a.lean.rotation.x) * Math.min(1, d * (dead ? 2.5 : 6));
    const ph = (enemyWalked / STRIDE) * Math.PI;
    a.legs[0].rotation.x = dead ? 0 : Math.sin(ph) * 0.35;
    a.legs[1].rotation.x = dead ? 0 : -Math.sin(ph) * 0.35;
    // 腕：チョップは振り上げ、大振りは両腕を上げ、光線はのけぞる
    let ar = [Math.sin(ph) * 0.25, -Math.sin(ph) * 0.25];
    const swing = (from) => (enemy.t < 0.2
      ? from + (-0.9 - from) * (enemy.t / 0.2)
      : -0.9 * Math.max(0, 1 - (enemy.t - 0.2) / 0.7));
    if (dead) {
      ar = [-0.6, -0.6];
    } else if (enemy.phase === 'windup') {
      if (enemy.attack === 'chop') ar = [-2.8 * k, 0.2 * k];
      else if (enemy.attack === 'smash') ar = [-3 * k, -3 * k];
      else ar = [0.35 * k, 0.35 * k];
    } else if (enemy.phase === 'recover' && enemy.attack === 'chop') {
      ar = [swing(-2.8), 0];
    } else if (enemy.phase === 'recover' && enemy.attack === 'smash') {
      const s = swing(-3);
      ar = [s, s];
    }
    a.arms.forEach((arm, i) => {
      arm.shoulder.rotation.x = ar[i];
      arm.shoulder.rotation.z = arm.side * 0.08;
    });
    if (!enemy.glassesOff) {
      // 光線の溜め：メガネが光る
      const g = enemy.phase === 'windup' && enemy.attack === 'beam' ? k : 0;
      a.lensMat.color.copy(a.lensBase).lerp(a.lensGlow, g);
      a.lensMat.opacity = 0.55 + 0.4 * g;
      a.glasses.scale.setScalar(1 + 0.1 * g * Math.abs(Math.sin(t * 25)));
    } else {
      const s = 1 + 0.18 * Math.abs(Math.sin(t * 8)) + (enemy.phase === 'windup' ? 0.4 * k : 0);
      for (const e of a.eyes) e.scale.setScalar(s);
    }
    if (glassesFall && !glassesFall.rest) {
      const g = a.glasses;
      const f = glassesFall;
      f.vy -= 30 * d;
      g.position.x += f.vx * d;
      g.position.y += f.vy * d;
      g.position.z += f.vz * d;
      g.rotation.x += f.spin * d;
      g.rotation.z += f.spin * 0.5 * d;
      if (g.position.y <= 0.5) {
        g.position.y = 0.5;
        g.rotation.set(-Math.PI / 2, 0, 0);
        f.rest = true;
        spawnDust(g.position.x, g.position.z, 2, 2);
      }
    }
    if (beamFx) {
      beamFx.t -= d;
      const kb = Math.max(0, beamFx.t / ENEMY_BEAM_SEC);
      a.beamMat.opacity = 0.9 * kb;
      const w = 1.8 * (0.4 + 0.6 * kb);
      a.beam.scale.set(w, w, ENEMY_BEAM_LEN);
      if (beamFx.t <= 0) {
        beamFx = null;
        a.beam.visible = false;
      }
    }
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

  function startPlay() {
    if (phase !== 'intro') return;
    phase = 'play';
    mouseDX = 0;
    ctx.ui.setHint(PLAY_HINT);
  }

  function placeCamera(d, snap = false) {
    const k = snap ? 1 : Math.min(1, d * KJ_CAMERA.follow);
    camYaw += angDiff(camYaw, pose.heading) * k;
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      const a = shakeAmp * (shakeT / SHAKE_SEC);
      sx = (Math.random() - 0.5) * 2 * a;
      sy = (Math.random() - 0.5) * 2 * a;
    }
    camera.position.set(
      pose.x - Math.sin(camYaw) * KJ_CAMERA.back + sx,
      KJ_CAMERA.height + sy,
      pose.z - Math.cos(camYaw) * KJ_CAMERA.back,
    );
    camera.lookAt(pose.x + sx * 0.5, KJ_CAMERA.lookY + sy * 0.5, pose.z);
  }

  function syncHero(d) {
    const sway = moving ? Math.abs(Math.sin((walked / STRIDE) * Math.PI)) * 0.35 : 0;
    heroHolder.position.set(pose.x, sway, pose.z);
    heroHolder.rotation.y = pose.heading;
    heroShadow.position.set(pose.x, 0.3, pose.z);
    const ap = actionPose();
    rig.root.rotation.set(ap.lean, ap.twist, 0);
    rig.root.position.set(0, -ap.sink, ap.lunge);
    if (fightOver === 'lose') {
      heroDownT += d;
      rig.root.rotation.x = -Math.min(1.45, heroDownT * 1.1);
    }
    // 大きな体なので、手足の振りもゆっくり
    stepAnim(anim, {
      moving, airborne: false, vy: 0, dt: d * 0.45,
    });
    rig.apply(anim);
    const bn = heroBones();
    if (bn && (ap.arm || ap.leg)) {
      // 主人公の右ベクトルまわりに回すと、腕・脚が前後に振れる（負で前へ）
      tmpAxis.set(Math.cos(pose.heading), 0, -Math.sin(pose.heading));
      if (bn.arm && ap.arm) rotateBoneWorld(bn.arm, tmpAxis, ap.arm);
      if (bn.leg && ap.leg) rotateBoneWorld(bn.leg, tmpAxis, ap.leg);
    }
  }

  function walk(d) {
    const forward = (isDown('KeyW', 'ArrowUp') ? 1 : 0) - (isDown('KeyS', 'ArrowDown') ? 1 : 0);
    // 画面の右は向き h の「右ベクトル」と逆側に映るので、見た目どおりに動くよう符号を合わせる
    const strafe = (isDown('KeyA') ? 1 : 0) - (isDown('KeyD') ? 1 : 0);
    const turn = (isDown('KeyQ', 'ArrowLeft') ? 1 : 0) - (isDown('KeyE', 'ArrowRight') ? 1 : 0) - mouseDX * MOUSE_TURN;
    mouseDX = 0;
    const prev = pose;
    const walkMods = (activeKind() || guardP > 0 || beam.charge > 0) ? { ...mods, walkSpeed: mods.walkSpeed * ACTION_WALK_MUL } : mods;
    let next = stepWalk(pose, { forward, strafe, turn }, d, walkMods);
    const r = Math.hypot(next.x, next.z);
    if (r > WALK_LIMIT) next = { ...next, x: (next.x / r) * WALK_LIMIT, z: (next.z / r) * WALK_LIMIT };
    const moved = Math.hypot(next.x - prev.x, next.z - prev.z);
    pose = next;
    moving = moved > 1e-4;
    const before = walked;
    walked += moved;
    if (footstepCount(before, walked) > 0) shake(SHAKE_AMP);
  }

  return {
    enter(params = {}) {
      const p = params && typeof params === 'object' ? params : {};
      gameId = typeof p.gameId === 'string' && p.gameId ? p.gameId : KJ_GAME_ID;
      carry = p.carry && typeof p.carry === 'object' ? p.carry : {};
      carryLine = ctx.carryEffectFor(gameId) || null;
      mods = makeMods(carry);
      if (!world) buildStatic();
      resetBattle();
      mouseDX = 0;
      leaving = false;
      if (resultPanel) resultPanel.hide();
      t = 0;
      guard = 0.3;
      Object.assign(anim, createAnimState());
      applyMohawkColor(rig, ctx.mohawkColor());
      ctx.setWorld(world);
      oldNear = camera.near;
      camera.near = KJ_CAMERA.near;
      camera.updateProjectionMatrix();
      syncHero(0);
      placeCamera(0, true);
      mountHud();
      refreshHud();
      listen(true);
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      if (!panel) panel = createMinigamePanel();
      phase = 'intro';
      panel.show(kjHowto(carryLine), () => startPlay());
    },
    update(dt) {
      if (!world) return;
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, MAX_DT);
      t += d;
      guard = Math.max(0, guard - d);
      if (shakeT > 0) shakeT = Math.max(0, shakeT - d);
      if (phase === 'intro') {
        if (pressed('Escape')) {
          if (panel) panel.hide();
          backToGallery();
          if (!leaving && panel) panel.show(kjHowto(carryLine), () => startPlay());
        } else if (guard <= 0 && pressed('Enter', 'NumpadEnter', 'Space')) {
          if (panel) panel.close();
        }
        moving = false;
      } else if (phase === 'play' && !paused()) {
        if (!fightOver) {
          fightT += d;
          act(d);
          walk(d);
          bodyContact(d);
          stepFoe(d);
          const j = judge(heroHp, enemy ? enemy.hp : 1);
          if (j) endFight(j);
        } else {
          moving = false;
          relaxActions(d);
          stepEnding(d);
          if (phase === 'play' && endT > 1 && pressed('Enter', 'NumpadEnter')) showResult();
        }
        stepKnocks(d);
        if (!fightOver) keepApart();
      } else if (phase === 'result' && !paused()) {
        moving = false;
        stepEnding(d);
        if (guard <= 0 && resultPanel && resultPanel.isOpen()) {
          if (pressed('ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW')) resultPanel.move(-1);
          if (pressed('ArrowRight', 'ArrowDown', 'KeyD', 'KeyS')) resultPanel.move(1);
          if (pressed('Enter', 'NumpadEnter', 'Space')) resultPanel.confirm();
        }
      }
      updateFx(d);
      updateHeroBeam(d);
      updateAlien(d);
      syncHero(d);
      if (fightOver) placeEndCamera(d);
      else placeCamera(d);
      refreshHud();
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, mods: smokeSummary(mods) };
    },
    exit() {
      phase = 'idle';
      melee = freshMelee();
      knocks = [];
      guardP = 0;
      listen(false);
      releaseLock();
      if (panel) panel.hide();
      if (resultPanel) resultPanel.hide();
      unmountHud();
      if (oldNear !== null) {
        camera.near = oldNear;
        camera.updateProjectionMatrix();
        oldNear = null;
      }
      ctx.ui.setHint('');
    },
    get pausable() { return phase !== 'intro'; },
    get carry() { return carry; },
    /** 後の段階で使う（建物の状態とその見た目） */
    get cityState() { return { city, meshes: cityMeshes }; },
  };
}

export default createKaijuScene;
