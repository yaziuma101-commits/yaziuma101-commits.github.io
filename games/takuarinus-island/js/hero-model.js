// 主人公の FBX モデル（public/models/goodmohawksman-003.fbx）の表示。
// 読み込めないときは手作りの主人公（characters.js）をそのまま使う。
// three.js は引数で受け取る（このファイルは three を静的 import しない）。
import { buildAlinus, HERO_HEIGHT, MODEL_UNIT } from './characters.js';
import { hueFor, recolorImageData, regionForSize } from './mohawk-color.js';
import { onSfxSwap } from './silly-rules.js';
import { pickSillyPose, sillyPoseFrame, shouldPose } from './hero-silly-pose.js';
import { createRng, timeSeed } from './seeded-rng.js';
import { installGalleryRuntime } from './gallery-runtime.js';

export const HERO_MODEL_URL = './models/goodmohawksman-003.fbx';
const ARM_OUT_RAD = (25 * Math.PI) / 180; // 腕を体の外へ何度開いて下げるか
const WALK_SWING_MAX = 0.7; // stepAnim の legSwing の振幅
const LAND_TIME = 0.25; // stepAnim の着地の時間
const FALLBACK_HIP = 1.05 * MODEL_UNIT; // 手作りの主人公の脚の付け根の高さ

/** カートの座席に座る姿勢（骨の角度。正で骨の先が前へ振れる。すねは負で後ろへ曲がる） */
export const SEATED_POSE = Object.freeze({
  thigh: 1.35, shin: -1.05, arm: 0.95, forearm: 0.45, spine: 0.08,
});

let templatePromise = null;

// ---- ふざけたポーズ（主人公の効果音がふざけた音に差し替わったとき） ----
const ACTIVE_WINDOW_MS = 500;
let activeRig = null;
let activeAt = -Infinity;
let sillyHooked = false;
let poseRngFn = null;
let lastPoseId = null;
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** 主人公にふざけたポーズを約 0.6 秒とらせる（id 省略でランダム）。選んだ id を返す */
export function startSillyPose(rig, id) {
  if (!rig || rig.seated) return null;
  if (!poseRngFn) poseRngFn = createRng(timeSeed());
  const pid = id || pickSillyPose(poseRngFn, rig.pose ? rig.pose.id : lastPoseId);
  lastPoseId = pid;
  rig.pose = { id: pid, start: nowMs() };
  return pid;
}

function hookSillySfx() {
  if (sillyHooked) return;
  sillyHooked = true;
  onSfxSwap((orig, played) => {
    if (!shouldPose(orig, played)) return;
    if (!activeRig || nowMs() - activeAt > ACTIVE_WINDOW_MS) return;
    startSillyPose(activeRig);
  });
}

function currentPose(rig) {
  if (!rig.pose) return null;
  const f = sillyPoseFrame(rig.pose.id, (nowMs() - rig.pose.start) / 1000);
  if (!f) rig.pose = null;
  return f;
}

/** 体全体の動き（逆立ち・一回転・跳ね）。体の中心を軸に回す */
function applyBodyPose(body, f, H) {
  if (!f) {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    return;
  }
  const { flip, spin, hop } = f.body;
  body.rotation.set(0, spin, flip);
  body.position.set((H / 2) * Math.sin(flip), (H / 2) * (1 - Math.cos(flip)) + hop, 0);
}

// ---- モヒカンの色（テクスチャの青い画素だけを選んだ色相へ） ----
let defaultMohawk = 'blue';
const mohawkListeners = new Set();
function notifyMohawk(id) {
  for (const fn of mohawkListeners) {
    try {
      fn(id);
    } catch (err) {
      console.warn('モヒカンの色の通知に失敗:', err);
    }
  }
}
/** 既定の色が変わったときに呼ぶ関数を登録する（保存用）。解除する関数を返す */
export function onDefaultMohawkColorChange(fn) {
  if (typeof fn !== 'function') return () => {};
  mohawkListeners.add(fn);
  return () => mohawkListeners.delete(fn);
}
let THREEref = null;
const recolorCache = new WeakMap(); // 元テクスチャ → Map(色 → CanvasTexture)
const sourceCache = new WeakMap(); // 元テクスチャ → { data, w, h }
const FALLBACK_MOHICAN_KEY = Object.freeze({
  red: 'mohicanRed', yellow: 'mohicanYellow', green: 'mohicanGreen',
});

const normColor = (id) => (hueFor(id) === null ? 'blue' : id);

