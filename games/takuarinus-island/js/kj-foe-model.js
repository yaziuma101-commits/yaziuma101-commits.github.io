// メガネ星人の怪獣の姿（three.js は引数で受け取る。読み込み時に DOM・three.js に触らない）。
// 前かがみの大きな体・太い脚・背中のとげ・大きな爪・うろこの質感。顔には大きな丸いレンズが2つ。
// 寸法と動きの規則は kj-foe-design.js。色は palette.js だけから取る。
import { PALETTE } from './palette.js';
import {
  FOE_HEIGHT, FOE_BODY, FOE_RAGE, foeSpikes, scaleCells, SCALE_TONES, foeLegSwing, lensShards,
  SHARDS_PER_LENS, SHARD_LIFE,
} from './kj-foe-design.js';

const SHARD_GRAVITY = 30;

function canvasTex(THREE, size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** うろこ（下の段が上の段に重なる。下側の縁に線） */
function drawScales(g, w, h, seed) {
  g.fillStyle = PALETTE.kjFoeHideDark;
  g.fillRect(0, 0, w, h);
  g.lineWidth = 1;
  for (const c of scaleCells(seed, 8, 8)) {
    const cx = c.x * w;
    const cy = c.y * h;
    const r = c.r * w;
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
        g.fillStyle = PALETTE[SCALE_TONES[c.tone]];
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = PALETTE.kjFoeScaleLine;
        g.beginPath();
        g.arc(x, y, r, 0.2, Math.PI - 0.2);
        g.stroke();
      }
    }
  }
}

/** 腹の板（横じま） */
function drawBelly(g, w, h) {
  g.fillStyle = PALETTE.kjFoeBelly;
  g.fillRect(0, 0, w, h);
  g.fillStyle = PALETTE.kjFoeBellyLine;
  for (let y = 3; y < h; y += 8) g.fillRect(0, y, w, 2);
}

/** 柔らかい光の丸（色はスプライトの材質で付ける） */
function glowTex(THREE) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'white');
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * メガネ星人の怪獣の体を作る。足元が原点、+z が正面。
 * 返り値：root・mats・motion（kj-scene の動きを重ねる部品 {lean, head, arms}）・update・breakLenses・repair
 */
