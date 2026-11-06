// 館に初めて入ったときのイベント（依頼者の指摘 2026-11-04）。
// 暗い広間 → 奥の9枚の絵がつぎつぎに光り、ビッグヌスが飛び出す → ひとりずつ寄って宣戦布告 →
// 9人そろって見得を切る引きの画。Esc でとばせる。見終わると館（広間の入口）へ。
import { PALETTE } from '../palette.js';
import { createHeroRig } from '../hero-model.js';
import { createAnimState, stepAnim } from '../characters.js';
import { buildCastModel } from '../cast-build.js';
import { getCast } from '../cast-defs.js';
import { getTextures } from '../textures.js';
import { MANSION_BOSSES } from '../paintings.js';
import {
  loadStory, saveStory, mansionIntroAt, MANSION_INTRO_TOTAL, MANSION_INTRO_LINES,
} from '../story.js';
import { createStoryOverlay } from '../story-overlay.js';

const HERO_Z = 7;
const ARC_R = 6.5;
const ARC_CZ = -1;
const WALL_Z = -11;

/** 9人の立ち位置（主人公の前の弧。左から右） */
export function introSpots(n = MANSION_INTRO_LINES.length) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + 0.25 + ((Math.PI - 0.5) * i) / Math.max(1, n - 1);
    out.push({ x: Math.cos(a) * ARC_R, z: ARC_CZ + Math.sin(a) * ARC_R });
  }
  return out;
}

/** castId → 画面に出す名前（館のボスの名前） */
export function introName(castId) {
  const b = Object.values(MANSION_BOSSES).find((m) => m.castId === castId);
  return b ? b.name : castId;
}

const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