/** これから作る主人公に付ける色 */
export function setDefaultMohawkColor(id) {
  defaultMohawk = normColor(id);
  notifyMohawk(defaultMohawk);
  return defaultMohawk;
}

export function getDefaultMohawkColor() {
  return defaultMohawk;
}

function imageSize(img) {
  if (!img) return null;
  if (img.complete === false) return null;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

function recoloredTexture(THREE, base, colorId) {
  const hue = hueFor(colorId);
  if (hue === null) return base;
  let m = recolorCache.get(base);
  if (m && m.has(colorId)) return m.get(colorId);
  let src = sourceCache.get(base);
  if (!src) {
    const size = imageSize(base.image);
    if (!size) return null; // まだ読み込み中
    const c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    const g = c.getContext('2d');
    g.drawImage(base.image, 0, 0, size.w, size.h);
    src = { data: g.getImageData(0, 0, size.w, size.h).data, w: size.w, h: size.h };
    sourceCache.set(base, src);
  }
  const out = recolorImageData(src.data, src.w, src.h, hue, regionForSize(src.w, src.h));
  const canvas = document.createElement('canvas');
  canvas.width = src.w;
  canvas.height = src.h;
  canvas.getContext('2d').putImageData(new ImageData(out, src.w, src.h), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = base.colorSpace;
  tex.flipY = base.flipY;
  tex.wrapS = base.wrapS;
  tex.wrapT = base.wrapT;
  tex.offset.copy(base.offset);
  tex.repeat.copy(base.repeat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  if (!m) {
    m = new Map();
    recolorCache.set(base, m);
  }
  m.set(colorId, tex);
  return tex;
}

/**
 * 主人公のモヒカンの色を変える。target は createHeroRig の返り値か、その root。
 * colorId を省くと既定の色。'blue' は元のテクスチャに戻す。反映できたら true。
 */
export function applyMohawkColor(target, colorId, tries = 0) {
  let root = null;
  if (target && typeof target.traverse === 'function') root = target;
  else if (target && target.root && typeof target.root.traverse === 'function') root = target.root;
  if (!root) return false;
  const id = colorId === undefined ? defaultMohawk : normColor(colorId);
  if (!root.userData) root.userData = {};
  root.userData.mohawkColor = id;
  const THREE = THREEref;
  const wantsOriginal = hueFor(id) === null;
  let pending = false;
  let found = false;
  let unavailable = false;
  root.traverse((o) => {
    if (!o || !o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      const base = m && m.userData ? m.userData.mohawkBase : null;
      if (!base) continue;
      found = true;
      let tex;
      if (wantsOriginal) {
        // 元の青: 元のテクスチャへ戻すだけ（three.js も canvas も要らない）
        tex = base;
      } else if (!THREE) {
        unavailable = true;
        continue;
      } else {
        try {
          tex = recoloredTexture(THREE, base, id);
        } catch (err) {
          console.warn('モヒカンの色を変えられません:', err);
          tex = base;
        }
      }
      if (!tex) {
        pending = true;
        continue;
      }
      if (m.map !== tex) {
        m.map = tex;
        m.needsUpdate = true;
      }
    }
  });
  if (pending && !unavailable && tries < 40 && typeof setTimeout === 'function') {
    setTimeout(() => {
      if (root.userData.mohawkColor === id) applyMohawkColor(root, id, tries + 1);
    }, 250);
  }
  return found && !pending && !unavailable;
}

// 骨の名前を比べやすくする（"mixamorig:LeftArm" → "leftarm", "upper_arm.L" → "upperarml"）
const norm = (s) => String(s || '').split(/[:|]/).pop().toLowerCase().replace(/[^a-z0-9]/g, '');

function toPixelMaterial(THREE, m, cache) {
  if (!m) return m;
  if (cache.has(m)) return cache.get(m);
  const map = m.map || null;
  if (map) {
    // 64 ビット機風: 拡大・縮小ともにバイリニアで少しぼやけた質感、ミップマップ無し
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }
  const out = new THREE.MeshLambertMaterial({
    map,
    color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || 0,
    side: m.side ?? THREE.FrontSide,
  });
  if (map) out.userData.mohawkBase = map;
  cache.set(m, out);
  return out;
}

function loadTemplate(THREE) {
  if (!templatePromise) {
    templatePromise = (async () => {
      const [fbxMod, skelMod] = await Promise.all([
        import('three/addons/loaders/FBXLoader.js'),
        import('three/addons/utils/SkeletonUtils.js'),
      ]);
      const obj = await new Promise((resolve, reject) => {
        new fbxMod.FBXLoader().load(
          HERO_MODEL_URL,
          resolve,
          undefined,
          () => reject(new Error(`モデルを読めません: ${HERO_MODEL_URL}`)),
        );
      });
      const cache = new Map();
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => toPixelMaterial(THREE, m, cache))
          : toPixelMaterial(THREE, o.material, cache);
      });
      return { obj, clone: skelMod.clone };
    })();
  }
  return templatePromise;
}