export function buildFoeKaiju(THREE, { height = FOE_HEIGHT, seed = 7 } = {}) {
  const H = Number(height) > 0 ? Number(height) : FOE_HEIGHT;
  const B = FOE_BODY;
  const LS = B.lens;
  const u = (v) => v * H;

  const scaleTex = canvasTex(THREE, 64, (g, w, h) => drawScales(g, w, h, seed));
  scaleTex.repeat.set(3, 3);
  const bellyTex = canvasTex(THREE, 32, drawBelly);
  bellyTex.repeat.set(1, 2);
  const glowMap = glowTex(THREE);
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const mats = {
    hide: L({ map: scaleTex }),
    belly: L({ map: bellyTex }),
    spike: L({ color: PALETTE.kjFoeSpike, flatShading: true }),
    claw: L({ color: PALETTE.kjFoeClaw, flatShading: true }),
    mouth: L({ color: PALETTE.kjFoeMouth }),
    rim: L({ color: PALETTE.kjFoeLensRim }),
    lens: L({ color: PALETTE.kjFoeLens }),
    eye: new THREE.MeshBasicMaterial({ color: PALETTE.kjFoeEye }),
    shard: L({
      color: PALETTE.kjFoeShard, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }),
    glow: new THREE.SpriteMaterial({
      map: glowMap, color: PALETTE.kjFoeLensGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }),
    eyeGlow: new THREE.SpriteMaterial({
      map: glowMap, color: PALETTE.kjFoeEye, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }),
  };
  mats.hide.emissive.set(PALETTE.kjHurt);
  mats.hide.emissiveIntensity = 0;
  mats.belly.emissive.set(PALETTE.kjHurt);
  mats.belly.emissiveIntensity = 0;
  mats.spike.emissive.set(PALETTE.kjFoeEye);
  mats.spike.emissiveIntensity = 0;
  mats.lens.emissive.set(PALETTE.kjFoeLensGlow);
  mats.lens.emissiveIntensity = 0.15;

  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const cone = new THREE.ConeGeometry(1, 1, 5);
  cone.translate(0, 0.5, 0);
  const shardGeo = new THREE.TetrahedronGeometry(1, 0);
  const ell = (parent, mat, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(sphere, mat);
    m.position.set(u(x), u(y), u(z));
    m.scale.set(u(rx), u(ry), u(rz));
    parent.add(m);
    return m;
  };
  const spike = (parent, mat, x, y, z, w, len, d, rx) => {
    const m = new THREE.Mesh(cone, mat);
    m.position.set(u(x), u(y), u(z));
    m.scale.set(u(w), u(len), u(d));
    m.rotation.x = rx;
    parent.add(m);
    return m;
  };
  const limb = (r0, r1, len) => {
    const g = new THREE.CylinderGeometry(u(r0), u(r1), u(len), 10);
    g.translate(0, -u(len) / 2, 0);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'kj-foe-kaiju';

  // ---- 太い脚と、爪のある大きな足 ----
  const legs = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(side * u(B.hipX), u(B.hipY), 0);
    root.add(hip);
    ell(hip, mats.hide, 0, 0, 0, B.legR * 1.35, B.legR * 1.35, B.legR * 1.35);
    hip.add(new THREE.Mesh(limb(B.legR * 1.25, B.legR, B.thigh), mats.hide));
    const knee = new THREE.Group();
    knee.position.y = -u(B.thigh);
    hip.add(knee);
    ell(knee, mats.hide, 0, 0, 0, B.legR, B.legR, B.legR);
    knee.add(new THREE.Mesh(limb(B.legR, B.legR * 0.85, B.shin), mats.hide));
    const ankle = new THREE.Group();
    ankle.position.y = -u(B.shin);
    knee.add(ankle);
    ell(ankle, mats.hide, 0, -B.foot.h * 0.5, B.foot.len * 0.3, B.foot.w * 0.5, B.foot.h * 0.6, B.foot.len * 0.6);
    for (const k of [-1, 0, 1]) {
      spike(ankle, mats.claw, k * B.foot.w * 0.3, -B.foot.h * 0.6, B.foot.len * 0.75, 0.02, B.foot.claw, 0.02, Math.PI / 2);
    }
    legs.push({
      side, hip, knee, ankle,
    });
  }

  // ---- 前かがみの胴（腰を軸に前へ倒す）・腹の板・背中のとげ ----
  const lean = new THREE.Group();
  lean.position.y = u(B.hipY);
  root.add(lean);
  const T = B.torso;
  ell(lean, mats.hide, 0, -0.02, -0.03, 0.15, 0.11, 0.15);
  ell(lean, mats.hide, 0, T.y, T.z, T.rx, T.ry, T.rz);
  ell(lean, mats.belly, 0, T.y - 0.03, T.z + T.rz * 0.35, T.rx * 0.78, T.ry * 0.85, T.rz * 0.75);
  for (const s of foeSpikes(B.spikes)) {
    spike(lean, mats.spike, 0, s.y, s.z, s.size * 0.16, s.size, s.size * 0.55, s.tilt);
    if (s.size > 0.06) {
      for (const sx of [-1, 1]) {
        const m = spike(lean, mats.spike, sx * T.rx * 0.35, s.y - 0.01, s.z * 0.94, s.size * 0.1, s.size * 0.45, s.size * 0.3, s.tilt);
        m.rotation.z = -sx * 0.35;
      }
    }
  }

  // ---- 首と頭（大きな丸いレンズ・牙・開く顎） ----
  const head = new THREE.Group();
  head.position.set(0, u(B.neck.y), u(B.neck.z));
  lean.add(head);
  const HD = B.head;
  ell(head, mats.hide, 0, -0.06, -0.03, 0.085, 0.12, 0.085);
  ell(head, mats.hide, 0, 0.03, 0.05, HD.rx, HD.ry, HD.rz);
  ell(head, mats.hide, 0, 0, 0.15, 0.07, 0.045, 0.07);
  ell(head, mats.hide, 0, LS.y + LS.r * 0.95, LS.z - 0.035, 0.1, 0.022, 0.05);
  spike(head, mats.spike, 0, 0.1, 0.02, 0.012, 0.05, 0.03, -0.5);
  for (const tx of [-0.05, -0.025, 0.025, 0.05]) {
    spike(head, mats.claw, tx, -0.035, 0.19 - Math.abs(tx) * 0.6, 0.008, 0.025, 0.008, Math.PI);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -u(0.035), u(0.06));
  head.add(jaw);
  ell(jaw, mats.hide, 0, -0.02, 0.07, 0.065, 0.025, 0.095);
  ell(jaw, mats.mouth, 0, -0.002, 0.07, 0.055, 0.012, 0.085);
  for (const tx of [-0.04, 0, 0.04]) spike(jaw, mats.claw, tx, -0.004, 0.13 - Math.abs(tx) * 0.5, 0.007, 0.02, 0.007, 0);

  const rimGeo = new THREE.TorusGeometry(u(LS.r), u(LS.r * 0.18), 6, 18);
  const diskGeo = new THREE.CylinderGeometry(u(LS.r * 0.92), u(LS.r * 0.92), u(LS.r * 0.25), 18);
  diskGeo.rotateX(Math.PI / 2);
  const lensRefs = [];
  const frameParts = [];
  const sockets = [];
  const glows = [];
  for (const side of [1, -1]) {
    const lg = new THREE.Group();
    lg.position.set(side * u(LS.x), u(LS.y), u(LS.z));
    lg.rotation.y = side * 0.18;
    lg.add(new THREE.Mesh(rimGeo, mats.rim), new THREE.Mesh(diskGeo, mats.lens));
    const gl = new THREE.Sprite(mats.glow);
    gl.position.z = u(LS.r * 0.4);
    gl.scale.setScalar(u(LS.r * 3));
    lg.add(gl);
    glows.push(gl);
    head.add(lg);
    lensRefs.push(lg);
    frameParts.push(lg);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(u(0.01), u(0.012), u(0.12)), mats.rim);
    temple.position.set(side * u(LS.x + LS.r * 0.95), u(LS.y), u(LS.z - 0.06));
    head.add(temple);
    frameParts.push(temple);
    const eye = ell(head, mats.eye, side * LS.x, LS.y, LS.z - LS.r * 0.5, LS.r * 0.45, LS.r * 0.35, LS.r * 0.3);
    eye.visible = false;
    const eg = new THREE.Sprite(mats.eyeGlow);
    eg.position.copy(eye.position);
    eg.position.z += u(LS.r * 0.3);
    eg.scale.setScalar(u(LS.r * 2.5));
    eg.visible = false;
    head.add(eg);
    sockets.push(eye, eg);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(u(2 * (LS.x - LS.r) + 0.01), u(0.012), u(0.012)), mats.rim);
  bridge.position.set(0, u(LS.y + LS.r * 0.3), u(LS.z));
  head.add(bridge);
  frameParts.push(bridge);

  // ---- 腕と大きな爪 ----
  const arms = [];
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * u(B.shoulder.x), u(B.shoulder.y), u(B.shoulder.z));
    lean.add(shoulder);
    ell(shoulder, mats.hide, 0, 0, 0, 0.06, 0.06, 0.06);
    shoulder.add(new THREE.Mesh(limb(B.armR * 1.2, B.armR, B.upperArm), mats.hide));
    const elbow = new THREE.Group();
    elbow.position.y = -u(B.upperArm);
    shoulder.add(elbow);
    ell(elbow, mats.hide, 0, 0, 0, B.armR, B.armR, B.armR);
    elbow.add(new THREE.Mesh(limb(B.armR, B.armR * 0.85, B.foreArm), mats.hide));
    const hand = new THREE.Group();
    hand.position.y = -u(B.foreArm);
    elbow.add(hand);
    ell(hand, mats.hide, 0, -0.015, 0.01, 0.04, 0.03, 0.035);
    for (const k of [-1, 0, 1]) spike(hand, mats.claw, k * 0.022, -0.03, 0.025, 0.012, B.claw, 0.012, Math.PI * 0.8);
    arms.push({
      side, shoulder, elbow, hand,
    });
  }

  root.traverse((o) => {
    o.userData.kjKeep = true;
    o.frustumCulled = false;
  });

  // ---- 動き ----
  let rage = 0;
  let jawOpen = 0;
  let broken = false;
  let pulse = 0;
  let shards = [];

  function clearShards() {
    for (const s of shards) if (s.m.parent) s.m.parent.remove(s.m);
    shards = [];
  }

  function stepShards(d) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const sh = shards[i];
      const m = sh.m;
      sh.life -= d;
      if (m.position.y > sh.rest || sh.v.y > 0) {
        sh.v.y -= SHARD_GRAVITY * d;
        m.position.addScaledVector(sh.v, d);
        m.rotation.x += sh.spin * d;
        m.rotation.z += sh.spin * 0.7 * d;
        if (m.position.y <= sh.rest) {
          m.position.y = sh.rest;
          sh.v.set(0, 0, 0);
        }
      }
      if (sh.life <= 0) {
        if (m.parent) m.parent.remove(m);
        shards.splice(i, 1);
      }
    }
  }

  /** 1 フレーム。s = {pose, glow, broken, roar, walked, gait, hurt} */
  function update(s = {}, dt = 0) {
    const n = Number(dt);
    const d = Number.isFinite(n) && n > 0 ? Math.min(n, 0.1) : 0;
    pulse += d;
    rage += ((broken ? 1 : 0) - rage) * Math.min(1, d * 1.5);
    const P = s && s.pose ? s.pose : {};
    const ax = Array.isArray(P.armX) ? P.armX : [0, 0];
    const el = Array.isArray(P.elbow) ? P.elbow : [0, 0];
    const jt = Math.max(Number(P.jaw) || 0, s && s.roar ? 0.85 : 0, rage * FOE_RAGE.jaw);
    jawOpen += (jt - jawOpen) * Math.min(1, d * 8);
    const hunch = B.hunch + rage * FOE_RAGE.hunch;
    lean.rotation.x = hunch + (Number(P.lean) || 0);
    head.rotation.x = -(B.hunch + rage * FOE_RAGE.hunch * 0.6) + (Number(P.head) || 0);
    jaw.rotation.x = jawOpen * B.jawMax;
    arms.forEach((a, i) => {
      a.shoulder.rotation.x = B.armX + (Number(ax[i]) || 0);
      a.shoulder.rotation.z = a.side * (B.armOut + rage * FOE_RAGE.armOut);
      a.elbow.rotation.x = B.elbowX + (Number(el[i]) || 0);
    });
    const ls = foeLegSwing(s ? s.walked : 0, s ? s.gait : 0);
    legs.forEach((l, i) => {
      l.hip.rotation.x = B.thighX - ls.hips[i];
      l.knee.rotation.x = B.kneeX + ls.knees[i];
      l.ankle.rotation.x = -(l.hip.rotation.x + l.knee.rotation.x);
    });
    const glow = broken ? 0 : Math.max(0, Math.min(1, Number(s && s.glow) || 0));
    mats.lens.emissiveIntensity = 0.15 + 2.4 * glow;
    mats.glow.opacity = glow * 0.95;
    for (const g of glows) g.scale.setScalar(u(LS.r * (3 + 3 * glow)));
    mats.eyeGlow.opacity = rage * (0.55 + 0.35 * Math.sin(pulse * 9));
    mats.spike.emissiveIntensity = rage * (0.18 + 0.12 * Math.sin(pulse * 5));
    const hurt = Math.max(0, Math.min(1, Number(s && s.hurt) || 0));
    mats.hide.emissiveIntensity = hurt * 0.9;
    mats.belly.emissiveIntensity = hurt * 0.9;
    stepShards(d);
  }

  /** レンズが割れて外れる。破片と枠は parent（ふつうは場面の世界）へ落ちる */
  function breakLenses(parent) {
    if (broken) return false;
    broken = true;
    root.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    root.getWorldQuaternion(q);
    const tgt = parent || root.parent;
    const wps = lensRefs.map((lg) => lg.getWorldPosition(new THREE.Vector3()));
    for (const m of frameParts) m.visible = false;
    for (const m of sockets) m.visible = true;
    if (!tgt) return true;
    wps.forEach((wp, li) => {
      const rimM = new THREE.Mesh(rimGeo, mats.rim);
      rimM.position.copy(wp);
      tgt.add(rimM);
      shards.push({
        m: rimM, v: new THREE.Vector3(li === 0 ? 1.5 : -1.5, 3, 4).applyQuaternion(q), spin: 4, life: SHARD_LIFE, rest: u(LS.r * 0.2),
      });
      for (const p of lensShards((seed * 31 + li) >>> 0, SHARDS_PER_LENS)) {
        const m = new THREE.Mesh(shardGeo, mats.shard);
        m.scale.setScalar(p.size);
        m.position.copy(wp);
        tgt.add(m);
        shards.push({
          m, v: new THREE.Vector3(p.vx, p.vy, p.vz).applyQuaternion(q), spin: p.spin, life: SHARD_LIFE, rest: p.size * 0.3,
        });
      }
    });
    return true;
  }

  /** 新しい戦い：レンズを元に戻す */
  function repair() {
    broken = false;
    rage = 0;
    clearShards();
    for (const m of frameParts) m.visible = true;
    for (const m of sockets) m.visible = false;
    mats.eyeGlow.opacity = 0;
    mats.spike.emissiveIntensity = 0;
  }

  return {
    root,
    mats,
    motion: { lean, head, arms: arms.map((a) => ({ shoulder: a.shoulder, side: a.side })) },
    parts: {
      lean, head, jaw, arms, legs,
    },
    update,
    breakLenses,
    repair,
    get broken() { return broken; },
  };
}
