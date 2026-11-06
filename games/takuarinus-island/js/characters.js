// タクアリヌス一族の形とアニメーション。
// three.js は import しない（THREE は buildAlinus の引数で受け取る）。
// 形のデータと動きの計算は純粋関数なので node --test で検証できる。
import { PALETTE } from './palette.js';

// ---- 形のデータ（設計単位。シーンへは MODEL_UNIT で縮める） ----
const ARCH_W = 1.2;
const ARCH_H = 1.56; // 高さ：幅 ≒ 1.3：1
const ARCH_R = ARCH_W / 2;
const ARCH_SIDE = ARCH_H - ARCH_R; // ここまでがまっすぐな側面、上は半円

/** 設計単位の全身を、従来のシーン上の大きさに合わせる縮尺 */
export const MODEL_UNIT = 0.64;

function archProfile() {
  const pts = [
    { r: 0, y: 0 },
    { r: ARCH_R, y: 0 },
    { r: ARCH_R, y: ARCH_SIDE / 2 },
    { r: ARCH_R, y: ARCH_SIDE },
  ];
  for (const deg of [30, 60]) {
    const a = (deg * Math.PI) / 180;
    pts.push({ r: ARCH_R * Math.cos(a), y: ARCH_SIDE + ARCH_R * Math.sin(a) });
  }
  pts.push({ r: 0, y: ARCH_H });
  return pts;
}

// Lathe の輪郭（r: 半径, y: 高さ）。下から上へ。
export const PROFILES = Object.freeze({
  // アーチ形（かまぼこ）: 上半分は半円、下半分はまっすぐ、底は平ら
  arch: archProfile(),
  // 裾が広がる形（ちびアリヌス用）
  skirt: [
    { r: 0, y: 0 }, { r: 0.66, y: 0.02 }, { r: 0.56, y: 0.2 }, { r: 0.46, y: 0.55 },
    { r: 0.4, y: 0.9 }, { r: 0.26, y: 1.18 }, { r: 0, y: 1.3 },
  ],
});

export const HERO_PARAMS = Object.freeze({
  scale: 1,
  profile: 'arch',
  mohican: true,
  arms: true,
  armScale: 1,
  legs: true,
  mohicanScale: 1,
  pose: 'rest', // 'rest' = 腕を体の横にだらんと下げる / 'dynamic' = 決めポーズ / 'hips' = 両手を腰
});

export function bodyProfile(name = 'arch') {
  const p = PROFILES[name];
  if (!p) throw new Error(`未知の輪郭: ${name}`);
  return p.map((q) => ({ r: q.r, y: q.y }));
}

export function profileRadiusAt(points, y) {
  if (!points.length || y < points[0].y || y > points[points.length - 1].y) return 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (y <= b.y) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.r + (b.r - a.r) * t;
    }
  }
  return points[points.length - 1].r;
}

// ---- 動き ----
export const POSE_DELAY = 0.5;
const WALK_FREQ = 11;
const LEG_AMP = 0.7;
const LAND_TIME = 0.25;
const LAND_SQUASH = 0.25;
const RISE_STRETCH_MAX = 0.18;

// ---- ダッシュ（Shift） ----
/** ダッシュ中の移動速度の倍率 */
export const DASH_SPEED = 1.8;
const DASH_FREQ = 1.6; // 脚の振りの速さの倍率
const DASH_AMP = 1.35; // 脚・腕の振りの大きさの倍率
let defaultDash = false;
/**
 * stepAnim に dash を渡さない呼び出しの既定値。
 * 時間を早送りしてダッシュを表すシーン用なので、振りの速さは時間側で上がっている。
 * そのため既定値では振りを大きくするだけにする。
 */