function indexNames(root) {
  const bones = new Map();
  const all = new Map();
  root.traverse((o) => {
    const k = norm(o.name);
    if (!k) return;
    if (o.isBone && !bones.has(k)) bones.set(k, o);
    if (!all.has(k)) all.set(k, o);
  });
  return { bones, all };
}

function findRole(maps, names) {
  for (const n of names) {
    const o = maps.bones.get(n) || maps.all.get(n);
    if (o) return o;
  }
  return null;
}

function pickRoles(maps) {
  const f = (names) => findRole(maps, names);
  const side = (s) => {
    const long = s === 'l' ? 'left' : 'right';
    return {
      upperArm: f([`upperarm${s}`, `${long}upperarm`, `${long}arm`]),
      lowerArm: f([`lowerarm${s}`, `${long}lowerarm`, `${long}forearm`]),
      upperLeg: f([`upperleg${s}`, `${long}upperleg`, `${long}upleg`, `${long}thigh`]),
      lowerLeg: f([`lowerleg${s}`, `${long}lowerleg`, `${long}leg`, `${long}shin`]),
      foot: f([`foot${s}`, `${long}foot`]),
    };
  };
  return {
    hips: f(['hips', 'hip', 'pelvis']),
    spine: f(['spine', 'spine1']),
    chest: f(['chest', 'upperchest', 'spine2']),
    head: f(['head']),
    L: side('l'),
    R: side('r'),
  };
}

function firstBone(o) {
  if (!o) return null;
  return o.children.find((c) => c.isBone) || null;
}

/** 骨の回転軸（骨のローカル座標）。骨の向きと前方の外積で決める。正の角度で骨の先が前へ振れる */
function swingAxis(THREE, bone, child, def, fwd) {
  const b = bone.getWorldPosition(new THREE.Vector3());
  const dir = child
    ? child.getWorldPosition(new THREE.Vector3()).sub(b)
    : def.clone();
  if (dir.lengthSq() < 1e-10) dir.copy(def);
  let axis = dir.clone().normalize().cross(fwd);
  if (axis.lengthSq() < 1e-8) axis = new THREE.Vector3(1, 0, 0);
  axis.normalize();
  const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  return axis.applyQuaternion(inv).normalize();
}

/** 骨の向き dir を target へ回す（ワールド座標で回してから、親の空間に直す） */
function alignBone(THREE, obj, bone, dir, target) {
  if (dir.lengthSq() < 1e-10) return;
  const q = new THREE.Quaternion().setFromUnitVectors(
    dir.clone().normalize(),
    target.clone().normalize(),
  );
  const parentQ = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.clone().invert().multiply(q.multiply(worldQ)));
  obj.updateMatrixWorld(true);
}

/** 腕を体の外へ下げ、脚をまっすぐ下ろす（モデルの rest 姿勢をそろえる） */
function correctRestPose(THREE, R, obj) {
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const hipsX = R.hips ? wp(R.hips).x : 0;
  const down = new THREE.Vector3(0, -1, 0);
  for (const [key, s] of [['L', R.L], ['R', R.R]]) {
    if (s.upperLeg && s.lowerLeg) {
      alignBone(THREE, obj, s.upperLeg, wp(s.lowerLeg).sub(wp(s.upperLeg)), down);
    }
    if (s.upperArm && s.lowerArm) {
      const sign = Math.sign(wp(s.upperArm).x - hipsX) || (key === 'L' ? 1 : -1);
      const target = new THREE.Vector3(sign * Math.sin(ARM_OUT_RAD), -Math.cos(ARM_OUT_RAD), 0);
      alignBone(THREE, obj, s.upperArm, wp(s.lowerArm).sub(wp(s.upperArm)), target);
    }
  }
}

