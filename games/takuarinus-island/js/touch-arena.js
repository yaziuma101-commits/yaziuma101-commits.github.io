// モヒカンタッチタッチの舞台（小さな円い土俵・デカ頭アリヌス・審判・観客）。
// three.js は引数で受け取る。読み込み時には DOM・three.js に触らない。
import { PALETTE } from './palette.js';
import { getTextures } from './textures.js';
import { textureRepeat } from './texture-gen.js';
import { attachHeroFace } from './opponent-faces.js';

export const TOUCH_LAYOUT = Object.freeze({
  hero: Object.freeze({ x: 0, z: 0.8 }),
  rival: Object.freeze({ x: 0, z: -0.8 }),
  referee: Object.freeze({ x: 2.3, z: 0 }),
  ringRadius: 3.2,
  crowdRadius: 6.2,
});

/** 殴られた審判の吹っ飛び（放物線＋きりもみ） */
export const REF_FLIGHT = Object.freeze({
  vx: 5.5, vy: 8.5, vz: -3.5, g: 12, spin: 15, twirl: 9,
});

/** 吹っ飛んで t 秒後の審判の位置と回転。着地したら寝そべる */
export function refereeFlightPose(t, start = TOUCH_LAYOUT.referee, floorY = 0.15) {
  const F = REF_FLIGHT;
  const tt = Math.max(0, Number(t) || 0);
  const tLand = (2 * F.vy) / F.g;
  const k = Math.min(tt, tLand);
  const landed = tt >= tLand;
  const y = floorY + F.vy * k - 0.5 * F.g * k * k;
  return {
    x: start.x + F.vx * k,
    y: Math.max(floorY, y),
    z: start.z + F.vz * k,
    rx: landed ? -Math.PI / 2 : F.spin * k,
    ry: -Math.PI / 2 + F.twirl * k,
    rz: landed ? 0 : F.spin * 0.5 * k,
    landed,
  };
}

/** 扇形のモヒカン（前後に伸びる板）。radius は大きさ */
export function mohawkFan(THREE, mat, radius = 1, colorKey = 'heroMohican', stripeKey = 'heroMohicanStripe') {
  const g = new THREE.Group();
  const a = (110 * Math.PI) / 180;
  const s0 = Math.PI / 2 - a / 2;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(Math.cos(s0) * radius, Math.sin(s0) * radius);
  sh.absarc(0, 0, radius, s0, s0 + a, false);
  sh.lineTo(0, 0);
  const depth = 0.12 * radius;
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  const inner = new THREE.Group();
  inner.add(new THREE.Mesh(geo, mat(colorKey)));
  for (const x of [-0.25, 0, 0.25]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.04 * radius, 0.5 * radius, depth * 1.2), mat(stripeKey));
    st.position.set(x * radius, 0.6 * radius, 0);
    inner.add(st);
  }
  inner.rotation.y = Math.PI / 2;
  g.add(inner);
  return g;
}

function limb(THREE, mat, key, len, r) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 6), mat(key));
  m.position.y = -len / 2;
  pivot.add(m);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 8, 6), mat('faceWindow'));
  hand.position.y = -len;
  pivot.add(hand);
  return pivot;
}

/** デカ頭アリヌス：小さな体・大きな頭・巨大なモヒカン。正面は +z */
export function buildDekaAtama(THREE, mat) {
  const root = new THREE.Group();
  const upper = new THREE.Group(); // 腰から上（傾き・しゃがみ用）
  upper.position.y = 0.45;
  root.add(upper);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.45, 6), mat('heroLeg'));
    leg.position.set(s * 0.15, 0.225, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), mat('heroBoots'));
    boot.position.set(s * 0.15, 0.05, 0.04);
    root.add(leg, boot);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.6, 10), mat('heroBody'));
  body.position.y = 0.3;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 10), mat('heroShorts'));
  belt.position.y = 0.04;
  upper.add(body, belt);
  const armL = limb(THREE, mat, 'heroBody', 0.5, 0.07);
  armL.position.set(-0.34, 0.52, 0);
  armL.rotation.z = -0.3;
  const armR = limb(THREE, mat, 'heroBody', 0.5, 0.07);
  armR.position.set(0.34, 0.52, 0);
  armR.rotation.z = 0.3;
  upper.add(armL, armR);
  const head = new THREE.Group();
  head.position.y = 1.2;
  upper.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mat('heroBody'));
  skull.scale.set(1.1, 0.95, 1);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mat('faceWindow'));
  face.scale.set(1.1, 0.8, 0.45);
  face.position.set(0, -0.05, 0.45);
  head.add(skull, face);
  // 顔は主人公と同じテクスチャの顔
  attachHeroFace(THREE, mat, head, { y: -0.05, z: 0.66, scale: 2.4 });
  const mohawk = mohawkFan(THREE, mat, 1.1);
  mohawk.position.y = 0.42;
  head.add(mohawk);
  return {
    root, upper, head, mohawk, armL, armR,
  };
}