export function setDefaultDash(v) {
  defaultDash = !!v;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createAnimState() {
  return {
    phase: 0, idle: 0, poseBlend: 0, swingAmp: 0, legSwing: 0,
    scaleY: 1, land: 0, wasAirborne: false,
  };
}

/** 1フレーム分の動きを進める。a を更新して返す */
export function stepAnim(a, {
  moving = false, airborne = false, vy = 0, dt = 0, dash,
} = {}) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const dashing = moving && (dash === undefined ? defaultDash : !!dash);
  const freq = WALK_FREQ * (moving && dash === true ? DASH_FREQ : 1);
  if (moving) {
    a.idle = 0;
    a.phase += d * freq;
  } else {
    a.idle += d;
  }
  if (airborne) a.idle = 0;

  const poseTarget = !moving && !airborne && a.idle >= POSE_DELAY ? 1 : 0;
  a.poseBlend = approach(a.poseBlend, poseTarget, d * (poseTarget ? 6 : 12));
  const ampTarget = moving && !airborne ? (dashing ? DASH_AMP : 1) : 0;
  a.swingAmp = approach(a.swingAmp, ampTarget, d * 8);
  a.legSwing = Math.sin(a.phase) * LEG_AMP * a.swingAmp + 0; // -0 を 0 にそろえる

  if (airborne) {
    a.land = 0;
    a.scaleY = vy > 0 ? 1 + Math.min(RISE_STRETCH_MAX, vy * 0.02) : 1.04;
  } else {
    a.land = a.wasAirborne ? LAND_TIME : Math.max(0, a.land - d);
    a.scaleY = 1 - LAND_SQUASH * (a.land / LAND_TIME);
  }
  a.wasAirborne = airborne;
  return a;
}

// 腕の角度。side: +1 = 左腕（+x 側）, -1 = 右腕（-x 側）。
// rotation.z が正（side 倍）で外へ開く。elbowZ は肘の曲げ。
const ARM_REST = { shoulderZ: 0.2, elbowZ: 0 };
const ARM_HIP = { shoulderZ: 0.9, elbowZ: -1.7 };
const ARM_RAISED = { shoulderZ: 2.5, elbowZ: 0.4 };

function armTargetFor(pose, side) {
  if (pose === 'hips') return ARM_HIP;
  if (pose === 'dynamic') return side < 0 ? ARM_HIP : ARM_RAISED;
  return ARM_REST;
}

export function armTargets(pose, side, blend, swing) {
  const b = pose === 'hips' ? 1 : clamp01(blend);
  const t = armTargetFor(pose, side);
  const sx = side > 0 ? -swing : swing; // 同じ側の脚と逆位相
  // side = -1 と 0 の積は -0 になるので、+0 を足して 0 にそろえる
  return {
    shoulderX: (sx * 0.8 * (1 - b)) + 0,
    shoulderZ: side * lerp(ARM_REST.shoulderZ, t.shoulderZ, b) + 0,
    elbowZ: side * lerp(ARM_REST.elbowZ, t.elbowZ, b) + 0,
  };
}

// ---- 3D の組み立て ----
const SEG = 8;
const LEG_TOP = 1.4; // 体の底（半ズボンの上端）
const HIP_Y = 1.05; // 脚の付け根（半ズボンの下端）
const LEG_X = 0.28;
const BOOT_TOP = 0.36;
const SHORTS_H = LEG_TOP - HIP_Y;
const LEG_SWING_RATIO = 0.6; // 脚が長いので振りを抑え、ブーツが滑って見えないようにする
const SHOULDER_RATIO = 0.55; // 肩の高さ（体の高さに対する比）
const KNEE_RATIO = 0.42; // 手先が届く高さ（体の底に対する比。ひざの高さ）
const HERO_MOH_H = 1.3;
const HERO_MOH_THICK = 0.14;
const HERO_MOH_SINK = 0.12; // 付け根を頭のてっぺんにめり込ませる量
// 手作りの主人公の全身の高さ（FBX モデルはこの高さに合わせる）
export const HERO_HEIGHT = (LEG_TOP + ARCH_H + HERO_MOH_H - HERO_MOH_SINK) * MODEL_UNIT;

const geoCache = new Map();
let outlineMat = null;

function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function getOutlineMat(THREE) {
  if (!outlineMat) {
    outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.heroOutline, side: THREE.BackSide });
  }
  return outlineMat;
}

// 狐目の傾き（外側の端が下がる）
const FOX_TILT = 0.45;