/** 前方の向き（+1: モデルの +z が前、-1: −z が前）。つま先の骨の位置で判定する */
function detectFront(THREE, R) {
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  for (const s of [R.L, R.R]) {
    if (!s.foot) continue;
    let toe = null;
    s.foot.traverse((o) => {
      if (!toe && o !== s.foot && /toe/.test(norm(o.name))) toe = o;
    });
    if (!toe) continue;
    const dz = wp(toe).z - wp(s.foot).z;
    if (Math.abs(dz) > 1e-4) return dz > 0 ? 1 : -1;
  }
  return 1;
}

function buildJoints(THREE, R, front) {
  const fwd = new THREE.Vector3(0, 0, front);
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const hipsX = R.hips ? wp(R.hips).x : 0;
  const mk = (bone, child, def, side = 1) => {
    if (!bone) return null;
    const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    return {
      bone,
      rest: bone.quaternion.clone(),
      axis: swingAxis(THREE, bone, child, def, fwd),
      // 体の外へ開く軸（ワールドの z を骨のローカルへ）と、骨のある側
      outAxis: Z.clone().applyQuaternion(inv).normalize(),
      outSign: Math.sign(wp(bone).x - hipsX) || side,
    };
  };
  const limbs = (s, side) => ({
    thigh: mk(s.upperLeg, s.lowerLeg, DOWN, side),
    shin: mk(s.lowerLeg, s.foot, DOWN, side),
    arm: mk(s.upperArm, s.lowerArm, DOWN, side),
    forearm: mk(s.lowerArm, firstBone(s.lowerArm), DOWN, side),
  });
  return {
    spine: mk(R.spine, R.chest || R.head, UP),
    chest: mk(R.chest, R.head, UP),
    L: limbs(R.L, 1),
    R: limbs(R.R, -1),
  };
}

/** テンプレートから 1 体ぶんを作り、身長・足元・向きをそろえる */
function instantiate(THREE, tpl, scale) {
  const obj = tpl.clone(tpl.obj);
  obj.updateMatrixWorld(true);
  const R = pickRoles(indexNames(obj));
  if (!R.L.upperLeg && !R.L.upperArm) throw new Error('人型の骨が見つかりません');

  correctRestPose(THREE, R, obj);
  const front = detectFront(THREE, R);
  const J = buildJoints(THREE, R, front);

  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const height = box.max.y - box.min.y;
  if (!(height > 0) || !Number.isFinite(height)) throw new Error('モデルの高さが取れません');

  const orient = new THREE.Group();
  orient.add(obj);
  orient.rotation.y = front < 0 ? Math.PI : 0;
  orient.scale.setScalar((HERO_HEIGHT * scale) / height);
  orient.updateMatrixWorld(true);
  // 足の裏を地面（y=0）に合わせ、中心を原点へ
  const b2 = new THREE.Box3().setFromObject(orient);
  const c = b2.getCenter(new THREE.Vector3());
  orient.position.set(-c.x, -b2.min.y, -c.z);

  const tmp = new THREE.Quaternion();
  const tmp2 = new THREE.Quaternion();
  const setJoint = (j, angle, out = 0) => {
    if (!j) return;
    j.bone.quaternion.copy(j.rest).multiply(tmp.setFromAxisAngle(j.axis, angle));
    if (out && j.outAxis) j.bone.quaternion.multiply(tmp2.setFromAxisAngle(j.outAxis, j.outSign * out));
  };
  const sides = [[J.L, 1], [J.R, -1]];

  const apply = (anim, pose = null) => {
    const a = anim || {};
    const s = Number.isFinite(a.legSwing) ? a.legSwing : 0;
    const air = !!a.wasAirborne;
    const crouch = Math.min(1, Math.max(0, (a.land || 0) / LAND_TIME));
    const amp = Math.min(1, Math.abs(s) / WALK_SWING_MAX);
    const breathe = Math.sin((performance.now() / 1000) * 1.8) * 0.02;
    // ふざけたポーズ：通常の角度からポーズの角度へ weight で寄せる
    const w = pose && pose.weight > 0 ? pose.weight : 0;
    const pj = w > 0 ? pose.joints : null;
    const mixv = (v, target) => (pj && Number.isFinite(target) ? v + (target - v) * w : v);
    setJoint(J.spine, mixv(0.05 * (a.swingAmp || 0) + breathe, pj && pj.spine));
    setJoint(J.chest, breathe);
    for (const [j, sign] of sides) {
      if (!j) continue;
      const p = pj ? (sign > 0 ? pj.L : pj.R) || {} : {};
      const out = (v) => (pj && Number.isFinite(v) ? v * w : 0);
      // 脚: 歩きは左右が逆位相。ジャンプは脚を曲げ、着地でかがむ
      setJoint(j.thigh, mixv(sign * s + (air ? 0.5 : 0.3 * crouch), p.thigh), out(p.thighOut));
      setJoint(j.shin, mixv(-(air ? 1.0 : 0.05 + 0.4 * amp + 0.5 * crouch), p.shin));
      // 腕: 同じ側の脚と逆位相
      setJoint(j.arm, mixv(-sign * s * 0.5 + (air ? 0.5 : 0), p.arm), out(p.armOut));
      setJoint(j.forearm, mixv(air ? 0.8 : 0.12 + 0.3 * amp, p.forearm));
    }
  };

  // 座り姿勢（カートの座席）: 太ももを前へ上げ、ひざを曲げ、腕はハンドルへ
  const seat = () => {
    const P = SEATED_POSE;
    setJoint(J.spine, P.spine);
    setJoint(J.chest, 0);
    for (const [j] of sides) {
      if (!j) continue;
      setJoint(j.thigh, P.thigh);
      setJoint(j.shin, P.shin);
      setJoint(j.arm, P.arm);
      setJoint(j.forearm, P.forearm);
    }
  };
  // 脚の付け根の高さ（足の裏から）。座席に載せるときに使う
  orient.updateMatrixWorld(true);
  const hipBone = R.L.upperLeg || R.R.upperLeg || R.hips;
  const hy = hipBone ? hipBone.getWorldPosition(new THREE.Vector3()).y : NaN;
  const hipHeight = Number.isFinite(hy) && hy > 0 ? hy : FALLBACK_HIP * scale;

  return {
    orient, apply, seat, hipHeight, head: R.head || null,
  };
}