/** 審判：モヒカン付きの行司のような小柄なキャラクター */
export function buildReferee(THREE, mat) {
  const root = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 10), mat('castPurple'));
  robe.position.y = 0.42;
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.08, 10), mat('mohicanYellow'));
  sash.position.y = 0.55;
  root.add(robe, sash);
  const head = new THREE.Group();
  head.position.y = 1.0;
  root.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('heroBody')));
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat('faceWindow'));
  face.scale.set(1, 0.85, 0.5);
  face.position.set(0, -0.02, 0.15);
  head.add(face);
  attachHeroFace(THREE, mat, head, { y: -0.02, z: 0.24, scale: 0.9 });
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat('shades'));
  hat.position.set(0, 0.3, -0.04);
  hat.rotation.x = -0.3;
  head.add(hat);
  const moh = mohawkFan(THREE, mat, 0.28, 'mohicanRed', 'scarf');
  moh.position.y = 0.16;
  head.add(moh);
  const arm = new THREE.Group();
  arm.position.set(0.25, 0.75, 0.05);
  root.add(arm);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5), mat('boardDark'));
  stick.position.y = 0.17;
  const gunbai = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.03), mat('mohicanYellow'));
  gunbai.position.y = 0.45;
  arm.add(stick, gunbai);
  // ヘルメット（殴られ慣れた審判用。モヒカンは突き出る）
  const helmet = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('gunBody'));
  dome.position.y = 0.02;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), mat('castWhite'));
  rim.position.y = 0.02;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.46), mat('castWhite'));
  ridge.position.y = 0.25;
  const faceGuard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.035), mat('goggleFrame'));
  faceGuard.position.set(0, -0.09, 0.22);
  helmet.add(dome, rim, ridge, faceGuard);
  helmet.visible = false;
  head.add(helmet);
  return {
    root, head, arm, hat, helmet,
  };
}

function crowdMember(THREE, mat, key) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 8), mat(key));
  body.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(key));
  head.position.y = 0.82;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat('faceWindow'));
  face.scale.set(1, 0.8, 0.5);
  face.position.set(0, 0.8, 0.17);
  const moh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.34), mat('mohicanRed'));
  moh.position.y = 1.12;
  g.add(body, head, face, moh);
  return g;
}

/** 伸びる手（-z 方向へ伸びる腕と手のひら）。set(ext) で 0〜1 の伸び */
export function buildReachArm(THREE, mat, { key = 'heroBody', length = 2.0, pitch = 0.6 } = {}) {
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.x = pitch;
  pivot.add(inner);
  const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
  geo.rotateX(Math.PI / 2);
  const arm = new THREE.Mesh(geo, mat(key));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('faceWindow'));
  inner.add(arm, hand);
  pivot.visible = false;
  return {
    pivot,
    set(ext) {
      const e = Math.max(0, Math.min(1, Number(ext) || 0));
      pivot.visible = e > 0.01;
      const len = Math.max(0.01, length * e);
      arm.scale.z = len;
      arm.position.z = -len / 2;
      hand.position.z = -len;
    },
  };
}

/** 姿勢（傾き・しゃがみ・前のめり・よろけ）を回転と縮みで見せる。forwardSign は相手の方向（+z なら 1） */
export function createPoser(target, { forwardSign = 1, crouchScale = 0.62 } = {}) {
  const st = { lean: 0, fwd: 0, crouch: 0 };
  return {
    st,
    reset() {
      st.lean = 0;
      st.fwd = 0;
      st.crouch = 0;
      target.rotation.set(0, target.rotation.y, 0);
      target.scale.y = 1;
    },
    update(f, dt, t) {
      const k = 1 - Math.exp(-(dt || 0) * 14);
      st.lean += ((f ? f.lean : 0) - st.lean) * k;
      st.fwd += ((f && f.forward ? 1 : 0) - st.fwd) * k;
      st.crouch += ((f && f.crouch ? 1 : 0) - st.crouch) * k;
      const sg = f ? Math.min(1, f.stagger / 0.5) : 0;
      const wob = sg > 0 ? Math.sin(t * 28) * 0.25 * sg : 0;
      target.rotation.z = -st.lean * 0.38 + wob;
      target.rotation.x = forwardSign * (st.fwd * 0.4 - 0.25 * sg);
      target.scale.y = 1 - (1 - crouchScale) * st.crouch;
    },
  };
}