// ---- 顔の窓に貼る、主人公と同じ顔（テクスチャの一部を切り出す） ----
export const FACE_TEXTURE_URL = './models/dotnus-002.png';
/** dotnus-002.png（1024x1024）の中の白い顔の範囲（左上原点のピクセル） */
export const FACE_REGION = Object.freeze({
  x0: 280, x1: 375, y0: 248, y1: 320, size: 1024,
});

/** 範囲 → テクスチャの offset / repeat（UV は左下原点、flipY=true の前提） */
export function faceUvTransform(region = FACE_REGION) {
  const s = region.size;
  return {
    offset: { x: region.x0 / s, y: 1 - region.y1 / s },
    repeat: { x: (region.x1 - region.x0) / s, y: (region.y1 - region.y0) / s },
  };
}

let faceMat = null;
let faceTexState = 'none'; // 'loading' | 'ready' | 'failed'
const faceFallbackMarks = [];

function getFaceMaterial(THREE) {
  if (faceMat) return faceMat;
  faceMat = new THREE.MeshLambertMaterial({ color: PALETTE.faceWindow });
  faceTexState = 'loading';
  const uv = faceUvTransform();
  new THREE.TextureLoader().load(
    FACE_TEXTURE_URL,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.offset.set(uv.offset.x, uv.offset.y);
      tex.repeat.set(uv.repeat.x, uv.repeat.y);
      tex.needsUpdate = true;
      faceMat.map = tex;
      faceMat.needsUpdate = true;
      faceTexState = 'ready';
      for (const m of faceFallbackMarks) m.visible = false;
      faceFallbackMarks.length = 0;
    },
    undefined,
    () => {
      faceTexState = 'failed';
      faceFallbackMarks.length = 0;
    },
  );
  return faceMat;
}

/** 窓の形の UV を、外接矩形に対して 0〜1 にそろえる（切り出しは offset / repeat で行う） */
function normalizeFaceUv(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const w = max.x - min.x || 1;
  const h = max.y - min.y || 1;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - min.x) / w, (pos.getY(i) - min.y) / h);
  }
  uv.needsUpdate = true;
  return geo;
}

/** 顔の窓（小さめのアーチ形の白い窓・狐目の点・V字の口）。原点が窓の中心、+z が手前 */
export function buildFace(THREE, mat) {
  const face = new THREE.Group();
  const win = new THREE.Mesh(cached('faceWin', () => {
    const w = 0.15;
    const h2 = 0.15;
    const s = new THREE.Shape();
    s.moveTo(-w, -h2);
    s.lineTo(w, -h2);
    s.lineTo(w, 0);
    s.absarc(0, 0, w, 0, Math.PI, false);
    s.closePath();
    return normalizeFaceUv(new THREE.ShapeGeometry(s, 8));
  }), getFaceMaterial(THREE));
  face.add(win);
  // テクスチャの顔が使えるなら、手描きの目と口（読み込みまでの代わり）は付けない
  if (faceTexState === 'ready') return face;
  const addMark = (m) => {
    face.add(m);
    if (faceTexState === 'loading') faceFallbackMarks.push(m);
  };

  const eyeGeo = cached('eye', () => new THREE.CircleGeometry(0.035, 6));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat('faceInk'));
    eye.scale.x = 1.6;
    eye.rotation.z = -s * FOX_TILT;
    eye.position.set(s * 0.07, 0.05, 0.005);
    addMark(eye);
  }

  const mouthGeo = cached('mouthV', () => new THREE.BoxGeometry(0.075, 0.022, 0.01));
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(mouthGeo, mat('faceInk'));
    m.position.set(s * 0.038, -0.07, 0.008);
    m.rotation.z = s * 0.5;
    face.add(m);
  }
  return face;
}

/** 台座に飾る単体のモヒカン（上へ広がる台形） */
function mohicanGeo(THREE) {
  return cached('mohican', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.15, 0);
    s.lineTo(0.15, 0);
    s.lineTo(0.3, 0.42);
    s.lineTo(-0.3, 0.42);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
    g.translate(0, 0, -0.05);
    return g;
  });
}

/** 主人公のモヒカン: 付け根が細く上が広い逆台形。正面から見える薄い板 */
function heroMohicanGeo(THREE) {
  return cached('heroMohican', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.12, 0);
    s.lineTo(0.12, 0);
    s.lineTo(0.32, HERO_MOH_H);
    s.lineTo(-0.32, HERO_MOH_H);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: HERO_MOH_THICK, bevelEnabled: false });
    g.translate(0, 0, -HERO_MOH_THICK / 2);
    return g;
  });
}

