// レバガチャファイターヌスの2人の体。主人公は FBX モデル（hero-model.js）の骨を回し、
// ムキムキヌスは箱・球・円柱の部品を回す。角度表は lf-pose.js。
// three.js は ctx.THREE から受け取る（読み込み時に DOM・three.js に触らない）。
import { PALETTE } from './palette.js';
import { createHeroRig, applyMohawkColor } from './hero-model.js';
import { createAnimState, stepAnim, HERO_HEIGHT } from './characters.js';
import { attachHeroFace } from './opponent-faces.js';
import { mirrorPose } from './lf-pose.js';

export const LF_HERO_HEIGHT = 1.7;
export const LF_FOE_HEIGHT = 2.0;
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const TURN_TO_CAMERA = 0.35;

/** 向き（+1: 右、-1: 左）→ 体の回転。少しカメラのほうへ向ける */
export function yawForFacing(facing) {
  return facing >= 0 ? Math.PI / 2 - TURN_TO_CAMERA : -Math.PI / 2 + TURN_TO_CAMERA;
}

const norm = (s) => String(s || '').split(/[:|]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');

function findBones(root) {
  const bones = new Map();
  const all = new Map();
  root.traverse((o) => {
    const k = norm(o.name);
    if (!k) return;
    if (o.isBone && !bones.has(k)) bones.set(k, o);
    if (!all.has(k)) all.set(k, o);
  });
  const f = (names) => {
    for (const n of names) {
      const o = bones.get(n) || all.get(n);
      if (o) return o;
    }
    return null;
  };
  const side = (s) => {
    const long = s === 'l' ? 'left' : 'right';
    return {
      arm: f([`upperarm${s}`, `${long}upperarm`, `${long}arm`]),
      fore: f([`lowerarm${s}`, `${long}lowerarm`, `${long}forearm`]),
      hand: f([`hand${s}`, `${long}hand`]),
      thigh: f([`upperleg${s}`, `${long}upperleg`, `${long}upleg`, `${long}thigh`]),
      shin: f([`lowerleg${s}`, `${long}lowerleg`, `${long}leg`, `${long}shin`]),
      foot: f([`foot${s}`, `${long}foot`]),
    };
  };
  return {
    hips: f(['hips', 'hip', 'pelvis']),
    spine: f(['spine', 'spine1']),
    chest: f(['chest', 'upperchest', 'spine2']),
    neck: f(['neck']),
    head: f(['head']),
    L: side('l'),
    R: side('r'),
  };
}

function wrap(THREE) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  return { root, tilt };
}

