// ギャラリーモード: 左に手に入れた絵（一言つき。まだの絵は入手方法）、右にハワイ気分でくつろぐ
// タクアリヌス（サングラス・ビーチチェア）と、夏の遊びをする仲間たち（助けた仲間だけ）。
// タイトルの「ギャラリー」から入る。←→↑↓で選ぶ・Esc でタイトルへ。
import { PALETTE } from '../palette.js';
import { BOSSES } from '../bosses.js';
import { NPCS } from '../npcs.js';
import { isBossDefeated } from '../progress.js';
import { buildAlinus, createAnimState, stepAnim } from '../characters.js';
import { createHeroRig } from '../hero-model.js';
import { drawingUrl, paintingById } from '../gallery-data.js';
import {
  PAINTING_REWARDS, PAINTING_TOTAL, hasPainting, howToGet, collectedCount, ALWAYS_SHOWN,
  DECOR_COMMENTS, decorUnlocked, decorHowToGet,
} from '../paintings.js';
import { rescuedCompanions } from '../story.js';
import { getLang } from '../i18n.js';
import { paintingNoteEn } from '../painting-notes.js';

export const GM_COLS = 6;

/** 頭の後ろで手を組む姿勢（hero-model の hold。ふざけたポーズと同じ形） */
export const LOUNGE_POSE = Object.freeze({
  weight: 1,
  body: Object.freeze({ flip: 0, spin: 0, hop: 0 }),
  joints: Object.freeze({
    spine: 0,
    L: Object.freeze({ thigh: 0, shin: -0.1, arm: 2.5, armOut: 1.1, forearm: -2.0 }),
    R: Object.freeze({ thigh: 0, shin: -0.1, arm: 2.5, armOut: 1.1, forearm: -2.0 }),
  }),
});
/** サングラスの位置（頭の骨から。主人公の向きで +z が前） */
const GLASSES_AT = Object.freeze({ x: 0, y: 0.12, z: 0.3 });

/** 一覧の並び: 入手する絵24枚のあとに、館に最初から飾ってある絵（依頼者の絵を含む） */
export const GM_ENTRIES = Object.freeze([
  ...PAINTING_REWARDS.map((r) => Object.freeze({ paintingId: r.paintingId, reward: r })),
  ...ALWAYS_SHOWN.map((id) => Object.freeze({ paintingId: id, reward: null })),
]);

/** 選択の移動（6列の格子・端で折り返す） */
export function gmMove(sel, dir, total = GM_ENTRIES.length, cols = GM_COLS) {
  const n = Math.max(1, total);
  if (dir === 'left') return (sel + n - 1) % n;
  if (dir === 'right') return (sel + 1) % n;
  if (dir === 'up') return (sel - cols + n) % n;
  if (dir === 'down') return (sel + cols) % n;
  return sel;
}

/** 左の欄に出す内容（手に入れたか・題名・一言／入手方法・画像） */
export function gmCard(state, index) {
  const e = GM_ENTRIES[index];
  if (!e) return null;
  const p = paintingById(e.paintingId);
  if (!e.reward) {
    // 館の広間に飾ってある絵。1枚ずつのひとこと。依頼者の絵は番長・ビッグヌスを倒すと開放
    const got = decorUnlocked(state, e.paintingId);
    return {
      got,
      title: got ? (p ? p.title : e.paintingId) : '？？？',
      text: got ? DECOR_COMMENTS[e.paintingId] || '館の広間に飾ってある絵。' : `入手方法：${decorHowToGet(state, e.paintingId)}`,
      src: got && p ? drawingUrl(p.file) : null,
      tier: 'decor',
      note: got && getLang() === 'en' ? paintingNoteEn(e.paintingId) : '',
    };
  }
  const r = e.reward;
  const got = hasPainting(state, r.paintingId);
  return {
    got,
    title: got ? (p ? p.title : r.paintingId) : '？？？',
    text: got ? r.comment : `入手方法：${howToGet(r)}`,
    src: got && p ? drawingUrl(p.file) : null,
    tier: r.tier,
    note: got && getLang() === 'en' ? paintingNoteEn(r.paintingId) : '',
  };
}