/** 舞台を組み立てる。{world, rival, referee, crowd, update(t)} */
export function buildTouchArena(THREE, { mat, addLights = null, makeShadow = null } = {}) {
  const world = new THREE.Scene();
  world.background = new THREE.Color(PALETTE.sky);
  world.fog = new THREE.Fog(PALETTE.sky, 18, 60);
  if (typeof addLights === 'function') addLights(world);
  const tx = getTextures(THREE);
  const L = TOUCH_LAYOUT;

  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 16), tx.material('grass', { repeat: textureRepeat(80, 80, 3) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  world.add(ground);

  const R = L.ringRadius;
  const sandMat = tx.material('sand', { repeat: textureRepeat(2 * R, 2 * R, 2) });
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.7, 0.3, 28), [mat('sandDark'), sandMat, sandMat]);
  mound.position.y = 0.0;
  world.add(mound);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.09, 6, 32), mat('sandDark'));
  rope.rotation.x = -Math.PI / 2;
  rope.position.y = 0.17;
  world.add(rope);
  for (const z of [-0.45, 0.45]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.06), mat('castWhite'));
    line.position.set(0, 0.16, z);
    world.add(line);
  }
  // 四隅の房
  const tassels = ['mohicanGreen', 'mohicanRed', 'castWhite', 'shades'];
  tassels.forEach((k, i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), mat('trunk'));
    post.position.set(Math.cos(a) * (R + 1.2), 1.4, Math.sin(a) * (R + 1.2));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat(k));
    ball.position.set(post.position.x, 2.6, post.position.z);
    world.add(post, ball);
  });

  const floorY = 0.15;
  const rival = buildDekaAtama(THREE, mat);
  rival.root.position.set(L.rival.x, floorY, L.rival.z);
  world.add(rival.root);
  const referee = buildReferee(THREE, mat);
  referee.root.position.set(L.referee.x, floorY, L.referee.z);
  referee.root.rotation.y = -Math.PI / 2;
  world.add(referee.root);
  if (typeof makeShadow === 'function') {
    for (const [p, s] of [[L.rival, 1.3], [L.referee, 0.8]]) {
      const sh = makeShadow(s);
      sh.position.set(p.x, floorY + 0.02, p.z);
      world.add(sh);
    }
  }

  const colors = ['castPink', 'castOrange', 'mohicanGreen', 'castWhite', 'mohicanYellow', 'castPurple', 'heroBody', 'castGray'];
  const crowd = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    if (Math.sin(a) > 0.75) continue; // カメラ側は空ける
    const m = crowdMember(THREE, mat, colors[i % colors.length]);
    const x = Math.cos(a) * L.crowdRadius;
    const z = Math.sin(a) * L.crowdRadius;
    m.position.set(x, 0, z);
    m.rotation.y = Math.atan2(-x, -z);
    world.add(m);
    crowd.push({ root: m, phase: i * 1.37, speed: 5 + (i % 3) });
  }

  let excite = 0;
  let flight = null;
  function placeReferee(p) {
    referee.root.position.set(p.x, p.y, p.z);
    referee.root.rotation.set(p.rx, p.ry, p.rz);
  }
  return {
    world,
    rival,
    referee,
    crowd,
    floorY,
    /** 観客を沸かせる（だんだん冷める） */
    cheer(amount = 1) {
      excite = Math.min(1.5, excite + amount);
    },
    setRefereeHelmet(on) {
      referee.helmet.visible = !!on;
      referee.hat.visible = !on;
    },
    hasHelmet: () => referee.helmet.visible,
    /** 審判をきりもみで吹っ飛ばす */
    launchReferee() {
      flight = { t: 0 };
    },
    /** 審判を元の位置に戻す */
    resetReferee() {
      flight = null;
      placeReferee(refereeFlightPose(0, L.referee, floorY));
    },
    refereeFlying: () => !!flight && !refereeFlightPose(flight.t, L.referee, floorY).landed,
    update(t, dt = 0) {
      const d = Number.isFinite(dt) ? dt : 0;
      excite = Math.max(0, excite - d * 0.8);
      if (flight) {
        flight.t += d;
        placeReferee(refereeFlightPose(flight.t, L.referee, floorY));
      }
      for (const c of crowd) {
        c.root.position.y = Math.abs(Math.sin(t * c.speed * (1 + excite * 0.6) + c.phase)) * (0.3 + excite * 0.35);
      }
      referee.arm.rotation.z = Math.sin(t * 2) * 0.15;
      rival.head.rotation.z = Math.sin(t * 1.7) * 0.05;
    },
  };
}
