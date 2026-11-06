// 「ファイルを見つけろ」の3Dの部屋：散らかった昔の和室（畳・ちゃぶ台・ブラウン管・ファミコン風の機械・カレンダー）。
// テクスチャはすべて手続き生成。文字は描かない。主人公は段ボール箱に座り、とうふアリヌスは横でノートパソコン。
// three.js は ctx から受け取る。モジュールの読み込み時には DOM・three.js に触らない。
import { PALETTE } from './palette.js';
import { createAnimState, HERO_HEIGHT } from './characters.js';
import { createHeroRig, applyMohawkColor, setSeatedPose } from './hero-model.js';
import { attachHeroFace } from './opponent-faces.js';

const P = (k) => PALETTE[k];
const S = Number.isFinite(HERO_HEIGHT) && HERO_HEIGHT > 0 ? HERO_HEIGHT : 1.6;
const hash = (i) => (Math.imul(i + 1, 2654435761) >>> 0);

/** 部屋の配置（主人公の背丈を単位にする） */
export const FF_ROOM = Object.freeze({
  unit: S,
  hero: Object.freeze({ x: -2.4 * S, z: -0.2 * S }),
  desk: Object.freeze({ x: -2.4 * S, z: -1.0 * S }),
  tofu: Object.freeze({ x: 2.3 * S, z: -0.1 * S, yaw: -0.55 }),
  target: Object.freeze({ x: 0, y: 0.85 * S, z: -0.6 * S }),
});

/** 主人公ととうふアリヌスが、真ん中のパソコンの画面の左右に見える距離 */
export function ffCameraDistance(aspect, fovDeg = 60, unit = S) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const tanH = Math.tan(((Number(fovDeg) || 60) * Math.PI) / 360) * a;
  const halfW = (2.4 * unit) / 0.68;
  return Math.max(2.5 * unit, Math.min(8 * unit, halfW / tanH));
}