export function createMansionIntroScene(ctx) {
  const { THREE, camera, input } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const storySfx = (e) => { if (typeof ctx.storySfx === 'function') ctx.storySfx(e); };
  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  const foes = [];
  const frames = [];
  let lamp = null;
  let overlay = null;
  let t = 0;
  let last = '';
  let lastWho = -1;
  let leaving = false;
  const shot = { x: 0, y: 2, z: 12, lx: 0, ly: 1.5, lz: 0 };

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.uiShade);
    world.fog = new THREE.Fog(PALETTE.uiShade, 18, 46);
    ctx.addLights(world);
    lamp = new THREE.PointLight(PALETTE.mohicanRed, 0, 30);
    lamp.position.set(0, 6, -4);
    world.add(lamp);
    const tx = getTextures(THREE);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 32), tx.material('checker', { repeat: [5, 5] }));
    floor.rotation.x = -Math.PI / 2;
    world.add(floor);
    const brick = tx.material('brick', { repeat: [1, 2] });
    const SEG = 24;
    for (let k = 0; k < SEG; k++) {
      const a = (k * Math.PI * 2) / SEG;
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7, 0.4), brick);
      m.position.set(Math.cos(a) * 15, 3.5, Math.sin(a) * 15 - 2);
      m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      world.add(m);
    }
    // 奥の壁の9枚の絵（光って、中からビッグヌスが飛び出す）
    const spots = introSpots();
    MANSION_INTRO_LINES.forEach((e, i) => {
      const fx = (i - 4) * 2.6;
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(2.1, 1.6),
        new THREE.MeshBasicMaterial({ color: PALETTE.frameGold, transparent: true, opacity: 1 }),
      );
      frame.position.set(fx, 3.2, WALL_Z);
      world.add(frame);
      frames.push(frame);
      const def = getCast(e.castId);
      const model = def ? buildCastModel(THREE, def) : null;
      if (!model) return;
      model.root.visible = false;
      world.add(model.root);
      const shadow = ctx.makeShadow(1.2);
      shadow.visible = false;
      world.add(shadow);
      foes.push({ ...e, i, model, shadow, from: { x: fx, y: 3.2, z: WALL_Z + 0.4 }, to: spots[i], name: introName(e.castId) });
    });
    hero = createHeroRig(THREE, ctx.mat);
    hero.root.position.set(0, 0, HERO_Z);
    hero.root.rotation.y = Math.PI;
    world.add(hero.root);
  }

  function finish() {
    if (leaving) return;
    leaving = true;
    const st = loadStory(ctx.storage);
    saveStory(ctx.storage, { ...st, mansionIntroSeen: true });
    if (overlay) overlay.hideAll();
    if (!ctx.goto('gallery', { fromIntro: true })) leaving = false;
  }

  /** 飛び出しの位置（絵から弧を描いて立ち位置へ） */
  function placeFoe(f, k) {
    const e = ease(k);
    const x = lerp(f.from.x, f.to.x, e);
    const z = lerp(f.from.z, f.to.z, e);
    const y = lerp(f.from.y, 0, e) + Math.sin(Math.PI * k) * 3;
    f.model.root.position.set(x, y, z);
    f.model.root.rotation.y = Math.atan2(-x, HERO_Z - z) + (1 - e) * Math.PI * 4; // くるくる回って着地
    f.shadow.position.set(x, 0.03, z);
  }

  /** カメラを目標の画へ寄せる（急に切らず、短く追いかける） */
  function aim(target, dt, rate) {
    const a = 1 - Math.exp(-dt * rate);
    for (const key of Object.keys(shot)) shot[key] = lerp(shot[key], target[key], a);
  }

  return {
    pausable: false,
    enter() {
      if (!world) build();
      if (!overlay) overlay = createStoryOverlay();
      ctx.setWorld(world);
      t = 0;
      last = '';
      lastWho = -1;
      leaving = false;
      for (const f of foes) {
        f.model.root.visible = false;
        f.shadow.visible = false;
        f.model.root.scale.setScalar(1);
      }
      Object.assign(shot, { x: 0, y: 1.2, z: HERO_Z + 5, lx: 0, ly: 2.4, lz: WALL_Z });
      overlay.letterbox(true);
      overlay.skipHint('Esc: とばす');
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.add('hidden');
      ctx.ui.setHint('');
      try { ctx.music(null); } catch { /* 握りつぶす */ }
    },
    update(dt) {
      if (leaving) return;
      t += dt;
      if (input.wasPressed('Escape')) {
        finish();
        return;
      }
      const at = mansionIntroAt(t);
      if (at.phase !== last) {
        last = at.phase;
        if (at.phase === 'dark') {
          overlay.caption('館の奥から、いやな笑い声が聞こえる……', 'title');
          storySfx('rumble');
        }
        if (at.phase === 'burst') {
          overlay.caption('9人のビッグヌスが 飛び出した！！', 'shock');
          storySfx('reveal');
        }
        if (at.phase === 'roll') overlay.caption('');
        if (at.phase === 'all') {
          overlay.subtitle('', '');
          overlay.caption('絵の中に飛び込んで、9人のビッグヌスを倒せ！', 'title');
          storySfx('reveal');
          sfx('mohawkGet');
        }
      }
      // 絵: 暗い間はつぎつぎに点滅、飛び出したあとは消える
      frames.forEach((fr, i) => {
        let o = 1;
        if (at.phase === 'dark') o = at.k * 9 > i ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i)) : 0.15;
        else if (at.phase === 'burst') o = 1 - at.k * 0.6;
        else o = 0.4;
        fr.material.opacity = o;
      });
      // 赤い明かりがゆらめく
      lamp.intensity = at.phase === 'dark' ? at.k * 30 * (0.6 + 0.4 * Math.sin(t * 13))
        : at.phase === 'burst' ? 40 : at.phase === 'all' ? 30 + 20 * Math.sin(t * 8) : 14;
      world.background.set(PALETTE.uiShade);
      // ビッグヌス
      for (const f of foes) {
        if (at.phase === 'dark') continue;
        f.model.root.visible = true;
        f.shadow.visible = true;
        if (at.phase === 'burst') {
          const k = Math.min(1, Math.max(0, at.k * 1.6 - f.i * 0.07));
          placeFoe(f, k);
        } else {
          placeFoe(f, 1);
          const speaking = at.phase === 'roll' && at.who === f.i;
          const s = speaking ? 1 + Math.abs(Math.sin(t * 10)) * 0.12 : at.phase === 'all' ? 1 + Math.abs(Math.sin(t * 6 + f.i)) * 0.1 : 1;
          f.model.root.scale.set(s, 1 / Math.sqrt(s) + (s - 1), s);
          if (at.phase === 'all') f.model.root.position.y = Math.abs(Math.sin(t * 6 + f.i)) * 0.6;
        }
        if (typeof f.model.update === 'function') f.model.update(t + f.i);
      }
      if (at.phase === 'roll' && at.who !== lastWho) {
        lastWho = at.who;
        const f = foes[at.who];
        if (f) {
          overlay.subtitle(f.name, f.line);
          sfx('talk');
        }
      }
      // カメラ（映画のように）: 主人公の背中ごしに奥の絵 → 飛び出す9人を下から → ひとりずつ寄る → 引きの画
      let target;
      let rate = 3;
      if (at.phase === 'dark') {
        target = { x: 2.6, y: 1.4 + at.k * 0.6, z: HERO_Z + 3.4 - at.k * 1.5, lx: -0.6, ly: 2.8, lz: WALL_Z };
        rate = 1.5;
      } else if (at.phase === 'burst') {
        target = { x: -3, y: 0.6, z: HERO_Z - 1, lx: 0, ly: 3.4, lz: -4 };
        rate = 4;
      } else if (at.phase === 'roll') {
        const f = foes[at.who] || foes[0];
        const p = f.to;
        const dx = 0 - p.x;
        const dz = HERO_Z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const side = at.who % 2 ? 1 : -1;
        const near = 3.1 - at.k * 0.7; // ゆっくり寄る（隣のビッグヌスが手前に入らない近さ）
        target = {
          x: p.x + (dx / d) * near + (-dz / d) * side * 0.45,
          y: 1.7 + (at.who % 3) * 0.2,
          z: p.z + (dz / d) * near + (dx / d) * side * 0.45,
          lx: p.x, ly: 1.25, lz: p.z,
        };
        rate = at.k < 0.15 ? 9 : 4;
      } else {
        // 9人そろって: 主人公の足もとから見上げ、ぐっと引く
        target = { x: 2.2, y: 0.7 + at.k * 2.8, z: HERO_Z + 3 + at.k * 4, lx: -0.4, ly: 2 - at.k * 0.6, lz: -3 };
        rate = 2.5;
      }
      aim(target, dt, rate);
      const shake = at.phase === 'burst' ? 0.25 : at.phase === 'all' ? 0.1 * (1 - at.k) : 0;
      camera.position.set(shot.x + (Math.random() - 0.5) * shake, shot.y + (Math.random() - 0.5) * shake, shot.z);
      camera.lookAt(shot.lx, shot.ly, shot.lz);
      stepAnim(heroAnim, { moving: false, airborne: false, dt });
      hero.apply(heroAnim);
      if (t >= MANSION_INTRO_TOTAL) finish();
    },
    smokeState() {
      const at = mansionIntroAt(t);
      return { phase: at.phase, who: at.who ?? null, t };
    },
    exit() {
      if (overlay) overlay.hideAll();
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.remove('hidden');
      ctx.ui.setHint('');
    },
  };
}
