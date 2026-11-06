// 小説一夜漬けチキンレースの3Dの勉強部屋。小説の場面を包んで、背景を3Dにし、動作に合わせて動かす。
// 文字（本文・問題・選択肢）は小説の場面の HTML がそのまま重なる。色はすべて palette.js から。
import { PALETTE } from './palette.js';
import { createHeroRig } from './hero-model.js';
import { createAnimState } from './characters.js';
import { buildOpponentModel } from './opponent-faces.js';
import { createPose, triggerPose, samplePose } from './novel-room-anim.js';
import { GAME_DRAWINGS } from './drawing-usage.js';
import { buildDrawingFrame } from './drawing-frame.js';

const P = (k) => PALETTE[k];

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hash = (i) => (Math.imul(i + 1, 2654435761) >>> 0);

function buildRoom(THREE, ctx) {
  const w = new THREE.Scene();
  w.background = new THREE.Color(P('fade'));
  w.fog = new THREE.Fog(P('fade'), 6, 14);
  w.add(new THREE.AmbientLight(P('uiDim'), 0.6));
  const lamp = new THREE.PointLight(P('mohicanYellow'), 2.2, 8);
  lamp.position.set(-0.9, 1.6, 0);
  w.add(lamp);
  const L = (map, color) => new THREE.MeshLambertMaterial(map ? { map } : { color });

  const wood = canvasTex(THREE, 64, 64, (g) => {
    g.fillStyle = P('shojiWood'); g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) { const h = hash(i); g.fillStyle = h & 1 ? P('boardDark') : P('board'); g.fillRect(0, h % 64, 64, 1); }
  });
  const floorT = canvasTex(THREE, 64, 64, (g) => {
    g.fillStyle = P('boardDark'); g.fillRect(0, 0, 64, 64);
    g.fillStyle = P('signInk'); for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 1);
  });
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(4, 4);
  const wallT = canvasTex(THREE, 32, 32, (g) => {
    g.fillStyle = P('uiShade'); g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 30; i++) { const h = hash(i + 99); g.fillStyle = P('uiPanel'); g.fillRect(h % 32, (h >>> 8) % 32, 1, 1); }
  });
  const sky = canvasTex(THREE, 64, 48, (g) => {
    g.fillStyle = P('uiBg'); g.fillRect(0, 0, 64, 48);
    for (let i = 0; i < 40; i++) { const h = hash(i + 7); g.fillStyle = P('uiText'); g.fillRect(h % 64, (h >>> 9) % 48, 1, 1); }
    g.fillStyle = P('signFace'); g.beginPath(); g.arc(48, 12, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = P('signInk'); g.lineWidth = 3; g.strokeRect(0, 0, 64, 48); g.fillStyle = P('signInk'); g.fillRect(31, 0, 2, 48); g.fillRect(0, 23, 64, 2);
  });
  const books = canvasTex(THREE, 64, 64, (g) => {
    g.fillStyle = P('boardDark'); g.fillRect(0, 0, 64, 64);
    const cols = [P('mohicanRed'), P('heroMohican'), P('mohicanGreen'), P('frameGold'), P('castPurple')];
    for (let r = 0; r < 4; r++) {
      let x = 2;
      while (x < 60) { const h = hash(x + r * 70); const bw = 3 + (h % 4); g.fillStyle = cols[h % 5]; g.fillRect(x, r * 16 + 3, bw, 12); x += bw + 1; }
      g.fillStyle = P('signInk'); g.fillRect(0, r * 16 + 15, 64, 1);
    }
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), L(floorT));
  floor.rotation.x = -Math.PI / 2; w.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), L(wallT));
  back.position.set(-3, 2, 0); back.rotation.y = Math.PI / 2; w.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), L(wallT));
  side.position.set(0, 2, -3.5); w.add(side);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: sky }));
  win.position.set(-2.98, 2.1, 0); win.rotation.y = Math.PI / 2; w.add(win);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.4), [L(wood), L(wood), L(wood), L(wood), L(books), L(wood)]);
  shelf.position.set(1.2, 1.1, -3.25); w.add(shelf);
  // 壁の額（なかよし・GO GO）
  const [wallA, wallB] = GAME_DRAWINGS.novel;
  if (wallA) {
    const fr = buildDrawingFrame(THREE, wallA, { maxW: 0.9, maxH: 0.75, frameColor: P('boardDark') });
    fr.group.position.set(-2.96, 2.15, -1.75);
    fr.group.rotation.y = Math.PI / 2;
    w.add(fr.group);
  }
  if (wallB) {
    const fr = buildDrawingFrame(THREE, wallB, { maxW: 0.9, maxH: 0.75, frameColor: P('boardDark') });
    fr.group.position.set(-1.6, 2.25, -3.46);
    w.add(fr.group);
  }

  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.4), L(wood));
  desk.position.set(0, 0.8, 0); w.add(desk);
  for (const [x, z] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), L(wood));
    leg.position.set(x, 0.4, z); w.add(leg);
  }
  // 電気スタンド
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 8), L(null, P('goggleFrame')));
  lb.position.set(-0.6, 0.86, 0.45);
  const la = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), L(null, P('goggleFrame')));
  la.position.set(-0.6, 1.1, 0.45);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 8, 1, true), new THREE.MeshBasicMaterial({ color: P('pieceFace'), side: THREE.DoubleSide }));
  shade.position.set(-0.6, 1.36, 0.45);
  w.add(lb, la, shade);

  // 本（左右のページと、めくれるページ）
  const paper = new THREE.MeshLambertMaterial({ color: P('shojiPaper'), side: THREE.DoubleSide });
  const book = new THREE.Group(); book.position.set(0, 0.85, 0);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), paper); left.rotation.x = -Math.PI / 2; left.position.x = -0.15;
  const right = left.clone(); right.position.x = 0.15;
  const pivot = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), paper); leaf.rotation.x = -Math.PI / 2; leaf.position.set(0.15, 0.003, 0);
  pivot.add(leaf); book.add(left, right, pivot); w.add(book);

  // 早押しボタン
  const buttons = {};
  for (const [who, z] of [['hero', 0.5], ['ally', -0.5]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), L(null, who === 'hero' ? P('mohicanRed') : P('mohicanPurple')));
    b.position.set(0.55, 0.87, z); w.add(b); buttons[who] = b;
  }

  // 主人公とタバコヌス（シャボン玉を吹く。タバコは描かない）
  const hero = createHeroRig(THREE, ctx.mat);
  hero.root.position.set(0, 0, 1.25); hero.root.rotation.y = Math.PI; w.add(hero.root);
  // タバコヌス（主人公と同じ顔・タバコは描かずシャボン玉を吹く）
  const ally = buildOpponentModel(THREE, ctx.mat, 'tabakonus');
  ally.root.position.set(0, 0, -1.25); w.add(ally.root);
  const bubbles = [];
  const bubMat = new THREE.MeshBasicMaterial({ color: P('goggleLens'), transparent: true, opacity: 0.45 });
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bubMat); w.add(m); bubbles.push({ m, ph: i / 6 }); }

  const hands = {};
  for (const [who, z] of [['hero', 0.45], ['ally', -0.45]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), L(null, who === 'hero' ? P('heroBody') : P('castPurple')));
    h.position.set(0, 0.95, z); w.add(h); hands[who] = h;
  }
  return {
    world: w, hero, ally, bubbles, hands, buttons, pivot,
  };
}