/** 主人公（FBX）。読み込みまでは手作りの主人公を歩かせる */
export function createHeroFighter3d(ctx) {
  const { THREE, mat } = ctx;
  const scale = LF_HERO_HEIGHT / HERO_HEIGHT;
  const rig = createHeroRig(THREE, mat, { scale });
  const { root, tilt } = wrap(THREE);
  tilt.add(rig.root);
  const shadow = ctx.makeShadow(0.9);
  const anim = createAnimState();
  let joints = null;
  let yaw = yawForFacing(1);
  const tq = new THREE.Quaternion();

  function capture() {
    const base = rig.root;
    base.updateMatrixWorld(true);
    const B = findBones(rig.real.orient || base);
    const out = {};
    if (!B.L.arm && !B.L.thigh) return out;
    const V = THREE.Vector3;
    const rootQ = base.getWorldQuaternion(new THREE.Quaternion());
    const toRoot = (o) => base.worldToLocal(o.getWorldPosition(new V()));
    const hipsX = B.hips ? toRoot(B.hips).x : 0;
    const fwd = new V(0, 0, 1);
    const mk = (bone, child, defY, fallbackSign) => {
      if (!bone) return null;
      const p = toRoot(bone);
      let dir = child ? toRoot(child).sub(p) : new V(0, defY, 0);
      if (dir.lengthSq() < 1e-10) dir = new V(0, defY, 0);
      dir.normalize();
      const sw = dir.clone().cross(fwd);
      if (sw.lengthSq() < 1e-8) sw.set(1, 0, 0);
      sw.normalize();
      const toLocal = bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rootQ);
      return {
        bone,
        base: bone.quaternion.clone(),
        swing: sw.applyQuaternion(toLocal).normalize(),
        out: new V(0, 0, 1).applyQuaternion(toLocal).normalize(),
        up: new V(0, 1, 0).applyQuaternion(toLocal).normalize(),
        sign: Math.sign(p.x - hipsX) || fallbackSign,
      };
    };
    const firstChild = (o) => (o ? o.children.find((ch) => ch.isBone) || null : null);
    out.spine = mk(B.spine, B.chest || B.neck || B.head, 1, 1);
    if (B.chest && B.chest !== B.spine) out.chest = mk(B.chest, B.neck || B.head, 1, 1);
    if (B.head) out.head = mk(B.head, null, 1, 1);
    for (const [key, s, sg] of [['L', B.L, 1], ['R', B.R, -1]]) {
      out[`arm${key}`] = mk(s.arm, s.fore, -1, sg);
      out[`fore${key}`] = mk(s.fore, s.hand || firstChild(s.fore), -1, sg);
      out[`thigh${key}`] = mk(s.thigh, s.shin, -1, sg);
      out[`shin${key}`] = mk(s.shin, s.foot, -1, sg);
    }
    return out;
  }

  function applyJoints(table) {
    for (const key of Object.keys(joints)) {
      const j = joints[key];
      if (!j) continue;
      const p = table[key] || ZERO;
      const q = j.bone.quaternion;
      q.copy(j.base);
      if (p.x) q.multiply(tq.setFromAxisAngle(j.swing, p.x));
      if (p.z) q.multiply(tq.setFromAxisAngle(j.out, j.sign * p.z));
      if (p.y) q.multiply(tq.setFromAxisAngle(j.up, p.y));
    }
  }

  return {
    root,
    shadow,
    rig,
    height: LF_HERO_HEIGHT,
    addTo(world) {
      world.add(root, shadow);
    },
    setMohawk(color) {
      applyMohawkColor(rig, color);
    },
    /** b: {x,y,vy,facing}、state: 状態名、table: poseFor の表、fx: bodyFor の結果 */
    sync(b, state, table, fx, dt) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      const tb = b.facing < 0 ? mirrorPose(table) : table;
      rig.pose = null; // 真剣勝負：ふざけたポーズはとらない
      if (rig.real) {
        rig.body.position.set(0, 0, 0);
        rig.body.rotation.set(0, 0, 0);
        if (!joints) joints = capture();
        applyJoints(tb);
      } else {
        stepAnim(anim, {
          moving: state === 'walk', airborne: b.y > 0, vy: b.vy || 0, dt: d,
        });
        rig.apply(anim);
      }
      const target = yawForFacing(b.facing);
      yaw += (target - yaw) * Math.min(1, d * 14);
      root.position.set(b.x, b.y + (fx.dy || 0) * LF_HERO_HEIGHT, 0);
      root.rotation.y = yaw + (fx.spin || 0);
      tilt.rotation.x = -(fx.tilt || 0);
      shadow.position.set(b.x, 0.07, 0);
      shadow.scale.setScalar(0.9 / (1 + b.y * 0.4));
    },
    snapYaw(facing) {
      yaw = yawForFacing(facing);
    },
  };
}