function tex(THREE, w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function drawTatami(g, w, h) {
  g.fillStyle = P('tatami');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('tatamiDark');
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  g.fillRect(0, h / 2 - 1, w, 2);
  g.fillStyle = P('tatamiEdge');
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  g.globalAlpha = 0.18;
  g.fillStyle = P('boardDark');
  for (let i = 0; i < 6; i++) {
    const r = hash(i + 40);
    g.beginPath();
    g.arc(r % w, (r >>> 8) % h, 2 + (r % 5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawWall(g, w, h) {
  g.fillStyle = P('shojiPaper');
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.12;
  g.fillStyle = P('tatamiDark');
  for (let i = 0; i < 18; i++) {
    const r = hash(i + 7);
    g.beginPath();
    g.arc(r % w, (r >>> 9) % h, 1 + (r % 6), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawCalendar(g, w, h) {
  g.fillStyle = P('castWhite');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('sky');
  g.fillRect(3, 4, w - 6, 20);
  g.fillStyle = P('grass');
  g.beginPath();
  g.moveTo(3, 24);
  g.lineTo(18, 10);
  g.lineTo(30, 24);
  g.fill();
  g.fillStyle = P('mohicanRed');
  g.fillRect(3, 26, w - 6, 4);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      g.fillStyle = c === 0 ? P('mohicanRed') : P('castGray');
      g.fillRect(4 + c * 6, 33 + r * 6, 4, 4);
    }
  }
  g.strokeStyle = P('mohicanRed');
  g.lineWidth = 1;
  g.beginPath();
  g.arc(4 + 2 * 6 + 2, 33 + 1 * 6 + 2, 4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = P('signInk');
  for (const x of [10, w - 10]) g.fillRect(x, 1, 2, 2);
}

function drawCrt(g, w, h) {
  g.fillStyle = P('uiShade');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('heroOutline');
  g.fillRect(3, 3, w - 6, h - 6);
  g.fillStyle = P('castWhite');
  for (let i = 0; i < 4; i++) g.fillRect(6, 6 + i * 8, 5, 5);
  g.fillStyle = P('castGray');
  g.fillRect(3, h - 8, w - 6, 5);
  g.fillStyle = P('sea');
  g.fillRect(20, 10, 32, 22);
  g.globalAlpha = 0.25;
  g.fillStyle = P('shadow');
  for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  g.globalAlpha = 1;
}

function drawPoster(g, w, h) {
  g.fillStyle = P('mohicanYellow');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('heroMohican');
  g.beginPath();
  g.ellipse(w / 2, h - 6, 12, 30, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = P('mohicanRed');
  for (let i = 0; i < 5; i++) {
    const r = hash(i + 3);
    g.fillRect(r % (w - 4), (r >>> 7) % (h / 2), 3, 3);
  }
  g.strokeStyle = P('uiAccent');
  g.lineWidth = 3;
  g.strokeRect(1, 1, w - 2, h - 2);
}

function drawTofu(g, w, h) {
  g.fillStyle = P('castWhite');
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.35;
  g.strokeStyle = P('castGray');
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.globalAlpha = 1;
}

function drawCard(g, w, h) {
  g.fillStyle = P('crate');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('sand');
  g.fillRect(w / 2 - 3, 0, 6, h);
  g.strokeStyle = P('crateDark');
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
}

function drawPaper(g, w, h) {
  g.fillStyle = P('castWhite');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('castGray');
  for (let y = 4; y < h - 2; y += 3) g.fillRect(2, y, 4 + (hash(y) % (w - 6)), 1);
}

function drawLaptop(g, w, h) {
  g.fillStyle = P('heroOutline');
  g.fillRect(0, 0, w, h);
  g.fillStyle = P('goggleLens');
  g.fillRect(6, 4, 18, 12);
  g.fillStyle = P('castGray');
  g.fillRect(0, h - 4, w, 4);
}

/** 部屋を組む。返り値 {world, rig, update(t,dt), placeCamera(camera,t), setMohawk(color)} */
export function buildFfRoom(ctx) {
  const { THREE, mat } = ctx;
  const world = new THREE.Scene();
  world.background = new THREE.Color(P('uiShade'));
  world.fog = new THREE.Fog(P('uiShade'), 9 * S, 22 * S);
  ctx.addLights(world);
  const warm = new THREE.PointLight(P('mohicanYellow'), 1.2, 9 * S);
  warm.position.set(0.2 * S, 2.4 * S, -1.0 * S);
  world.add(warm);

  const lam = (map) => new THREE.MeshLambertMaterial({ map });
  const box = (w, h, d, m, x, y, z, parent = world) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const plane = (w, h, m, x, y, z, parent = world) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  // 床と壁
  const floor = plane(10 * S, 7 * S, lam(tex(THREE, 64, 128, drawTatami, [5, 3])), 0, 0, 0.6 * S);
  floor.rotation.x = -Math.PI / 2;
  const wallMat = lam(tex(THREE, 64, 64, drawWall, [6, 2]));
  plane(10 * S, 3.2 * S, wallMat, 0, 1.6 * S, -2.9 * S);
  for (const sx of [-1, 1]) {
    const side = plane(7 * S, 3.2 * S, wallMat, sx * 5 * S, 1.6 * S, 0.6 * S);
    side.rotation.y = -sx * Math.PI / 2;
  }
  box(10 * S, 0.12 * S, 0.05 * S, mat('shojiWood'), 0, 0.06 * S, -2.87 * S);

  // ちゃぶ台とブラウン管
  const D = FF_ROOM.desk;
  const desk = new THREE.Group();
  desk.position.set(D.x, 0, D.z);
  world.add(desk);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * S, 0.55 * S, 0.05 * S, 20), mat('shogiBoard'));
  top.position.y = 0.36 * S;
  desk.add(top);
  const legGeo = new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 0.34 * S, 6);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const leg = new THREE.Mesh(legGeo, mat('shogiBoardEdge'));
    leg.position.set(Math.cos(a) * 0.35 * S, 0.17 * S, Math.sin(a) * 0.35 * S);
    desk.add(leg);
  }
  box(0.62 * S, 0.5 * S, 0.5 * S, mat('pedestal'), 0, 0.635 * S, -0.05 * S, desk);
  box(0.42 * S, 0.36 * S, 0.25 * S, mat('pedestal'), 0, 0.6 * S, -0.4 * S, desk);
  const crtMat = new THREE.MeshBasicMaterial({ map: tex(THREE, 64, 48, drawCrt) });
  plane(0.5 * S, 0.38 * S, crtMat, 0, 0.64 * S, 0.201 * S, desk);
  box(0.46 * S, 0.03 * S, 0.16 * S, mat('castGray'), 0, 0.4 * S, 0.32 * S, desk);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * S, 0.045 * S, 0.1 * S, 10), mat('mohicanRed'));
  mug.position.set(0.38 * S, 0.435 * S, 0.05 * S);
  desk.add(mug);

  // 主人公（段ボール箱に座ってモニターを見る）
  const H = FF_ROOM.hero;
  const cardMat = lam(tex(THREE, 32, 32, drawCard));
  const stoolGeo = new THREE.BoxGeometry(0.42 * S, 1, 0.42 * S);
  stoolGeo.translate(0, 0.5, 0);
  const stool = new THREE.Mesh(stoolGeo, cardMat);
  stool.position.set(H.x, 0, H.z + 0.06 * S);
  world.add(stool);
  const rig = createHeroRig(THREE, mat);
  rig.root.position.set(H.x, 0, H.z);
  rig.root.rotation.y = Math.PI;
  world.add(rig.root);
  setSeatedPose(rig);
  const anim = createAnimState();
  const heroShadow = ctx.makeShadow(1.0);
  heroShadow.position.set(H.x, 0.01, H.z);
  world.add(heroShadow);

  // ファミコン風の機械（文字もロゴも無い）
  const fam = new THREE.Group();
  fam.position.set(-1.45 * S, 0, -0.55 * S);
  fam.rotation.y = 0.3;
  world.add(fam);
  box(0.42 * S, 0.08 * S, 0.3 * S, mat('pedestalTop'), 0, 0.04 * S, 0, fam);
  box(0.3 * S, 0.012 * S, 0.16 * S, mat('goggleFrame'), 0, 0.085 * S, -0.03 * S, fam);
  box(0.42 * S, 0.03 * S, 0.01 * S, mat('mohicanRed'), 0, 0.03 * S, 0.152 * S, fam);
  box(0.18 * S, 0.12 * S, 0.03 * S, mat('mohicanYellow'), 0, 0.14 * S, -0.03 * S, fam);
  for (const sx of [-1, 1]) {
    const pad = box(0.14 * S, 0.025 * S, 0.06 * S, mat('gatePost'), sx * 0.14 * S, 0.0125 * S, 0.36 * S, fam);
    pad.rotation.y = sx * 0.4;
  }

  // とうふアリヌス（白い四角い体・主人公と同じ顔）とノートパソコン
  const T = FF_ROOM.tofu;
  const tofu = new THREE.Group();
  tofu.position.set(T.x, 0, T.z);
  tofu.rotation.y = T.yaw;
  world.add(tofu);
  box(0.95 * S, 0.07 * S, 0.95 * S, mat('scarf'), 0, 0.035 * S, 0, tofu);
  const holder = new THREE.Group();
  holder.position.y = 0.07 * S;
  holder.scale.setScalar(0.62 * S);
  tofu.add(holder);
  const inner = new THREE.Group();
  holder.add(inner);
  const tofuMat = lam(tex(THREE, 32, 32, drawTofu));
  box(1, 1, 1, tofuMat, 0, 0.5, 0, inner);
  attachHeroFace(THREE, mat, inner, { y: 0.55, z: 0.505, scale: 1.25 });
  const armL = box(0.16, 0.16, 0.5, tofuMat, -0.38, 0.28, 0.55, inner);
  const armR = box(0.16, 0.16, 0.5, tofuMat, 0.38, 0.28, 0.55, inner);
  const lap = new THREE.Group();
  lap.position.set(0, 0, 1.05);
  holder.add(lap);
  box(0.8, 0.05, 0.55, mat('goggleFrame'), 0, 0.025, 0, lap);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.05, 0.27);
  hinge.rotation.x = 0.28;
  lap.add(hinge);
  box(0.8, 0.55, 0.03, mat('goggleFrame'), 0, 0.275, 0, hinge);
  const lapMat = new THREE.MeshBasicMaterial({ map: tex(THREE, 32, 24, drawLaptop) });
  const lapScreen = plane(0.7, 0.46, lapMat, 0, 0.275, -0.02, hinge);
  lapScreen.rotation.y = Math.PI;
  const tofuShadow = ctx.makeShadow(1.3);
  tofuShadow.position.set(T.x, 0.005, T.z);
  world.add(tofuShadow);

  // カレンダーとポスター（文字は描かない）
  plane(0.55 * S, 0.75 * S, lam(tex(THREE, 48, 64, drawCalendar)), 2.6 * S, 1.95 * S, -2.88 * S);
  plane(0.8 * S, 0.6 * S, lam(tex(THREE, 64, 48, drawPoster)), -3.6 * S, 1.9 * S, -2.88 * S);

  // 散らかったもの
  const paperMat = lam(tex(THREE, 16, 24, drawPaper));
  for (let i = 0; i < 8; i++) {
    const r = hash(i + 100);
    const p = plane(0.2 * S, 0.28 * S, paperMat,
      (-1.2 + ((r % 1000) / 1000) * 3.2) * S, (0.005 + i * 0.001) * S, (-0.4 + (((r >>> 10) % 1000) / 1000) * 1.8) * S);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = ((r >>> 4) % 628) / 100;
  }
  box(0.6 * S, 0.45 * S, 0.5 * S, cardMat, 3.6 * S, 0.225 * S, -2.3 * S);
  const box2 = box(0.45 * S, 0.35 * S, 0.4 * S, cardMat, 3.55 * S, 0.625 * S, -2.25 * S);
  box2.rotation.y = 0.3;
  const mags = ['mohicanRed', 'heroMohican', 'mohicanGreen', 'mohicanYellow', 'castPink'];
  mags.forEach((k, i) => {
    const m = box(0.3 * S, 0.03 * S, 0.4 * S, mat(k), -3.7 * S, (0.015 + i * 0.03) * S, -1.8 * S);
    m.rotation.y = (hash(i) % 60) / 100 - 0.3;
  });
  // つり下げの電灯
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * S, 0.008 * S, 0.6 * S, 4), mat('goggleFrame'));
  cord.position.set(0.2 * S, 2.9 * S, -1.0 * S);
  world.add(cord);
  const shade = new THREE.Group();
  shade.position.set(0.2 * S, 2.6 * S, -1.0 * S);
  world.add(shade);
  const shadeMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.25 * S, 0.18 * S, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(P('pieceFace')), side: THREE.DoubleSide }),
  );
  shade.add(shadeMesh);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06 * S, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(P('signFace')) }));
  bulb.position.y = -0.1 * S;
  shade.add(bulb);

  // 気分：とうふアリヌス 'search'（タイピング）/'banzai'（万歳）、主人公 'idle'/'joy'（喜んで跳ねる）
  let tofuMood = 'search';
  let heroMood = 'idle';
  function setMood({ tofu = 'search', hero = 'idle' } = {}) {
    tofuMood = tofu;
    heroMood = hero;
  }

  function update(t = 0) {
    const T2 = Number.isFinite(t) ? t : 0;
    if (tofuMood === 'banzai') {
      const hop = Math.abs(Math.sin(T2 * 8));
      inner.position.y = hop * 0.18;
      for (const [arm, s] of [[armL, -1], [armR, 1]]) {
        arm.rotation.set(Math.PI / 2, 0, 0);
        arm.position.set(s * 0.58, 1.05 + hop * 0.05, 0.05);
      }
    } else {
      inner.position.y = Math.abs(Math.sin(T2 * 2.2)) * 0.03;
      armL.rotation.set(0, 0, 0);
      armR.rotation.set(0, 0, 0);
      armL.position.set(-0.38, 0.28 + Math.max(0, Math.sin(T2 * 13)) * 0.07, 0.55);
      armR.position.set(0.38, 0.28 + Math.max(0, Math.sin(T2 * 13 + Math.PI)) * 0.07, 0.55);
    }
    lapMat.color.setScalar(0.85 + 0.15 * Math.abs(Math.sin(T2 * 1.7)));
    crtMat.color.setScalar(0.93 + 0.07 * Math.sin(T2 * 9));
    shade.rotation.z = Math.sin(T2 * 0.8) * 0.04;
    const hip = Number.isFinite(rig.hipHeight) && rig.hipHeight > 0 ? rig.hipHeight : 0.45 * S;
    stool.scale.y = Math.max(0.2 * S, hip * 0.92);
    rig.apply(anim);
    rig.root.position.y = heroMood === 'joy' ? Math.abs(Math.sin(T2 * 9)) * 0.12 * S : 0;
  }

  function placeCamera(camera, t = 0) {
    if (!camera) return;
    const dist = ffCameraDistance(camera.aspect, camera.fov, S);
    const tg = FF_ROOM.target;
    camera.position.set(Math.sin((Number(t) || 0) * 0.2) * 0.08 * S, 1.55 * S, tg.z + dist);
    camera.lookAt(tg.x, tg.y, tg.z);
  }

  function setMohawk(color) {
    applyMohawkColor(rig, color);
  }

  update(0);
  return {
    world, rig, update, placeCamera, setMohawk, setMood,
  };
}