/** 小説の場面を包む。返すのは同じ場面のオブジェクト */
export function withNovelRoom3d(scene, ctx) {
  if (!scene || typeof document === 'undefined') return scene;
  const { THREE, camera } = ctx;
  let room = null; let t = 0; let on = false; let mo = null; let styleEl = null;
  let poses = { hero: createPose(), ally: createPose() };
  let confetti = [];
  const anim = createAnimState();
  const act = (who, kind) => {
    poses = { ...poses, [who]: triggerPose(poses[who], kind, t) };
    if (kind === 'joy' && room) spawnConfetti(who);
  };
  function spawnConfetti(who) {
    const cols = [P('mohicanRed'), P('mohicanYellow'), P('mohicanGreen'), P('sea'), P('castPink')];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshBasicMaterial({ color: cols[i % 5], side: THREE.DoubleSide }));
      m.position.set(0, 2, who === 'hero' ? 1.2 : -1.2);
      room.world.add(m);
      confetti.push({ m, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 1.8 });
    }
  }
  const onKey = (e) => {
    if (!on || e.repeat) return;
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'KeyB') act('hero', 'flip');
    else if (e.code === 'Space') act('hero', 'buzz');
    else if (/^(Digit|Numpad)[1-4]$/.test(e.code) || e.code === 'KeyE') act('hero', 'think');
  };
  const seen = new WeakSet();
  function scanText(txt) {
    if (/どちらも不正解/.test(txt)) { act('hero', 'sad'); act('ally', 'sad'); } else if (/タバコヌスが正解/.test(txt)) { act('ally', 'joy'); act('hero', 'sad'); } else if (/正解！/.test(txt)) { act('hero', 'joy'); act('ally', 'sad'); } else if (/不正解|ブブー/.test(txt)) { act('hero', 'sad'); } else if (/タバコヌス.*(押|ピンポーン)/.test(txt)) { act('ally', 'buzz'); setTimeout(() => on && act('ally', 'think'), 450); }
  }
  const origEnter = scene.enter; const origUpdate = scene.update; const origExit = scene.exit;
  scene.enter = function enter(...args) {
    const r = typeof origEnter === 'function' ? origEnter.apply(this, args) : undefined;
    try {
      if (!room) room = buildRoom(THREE, ctx);
      ctx.setWorld(room.world);
      on = true; t = 0; poses = { hero: createPose(), ally: createPose() };
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'novel-room3d-style';
        styleEl.textContent = '#novel-root > canvas{display:none !important}#novel-root{background:transparent !important}#novel-root .nv-shelf,#novel-root .nv-lamp,#novel-root .nv-desk,#novel-root .nv-hero,#novel-root .nv-tabako,#novel-root .nv-bubble{display:none !important}';
      }
      document.head.appendChild(styleEl);
      window.addEventListener('keydown', onKey);
      mo = new MutationObserver((list) => {
        for (const m of list) {
          for (const n of m.addedNodes) {
            const node = n.nodeType === 3 ? n.parentNode : n;
            if (!node || seen.has(node)) continue;
            seen.add(node);
            if (typeof node.textContent === 'string' && node.textContent.length < 80) scanText(node.textContent);
          }
          if (m.type === 'characterData' && m.target && m.target.data && m.target.data.length < 80) scanText(m.target.data);
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { console.warn('3Dの勉強部屋を作れません', e); }
    return r;
  };
  scene.update = function update(dt, ...rest) {
    const r = typeof origUpdate === 'function' ? origUpdate.call(this, dt, ...rest) : undefined;
    if (!room || !on) return r;
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(0.05, dt) : 0;
    t += d;
    camera.position.set(2.6, 2.3, 1.9);
    camera.lookAt(0, 0.95, 0);
    const ph = samplePose(poses.hero, t); const pa = samplePose(poses.ally, t);
    room.hero.apply(anim);
    room.hero.root.position.y = ph.jump;
    room.hero.root.rotation.x = -ph.droop * 0.35;
    room.hero.root.rotation.z = ph.tilt * 0.2;
    room.ally.root.position.y = pa.jump + Math.sin(t * 1.6) * 0.02;
    room.ally.root.rotation.x = pa.droop * 0.35;
    room.ally.root.rotation.z = -pa.tilt * 0.2;
    room.ally.update(t);
    const pf = Math.max(ph.flip, pa.flip);
    room.pivot.rotation.z = pf * Math.PI;
    const place = (who, p, z) => {
      const h = room.hands[who];
      if (p.slam > 0) h.position.set(0.55, 0.92 + (1 - p.slam) * 0.25, room.buttons[who].position.z);
      else if (p.flip > 0) h.position.set(0.3 - p.flip * 0.6, 0.9 + Math.sin(p.flip * Math.PI) * 0.15, z);
      else if (p.tilt > 0) h.position.set(0, 1.35, z * 2.4);
      else if (p.jump > 0) h.position.set(0.25, 1.9 + p.jump, z * 2.6);
      else h.position.set(0.2, 0.92, z);
      room.buttons[who].scale.y = 1 - p.slam * 0.6;
    };
    place('hero', ph, 0.45); place('ally', pa, -0.45);
    for (const b of room.bubbles) {
      const k = (t * 0.35 + b.ph) % 1;
      b.m.position.set(0.2 + k * 0.5, 1.4 + k * 1.2, -1.0 + Math.sin(k * 9) * 0.15);
      b.m.scale.setScalar(0.6 + k);
    }
    confetti = confetti.filter((c) => {
      c.life -= d; c.vy -= 3 * d;
      c.m.position.x += c.vx * d; c.m.position.y += c.vy * d; c.m.position.z += c.vz * d;
      c.m.rotation.x += d * 6; c.m.rotation.y += d * 4;
      if (c.life <= 0) { room.world.remove(c.m); return false; }
      return true;
    });
    return r;
  };
  scene.exit = function exit(...args) {
    on = false;
    window.removeEventListener('keydown', onKey);
    if (mo) { mo.disconnect(); mo = null; }
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    if (room) for (const c of confetti) room.world.remove(c.m);
    confetti = [];
    return typeof origExit === 'function' ? origExit.apply(this, args) : undefined;
  };
  if (scene.start === origEnter) scene.start = scene.enter;
  if (scene.tick === origUpdate) scene.tick = scene.update;
  if (scene.stop === origExit) scene.stop = scene.exit;
  if (scene.dispose === origExit) scene.dispose = scene.exit;
  return scene;
}