/** 半ズボン: 体と同じ幅の箱形で、下に逆V字の切れ込み */
function shortsGeo(THREE) {
  return cached('shorts', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.6, SHORTS_H);
    s.lineTo(-0.6, 0);
    s.lineTo(0, 0.18);
    s.lineTo(0.6, 0);
    s.lineTo(0.6, SHORTS_H);
    s.closePath();
    const depth = 0.95;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

/** 大きく角ばったL字のブーツ（前が +z。厚い靴底、つま先が前に張り出す） */
function bootGeo(THREE) {
  return cached('boot', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.2, 0);
    s.lineTo(0.56, 0);
    s.lineTo(0.56, 0.16);
    s.lineTo(0.16, 0.16);
    s.lineTo(0.16, BOOT_TOP);
    s.lineTo(-0.2, BOOT_TOP);
    s.closePath();
    const depth = 0.3;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    // 形の横軸を +z（前）へ、押し出し方向を左右へ
    g.rotateY(-Math.PI / 2);
    return g;
  });
}

/** 生まれたばかりの台座用モヒカン。scale は呼び出し側で設定する */
export function buildMohicanModel(THREE, mat, colorKey) {
  const g = new THREE.Group();
  const moh = new THREE.Mesh(mohicanGeo(THREE), mat(colorKey));
  moh.scale.z = 1.6;
  g.add(moh);
  return g;
}

// ぺたアリヌス: 平たい円盤の上面に顔
function buildDisc(THREE, mat, p, root, squash) {
  const R = 1.2;
  const H = 0.3;
  const geo = cached('disc', () => new THREE.CylinderGeometry(R, R, H, 12));
  const disc = new THREE.Mesh(geo, mat('heroBody'));
  disc.position.y = H / 2;
  const outline = new THREE.Mesh(geo, getOutlineMat(THREE));
  outline.position.y = H / 2 - 0.01;
  outline.scale.set(1.05, 1.1, 1.05);
  const face = buildFace(THREE, mat);
  face.rotation.x = -Math.PI / 2; // 上を向き、顔の上側が奥（-z）
  face.position.set(0, H + 0.01, 0.15);
  face.scale.setScalar(2.2);
  squash.add(disc, outline, face);
  const model = {
    root,
    params: p,
    apply(anim) {
      const a = anim || createAnimState();
      const sy = a.scaleY > 0 ? a.scaleY : 1;
      const sxz = 1 / Math.sqrt(sy);
      squash.scale.set(sxz, sy, sxz);
    },
  };
  model.apply(null);
  return model;
}

// ---- ちびモヒ: モヒカンそのものが体。細い手足と小さなブーツ。顔は無い ----
/** モヒカン形の体（設計単位）。下が細く上が広い逆台形 */
export const MOHICAN_BODY = Object.freeze({
  bottomHalf: 0.12,
  topHalf: 0.34,
  height: 1.3,
  depth: 0.3,
  legLength: 0.45,
});

function mohicanBodyGeo(THREE) {
  return cached('mohiBody', () => {
    const B = MOHICAN_BODY;
    const s = new THREE.Shape();
    s.moveTo(-B.bottomHalf, 0);
    s.lineTo(B.bottomHalf, 0);
    s.lineTo(B.topHalf, B.height);
    s.lineTo(-B.topHalf, B.height);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: B.depth, bevelEnabled: false });
    g.translate(0, 0, -B.depth / 2);
    return g;
  });
}

function stickGeo(THREE) {
  return cached('arm', () => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
    g.translate(0, -0.5, 0);
    return g;
  });
}

