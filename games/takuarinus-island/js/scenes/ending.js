// エンディング場面: 島の上空をカメラが周回、台座のモヒカンが光り、仲間とボスが跳ねて喜ぶ。
// 字幕 → スタッフロール（Enter で飛ばせる）→ クリアの印を保存してタイトルへ。
import { PALETTE } from '../palette.js';
import { BOSSES } from '../bosses.js';
import { NPCS } from '../npcs.js';
// 木の位置と大きさは HUB_TREES（x・z・s）をそのまま使う
import {
  buildAlinus, buildMohicanModel, createAnimState, stepAnim,
} from '../characters.js';
import { createHeroRig } from '../hero-model.js';
import { pedestalSlots, HUB_TREES } from './hub.js';
import {
  createEnding, ENDING_CAPTION, CREDITS_LINES,
} from '../ending.js';
import { fx, FIREWORK_INTERVAL, fireworkSpot } from '../fx.js';
import { CAST } from '../cast-defs.js';
import { buildCastModel } from '../cast-build.js';
import { loadStory, saveStory } from '../story.js';

/** 本当のエンディング（館の9人を倒した後）の字幕 */
export const FINALE_CAPTION = 'おめでとう、タクアリヌス！ 島も世界も救われた！';
const OUTER_RADIUS = 8.2;

const ISLAND_RADIUS = 19;
const PEDESTAL_TOP_Y = 1.245;
const DANCE_RADIUS = 4.6;

