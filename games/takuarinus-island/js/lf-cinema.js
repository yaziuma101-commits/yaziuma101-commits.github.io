// 試合の前後の会話の演出（DOM と three.js の薄い利用者）。上下の黒い帯と漫画のコマ割り。
// コマごとにカメラを置いて 3D の舞台を描き、コマの絵（canvas）に写す。台詞は HTML の吹き出し。
// 作るときには DOM・three.js に触らない（show のときに要素を作る）。three.js は ctx.THREE から受け取る。
import { PALETTE } from './palette.js';
import { panelBox, shotCamera, LF_CUTSCENE_SPEAKERS } from './lf-cutscene.js';

const DUST_N = 18;

export function createLfCinema(ctx, env = {}) {
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  let root = null;
  let frame = null;
  let items = [];
  let shown = -1;
  let dust = null;
  let dustWorld = null;
  let time = 0;

  function mk(tag, cls, text) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function build() {
    if (root || !doc) return root;
    root = mk('div', 'hidden');
    root.id = 'lf-cine';
    const top = mk('div', 'lf-cine-bar lf-cine-top');
    frame = mk('div', 'lf-cine-frame');
    const bottom = mk('div', 'lf-cine-bar lf-cine-bottom');
    bottom.append(mk('span', 'lf-cine-keys', 'Enter / Space：次へ　Esc：飛ばす'));
    root.append(top, frame, bottom);
    return root;
  }

  function buildDust() {
    const THREE = ctx && ctx.THREE;
    if (!THREE) return null;
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 6, 4);
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.lfcBurlywood), transparent: true, opacity: 0.45, depthWrite: false,
    });
    const bits = [];
    for (let i = 0; i < DUST_N; i++) {
      const o = new THREE.Mesh(geo, m);
      g.add(o);
      bits.push({
        o, ph: Math.random(), side: i % 2 ? 1 : -1, r: 0.03 + Math.random() * 0.05, dz: (Math.random() - 0.5) * 0.8, sp: 0.25 + Math.random() * 0.3,
      });
    }
    g.userData.bits = bits;
    g.visible = false;
    return g;
  }

  function stepDust(d, actors) {
    if (!dust) return;
    time += d;
    const hx = actors && actors.hero ? actors.hero.x : -2;
    const fx = actors && actors.foe ? actors.foe.x : 2;
    for (const b of dust.userData.bits) {
      const k = (time * b.sp + b.ph) % 1;
      const base = b.side > 0 ? fx : hx;
      b.o.position.set(base - 0.8 + k * 1.6, 0.02 + k * 0.3, b.dz);
      b.o.scale.setScalar(b.r * (0.6 + k));
    }
  }

  function render(it, p, k, world, actors) {
    const r = ctx && ctx.renderer;
    if (!r || !it.cam || !it.g || !world) return;
    const w = it.clip.offsetWidth;
    const h = it.clip.offsetHeight;
    if (!(w > 0 && h > 0)) return;
    const cw = Math.max(48, Math.round(w / 2));
    const ch = Math.max(32, Math.round(h / 2));
    if (it.canvas.width !== cw) it.canvas.width = cw;
    if (it.canvas.height !== ch) it.canvas.height = ch;
    const s = shotCamera(p.shot, k, actors);
    const cam = it.cam;
    cam.fov = s.fov;
    cam.aspect = w / h;
    cam.position.set(s.pos.x, s.pos.y, s.pos.z);
    cam.lookAt(s.look.x, s.look.y, s.look.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    try {
      r.render(world, cam);
      it.g.drawImage(r.domElement, 0, 0, cw, ch);
    } catch {
      // 描けなくても台詞は出す
    }
  }

  return {
    /** 演出を出す（コマはまだ隠れている。update で順に現れる） */
    show(cs, world) {
      if (!build() || !doc.body || !cs) return;
      items = [];
      shown = -1;
      const list = cs.panels.map((p, i) => {
        const box = panelBox(cs.layout[i]);
        const el = mk('div', 'lf-cine-panel');
        el.style.left = `${box.x}%`;
        el.style.top = `${box.y}%`;
        el.style.width = `${box.w}%`;
        el.style.height = `${box.h}%`;
        const clip = mk('div', 'lf-cine-clip');
        clip.style.clipPath = box.clip;
        clip.style.webkitClipPath = box.clip;
        const canvas = mk('canvas', 'lf-cine-shot');
        canvas.width = 160;
        canvas.height = 90;
        clip.append(canvas);
        if (p.text) {
          const who = p.speaker ? ` lf-by-${p.speaker}` : ' lf-cine-cap';
          const say = mk('div', `lf-cine-say lf-at-${p.say.at} lf-side-${p.say.side}${who}`);
          if (p.speaker) say.append(mk('span', 'lf-cine-who', LF_CUTSCENE_SPEAKERS[p.speaker] || ''));
          say.append(mk('span', 'lf-cine-line', p.text));
          clip.append(say);
        }
        el.append(clip);
        let cam = null;
        try {
          cam = new ctx.THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
        } catch {
          cam = null;
        }
        let g = null;
        try {
          g = canvas.getContext('2d');
        } catch {
          g = null;
        }
        items.push({
          el, clip, canvas, g, cam,
        });
        return el;
      });
      frame.replaceChildren(...list);
      if (!root.parentNode) doc.body.append(root);
      root.classList.remove('hidden', 'lf-on');
      void root.offsetWidth;
      root.classList.add('lf-on');
      if (!dust) dust = buildDust();
      if (dust && world && dustWorld !== world) {
        if (dustWorld) dustWorld.remove(dust);
        world.add(dust);
        dustWorld = world;
      }
      if (dust) dust.visible = true;
    },
    /** コマを現し、いまのコマの絵を描く */
    update(cs, world, actors, dt) {
      if (!root || !cs) return;
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      stepDust(d, actors);
      if (cs.index !== shown) {
        items.forEach((it, i) => {
          it.el.classList.toggle('lf-in', i <= cs.index);
          it.el.classList.toggle('lf-cur', i === cs.index);
        });
        shown = cs.index;
      }
      const it = items[cs.index];
      const p = cs.panels[cs.index];
      if (!it || !p || cs.done) return;
      const sec = p.sec > 0 ? p.sec : 1;
      render(it, p, Math.min(1, cs.t / sec), world, actors);
    },
    hide() {
      items = [];
      shown = -1;
      if (dust) {
        dust.visible = false;
        if (dustWorld) dustWorld.remove(dust);
        dustWorld = null;
      }
      if (root) {
        root.classList.add('hidden');
        if (frame) frame.replaceChildren();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    },
  };
}