function buildMohicanBuddy(THREE, mat, p, root, squash) {
  const B = MOHICAN_BODY;
  const base = p.legs ? B.legLength : 0;
  const halfAt = (y) => B.bottomHalf + (B.topHalf - B.bottomHalf) * (y / B.height);

  // 体（モヒカンそのもの）と輪郭
  const body = new THREE.Mesh(mohicanBodyGeo(THREE), mat('heroMohican'));
  body.position.y = base;
  const outline = new THREE.Mesh(mohicanBodyGeo(THREE), getOutlineMat(THREE));
  outline.position.y = base - 0.02;
  outline.scale.set(1.1, 1.03, 1.2);
  squash.add(body, outline);

  // 正面の縦すじ3本
  const stripeGeo = cached('mohiStripe', () => new THREE.BoxGeometry(0.035, 0.7, 0.02));
  for (const x of [-0.11, 0, 0.11]) {
    const st = new THREE.Mesh(stripeGeo, mat('heroMohicanStripe'));
    st.position.set(x, base + 0.7, B.depth / 2 + 0.011);
    squash.add(st);
  }

  // 体の左右から細い棒の腕
  const arms = [];
  if (p.arms) {
    const sy = B.height * 0.5;
    const L = 0.55 * (p.armScale > 0 ? p.armScale : 1);
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (halfAt(sy) + 0.02), base + sy, 0);
      const stick = new THREE.Mesh(stickGeo(THREE), mat('heroBody'));
      stick.scale.y = L;
      shoulder.add(stick);
      squash.add(shoulder);
      arms.push({ side, shoulder });
    }
  }

  // 体の底から細い棒の脚と、小さな茶色のブーツ
  const legs = [];
  if (p.legs) {
    const legGeo = cached('mohiLeg', () => {
      const g = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
      g.translate(0, -0.5, 0);
      return g;
    });
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.08, base, 0);
      const leg = new THREE.Mesh(legGeo, mat('heroLeg'));
      leg.scale.y = base;
      const boot = new THREE.Mesh(bootGeo(THREE), mat('heroBoots'));
      boot.scale.setScalar(0.4);
      boot.position.y = -base;
      boot.rotation.y = side * 0.15;
      hip.add(leg, boot);
      squash.add(hip);
      legs.push({ side, hip });
    }
  }

  const model = {
    root,
    params: p,
    apply(anim) {
      const a = anim || createAnimState();
      const sy = a.scaleY > 0 ? a.scaleY : 1;
      const sxz = 1 / Math.sqrt(sy);
      squash.scale.set(sxz, sy, sxz);
      for (const l of legs) l.hip.rotation.x = l.side * a.legSwing * LEG_SWING_RATIO;
      for (const arm of arms) {
        const t = armTargets('rest', arm.side, a.poseBlend, a.legSwing);
        arm.shoulder.rotation.x = t.shoulderX;
        arm.shoulder.rotation.z = t.shoulderZ;
      }
    },
  };
  model.apply(null);
  return model;
}

/**
 * タクアリヌス一族を作る。
 * @param THREE three.js モジュール
 * @param mat   palette キー → 材質
 * @returns {{root, params, apply(anim)}}
 */
