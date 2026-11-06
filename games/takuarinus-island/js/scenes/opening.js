// オープニング: 島の空撮 → 先輩の話 → 回想（3人の番長が仲間をさらう）→ 主人公の決意 → 門を見渡す。
// 初めてスタートしたときに流れる（Enter で次のカット・Esc でとばす）。見終わったら島へ。
import { PALETTE } from '../palette.js';
import { BOSSES } from '../bosses.js';
import { NPCS } from '../npcs.js';
import { buildAlinus, createAnimState, stepAnim } from '../characters.js';
import { createHeroRig } from '../hero-model.js';
import { HUB_TREES } from './hub.js';
import { OPENING_SHOTS, openingAt, nextShotStart } from '../opening-shots.js';
import { loadStory, saveStory, RESCUE_BY_BOSS } from '../story.js';
import { createStoryOverlay } from '../story-overlay.js';

const ISLAND_RADIUS = 19;
const HERO_AT = Object.freeze({ x: 0, z: 5 });
const SENPAI_AT = Object.freeze({ x: 0, z: 1.4 });

export function createOpeningScene(ctx) {
  const { THREE, camera, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const storySfx = (e) => { if (typeof ctx.storySfx === 'function') ctx.storySfx(e); };
  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  let senpai = null;
  const senpaiAnim = createAnimState();
  const villains = []; // {boss, model, anim, captive, captiveModel, angle}
  let overlay = null;
  let t = 0;
  let lastIndex = -1;
  let leaving = false;
  let baseFov = 60;
  let dayBg = null;
  let nightBg = null;

  function build() {
    world = new THREE.Scene();
    dayBg = new THREE.Color(PALETTE.sky);
    nightBg = new THREE.Color(PALETTE.uiShade);
    world.background = dayBg.clone();
    world.fog = new THREE.Fog(PALETTE.sky, 30, 90);
    ctx.addLights(world);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(160, 16), mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS + 1.6, ISLAND_RADIUS + 2.4, 1.2, 16), mat('sand'));
    sand.position.y = -0.65;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 0.3, 1, 16), mat('grass'));
    grass.position.y = -0.5;
    world.add(sea, sand, grass);
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
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1, 8), mat('pedestal'));
    ped.position.set(0, 0.5, -4.5);
    world.add(ped);

    hero = createHeroRig(THREE, mat);
    hero.root.position.set(HERO_AT.x, 0, HERO_AT.z);
    hero.root.rotation.y = Math.PI; // 先輩のほうを向く
    world.add(hero.root);
    const sp = NPCS.find((n) => n.id === 'senpai');
    senpai = buildAlinus(THREE, mat, sp ? sp.shape : { scale: 1.25, pose: 'hips' });
    senpai.root.position.set(SENPAI_AT.x, 0, SENPAI_AT.z);
    senpai.root.rotation.y = 0;
    world.add(senpai.root);

    // 回想に出る番長3人と、さらわれる仲間
    BOSSES.forEach((b, i) => {
      const model = buildAlinus(THREE, mat, { scale: 1.35, pose: 'hips', mohicanColor: b.mohican.colorKey });
      const npc = NPCS.find((n) => n.id === RESCUE_BY_BOSS[b.id]);
      const captiveModel = npc ? buildAlinus(THREE, mat, npc.shape) : null;
      model.root.visible = false;
      world.add(model.root);
      if (captiveModel) {
        captiveModel.root.visible = false;
        world.add(captiveModel.root);
      }
      villains.push({
        boss: b, model, anim: createAnimState(), captiveModel, angle: ((b.gateAngleDeg || i * 120) * Math.PI) / 180, i,
      });
    });
  }

  function finish() {
    if (leaving) return;
    leaving = true;
    const st = loadStory(ctx.storage);
    saveStory(ctx.storage, { ...st, openingSeen: true });
    if (overlay) overlay.hideAll();
    if (!ctx.goto('hub', {})) leaving = false;
  }

  function applyShot(at) {
    const s = at.shot;
    if (at.index !== lastIndex) {
      lastIndex = at.index;
      overlay.caption(s.caption || '', s.caption ? 'title' : '');
      overlay.subtitle(s.sub ? s.sub[0] : '', s.sub ? s.sub[1] : '');
      overlay.mood(s.mood);
      const night = s.mood === 'flashback';
      world.background.copy(night ? nightBg : dayBg);
      world.fog.color.copy(night ? nightBg : dayBg);
      world.fog.near = night ? 8 : 30;
      world.fog.far = night ? 30 : 90;
      for (const v of villains) {
        v.model.root.visible = s.act === 'kidnap';
        if (v.captiveModel) v.captiveModel.root.visible = s.act === 'kidnap';
      }
      senpai.root.visible = s.act !== 'kidnap';
      hero.root.visible = s.act !== 'kidnap';
      if (s.mood === 'flashback') storySfx('reveal');
      else sfx('talk');
    }
  }

  function animate(at, dt) {
    const s = at.shot;
    // 先輩: 話すあいだ小さく弾む
    const talk = s.sub ? Math.abs(Math.sin(t * 7)) * 0.08 : 0;
    stepAnim(senpaiAnim, { moving: false, airborne: false, dt });
    senpai.apply(senpaiAnim);
    senpai.root.position.y = talk;
    // 主人公: 決意のカットでぴょんと跳ねる
    const hop = s.act === 'heroFist' ? Math.abs(Math.sin(at.local * 4)) * 0.5 : 0;
    stepAnim(heroAnim, { moving: false, airborne: hop > 0.05, vy: 0, dt });
    hero.apply(heroAnim);
    hero.root.position.y = hop;
    // 回想: 番長が仲間を頭の上にかかえて、それぞれの門の方へ走り去る
    if (s.act === 'kidnap') {
      const k = Math.min(1, at.local / s.dur);
      for (const v of villains) {
        const r = 3.2 + k * 15;
        const a = v.angle;
        const x = Math.cos(a) * r;
        const z = -3 + Math.sin(a) * r * 0.6;
        stepAnim(v.anim, { moving: true, airborne: false, dt, dash: true });
        v.model.apply(v.anim);
        v.model.root.position.set(x, Math.abs(Math.sin(t * 10 + v.i)) * 0.25, z);
        v.model.root.rotation.y = Math.atan2(Math.cos(a), Math.sin(a) * 0.6);
        if (v.captiveModel) {
          v.captiveModel.root.position.set(x, 2.4 + Math.sin(t * 12 + v.i) * 0.15, z);
          v.captiveModel.root.rotation.z = Math.sin(t * 14 + v.i) * 0.5; // じたばた
        }
      }
    }
  }

  return {
    pausable: false,
    enter() {
      if (!world) build();
      if (!overlay) overlay = createStoryOverlay();
      ctx.setWorld(world);
      baseFov = camera.fov;
      t = 0;
      lastIndex = -1;
      leaving = false;
      overlay.letterbox(true);
      overlay.skipHint('Enter: つぎへ　Esc: とばす');
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.add('hidden');
      ctx.ui.setHint('');
    },
    update(dt) {
      if (leaving) return;
      t += dt;
      if (input.wasPressed('Escape')) {
        finish();
        return;
      }
      if (input.wasPressed('Enter', 'NumpadEnter', 'Space')) t = nextShotStart(t);
      const at = openingAt(t);
      if (at.done) {
        finish();
        return;
      }
      applyShot(at);
      animate(at, dt);
      const sh = at.shot.shake || 0;
      camera.position.set(at.pos.x + Math.sin(t * 13) * sh, at.pos.y + Math.sin(t * 17) * sh, at.pos.z);
      camera.lookAt(at.look.x, at.look.y, at.look.z);
      camera.rotateZ(at.roll);
      if (camera.fov !== at.fov) {
        camera.fov += (at.fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
    },
    // 試し遊び用の状態（いまのカット・経過秒）
    smokeState() {
      const at = openingAt(t);
      return { phase: at.done ? 'done' : `shot${at.index + 1}`, shots: OPENING_SHOTS.length, t };
    },
    exit() {
      if (overlay) overlay.hideAll();
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
      const hud = document.getElementById('ui-hud');
      if (hud) hud.classList.remove('hidden');
      ctx.ui.setHint('');
    },
  };
}
