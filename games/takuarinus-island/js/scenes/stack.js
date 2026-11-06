// 積み上げたもの吹っ飛ばしの場面：屋台前の広場で、モヒカンのブロックを積み、溜めて振って吹っ飛ばす。
// 主人公 → モヒフライの順に3ラウンド。線より遠くへ飛んだ数＋油の鍋のおまけの合計で勝敗。
// Esc のポーズから館に戻れる。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { createAnimState, stepAnim } from '../characters.js';
import { createHeroRig, applyMohawkColor } from '../hero-model.js';
import {
  buildStackArena, buildStackBlock, buildStackWeapon, STACK_LAYOUT, levelY,
} from '../stack-arena.js';
import {
  createMinigamePanel, createResultPanel, createPopText, createTextBox, createKeyTracker, PAUSE_BACK_GALLERY,
} from './touch.js';
import {
  createTower, dropBlock, tickTower, topBlock, movingX, swingSpeed, timeLeft, swingStartTime, SWING_RANGE,
} from '../stack-rules.js';
import {
  gaugeValue, adjustAngle, resolveBlast, weaponFor, flightPoint, flightDuration, ANGLE_DEFAULT,
} from '../stack-blast.js';
import { createStackMatch, recordTurn, currentTurn } from '../stack-match.js';
import {
  throwScore, gaugePower, wobbleAngle, stepAngleOffset, ebiFryBonus, DISTANCE_MARKS, effectivePower, heroThrowRange,
} from '../stack-throw.js';
import { POT_NEAR, POT_FAR, LINE_DISTANCE } from '../stack-blast.js';
import { playStackAiTurnDetailed } from '../stack-ai.js';
import { createRng } from '../mini-rng.js';
import { loadSillyLevel, SILLY_STORAGE_KEY } from '../silly-rules.js';
import { stackCarryOptions } from '../item-table.js';
import { canRetrySwing } from '../item-effects.js';
import { gameSfx, gameCharge, ensureGameMusic } from '../audio.js';
import { smokeSummary } from '../smoke-state.js';

export { PAUSE_BACK_GALLERY };
export const STACK_GAME_ID = 'blowaway';
/** 積むブロックの色（順番に回す） */
export const BLOCK_COLORS = Object.freeze(['heroMohican', 'mohicanRed', 'mohicanYellow', 'mohicanGreen', 'mohicanPurple']);
export const DROP_FALL_SECONDS = 0.12;
export const STACK_ROUNDS = 3;
export const RIVAL_LEVEL = 'normal';
export const RIVAL_DROP_INTERVAL = 0.45;
export const SWING_IMPACT = 0.15;
const GRAVITY = 14;
const IDLE_HERO = Object.freeze({ x: -5.6, z: 2.8 });
const FIELD_PHASES = new Set(['fly', 'turnEnd', 'result']);
const WEAPON_PHASES = new Set(['aim', 'rivalAim', 'swing', 'fly']);
const RESULT_LABELS = Object.freeze({ win: '勝ち！', lose: '負け…', draw: '引き分け' });

export const STACK_HOWTO = Object.freeze({
  title: '積み上げたもの吹っ飛ばし',
  sub: 'モヒカンを積んで吹っ飛ばせ！ 線より遠くへ飛んだ数が得点（3ラウンド）',
  rows: Object.freeze([
    Object.freeze(['Space（積む）', '左右に往復するモヒカンを落として積む']),
    Object.freeze(['はみ出し', '下の段からはみ出した分は切り落とされる']),
    Object.freeze(['Space 長押し → 離す', 'パワーを溜めて振る（吹っ飛ばす）']),
    Object.freeze(['A / D', '振る角度を変える']),
    Object.freeze(['油の鍋', '入ると「じゅわー」で1点おまけ']),
    Object.freeze(['Esc', 'ポーズ（館に戻る）']),
  ]),
  note: 'Enter / Space / クリック: はじめる',
});

export function stackHudText(tower) {
  if (!tower) return '';
  const left = Math.ceil(timeLeft(tower) - 1e-9);
  return `積む　段 ${tower.levels}/${tower.maxLevels}　のこり ${left}秒　落とした ${tower.misses}`;
}