/**
 * 主人公を作る。返り値は buildAlinus と同じ使い方（root / apply(anim)）。
 * 読み込み完了までは手作りの主人公を表示し、完了後に FBX へ差し替える。
 */
export function createHeroRig(THREE, mat, { scale = 1 } = {}) {
  THREEref = THREE;
  // 館の絵の下ごしらえ・札の絵（ブラウザでだけ、1回だけ入る）
  installGalleryRuntime(THREE);
  const fallback = buildAlinus(THREE, mat, { scale, mohicanColor: FALLBACK_MOHICAN_KEY[defaultMohawk] });
  const root = new THREE.Group();
  root.userData.mohawkColor = defaultMohawk;
  // ふざけたポーズで体全体を回す入れ物（root の位置・向き・むにゅっとは場面側が使う）
  const body = new THREE.Group();
  body.name = 'hero-pose';
  root.add(body);
  body.add(fallback.root);
  hookSillySfx();

  const rig = {
    root,
    body,
    real: null,
    seated: false,
    pose: null,
    // ずっと保つ姿勢（ふざけたポーズと同じ形 {weight, body, joints}）。ギャラリーの「頭の後ろで手を組む」など
    hold: null,
    hipHeight: FALLBACK_HIP * scale,
    /** 頭の骨（読み込み前・見つからないときは null）。サングラスを頭に合わせるのに使う */
    headBone() {
      return rig.real && rig.real.head ? rig.real.head : null;
    },
    apply(anim) {
      activeRig = rig;
      activeAt = nowMs();
      const frame = rig.seated ? null : currentPose(rig) || rig.hold;
      if (rig.seated) rig.pose = null;
      applyBodyPose(body, frame, HERO_HEIGHT * scale);
      if (rig.real) {
        if (rig.seated) rig.real.seat();
        else rig.real.apply(anim, frame);
      } else {
        fallback.apply(anim);
      }
    },
  };

  loadTemplate(THREE)
    .then((tpl) => {
      const real = instantiate(THREE, tpl, scale);
      body.add(real.orient);
      fallback.root.visible = false;
      rig.real = real;
      rig.hipHeight = real.hipHeight;
      if (rig.seated) real.seat();
      applyMohawkColor(root, root.userData.mohawkColor);
    })
    .catch((err) => {
      console.warn('主人公のモデルを使えないため、手作りの主人公を使います:', err);
    });

  return rig;
}

/** 座り姿勢にする（歩行で回している骨と同じ太もも・すねを曲げる） */
export function setSeatedPose(rig) {
  if (!rig) return rig;
  rig.seated = true;
  if (typeof rig.apply === 'function') rig.apply(null);
  return rig;
}

/** 座り姿勢をやめる */
export function clearSeatedPose(rig) {
  if (!rig) return rig;
  rig.seated = false;
  if (typeof rig.apply === 'function') rig.apply(null);
  return rig;
}