/** ムキムキヌス：筋肉質の大きな体（肌・黒髪・白いタンクトップ）。顔は主人公と同じ */
export function createFoeFighter3d(ctx) {
  const { THREE, mat } = ctx;
  const M = (n) => new THREE.MeshLambertMaterial({ color: new THREE.Color(n) });
  const skin = M(PALETTE.lfFoeSkin);
  const top = M(PALETTE.lfFoeTop);
  const shorts = M(PALETTE.lfFoeShorts);
  const hair = M(PALETTE.lfFoeHair);
  const belt = mat('scarf');
  const shoe = M('dimgray');
  const { root, tilt } = wrap(THREE);
  const body = new THREE.Group();
  tilt.add(body);
  const mesh = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const HIP_Y = 0.97;
  const hips = group(body, 0, HIP_Y, 0);
  mesh(hips, new THREE.BoxGeometry(0.56, 0.22, 0.36), shorts, 0, -0.05, 0);
  mesh(hips, new THREE.BoxGeometry(0.58, 0.07, 0.38), belt, 0, 0.07, 0);
  const spine = group(hips, 0, 0.05, 0);
  mesh(spine, new THREE.BoxGeometry(0.54, 0.38, 0.34), skin, 0, 0.18, 0);
  mesh(spine, new THREE.BoxGeometry(0.58, 0.4, 0.37), top, 0, 0.2, 0);
  const chest = group(spine, 0, 0.35, 0);
  mesh(chest, new THREE.BoxGeometry(0.7, 0.32, 0.42), top, 0, 0.12, 0);
  for (const sx of [-1, 1]) {
    const pec = mesh(chest, new THREE.SphereGeometry(0.15, 10, 8), top, sx * 0.14, 0.14, 0.15);
    pec.scale.set(1, 0.75, 0.6);
    const trap = mesh(chest, new THREE.SphereGeometry(0.12, 8, 6), skin, sx * 0.17, 0.28, -0.02);
    trap.scale.set(1.2, 0.6, 1);
  }
  mesh(chest, new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), skin, 0, 0.33, 0);
  const head = group(chest, 0, 0.38, 0);
  mesh(head, new THREE.SphereGeometry(0.17, 14, 10), skin, 0, 0.13, 0);
  const cap = mesh(head, new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.15, -0.01);
  cap.scale.set(1.02, 1, 1.02);
  attachHeroFace(THREE, mat, head, { y: 0.12, z: 0.165, scale: 0.48 });

  const parts = { spine, chest, head };
  const signs = {};
  for (const [key, sx] of [['L', 1], ['R', -1]]) {
    mesh(chest, new THREE.SphereGeometry(0.14, 10, 8), skin, sx * 0.4, 0.2, 0);
    const arm = group(chest, sx * 0.42, 0.2, 0);
    mesh(arm, new THREE.CylinderGeometry(0.11, 0.09, 0.32, 8), skin, 0, -0.16, 0);
    mesh(arm, new THREE.SphereGeometry(0.1, 8, 6), skin, 0, -0.13, 0.04);
    const fore = group(arm, 0, -0.32, 0);
    mesh(fore, new THREE.CylinderGeometry(0.09, 0.07, 0.3, 8), skin, 0, -0.15, 0);
    mesh(fore, new THREE.SphereGeometry(0.085, 8, 6), skin, 0, -0.33, 0);
    const thigh = group(hips, sx * 0.16, -0.04, 0);
    mesh(thigh, new THREE.CylinderGeometry(0.14, 0.11, 0.46, 8), skin, 0, -0.23, 0);
    mesh(thigh, new THREE.CylinderGeometry(0.15, 0.15, 0.2, 8), shorts, 0, -0.08, 0);
    const shin = group(thigh, 0, -0.46, 0);
    mesh(shin, new THREE.CylinderGeometry(0.1, 0.075, 0.42, 8), skin, 0, -0.21, 0);
    mesh(shin, new THREE.BoxGeometry(0.15, 0.08, 0.26), shoe, 0, -0.45, 0.05);
    parts[`arm${key}`] = arm;
    parts[`fore${key}`] = fore;
    parts[`thigh${key}`] = thigh;
    parts[`shin${key}`] = shin;
    for (const k of ['arm', 'fore', 'thigh', 'shin']) signs[`${k}${key}`] = sx;
  }
  const TRUNK = new Set(['spine', 'chest', 'head']);
  const shadow = ctx.makeShadow(1.2);
  let yaw = yawForFacing(-1);
  let breath = 0;

  return {
    root,
    shadow,
    height: LF_FOE_HEIGHT,
    addTo(world) {
      world.add(root, shadow);
    },
    sync(b, state, table, fx, dt) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      breath += d;
      const tb = b.facing < 0 ? mirrorPose(table) : table;
      for (const key of Object.keys(parts)) {
        const g = parts[key];
        const p = tb[key] || ZERO;
        if (TRUNK.has(key)) g.rotation.set(p.x, p.y, p.z);
        else g.rotation.set(-p.x, p.y, (signs[key] || 1) * p.z);
      }
      chest.scale.set(1 + Math.sin(breath * 2.6) * 0.015, 1, 1 + Math.sin(breath * 2.6) * 0.02);
      const target = yawForFacing(b.facing);
      yaw += (target - yaw) * Math.min(1, d * 14);
      root.position.set(b.x, b.y + (fx.dy || 0) * LF_FOE_HEIGHT, 0);
      root.rotation.y = yaw + (fx.spin || 0);
      tilt.rotation.x = -(fx.tilt || 0);
      shadow.position.set(b.x, 0.07, 0);
      shadow.scale.setScalar(1.2 / (1 + b.y * 0.4));
    },
    snapYaw(facing) {
      yaw = yawForFacing(facing);
    },
  };
}