export function stackDoneView(tower) {
  const full = tower.endReason === 'full';
  return {
    title: full ? '積み上げ完了！' : '時間切れ！',
    tone: full ? 'good' : '',
    lines: [`${tower.levels}段 積んだ（落としたブロック ${tower.misses}）`, '吹っ飛ばしへ！'],
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}

/** パワーのゲージ（■□ の列） */
export function gaugeBar(v, cells = 10) {
  const n = Math.max(0, Math.min(cells, Math.round((Number(v) || 0) * cells)));
  return `${'■'.repeat(n)}${'□'.repeat(cells - n)}`;
}

export function blastHudText(power, angle) {
  return `吹っ飛ばし　パワー ${gaugeBar(power)}　角度 ${Math.round(Number(angle) || 0)}°`;
}

/** 1ターンの内訳 */
export function turnScoreText(b) {
  if (!b) return '';
  return `飛んだ ${b.flown}＋おまけ ${b.potBonus}＝${b.score}点`;
}

export function stackMatchHud(match) {
  if (!match) return '';
  const r = Math.min(match.round, match.rounds);
  return `ラウンド ${r}/${match.rounds}　あなた ${match.totals.hero} − ${match.totals.rival} モヒフライ`;
}

export function stackResultView(match, extra = []) {
  const result = match.result || 'draw';
  const rounds = match.turns
    .map((t, i) => `R${i + 1} ${t.hero ?? '-'}−${t.rival ?? '-'}`)
    .join('　');
  return {
    title: RESULT_LABELS[result] || '…',
    tone: result === 'win' ? 'good' : result === 'lose' ? 'bad' : '',
    lines: [
      `あなた ${match.totals.hero} − ${match.totals.rival} モヒフライ（${match.rounds}ラウンド合計）`,
      rounds,
      ...(Array.isArray(extra) ? extra.filter((s) => typeof s === 'string' && s) : []),
    ],
    choices: [{ id: 'again', label: 'もう一度' }, { id: 'gallery', label: '館に戻る' }],
  };
}

function sillyLevelNow() {
  try {
    return loadSillyLevel(globalThis.localStorage.getItem(SILLY_STORAGE_KEY));
  } catch {
    return 2;
  }
}

export function createStackScene(ctx) {
  const { THREE, mat, camera, input } = ctx;
  const L = STACK_LAYOUT;
  let arena = null;
  let rig = null;
  let anim = null;
  let heroShadow = null;
  let pieces = null;
  let mover = null;
  let weaponHolder = null;
  let weapons = null;
  let aimArrow = null;
  let panel = null;
  let resultPanel = null;
  let pop = null;
  let hud = null;
  let keys = null;
  let camPos = null;
  let camLook = null;
  let phase = 'howto';
  let gameId = STACK_GAME_ID;
  let carry = {};
  let t = 0;
  let phaseT = 0;
  let guard = 0;
  let leaving = false;
  let tower = null;
  let moverT = 0;
  let moverSpeed = 3;
  let placed = [];
  let debris = [];
  let flights = [];
  let camY = 2;
  let match = null;
  let seed = 0;
  let who = 'hero';
  let aimAngle = ANGLE_DEFAULT;
  let charge = null;
  let armed = false;
  let swingPower = 0;
  let swingT = 0;
  let swingFrom = 0.3;
  let swingAngle = ANGLE_DEFAULT;
  let blast = null;
  let rivalDetail = null;
  let rp = null;
  let potShown = false;
  let opts = stackCarryOptions({});
  let carryLine = null;
  let retryLeft = 0; // 1回だけ打ち直せる（しおり・フロッピー・ランタン）
  let rewardLine = null;
  let angleOffset = 0;
  let ebiCount = { hero: 0, rival: 0 };

  /** 飛んだ一覧から stack-throw.js の得点を出す */
  function scoreBlast(fl) {
    const potCount = fl.filter((f) => f.inPot).length;
    const s = throwScore({ distances: fl.map((f) => f.distance), potCount });
    return {
      flights: fl, flown: fl.length, potCount, potBonus: s.bonus, distanceScore: s.distance, score: s.total,
    };
  }

  function build() {
    arena = buildStackArena(THREE, {
      mat,
      addLights: (w) => ctx.addLights(w),
      makeShadow: (r) => ctx.makeShadow(r),
    });
    rig = createHeroRig(THREE, mat);
    arena.world.add(rig.root);
    heroShadow = ctx.makeShadow(1.1);
    arena.world.add(heroShadow);
    pieces = new THREE.Group();
    arena.world.add(pieces);
    mover = buildStackBlock(THREE, mat, { width: L.baseWidth, colorKey: BLOCK_COLORS[0] });
    mover.root.visible = false;
    arena.world.add(mover.root);
    weaponHolder = new THREE.Group();
    weapons = {
      fan: buildStackWeapon(THREE, mat, 'fan'),
      hammer: buildStackWeapon(THREE, mat, 'hammer'),
    };
    weaponHolder.add(weapons.fan.root, weapons.hammer.root);
    weaponHolder.visible = false;
    arena.world.add(weaponHolder);
    aimArrow = new THREE.Group();
    const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
    shaftGeo.rotateZ(-Math.PI / 2);
    shaftGeo.translate(0.5, 0, 0);
    const tipGeo = new THREE.ConeGeometry(0.18, 0.4, 8);
    tipGeo.rotateZ(-Math.PI / 2);
    tipGeo.translate(1.15, 0, 0);
    aimArrow.add(new THREE.Mesh(shaftGeo, mat('uiAccent')), new THREE.Mesh(tipGeo, mat('uiAccent')));
    aimArrow.visible = false;
    arena.world.add(aimArrow);
    // 地面の距離の目盛り（5m ごと）
    for (const m of DISTANCE_MARKS) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 10), mat(m % 10 === 0 ? 'uiGold' : 'roadLine'));
      mark.position.set(L.towerX + m, 0.03, 0);
      arena.world.add(mark);
    }
    camPos = new THREE.Vector3(2, 4, 11);
    camLook = new THREE.Vector3(0, 2, 0);
    anim = createAnimState();
  }

  function setWeaponKind(kind) {
    weapons.fan.root.visible = kind !== 'hammer';
    weapons.hammer.root.visible = kind === 'hammer';
  }

  function placeActors() {
    const B = L.blastSpot;
    const heroAt = who === 'hero' ? B : IDLE_HERO;
    const rivalAt = who === 'rival' ? B : L.rival;
    rig.root.position.set(heroAt.x, 0, heroAt.z);
    rig.root.rotation.y = who === 'hero' ? Math.PI / 2 : Math.atan2(L.towerX - heroAt.x, -heroAt.z);
    heroShadow.position.set(heroAt.x, 0.02, heroAt.z);
    arena.rival.root.position.x = rivalAt.x;
    arena.rival.root.position.z = rivalAt.z;
    arena.rival.root.rotation.y = Math.PI / 2;
    if (arena.rivalShadow) arena.rivalShadow.position.set(rivalAt.x, 0.02, rivalAt.z);
    weaponHolder.position.set(B.x + 0.55, 0.9, B.z + 0.4);
    aimArrow.position.set(B.x + 0.7, 1.8, B.z + 0.4);
  }

  function focusY() {
    const lv = tower ? tower.levels : 0;
    return 1.2 + (L.baseHeight + lv * L.blockHeight) * 0.65;
  }

  function placeCamera(d = 1, snap = false) {
    camY += (focusY() - camY) * Math.min(1, d * 3);
    let px; let py; let pz; let lx; let ly; let lz;
    if (FIELD_PHASES.has(phase)) {
      px = 10; py = 8.5; pz = 21; lx = 10.5; ly = 1.2; lz = 0;
    } else {
      const sway = Math.sin(t * 0.3) * 0.2;
      px = L.towerX + 0.8 + sway; py = camY + 2.6; pz = 11; lx = L.towerX - 0.6; ly = camY; lz = 0;
    }
    const k = snap ? 1 : 1 - Math.exp(-d * 3);
    camPos.x += (px - camPos.x) * k;
    camPos.y += (py - camPos.y) * k;
    camPos.z += (pz - camPos.z) * k;
    camLook.x += (lx - camLook.x) * k;
    camLook.y += (ly - camLook.y) * k;
    camLook.z += (lz - camLook.z) * k;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  function backToGallery() {
    if (leaving) return;
    leaving = true;
    if (!ctx.returnToGallery(gameId)) leaving = false;
  }

  function clearPieces() {
    for (const c of [...pieces.children]) pieces.remove(c);
    placed = [];
    debris = [];
    flights = [];
  }

  function hoverY() {
    return levelY(tower.levels + 1) + L.hover;
  }

  function nextBlock() {
    const drops = tower.levels + tower.misses;
    moverSpeed = swingSpeed(tower.levels, who === 'hero' ? opts.swingMult : 1);
    moverT = swingStartTime(drops, moverSpeed, SWING_RANGE);
    mover.setWidth(topBlock(tower).width);
    mover.setColor(BLOCK_COLORS[drops % BLOCK_COLORS.length]);
    mover.root.position.set(L.towerX + movingX(moverT, moverSpeed, SWING_RANGE), hoverY(), 0);
    mover.root.visible = !tower.over;
  }

  // ---- 試合とターンの流れ ----
  function newMatch() {
    seed = Date.now() >>> 0;
    match = createStackMatch({ rounds: STACK_ROUNDS });
    rewardLine = null;
    ebiCount = { hero: 0, rival: 0 };
    retryLeft = opts.retryOnce ? 1 : 0;
    setWeaponKind(weaponFor(sillyLevelNow()));
    if (resultPanel) resultPanel.hide();
    startTurn();
  }

  function startTurn() {
    who = currentTurn(match) || 'hero';
    clearPieces();
    tower = null;
    blast = null;
    rivalDetail = null;
    rp = null;
    charge = null;
    mover.root.visible = false;
    arena.setBaseWidth(L.baseWidth);
    placeActors();
    phase = 'intro';
    phaseT = 0;
    pop.show(`ラウンド${match.round}　${who === 'hero' ? 'あなたの番' : 'モヒフライの番'}`, who === 'hero' ? 'good' : '');
    ctx.ui.setHint('');
  }

  function startStacking() {
    clearPieces();
    tower = createTower({ baseWidth: opts.baseWidth, timeLimit: opts.timeLimit });
    arena.setBaseWidth(tower.blocks[0].width);
    nextBlock();
    phase = 'ready';
    phaseT = 0;
    pop.show('よーい…');
    ctx.ui.setHint('Space: ブロックを落として積む　Esc: ポーズ');
  }

  function startRivalStack() {
    clearPieces();
    rivalDetail = playStackAiTurnDetailed({ seed: (seed + match.round) >>> 0, level: carry.hard ? 'hard' : RIVAL_LEVEL });
    tower = createTower({
      baseWidth: rivalDetail.baseWidth, maxLevels: rivalDetail.maxLevels, timeLimit: rivalDetail.timeLimit,
    });
    arena.setBaseWidth(tower.blocks[0].width);
    rp = { i: 0, timer: 0, fromX: -SWING_RANGE };
    nextBlock();
    phase = 'rivalStack';
    phaseT = 0;
    pop.show('モヒフライが積む！');
    ctx.ui.setHint('');
  }

  function spawnDebris(cut, y, colorKey) {
    const b = buildStackBlock(THREE, mat, { width: cut.width, colorKey });
    const s = cut.side === 'right' ? 1 : -1;
    b.root.position.set(L.towerX + cut.x, y, 0);
    pieces.add(b.root);
    debris.push({
      b, vx: s * (1.6 + Math.random() * 0.8), vy: 1.6, vz: (Math.random() - 0.5) * 1.2, spin: s * (3 + Math.random() * 3), rest: false,
    });
  }

  /** x に落として見た目を作る。dropBlock の結果を返す */
  function placeDrop(x) {
    const fromY = hoverY();
    const colorKey = mover.colorKey;
    const r = dropBlock(tower, x);
    if (!r) return null;
    if (r.landed) {
      const b = buildStackBlock(THREE, mat, { width: r.block.width, colorKey });
      const to = levelY(tower.levels);
      b.root.position.set(L.towerX + r.block.x, fromY, 0);
      pieces.add(b.root);
      placed.push({
        b, from: fromY, to, t: 0,
      });
      if (r.cut) {
        spawnDebris(r.cut, to, colorKey);
        pop.show('シュッ');
        gameSfx('blockCut');
      } else {
        pop.show(r.perfect ? 'ぴったり！' : 'ポフッ', r.perfect ? 'good' : '');
      }
      gameSfx('blockLand');
    } else {
      spawnDebris(r.cut, fromY - L.hover * 0.5, colorKey);
      pop.show('おちた！', 'bad');
      gameSfx('whiff');
    }
    return r;
  }

  function heroDrop() {
    const r = placeDrop(movingX(moverT, moverSpeed, SWING_RANGE));
    if (!r) return;
    if (tower.over) finishStacking();
    else nextBlock();
  }

  function finishStacking() {
    mover.root.visible = false;
    phase = 'stackDone';
    phaseT = 0;
    const full = tower.endReason === 'full';
    if (tower.levels === 0) pop.show('1段も積めなかった…', 'bad');
    else pop.show(full ? '積み上げ完了！' : 'タイムアップ！', full ? 'good' : '');
    ctx.ui.setHint('');
  }

  function startAim() {
    aimAngle = ANGLE_DEFAULT;
    angleOffset = 0;
    charge = null;
    armed = !keys.isDown('Space');
    phase = 'aim';
    phaseT = 0;
    pop.show('溜めて吹っ飛ばせ！', 'good');
    ctx.ui.setHint('Space 長押し: パワーを溜める → 離して振る　A/D: 角度　Esc: ポーズ');
  }

  function startRivalAim() {
    mover.root.visible = false;
    phase = 'rivalAim';
    phaseT = 0;
    pop.show(`${tower.levels}段！ いくぞ〜`);
  }

  function beginSwing(power) {
    swingPower = Math.max(0, Math.min(1, Number(power) || 0));
    swingAngle = who === 'hero' ? aimAngle : rivalDetail.angleDeg;
    swingFrom = weaponHolder.rotation.z;
    swingT = 0;
    phase = 'swing';
    phaseT = 0;
    ctx.ui.setHint('');
  }

  function launch() {
    if (who === 'hero') {
      const rng = createRng((seed + 7919 * match.round + 1) >>> 0);
      // 持ち込みの「力＋」「壺の幅＋」（以前は表示だけで主人公には効いていなかった）
      const R = heroThrowRange(effectivePower(swingPower), swingAngle, opts.powerBonus);
      const potFar = POT_FAR + (Number(opts.potWidthBonus) || 0);
      const n = tower.levels;
      const fl = [];
      for (let i = 0; i < n; i++) {
        const distance = R * (0.7 + 0.6 * ((i + 0.5) / n)) * (1 + (rng.next() * 2 - 1) * 0.05);
        const inPot = distance >= POT_NEAR && distance < potFar;
        fl.push({
          index: i, distance, over: distance > LINE_DISTANCE || inPot, inPot,
        });
      }
      blast = scoreBlast(fl);
    } else {
      blast = scoreBlast(rivalDetail.flights);
    }
    ebiCount[who] += blast.potCount;
    startFlights(blast, swingAngle);
    pop.show('ドカーン！', 'good');
    gameSfx('blast');
    phase = 'fly';
    phaseT = 0;
  }

  function startFlights(b, angle) {
    potShown = false;
    const n = b.flights.length;
    const baseW = tower ? tower.blocks[0].width : L.baseWidth;
    flights = b.flights.map((fl, i) => {
      const p = placed[i];
      if (!p) return null;
      p.t = DROP_FALL_SECONDS;
      const o = p.b.root;
      const ex = fl.distance;
      let endY = L.blockHeight / 2;
      if (fl.inPot) endY = 0.9;
      else if (Math.abs(ex) < baseW / 2) endY = L.baseHeight + L.blockHeight / 2;
      return {
        b: p.b,
        x0: o.position.x - L.towerX,
        startY: o.position.y,
        z0: o.position.z,
        z1: fl.inPot ? L.pot.z : (Math.random() - 0.5) * 4,
        endY,
        dist: fl.distance,
        angle,
        T: flightDuration(fl.distance),
        t: -(n - 1 - i) * 0.05,
        spin: 4 + Math.random() * 6,
        inPot: fl.inPot,
        landed: false,
      };
    }).filter(Boolean);
  }

  function updateFlights(d) {
    for (const f of flights) {
      if (f.landed && f.inPot) {
        // エビフライモヒカンが鍋で跳ねる
        f.ebi += d;
        f.b.root.position.y = 0.9 + Math.abs(Math.sin(f.ebi * 8)) * 0.6 * Math.max(0, 1 - f.ebi / 1.5);
        f.b.root.rotation.z += d * 6;
        continue;
      }
      if (f.landed) continue;
      f.t += d;
      if (f.t < 0) continue;
      const p = flightPoint(f.dist, f.angle, f.t, { startY: f.startY, endY: f.endY, duration: f.T });
      const o = f.b.root;
      o.position.x = L.towerX + f.x0 * (1 - p.k) + p.x;
      o.position.y = p.y;
      o.position.z = f.z0 + (f.z1 - f.z0) * p.k;
      o.rotation.z = -f.spin * f.t;
      o.rotation.x = f.spin * 0.3 * f.t;
      if (p.done) {
        f.landed = true;
        if (f.inPot) {
          f.b.setColor('castFry');
          o.scale.set(1.1, 1.3, 1.1);
          f.ebi = 0;
          if (!potShown) {
            potShown = true;
            pop.show('じゅわー！ エビフライ！', 'good');
            gameSfx('oil');
          }
        } else {
          o.rotation.set(0, 0, Math.round(o.rotation.z / (Math.PI / 2)) * (Math.PI / 2));
        }
      }
    }
  }

  function endTurn() {
    const score = blast ? blast.score : 0;
    try {
      recordTurn(match, who, score);
    } catch (err) {
      console.warn('ターンの記録に失敗:', err);
    }
    pop.show(`${who === 'hero' ? 'あなた' : 'モヒフライ'} ${score}点！`, who === 'hero' ? 'good' : '');
    phase = 'turnEnd';
    phaseT = 0;
  }

  function afterTurn() {
    if (match.over) showResult();
    else startTurn();
  }

  function showResult() {
    phase = 'result';
    guard = 0.4;
    hud.hide();
    if (match.result === 'win') {
      const got = ctx.grantGameItem(STACK_GAME_ID);
      if (got && got.item && got.isNew) rewardLine = `アイテム獲得：${got.item.name}`;
    }
    const ebiLine = `エビフライ ×${ebiCount.hero}（+${ebiFryBonus(ebiCount.hero)}点）　モヒフライ ×${ebiCount.rival}（+${ebiFryBonus(ebiCount.rival)}点）`;
    resultPanel.show(stackResultView(match, [ebiLine, carryLine, rewardLine]), (id) => {
      if (id === 'again') newMatch();
      else backToGallery();
    });
    ctx.ui.setHint('←→ で選ぶ ／ Enter で決定');
  }

  function animatePieces(d) {
    for (const p of placed) {
      if (p.t >= DROP_FALL_SECONDS) continue;
      p.t = Math.min(DROP_FALL_SECONDS, p.t + d);
      const k = p.t / DROP_FALL_SECONDS;
      p.b.root.position.y = p.from + (p.to - p.from) * k * k;
    }
    const floor = L.blockHeight / 2;
    for (const q of debris) {
      if (q.rest) continue;
      const o = q.b.root;
      q.vy -= GRAVITY * d;
      o.position.x += q.vx * d;
      o.position.y += q.vy * d;
      o.position.z += q.vz * d;
      o.rotation.z -= q.spin * d;
      if (o.position.y <= floor && q.vy < 0) {
        o.position.y = floor;
        o.rotation.z = Math.round(o.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
        q.rest = true;
      }
    }
  }

  function updateWeapon(d) {
    weaponHolder.visible = WEAPON_PHASES.has(phase);
    aimArrow.visible = phase === 'aim';
    if (phase === 'aim') {
      const g = charge ? gaugePower(charge.t, seed) : 0;
      weaponHolder.rotation.z = charge ? 0.3 + 1.1 * g : 0.3 + Math.sin(t * 3) * 0.05;
      aimArrow.rotation.z = (aimAngle * Math.PI) / 180;
      aimArrow.scale.set(0.8 + g * 1.2, 1, 1);
    } else if (phase === 'rivalAim') {
      weaponHolder.rotation.z = 0.3 + 1.1 * gaugeValue(phaseT);
    } else if (phase === 'swing' || phase === 'fly') {
      swingT += d;
      const k = Math.min(1, swingT / SWING_IMPACT);
      if (swingT < 0.6) weaponHolder.rotation.z = swingFrom + (-1.0 - swingFrom) * k;
      else weaponHolder.rotation.z += (-0.3 - weaponHolder.rotation.z) * Math.min(1, d * 4);
    }
  }

  function hudText() {
    if (!match) return null;
    const head = stackMatchHud(match);
    const name = who === 'hero' ? 'あなた' : 'モヒフライ';
    switch (phase) {
      case 'intro': return head;
      case 'ready': case 'stack': case 'stackDone':
        return tower ? `${head} ｜ ${stackHudText(tower)}` : head;
      case 'rivalStack': return `${head} ｜ モヒフライが積んでいる… 段 ${tower ? tower.levels : 0}`;
      case 'aim': return `${head} ｜ ${blastHudText(charge ? gaugePower(charge.t, seed) : 0, aimAngle)}`;
      case 'rivalAim':
        return `${head} ｜ ${blastHudText(phaseT < 1.1 ? gaugeValue(phaseT) : rivalDetail.power, rivalDetail.angleDeg)}`;
      case 'swing': return `${head} ｜ ${blastHudText(swingPower, swingAngle)}`;
      case 'fly': return `${head} ｜ ${name}：ドカーン！`;
      case 'turnEnd': return blast
        ? `${head} ｜ ${name}：距離 ${blast.distanceScore}点＋エビフライ ×${blast.potCount}（+${blast.potBonus}）＝${blast.score}点`
        : head;
      default: return null;
    }
  }

  function updateAim(d) {
    const right = keys.isDown('KeyD') || keys.isDown('ArrowRight');
    const left = keys.isDown('KeyA') || keys.isDown('ArrowLeft');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    angleOffset = stepAngleOffset(angleOffset, dir, d);
    aimAngle = Math.max(5, Math.min(85, wobbleAngle(phaseT, seed) + angleOffset));
    const down = keys.isDown('Space');
    if (!armed) {
      if (!down) armed = true;
    } else if (!charge) {
      if (down) charge = { t: 0 };
    } else if (down) {
      charge.t += d;
    } else {
      const p = gaugePower(charge.t, seed);
      charge = null;
      if (canRetrySwing(p, retryLeft)) {
        // 弱すぎる振りは1回だけやり直せる（持ち込みの「1回だけ打ち直せる」）
        retryLeft -= 1;
        armed = false;
        pop.show('打ち直し！ もう一度溜めよう', 'good');
        return;
      }
      beginSwing(p);
    }
  }

  function updateRivalStack(d) {
    const drop = rivalDetail.drops[rp.i];
    if (!drop || tower.over) {
      startRivalAim();
      return;
    }
    rp.timer += d;
    const k = Math.min(1, rp.timer / RIVAL_DROP_INTERVAL);
    const s = k * k * (3 - 2 * k);
    mover.root.position.set(L.towerX + rp.fromX + (drop.x - rp.fromX) * s, hoverY(), 0);
    if (rp.timer >= RIVAL_DROP_INTERVAL) {
      placeDrop(drop.x);
      rp.i += 1;
      rp.timer = 0;
      rp.fromX = drop.x;
      if (!tower.over) nextBlock();
      else mover.root.visible = false;
    }
  }

  return {
    enter(params = {}) {
      if (!arena) build();
      gameId = typeof params.gameId === 'string' && params.gameId ? params.gameId : STACK_GAME_ID;
      carry = params.carry && typeof params.carry === 'object' ? params.carry : {};
      opts = stackCarryOptions(carry);
      carryLine = ctx.carryEffectFor(gameId) || null;
      rewardLine = null;
      leaving = false;
      t = 0;
      phaseT = 0;
      guard = 0.3;
      phase = 'howto';
      tower = null;
      match = null;
      blast = null;
      who = 'hero';
      clearPieces();
      mover.root.visible = false;
      weaponHolder.visible = false;
      aimArrow.visible = false;
      arena.setBaseWidth(L.baseWidth);
      placeActors();
      camY = focusY();
      Object.assign(anim, createAnimState());
      applyMohawkColor(rig, ctx.mohawkColor());
      ctx.setWorld(arena.world);
      placeCamera(1, true);
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      if (!panel) panel = createMinigamePanel();
      if (!resultPanel) resultPanel = createResultPanel();
      if (!pop) pop = createPopText();
      if (!hud) hud = createTextBox('mg-hud');
      if (!keys) keys = createKeyTracker();
      keys.attach();
      resultPanel.hide();
      hud.hide();
      pop.hide();
      panel.show(STACK_HOWTO, () => newMatch());
    },
    update(dt) {
      if (!arena) return;
      const d = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, 0.1);
      t += d;
      phaseT += d;
      guard = Math.max(0, guard - d);
      arena.update(t, d);
      if (phase === 'howto') {
        if (guard <= 0 && input.wasPressed('Enter', 'NumpadEnter', 'Space')) panel.close();
      } else if (phase === 'intro') {
        if (phaseT >= 1.1) {
          if (who === 'hero') startStacking();
          else startRivalStack();
        }
      } else if (phase === 'ready') {
        if (phaseT >= 0.9) {
          phase = 'stack';
          phaseT = 0;
          pop.show('スタート！', 'good');
        }
      } else if (phase === 'stack') {
        moverT += d;
        if (input.wasPressed('Space')) heroDrop();
        if (phase === 'stack' && tickTower(tower, d)) finishStacking();
        if (mover.root.visible) {
          mover.root.position.set(L.towerX + movingX(moverT, moverSpeed, SWING_RANGE), hoverY(), 0);
        }
      } else if (phase === 'stackDone') {
        if (phaseT >= 1.1) startAim();
      } else if (phase === 'aim') {
        updateAim(d);
      } else if (phase === 'rivalStack') {
        updateRivalStack(d);
      } else if (phase === 'rivalAim') {
        if (phaseT >= 1.4) beginSwing(rivalDetail.power);
      } else if (phase === 'swing') {
        if (phaseT >= SWING_IMPACT) launch();
      } else if (phase === 'fly') {
        if (flights.every((f) => f.landed) && phaseT >= 0.8) endTurn();
      } else if (phase === 'turnEnd') {
        if (phaseT >= 1.8) afterTurn();
      } else if (phase === 'result' && guard <= 0) {
        if (input.wasPressed('ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW')) resultPanel.move(-1);
        if (input.wasPressed('ArrowRight', 'ArrowDown', 'KeyD', 'KeyS')) resultPanel.move(1);
        if (input.wasPressed('Enter', 'NumpadEnter', 'Space')) resultPanel.confirm();
      }
      animatePieces(d);
      updateFlights(d);
      updateWeapon(d);
      ensureGameMusic('stack');
      if (phase === 'aim' && charge) gameCharge(gaugePower(charge.t, seed));
      else if (phase === 'rivalAim' && phaseT < 1.1) gameCharge(gaugeValue(phaseT));
      else gameCharge(null);
      const text = phase === 'result' ? null : hudText();
      if (text) hud.show(text);
      else hud.hide();
      const winHop = phase === 'result' && match && match.result === 'win' ? Math.abs(Math.sin(t * 9)) * 0.25 : 0;
      rig.root.position.y = winHop;
      stepAnim(anim, { moving: false, airborne: false, dt: d });
      rig.apply(anim);
      placeCamera(d);
    },
    // 試し遊び用の状態（window.__smoke.state() が読む）
    smokeState() {
      return { phase, t, who, match: smokeSummary(match), tower: smokeSummary(tower), opts: smokeSummary(opts) };
    },
    exit() {
      gameCharge(null);
      if (panel) panel.hide();
      if (resultPanel) resultPanel.hide();
      if (hud) hud.hide();
      if (pop) pop.hide();
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
