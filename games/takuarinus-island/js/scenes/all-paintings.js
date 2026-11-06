// 絵を全部集めたときのイベント: 空が暗くなり、地響きと大きな影……と見せかけて、
// 出てくるのはちびモヒ。「全部集めたね！」と褒めて終わる（肩透かし）。
import { PALETTE } from '../palette.js';
import { NPCS } from '../npcs.js';
import { buildAlinus, createAnimState, stepAnim } from '../characters.js';
import { createHeroRig } from '../hero-model.js';
import { HUB_TREES } from './hub.js';
import {
  loadStory, saveStory, allPaintingsAt, ALL_PAINTINGS_TOTAL, ALL_PAINTINGS_LINES,
} from '../story.js';
import { createStoryOverlay } from '../story-overlay.js';

export function createAllPaintingsScene(ctx) {
  const { THREE, camera, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const storySfx = (e) => { if (typeof ctx.storySfx === 'function') ctx.storySfx(e); };
  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  let chibi = null;
  const chibiAnim = createAnimState();
  let shadow = null; // 迫ってくる大きな影（実はちびモヒの影）
  let overlay = null;
  let t = 0;
  let last = '';
  let leaving = false;
  let day = null;
  let night = null;

  function build() {
    world = new THREE.Scene();
    day = new THREE.Color(PALETTE.sky);
    night = new THREE.Color(PALETTE.uiShade);
    world.background = day.clone();
    world.fog = new THREE.Fog(PALETTE.sky, 25, 80);
    ctx.addLights(world);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(120, 16), mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(19, 19.3, 1, 16), mat('grass'));
    grass.position.y = -0.5;
    world.add(sea, grass);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5);
    const leafGeo = new THREE.IcosahedronGeometry(1.1, 0);
    for (const tr of HUB_TREES) {
      const g = new THREE.Group();
      g.position.set(tr.x, 0, tr.z);
      g.scale.setScalar(tr.s);
      const trunk = new THREE.Mesh(trunkGeo, mat('trunk'));
      trunk.position.y = 0.6;
      const leaf = new THREE.Mesh(leafGeo, mat('leaf'));
      leaf.position.y = 1.8;
      g.add(trunk, leaf);
      world.add(g);
    }
    hero = createHeroRig(THREE, mat);
    hero.root.position.set(-1.8, 0, 3.4); // ちびモヒを隠さないよう少し横に
    hero.root.rotation.y = Math.PI;
    world.add(hero.root);
    const npc = NPCS.find((n) => n.id === 'chibimohi');
    chibi = buildAlinus(THREE, mat, npc ? npc.shape : { scale: 0.6 });
    chibi.root.visible = false;
    world.add(chibi.root);
    shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({
      color: PALETTE.shadow, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.03, -2);
    world.add(shadow);
  }

  function finish() {
    if (leaving) return;
    leaving = true;
    const st = loadStory(ctx.storage);
    saveStory(ctx.storage, { ...st, allPaintingsSeen: true });
    if (overlay) overlay.hideAll();
    if (!ctx.goto('hub', {})) leaving = false;
  }

  return {
    pausable: false,
    enter() {
      if (!world) build();
      if (!overlay) overlay = createStoryOverlay();
      ctx.setWorld(world);
      t = 0;
      last = '';
      leaving = false;
      chibi.root.visible = false;
      shadow.scale.setScalar(1);
      world.background.copy(day);
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
      const at = allPaintingsAt(t);
      if (at.phase !== last) {
        last = at.phase;
        if (at.phase === 'dark') overlay.caption('24枚の絵が……光りはじめた……', 'title');
        if (at.phase === 'rumble') {
          overlay.caption('');
          storySfx('rumble');
        }
        if (at.phase === 'reveal') {
          overlay.caption('な、何かが来る……！！', 'shock');
          storySfx('reveal');
        }
        if (at.phase === 'chibi') {
          overlay.caption('');
          chibi.root.visible = true;
          sfx('mohawkGet');
          overlay.subtitle('ちびモヒ', ALL_PAINTINGS_LINES[0]);
        }
      }
      // 空が暗くなり、影がどんどん大きくなる
      const dark = at.phase === 'dark' ? at.k : at.phase === 'chibi' ? Math.max(0, 1 - at.k * 3) : 1;
      world.background.copy(day).lerp(night, dark * 0.85);
      world.fog.color.copy(world.background);
      if (at.phase === 'rumble' || at.phase === 'reveal') {
        const grow = at.phase === 'rumble' ? 1 + at.k * 6 : 7 + at.k * 3;
        shadow.scale.setScalar(grow);
      } else if (at.phase === 'chibi') {
        shadow.scale.setScalar(Math.max(0.5, 10 * (1 - at.k * 4)));
      }
      if (at.phase === 'chibi' && at.k > 0.5) overlay.subtitle('ちびモヒ', ALL_PAINTINGS_LINES[1]);
      // カメラ: 主人公の足もとから空を見上げる → 揺れ → 正面に戻ってちびモヒを映す
      let cam;
      let look;
      if (at.phase === 'chibi') {
        cam = { x: 4.2, y: 1.3, z: 7.5 };
        look = { x: 0.4, y: 0.5, z: 1.4 };
      } else {
        // 主人公の後ろから、地面に広がる大きな影と暗くなる空を見る（少しずつ見上げる）
        const up = at.phase === 'dark' ? at.k : 1;
        cam = { x: 3.2, y: 1.6 + up * 0.6, z: 9 };
        look = { x: 0, y: 1 + up * 2.5, z: -3 };
      }
      const sh = at.phase === 'rumble' ? 0.15 * at.k : at.phase === 'reveal' ? 0.25 : 0;
      camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z);
      camera.lookAt(look.x, look.y, look.z);
      // ちびモヒ: ぴょんぴょん跳ねて主人公の前へ
      if (chibi.root.visible) {
        const y = Math.abs(Math.sin(t * 6)) * 0.5;
        chibi.root.position.set(0.4, y, Math.min(1.6, -2 + at.k * 8));
        chibi.root.rotation.y = 0;
        stepAnim(chibiAnim, { moving: true, airborne: y > 0.05, dt });
        chibi.apply(chibiAnim);
      }
      stepAnim(heroAnim, { moving: false, airborne: false, dt });
      hero.apply(heroAnim);
      if (t >= ALL_PAINTINGS_TOTAL) finish();
    },
    smokeState() {
      return { phase: allPaintingsAt(t).phase, t };
    },
    exit() {
      if (overlay) overlay.hideAll();
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.remove('hidden');
      ctx.ui.setHint('');
    },
  };
}