export function buildAlinus(THREE, mat, params = {}) {
  const p = { ...HERO_PARAMS, ...params };
  const root = new THREE.Group();
  const squash = new THREE.Group();
  root.add(squash);
  if (p.form === 'disc') {
    root.scale.setScalar(p.scale);
    return buildDisc(THREE, mat, p, root, squash);
  }
  root.scale.setScalar(p.scale * MODEL_UNIT);
  if (p.form === 'mohican') return buildMohicanBuddy(THREE, mat, p, root, squash);

  const base = p.legs ? LEG_TOP : 0;
  const prof = bodyProfile(p.profile);
  const top = prof[prof.length - 1].y;

  // 体（アーチ形: 頭と胴が一体）
  const bodyGeo = cached(`body:${p.profile}`, () => new THREE.LatheGeometry(
    prof.map((q) => new THREE.Vector2(q.r, q.y)), SEG, -Math.PI / SEG,
  ));
  const body = new THREE.Mesh(bodyGeo, mat('heroBody'));
  body.position.y = base;
  const outline = new THREE.Mesh(bodyGeo, getOutlineMat(THREE));
  outline.position.y = base - 0.02;
  outline.scale.set(1.07, 1.03, 1.07);
  squash.add(body, outline);

  // 顔の窓（体の正面の中ほどよりやや下）
  const faceRel = top * 0.4;
  const faceZ = profileRadiusAt(prof, faceRel) * Math.cos(Math.PI / SEG) + 0.02;
  const face = buildFace(THREE, mat);
  face.position.set(0, base + faceRel, faceZ);
  squash.add(face);

  // モヒカンと正面の縦すじ3本（付け根は頭に少しめり込ませる）
  if (p.mohican) {
    const ms = p.mohicanScale > 0 ? p.mohicanScale : 1;
    const mohGroup = new THREE.Group();
    mohGroup.position.y = base + top - HERO_MOH_SINK * ms;
    mohGroup.scale.setScalar(ms);
    const moh = new THREE.Mesh(heroMohicanGeo(THREE), mat(p.mohicanColor || 'heroMohican'));
    mohGroup.add(moh);
    const stripeGeo = cached('heroStripe', () => new THREE.BoxGeometry(0.03, 0.7, 0.02));
    for (const x of [-0.13, 0, 0.13]) {
      const st = new THREE.Mesh(stripeGeo, mat(p.mohicanStripe || 'heroMohicanStripe'));
      st.position.set(x, 0.75, HERO_MOH_THICK / 2 + 0.01);
      mohGroup.add(st);
    }
    squash.add(mohGroup);
  }

  // 腕: 体の側面から出る細長い腕。下げるとひざの高さまで届き、先はフック形の手
  const arms = [];
  if (p.arms) {
    const shoulderRel = top * SHOULDER_RATIO;
    const reach = (base + shoulderRel - base * KNEE_RATIO) * p.armScale;
    const L1 = reach * 0.48;
    const L2 = reach * 0.52;
    const sx = profileRadiusAt(prof, shoulderRel) + 0.02;
    const armGeo = cached('arm', () => {
      const g = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
      g.translate(0, -0.5, 0);
      return g;
    });
    const hookGeo = cached('hook', () => new THREE.TorusGeometry(0.08, 0.028, 4, 10, Math.PI * 1.5));
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * sx, base + shoulderRel, 0);
      const upper = new THREE.Mesh(armGeo, mat('heroBody'));
      upper.scale.y = L1;
      const elbow = new THREE.Group();
      elbow.position.y = -L1;
      const fore = new THREE.Mesh(armGeo, mat('heroBody'));
      fore.scale.y = L2;
      const hook = new THREE.Mesh(hookGeo, mat('heroBody'));
      hook.scale.setScalar(p.armScale);
      hook.position.set(0, -L2 - 0.08 * p.armScale, 0);
      hook.rotation.z = side > 0 ? Math.PI / 2 : Math.PI; // 内側へくるっと巻く
      elbow.add(fore, hook);
      shoulder.add(upper, elbow);
      squash.add(shoulder);
      arms.push({ side, shoulder, elbow, handY: -L2 });
    }
  }

  // 半ズボン・細い脚・L字のブーツ
  const legs = [];
  if (p.legs) {
    const shorts = new THREE.Mesh(shortsGeo(THREE), mat('heroShorts'));
    shorts.position.y = HIP_Y;
    squash.add(shorts);
    const legGeo = cached('leg', () => new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6));
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * LEG_X, HIP_Y, 0);
      const leg = new THREE.Mesh(legGeo, mat('heroLeg'));
      leg.position.y = -0.35;
      const boot = new THREE.Mesh(bootGeo(THREE), mat('heroBoots'));
      boot.position.y = -HIP_Y; // 足元（地面の高さ）
      boot.rotation.y = side * 0.15; // やや外向き
      hip.add(leg, boot);
      squash.add(hip);
      legs.push({ side, hip });
    }
  }

  const model = {
    root,
    params: p,
    apply(anim) {
      const a = anim || createAnimState();
      const sy = a.scaleY > 0 ? a.scaleY : 1;
      const sxz = 1 / Math.sqrt(sy);
      squash.scale.set(sxz, sy, sxz);
      for (const l of legs) l.hip.rotation.x = l.side * a.legSwing * LEG_SWING_RATIO;
      for (const arm of arms) {
        const t = armTargets(p.pose, arm.side, a.poseBlend, a.legSwing);
        arm.shoulder.rotation.x = t.shoulderX;
        arm.shoulder.rotation.z = t.shoulderZ;
        arm.elbow.rotation.z = t.elbowZ;
      }
      if (model.seated) {
        // カートの座席: 脚を前へ伸ばし、腕はハンドルへ
        for (const l of legs) l.hip.rotation.x = -SEATED_LEG_X;
        for (const arm of arms) {
          arm.shoulder.rotation.x = -SEATED_ARM_X;
          arm.shoulder.rotation.z = arm.side * 0.15;
          arm.elbow.rotation.z = 0;
        }
      }
    },
  };
  model.squash = squash; // 小物を足すための入れ物
  model.arms = arms; // 手に持たせる小物用
  model.apply(null);
  return model;
}