export function createGalleryModeScene(ctx) {
  const { THREE, camera, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  const pals = []; // {id, model, anim, role}
  let ball = null;
  let glasses = null;
  let headPos = null;
  let ring = null;
  let melon = null;
  let stick = null;
  let el = null;
  let imgEl = null;
  let titleEl = null;
  let textEl = null;
  let noteEl = null;
  let countEl = null;
  let gridEl = null;
  let sel = 0;
  let t = 0;
  let state = { earned: [] };
  let baseFov = 60;

  function buildDom() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'gm';
    el.className = 'hidden';
    const left = document.createElement('div');
    left.className = 'gm-left';
    const head = document.createElement('div');
    head.className = 'gm-head';
    head.textContent = 'ギャラリー';
    countEl = document.createElement('span');
    countEl.className = 'gm-count';
    head.append(countEl);
    const frame = document.createElement('div');
    frame.className = 'gm-frame';
    imgEl = document.createElement('img');
    imgEl.alt = '';
    const q = document.createElement('div');
    q.className = 'gm-q';
    q.textContent = '？';
    frame.append(imgEl, q);
    titleEl = document.createElement('div');
    titleEl.className = 'gm-title';
    textEl = document.createElement('div');
    textEl.className = 'gm-text';
    gridEl = document.createElement('div');
    gridEl.className = 'gm-grid';
    GM_ENTRIES.forEach((r, i) => {
      const c = document.createElement('div');
      c.className = 'gm-cell';
      c.addEventListener('click', () => {
        sel = i;
        render();
      });
      gridEl.append(c);
    });
    const hint = document.createElement('div');
    hint.className = 'gm-hint';
    hint.textContent = '←→↑↓: えらぶ　Esc: もどる';
    const info = document.createElement('div');
    info.className = 'gm-info';
    noteEl = document.createElement('div');
    noteEl.className = 'gm-note';
    info.append(titleEl, textEl, noteEl);
    left.append(head, frame, info, gridEl, hint);
    el.append(left);
    document.body.append(el);
  }

  function render() {
    const c = gmCard(state, sel);
    if (!c) return;
    el.classList.toggle('gm-locked', !c.got);
    if (c.src) {
      if (imgEl.getAttribute('src') !== c.src) imgEl.src = c.src;
    } else {
      imgEl.removeAttribute('src');
    }
    titleEl.textContent = c.tier === 'hard' ? `${c.title}（高難易度）` : c.title;
    textEl.textContent = c.text;
    // 英語のときは、手書きの絵の中の文字を説明する（絵はそのまま）
    noteEl.textContent = c.note || '';
    countEl.textContent = `${collectedCount(state)} / ${PAINTING_TOTAL}`;
    [...gridEl.children].forEach((cell, i) => {
      const e = GM_ENTRIES[i];
      const got = e.reward ? hasPainting(state, e.paintingId) : decorUnlocked(state, e.paintingId);
      cell.classList.toggle('got', got);
      cell.classList.toggle('sel', i === sel);
      cell.classList.toggle('hard', !!e.reward && e.reward.tier === 'hard');
      cell.classList.toggle('decor', !e.reward);
      const p = paintingById(e.paintingId);
      cell.style.backgroundImage = got && p ? `url("${drawingUrl(p.file)}")` : '';
    });
  }

  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 4 * s, 6), mat('trunk'));
    trunk.position.y = 2 * s;
    trunk.rotation.z = 0.15;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 0.08, 0.6 * s), mat('leaf'));
      leaf.position.set(0.3 * s, 4 * s, 0);
      leaf.rotation.set(0, (i * Math.PI) / 3, -0.35);
      leaf.translateX(1 * s);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    return g;
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 40, 120);
    ctx.addLights(world);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.15, -60);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), mat('sand'));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, 4);
    world.add(sea, sand);
    // 夕方の大きな太陽
    const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.uiGold }));
    sun.position.set(18, 10, -90);
    world.add(sun);
    world.add(palm(-6, -2, 1.1), palm(9, -4, 1.3), palm(13, 2, 0.9));

    // ビーチチェアとパラソル
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.4), mat('mohicanYellow'));
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), mat('mohicanYellow'));
    back.position.set(0, 1.05, 1.4);
    back.rotation.x = -0.9;
    chair.add(seat, back);
    for (const [x, z] of [[-0.6, -1], [0.6, -1], [-0.6, 1], [0.6, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat('boardDark'));
      leg.position.set(x, 0.25, z);
      chair.add(leg);
    }
    chair.position.set(2, 0, 4);
    chair.rotation.y = Math.PI + 0.35;
    world.add(chair);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), mat('uiShade'));
    pole.position.set(0.3, 1.6, 5.6); // 仲間を隠さないよう、チェアの左手前に
    const shade = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.8, 8), mat('uiAccent'));
    shade.position.set(0.3, 3.3, 5.6);
    world.add(pole, shade);
    // トロピカルな飲み物
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.36, 8), mat('mohicanRed'));
    cup.position.set(3.1, 0.55, 3.4);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), mat('mohicanGreen'));
    straw.position.set(3.15, 0.85, 3.4);
    straw.rotation.z = 0.3;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.36, 8), mat('trunk'));
    table.position.set(3.1, 0.18, 3.4);
    world.add(table, cup, straw);

    // タクアリヌス: チェアに寝そべってサングラス
    hero = createHeroRig(THREE, mat);
    hero.root.position.set(2, 0.62, 4.2);
    hero.root.rotation.set(-0.95, 0.35, 0, 'YXZ'); // こちらを向いて背もたれに寝そべる
    glasses = new THREE.Group();
    const lensMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadow });
    for (const sx of [-0.17, 0.17]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.04), lensMat);
      lens.position.x = sx;
      glasses.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), lensMat);
    glasses.add(bridge);
    glasses.position.set(0, 1.62, 0.4);
    hero.root.add(glasses);
    headPos = new THREE.Vector3();
    // 頭の後ろで手を組んでくつろぐ（依頼者の指摘 2026-11-04）
    hero.hold = LOUNGE_POSE;
    world.add(hero.root);

    // 仲間の遊び道具
    ball = new THREE.Group();
    const cols = ['mohicanRed', 'uiText', 'heroMohican', 'mohicanYellow'];
    cols.forEach((k, i) => {
      const part = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 8, (i * Math.PI) / 2, Math.PI / 2),
        mat(k),
      );
      ball.add(part);
    });
    world.add(ball);
    ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.25, 8, 16), mat('mohicanRed'));
    ring.rotation.x = -Math.PI / 2;
    world.add(ring);
    melon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat('mohicanGreen'));
    world.add(melon);
    stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat('trunk'));
    world.add(stick);
  }

  /** 助けた仲間だけを浜に出す（遊びは仲間ごとに決まっている） */
  /** サングラスを頭の骨に合わせる（モデルの読み込み前は手作りの頭の高さのまま） */
  function fitGlasses() {
    const hb = hero.headBone();
    if (!hb) return;
    hero.root.updateMatrixWorld(true);
    hb.getWorldPosition(headPos);
    hero.root.worldToLocal(headPos);
    glasses.position.set(headPos.x + GLASSES_AT.x, headPos.y + GLASSES_AT.y, headPos.z + GLASSES_AT.z);
  }

  function placePals() {
    for (const p of pals) world.remove(p.model.root);
    pals.length = 0;
    const defeated = BOSSES.filter((b) => isBossDefeated(ctx.getProgress(), b.id)).map((b) => b.id);
    const here = rescuedCompanions(defeated);
    const roles = { senpai: 'melon', chibi: 'ballL', peta: 'ballR', chibimohi: 'ring' };
    for (const id of here) {
      const npc = NPCS.find((n) => n.id === id);
      if (!npc) continue;
      const model = buildAlinus(THREE, mat, npc.shape);
      world.add(model.root);
      pals.push({ id, model, anim: createAnimState(), role: roles[id] });
    }
    const has = (r) => pals.some((p) => p.role === r);
    ball.visible = has('ballL') || has('ballR');
    ring.visible = has('ring');
    melon.visible = has('melon');
    stick.visible = has('melon');
  }

  function animatePals(dt) {
    // 依頼者の指摘（2026-11-04）: 仲間が見切れる → 右の細い欄に収まるよう、主人公の後ろへ寄せる
    const L = { x: 1.3, z: -1.8 };
    const R = { x: 3.5, z: -3.0 };
    const both = pals.some((p) => p.role === 'ballL') && pals.some((p) => p.role === 'ballR');
    // ビーチボール: 2人なら投げ合い、1人ならポンポン突く
    const k = (Math.sin(t * 1.6) + 1) / 2;
    if (both) ball.position.set(L.x + (R.x - L.x) * k, 1.2 + Math.sin(k * Math.PI) * 2.4, L.z + (R.z - L.z) * k);
    else {
      const who = pals.find((p) => p.role === 'ballL' || p.role === 'ballR');
      const at = who && who.role === 'ballR' ? R : L;
      ball.position.set(at.x, 1.4 + Math.abs(Math.sin(t * 3)) * 1.6, at.z);
    }
    ball.rotation.x += dt * 4;
    for (const p of pals) {
      const root = p.model.root;
      let y = 0;
      if (p.role === 'ballL' || p.role === 'ballR') {
        const at = p.role === 'ballL' ? L : R;
        y = Math.abs(Math.sin(t * 3.2 + (p.role === 'ballL' ? 0 : 1.5))) * 0.4;
        root.position.set(at.x, y, at.z);
        root.rotation.y = Math.atan2(ball.position.x - at.x, ball.position.z - at.z);
      } else if (p.role === 'ring') {
        // 浮き輪で波に揺られる
        const x = 2.4 + Math.sin(t * 0.5) * 1.2;
        const z = -6.5;
        ring.position.set(x, 0.05 + Math.sin(t * 2) * 0.12, z);
        root.position.set(x, 0.1 + Math.sin(t * 2) * 0.12, z);
        root.rotation.z = Math.sin(t * 1.3) * 0.2;
      } else if (p.role === 'melon') {
        // 目かくしでスイカ割り（ぜんぜん当たらない）
        const x = 3.9 + Math.sin(t * 0.7) * 0.3;
        const z = 1.4;
        root.position.set(x, 0, z);
        root.rotation.y = Math.sin(t * 0.9) * 1.2;
        melon.position.set(4.4, 0.45, 0.5);
        stick.position.set(x + Math.sin(root.rotation.y) * 0.6, 1.6, z + Math.cos(root.rotation.y) * 0.6);
        stick.rotation.x = -0.5 + Math.abs(Math.sin(t * 4)) * 1.4;
        stick.rotation.y = root.rotation.y;
      }
      stepAnim(p.anim, { moving: false, airborne: y > 0.05, dt });
      p.model.apply(p.anim);
    }
  }

  return {
    pausable: false,
    enter() {
      if (!world) build();
      buildDom();
      ctx.setWorld(world);
      baseFov = camera.fov;
      try {
        state = typeof ctx.paintings === 'function' ? ctx.paintings() : { earned: [] };
      } catch {
        state = { earned: [] };
      }
      // 最初は手に入れた絵のうち最初のものを選ぶ
      const first = PAINTING_REWARDS.findIndex((r) => hasPainting(state, r.paintingId));
      sel = first >= 0 ? first : 0;
      placePals();
      el.classList.remove('hidden');
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.add('hidden');
      ctx.ui.setHint('');
      render();
    },
    update(dt) {
      t += dt;
      if (input.wasPressed('Escape', 'Backspace')) {
        sfx('confirm');
        ctx.goto('title', {});
        return;
      }
      const dirs = [['left', 'ArrowLeft', 'KeyA'], ['right', 'ArrowRight', 'KeyD'], ['up', 'ArrowUp', 'KeyW'], ['down', 'ArrowDown', 'KeyS']];
      for (const [d, ...keys] of dirs) {
        if (input.wasPressed(...keys)) {
          sel = gmMove(sel, d);
          sfx('talk');
          render();
        }
      }
      // くつろぐ: ときどき飲み物に手をのばすように小さく揺れる
      stepAnim(heroAnim, { moving: false, airborne: false, dt });
      hero.apply(heroAnim);
      fitGlasses();
      hero.root.position.y = 0.62 + Math.sin(t * 1.2) * 0.03;
      animatePals(dt);
      // カメラ: 浜を右の細い欄に収める（左は絵の欄）。ゆっくり横に流す
      // 細い欄の真ん中に、くつろぐ主人公が来るように狙う
      camera.position.set(2.5 + Math.sin(t * 0.15) * 0.3, 3.6, 13.5);
      camera.lookAt(2.5 + Math.sin(t * 0.15) * 0.2, 1.2, 0.8);
      // 絵の欄（左）に隠れないよう、写す中心を右へずらす
      const w = window.innerWidth || 800;
      const h = window.innerHeight || 600;
      // 絵の欄が画面の約7割。浜は右の残りに収める（依頼者の指定: ヌスたちはあくまでサブ）
      camera.setViewOffset(w, h, -w * 0.36, 0, w, h);
      if (camera.fov !== 50) camera.fov = 50;
      camera.updateProjectionMatrix();
    },
    // 試し遊び用の状態
    smokeState() {
      return {
        phase: 'view', sel, earned: collectedCount(state), pals: pals.map((p) => p.id),
      };
    },
    exit() {
      if (el) el.classList.add('hidden');
      camera.clearViewOffset();
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.remove('hidden');
    },
  };
}