export function createEndingScene(ctx) {
  const { THREE, camera, input, mat } = ctx;
  let world = null;
  let hero = null;
  const heroAnim = createAnimState();
  const glows = [];
  const dancers = [];
  let ending = null;
  let t = 0;
  let camR = 18;
  let camH = 11;
  let leaving = false;
  let captionEl = null;
  let creditsEl = null;
  let rollEl = null;
  let fwTimer = 0;
  let fwCount = 0;
  let finale = false;
  let crowd = null; // 本当のエンディングだけ: 島のみんなが外側の輪で祝う
  const fans = [];

  function buildOverlay() {
    if (captionEl) return;
    captionEl = document.createElement('div');
    captionEl.id = 'ending-caption';
    captionEl.className = 'hidden';
    captionEl.textContent = ENDING_CAPTION;

    creditsEl = document.createElement('div');
    creditsEl.id = 'ending-credits';
    creditsEl.className = 'hidden';
    const shade = document.createElement('div');
    shade.className = 'ending-credits-shade';
    rollEl = document.createElement('div');
    rollEl.className = 'ending-credits-roll';
    for (const line of CREDITS_LINES) {
      const d = document.createElement('div');
      d.className = line ? 'ending-credits-line' : 'ending-credits-line spacer';
      d.textContent = line;
      rollEl.appendChild(d);
    }
    creditsEl.append(shade, rollEl);
    document.body.append(captionEl, creditsEl);
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 30, 80);
    ctx.addLights(world);

    const sea = new THREE.Mesh(new THREE.CircleGeometry(120, 16), mat('sea'));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS + 1.6, ISLAND_RADIUS + 2.4, 1.2, 16), mat('sand'));
    sand.position.y = -0.65;
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 0.3, 1, 16), mat('grass'));
    grass.position.y = -0.5;
    world.add(sea, sand, grass);

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5);
    const leafGeo = new THREE.IcosahedronGeometry(1.1, 0);
    for (const t of HUB_TREES) {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.scale.setScalar(t.s);
      const trunk = new THREE.Mesh(trunkGeo, mat('trunk'));
      trunk.position.y = 0.6;
      const leaf = new THREE.Mesh(leafGeo, mat('leaf'));
      leaf.position.y = 1.8;
      g.add(trunk, leaf);
      world.add(g);
    }

    // 台座
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1, 8), mat('pedestal'));
    ped.position.y = 0.5;
    const pedTop = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.25, 8), mat('pedestalTop'));
    pedTop.position.y = 1.12;
    world.add(ped, pedTop);

    // 3本のモヒカン（自分の色で発光する材質を個別に持つ）
    pedestalSlots(null).forEach((s, i) => {
      const m = buildMohicanModel(THREE, mat, s.colorKey);
      const mats = [];
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(PALETTE[s.colorKey]);
        o.material.emissiveIntensity = 0;
        mats.push(o.material);
      });
      m.position.set(s.x, PEDESTAL_TOP_Y + 0.1, s.z);
      m.scale.setScalar(1.4);
      m.rotation.y = Math.atan2(s.x, s.z);
      world.add(m);
      glows.push({ mesh: m, mats, phase: i * 2.1 });
    });

    // 主人公は台座の真ん中に立つ
    hero = createHeroRig(THREE, mat);
    hero.root.position.set(0, PEDESTAL_TOP_Y, 0);
    world.add(hero.root);

    // 仲間4人とボス3体が台座のまわりに輪になる
    const list = [
      ...NPCS.map((n) => ({
        shape: n.shape, shadow: n.shadow || 1.1, height: n.shape && n.shape.form === 'disc' ? 0.45 : 0.9,
      })),
      ...BOSSES.map((b) => ({
        shape: { scale: 1.25, pose: 'hips', mohicanColor: b.mohican.colorKey },
        shadow: 1.5,
        height: 0.8,
      })),
    ];
    const n = list.length;
    list.forEach((d, i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / n;
      const x = Math.cos(a) * DANCE_RADIUS;
      const z = Math.sin(a) * DANCE_RADIUS;
      const model = buildAlinus(THREE, mat, d.shape);
      model.root.position.set(x, 0, z);
      model.root.rotation.y = Math.atan2(-x, -z);
      const sh = ctx.makeShadow(d.shadow);
      sh.position.set(x, 0.02, z);
      world.add(model.root, sh);
      dancers.push({
        model, shadow: sh, shadowScale: d.shadow, height: d.height, phase: i * 0.9, anim: createAnimState(),
      });
    });

    // 外側の輪: 島と館のキャラクター全員（群れは除く）
    crowd = new THREE.Group();
    crowd.visible = false;
    const defs = CAST.filter((c) => !c.crowd);
    defs.forEach((def, i) => {
      const a = (i * Math.PI * 2) / defs.length;
      const x = Math.cos(a) * OUTER_RADIUS;
      const z = Math.sin(a) * OUTER_RADIUS;
      const m = buildCastModel(THREE, def);
      m.root.position.set(x, 0, z);
      m.root.rotation.y = Math.atan2(-x, -z);
      crowd.add(m.root);
      fans.push({ model: m, phase: i * 0.6, x, z });
    });
    world.add(crowd);
  }

  function setHud(visible) {
    // 今の HUD（main.js の #ui-hud）
    const hud = document.getElementById('ui-hud');
    if (hud) hud.classList.toggle('hidden', !visible);
  }

  return {
    enter(params = {}) {
      if (!world) build();
      buildOverlay();
      finale = !!(params && params.finale);
      crowd.visible = finale;
      captionEl.textContent = finale ? FINALE_CAPTION : ENDING_CAPTION;
      ctx.setWorld(world);
      fx.init(world, THREE);
      fwTimer = 0.6;
      fwCount = 0;
      ending = createEnding();
      t = 0;
      camR = 18;
      camH = 11;
      leaving = false;
      captionEl.classList.remove('hidden', 'show');
      creditsEl.classList.add('hidden');
      setHud(false);
      ctx.ui.setHint('');
    },
    update(dt) {
      if (!ending) return;
      t += dt;
      if (input.wasPressed('Enter', 'NumpadEnter')) ending.skip();
      ending.update(dt);
      const phase = ending.phase;

      // カメラ: 島の上空を一定半径でゆっくり周回（スタッフロール中は少し引く）
      const k = Math.min(1, dt * 0.6);
      camR += ((phase === 'celebrate' ? 18 : 24) - camR) * k;
      camH += ((phase === 'celebrate' ? 11 : 16) - camH) * k;
      const a = t * 0.15 + 0.4;
      if (finale && t < 4) {
        // 本当のエンディング: 主人公の足もとから、ぐるっと回り込んで見上げる
        const b = t * 0.5 + 2.2;
        camera.position.set(Math.sin(b) * 3.2, 1.2, Math.cos(b) * 3.2);
        camera.lookAt(0, PEDESTAL_TOP_Y + 1.1, 0);
      } else if (finale && t < 9) {
        // クレーンで上がりながら、みんなの輪が見えるまで引く
        const q = (t - 4) / 5;
        const e = q * q * (3 - 2 * q);
        const b = 4 * 0.5 + 2.2 + (t - 4) * 0.2;
        const r = 3.2 + (camR - 3.2) * e;
        camera.position.set(Math.sin(b) * r, 1.2 + (camH - 1.2) * e, Math.cos(b) * r);
        camera.lookAt(0, 1.6, 0);
      } else {
        camera.position.set(Math.sin(a) * camR, camH, Math.cos(a) * camR);
        camera.lookAt(0, 1.6, 0);
      }
      if (finale) {
        for (const f of fans) {
          f.model.root.position.y = Math.abs(Math.sin(t * 4 + f.phase)) * 0.6;
          if (typeof f.model.update === 'function') f.model.update(t);
        }
      }

      // モヒカンの発光（脈動）
      for (const g of glows) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + g.phase);
        for (const m of g.mats) m.emissiveIntensity = 0.3 + 0.7 * pulse;
        g.mesh.rotation.y += dt * 1.5;
        g.mesh.position.y = PEDESTAL_TOP_Y + 0.1 + Math.sin(t * 2 + g.phase) * 0.08;
      }

      // 仲間とボスが位相をずらして跳ねる
      for (const d of dancers) {
        const s = Math.sin(t * 5 + d.phase);
        const y = Math.abs(s) * d.height;
        const vy = Math.cos(t * 5 + d.phase) * Math.sign(s) * 5 * d.height;
        stepAnim(d.anim, { moving: false, airborne: y > 0.03, vy, dt });
        d.model.apply(d.anim);
        d.model.root.position.y = y;
        d.shadow.scale.setScalar(d.shadowScale / (1 + y * 0.4));
      }

      // 主人公はカメラのほうを向いて小さく跳ねる
      const hs = Math.sin(t * 3);
      const hy = Math.abs(hs) * 0.45;
      stepAnim(heroAnim, { moving: false, airborne: hy > 0.03, vy: Math.cos(t * 3) * Math.sign(hs) * 1.4, dt });
      hero.apply(heroAnim);
      hero.root.position.y = PEDESTAL_TOP_Y + hy;
      hero.root.rotation.y = Math.atan2(camera.position.x, camera.position.z);

      // 花火を一定間隔で打ち上げる（読み込めていなければ何もしない）
      if (phase !== 'done') {
        fwTimer -= dt;
        if (fwTimer <= 0) {
          fwTimer += FIREWORK_INTERVAL;
          if (fwTimer <= 0) fwTimer = FIREWORK_INTERVAL;
          fx.firework(fireworkSpot(fwCount));
          fwCount += 1;
        }
      }
      fx.update(dt);

      // 字幕とスタッフロール
      captionEl.classList.toggle('show', phase === 'celebrate' && t > 1.2);
      creditsEl.classList.toggle('hidden', phase !== 'credits');
      if (phase === 'credits') {
        const p = ending.creditsProgress;
        rollEl.style.top = `${(1 - p) * 100}%`;
        rollEl.style.transform = `translateY(${-p * 100}%)`;
        ctx.ui.setHint('Enter: とばす');
      } else {
        ctx.ui.setHint('');
      }

      if (ending.finished && !leaving) {
        leaving = true;
        if (typeof ctx.markCleared === 'function') ctx.markCleared();
        if (finale) {
          const st = loadStory(ctx.storage);
          saveStory(ctx.storage, { ...st, endingSeen: true });
          ctx.ui.toast('クリアおめでとう！ これからは全部のゲームで「高難易度」に挑めます', 6);
        }
        ctx.goto('title', {});
      }
    },
    exit() {
      if (captionEl) {
        captionEl.classList.remove('show');
        captionEl.classList.add('hidden');
      }
      if (creditsEl) creditsEl.classList.add('hidden');
      fx.dispose();
      setHud(true);
      ctx.ui.setHint('');
    },
  };
}