// ---- レース番長: 仲間と同じアーチ形・主人公と同じ顔に、黄色いモヒカン・ゴーグル・マフラー ----
export const RACE_BOSS_SHAPE = Object.freeze({
  scale: 1.7, pose: 'hips', mohicanColor: 'mohicanYellow', mohicanStripe: 'roadDark',
});

export function buildRaceBoss(THREE, mat, params = {}) {
  const model = buildAlinus(THREE, mat, { ...RACE_BOSS_SHAPE, ...params });
  const p = model.params;
  const sq = model.squash;
  if (!sq) return model;
  const base = p.legs ? LEG_TOP : 0;
  const prof = bodyProfile(p.profile);
  const top = prof[prof.length - 1].y;
  const front = Math.cos(Math.PI / SEG);

  // ゴーグル（額に上げたレンズ2つと、頭を一周するベルト）
  const gRel = top * 0.7;
  const gr = profileRadiusAt(prof, gRel);
  const strap = new THREE.Mesh(
    cached(`goggleStrap:${gr.toFixed(3)}`, () => new THREE.TorusGeometry(gr + 0.03, 0.05, 4, SEG)),
    mat('goggleFrame'),
  );
  strap.rotation.set(Math.PI / 2, 0, Math.PI / SEG);
  strap.position.y = base + gRel;
  sq.add(strap);
  const rimGeo = cached('goggleRim', () => {
    const g = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const glassGeo = cached('goggleGlass', () => new THREE.CircleGeometry(0.085, 8));
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(rimGeo, mat('goggleFrame'));
    rim.position.set(s * 0.15, base + gRel + 0.02, gr * front + 0.04);
    rim.rotation.x = -0.25; // 頭の丸みに合わせて少し上向き
    const glass = new THREE.Mesh(glassGeo, mat('goggleLens'));
    glass.position.z = 0.051;
    rim.add(glass);
    sq.add(rim);
  }

  // マフラー（首の輪と、後ろになびく尾）
  const sRel = top * 0.55;
  const sr = profileRadiusAt(prof, sRel);
  const ring = new THREE.Mesh(
    cached(`scarfRing:${sr.toFixed(3)}`, () => new THREE.TorusGeometry(sr + 0.05, 0.08, 5, SEG)),
    mat('scarf'),
  );
  ring.rotation.set(Math.PI / 2, 0, Math.PI / SEG);
  ring.position.y = base + sRel;
  sq.add(ring);
  const tail = new THREE.Group();
  tail.position.set(0.22, base + sRel, -(sr + 0.08));
  const cloth = new THREE.Mesh(cached('scarfTail', () => {
    const g = new THREE.BoxGeometry(0.22, 0.8, 0.06);
    g.translate(0, -0.4, 0);
    return g;
  }), mat('scarf'));
  tail.add(cloth);
  tail.rotation.x = 0.55;
  sq.add(tail);

  model.scarfTail = tail;
  model.flutter = (t) => {
    const tt = Number.isFinite(t) ? t : 0;
    tail.rotation.x = 0.55 + Math.sin(tt * 5) * 0.2;
    tail.rotation.z = Math.sin(tt * 3.1) * 0.12;
  };
  return model;
}

// ---- FPS番長: 仲間と同じアーチ形・主人公と同じ顔に、緑のモヒカン・サングラス・両手に水鉄砲 ----
export const FPS_BOSS_SHAPE = Object.freeze({
  scale: 1.7, pose: 'rest', mohicanColor: 'mohicanGreen', mohicanStripe: 'grassDark',
});
/** 水鉄砲を前へ構える腕の角度（肩の rotation.x） */
export const FPS_AIM_ARM_X = -1.35;

/** 大きな水鉄砲。銃口は -y（腕の先の方向）、タンクは +z（構えたときの上） */
function buildWaterGun(THREE, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cached('gunBody', () => new THREE.BoxGeometry(0.26, 0.75, 0.3)), mat('gunBody'));
  body.position.y = -0.22;
  const tank = new THREE.Mesh(cached('gunTank', () => new THREE.SphereGeometry(0.22, 8, 6)), mat('gunTank'));
  tank.position.set(0, -0.12, 0.3);
  const nozzle = new THREE.Mesh(cached('gunNozzle', () => new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6)), mat('gunNozzle'));
  nozzle.position.y = -0.7;
  const grip = new THREE.Mesh(cached('gunGrip', () => new THREE.BoxGeometry(0.14, 0.16, 0.3)), mat('gunNozzle'));
  grip.position.set(0, 0.02, -0.16);
  g.add(body, tank, nozzle, grip);
  return g;
}

export function buildFpsBoss(THREE, mat, params = {}) {
  const model = buildAlinus(THREE, mat, { ...FPS_BOSS_SHAPE, ...params });
  const p = model.params;
  const sq = model.squash;
  if (!sq) return model;
  const base = p.legs ? LEG_TOP : 0;
  const prof = bodyProfile(p.profile);
  const top = prof[prof.length - 1].y;
  const faceRel = top * 0.4;
  const faceZ = profileRadiusAt(prof, faceRel) * Math.cos(Math.PI / SEG) + 0.02;

  // サングラス（顔の窓の目の上）と、頭を一周するつる
  const glasses = new THREE.Group();
  glasses.position.set(0, base + faceRel + 0.05, faceZ + 0.025);
  const lensGeo = cached('shadeLens', () => new THREE.BoxGeometry(0.15, 0.085, 0.03));
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, mat('shades'));
    lens.position.x = s * 0.08;
    lens.rotation.z = s * -0.12;
    glasses.add(lens);
  }
  const bridge = new THREE.Mesh(cached('shadeBridge', () => new THREE.BoxGeometry(0.05, 0.022, 0.02)), mat('goggleFrame'));
  bridge.position.y = 0.02;
  glasses.add(bridge);
  sq.add(glasses);
  const gRel = faceRel + 0.05;
  const gr = profileRadiusAt(prof, gRel);
  const strap = new THREE.Mesh(
    cached(`shadeStrap:${gr.toFixed(3)}`, () => new THREE.TorusGeometry(gr + 0.015, 0.02, 3, SEG)),
    mat('shades'),
  );
  strap.rotation.set(Math.PI / 2, 0, Math.PI / SEG);
  strap.position.y = base + gRel;
  sq.add(strap);

  // 両手に大きな水鉄砲を構える
  const arms = model.arms || [];
  for (const arm of arms) {
    const gun = buildWaterGun(THREE, mat);
    gun.position.y = Number.isFinite(arm.handY) ? arm.handY : -0.8;
    arm.elbow.add(gun);
  }
  const baseApply = model.apply;
  model.apply = (anim) => {
    baseApply(anim);
    if (model.seated) return;
    for (const arm of arms) {
      arm.shoulder.rotation.x = FPS_AIM_ARM_X;
      arm.shoulder.rotation.z = arm.side * 0.12;
      arm.elbow.rotation.z = 0;
    }
  };
  model.apply(null);
  return model;
}

// ---- 座り姿勢（カートの座席。手作りの一族モデル用） ----
const SEATED_LEG_X = 1.45;
const SEATED_ARM_X = 1.1;

/** 座ったときの脚の付け根の高さ（root の原点＝足元から） */
export function seatedHipHeight(scale = 1) {
  return HIP_Y * MODEL_UNIT * (scale > 0 ? scale : 1);
}

/** buildAlinus / buildRaceBoss のモデルを座らせる（on=false でやめる） */
export function setModelSeated(model, on = true) {
  if (!model) return model;
  model.seated = !!on;
  if (typeof model.apply === 'function') model.apply(null);
  return model;
}
