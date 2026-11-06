// 絵画の館：長い廊下（入口の絵9枚）と円形の広間（飾りの絵8枚）。
// 入口の絵は近づくと水面のように波打ち、ジャンプで飛び込むとそのゲーム（いまは工事中の部屋）へ。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { translate, getLang } from '../i18n.js';
import { paintingNoteEn } from '../painting-notes.js';
import { PALETTE } from '../palette.js';
import { createAnimState, stepAnim } from '../characters.js';
import { createHeroRig, applyMohawkColor } from '../hero-model.js';
import {
  ENTRANCE_PAINTINGS, DECOR_PAINTINGS, fitFrame, rippleStrength, canDive, darknessLevel,
} from '../gallery-data.js';
import { resolveDestination, gameById } from '../game-catalog.js';
import { getTextures } from '../textures.js';
import { textureRepeat } from '../texture-gen.js';
import { createCastTroupe, buildCastModel } from '../cast-build.js';
import { pickLine, getCast } from '../cast-defs.js';
import { buildAlinus } from '../characters.js';
import { NPCS } from '../npcs.js';
import { BOSSES } from '../bosses.js';
import { isBossDefeated } from '../progress.js';
import {
  rescuedCompanions, loadStory, finaleDue, FINALE_LINES, allPaintingsEventDue,
  mansionIntroDue, GATHER_LINES_BY_STAGE, gatherStage, TENOHIRA_ALIBI,
} from '../story.js';
import {
  shownInMansion, rewardByPainting, howToGet, MANSION_BOSSES, defeatedMansionGames, allCollected,
  DECOR_COMMENTS, decorHowToGet,
} from '../paintings.js';
import { findTalkTarget } from '../npcs.js';
import { createRng, timeSeed } from '../seeded-rng.js';
// 近づいたときの札（nearestLabel の重ね表示）は出さない。飛び込み方は下のヒントだけ
import { crispCanvasSize, setLabelPresenter } from '../label-size.js';
import { pitchFromOffset, stepPitch, orbitCameraPosition } from '../orbit-pitch.js';
import { consumePitchDrag, resetPitchDrag } from '../pitch-drag.js';
import { prepareDrawing } from '../drawing-prep.js';

export const GALLERY_INTERIOR = Object.freeze({
  halfWidth: 4, entryZ: 2, corridorEnd: -35, hallCenterZ: -48, hallRadius: 15, wallHeight: 5.5,
});
const L = GALLERY_INTERIOR;
const WALKER_R = 0.35;
const DECOR_TITLE_RANGE = 3;
const DIVE_TIME = 0.85;

/** 館の中で歩けるか（廊下か広間） */
export function galleryWalkable(x, z, r = WALKER_R) {
  if (Math.abs(x) <= L.halfWidth - r && z <= L.entryZ + 1 && z >= L.corridorEnd) return true;
  return Math.hypot(x, z - L.hallCenterZ) <= L.hallRadius - r - 0.2;
}

/** カメラが壁の外へ出るなら、内側に入るまで主人公へ寄せる（廊下から広間に入る角で芝生が見えていた） */
export function insideCameraPosition(target, yaw, pitch, range, inside = null, minRange = 1.2) {
  let r = range;
  let cp = orbitCameraPosition(target, yaw, pitch, r);
  if (typeof inside !== 'function') return cp;
  while (r > minRange && !inside(cp.x, cp.z)) {
    r = Math.max(minRange, r * 0.85);
    cp = orbitCameraPosition(target, yaw, pitch, r);
  }
  return cp;
}

/** 館の中でカメラを置いてよいか（壁の少し内側まで） */
export function galleryCameraInside(x, z) {
  if (galleryWalkable(x, z, 0.15)) return true;
  // 入口の扉の手前（廊下の延長）は、元からカメラを置いていて見え方に問題がない
  return Math.abs(x) <= L.halfWidth - 0.15 && z > L.entryZ && z <= L.entryZ + 8;
}

/** 入口の絵の置き場所（廊下の両壁に交互） */
export function entrancePlacements() {
  return ENTRANCE_PAINTINGS.map((p, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    return {
      painting: p, x: side * (L.halfWidth - 0.06), y: 2.4, z: -4 - i * 3.2, rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    };
  });
}

/** 1段に並べる飾りの絵の上限（超えたら上下2段にする） */
export const DECOR_ROW_MAX = 12;
/** 2段のときの高さ（下・上） */
export const DECOR_ROW_Y = Object.freeze([1.55, 3.95]);

/** 飾りの絵の置き場所（広間の壁に、通路の口を避けて並べる。多いときは上下2段） */
export function decorPlacements() {
  const n = DECOR_PAINTINGS.length;
  const R = L.hallRadius - 0.08;
  const rows = n > DECOR_ROW_MAX ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const step = (Math.PI * 2 - 1.8) / Math.max(1, perRow - 1);
  const maxW = Math.min(3, step * R * 0.8);
  const maxH = rows > 1 ? 1.95 : 2.6;
  return DECOR_PAINTINGS.map((p, k) => {
    const row = rows > 1 ? k % rows : 0;
    const j = rows > 1 ? Math.floor(k / rows) : k;
    const a = Math.PI / 2 + 0.9 + j * step;
    return {
      painting: p,
      x: Math.cos(a) * R,
      y: rows > 1 ? DECOR_ROW_Y[row] : 2.6,
      z: L.hallCenterZ + Math.sin(a) * R,
      rotY: Math.atan2(-Math.cos(a), -Math.sin(a)),
      row,
      maxW,
      maxH,
    };
  });
}

/** 看板の文字のテクスチャ */
export function labelTexture(THREE, lines, {
  w = 256, h = 64, bg = PALETTE.signFace, fg = PALETTE.signInk, border = PALETTE.signStripe,
} = {}) {
  const list = (Array.isArray(lines) ? lines : [lines]).map((s) => translate(String(s ?? '')));
  const size = crispCanvasSize(w, h);
  const c = document.createElement('canvas');
  c.width = size.width;
  c.height = size.height;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  if (border) {
    const lw = Math.max(2, c.height * 0.06);
    g.strokeStyle = border;
    g.lineWidth = lw;
    g.strokeRect(lw / 2, lw / 2, c.width - lw, c.height - lw);
  }
  const maxChars = Math.max(1, ...list.map((s) => [...s].length));
  const fs = Math.max(8, Math.floor(Math.min((c.height * 0.78) / list.length, (c.width * 0.9) / maxChars)));
  g.fillStyle = fg;
  g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", "Meiryo", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  list.forEach((s, i) => g.fillText(s, c.width / 2, (c.height * (i + 0.5)) / list.length));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 歩く主人公（ハブと同じ操作）。walkable(x,z) か move(from,to) で歩ける場所を決める。
 */
export function createWalker(ctx, {
  walkable = null, move = null, camDist = 5.5, camHeight = 3.4, camInside = null,
} = {}) {
  const { THREE, camera, input, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  const rig = createHeroRig(THREE, mat);
  const shadow = ctx.makeShadow(1.1);
  const anim = createAnimState();
  const camTargetY = 1.2;
  const pitch0 = pitchFromOffset(camDist, camHeight - camTargetY);
  const camRange = Math.hypot(camDist, camHeight - camTargetY);
  const st = {
    x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: pitch0, facing: Math.PI, moving: false,
  };
  const ok = (x, z) => (typeof walkable === 'function' ? walkable(x, z) : true);

  function sync() {
    const bob = st.moving && st.y === 0 ? Math.abs(Math.sin(anim.phase)) * 0.05 : 0;
    rig.root.position.set(st.x, st.y + bob, st.z);
    rig.root.rotation.y = st.facing;
    shadow.position.set(st.x, 0.04, st.z);
    shadow.scale.setScalar(1.1 / (1 + st.y * 0.25));
    const ty = camTargetY + st.y * 0.4;
    const cp = insideCameraPosition({ x: st.x, y: ty, z: st.z }, st.yaw, st.pitch, camRange, camInside);
    camera.position.set(cp.x, cp.y, cp.z);
    camera.lookAt(st.x, ty, st.z);
  }

  return {
    rig,
    shadow,
    st,
    anim,
    addTo(world) {
      world.add(rig.root, shadow);
    },
    place(x, z, facing = Math.PI) {
      Object.assign(st, {
        x, z, y: 0, vy: 0, facing, yaw: facing + Math.PI, pitch: pitch0, moving: false,
      });
      resetPitchDrag();
      Object.assign(anim, createAnimState());
      rig.root.scale.setScalar(1);
      rig.root.visible = true;
      if (ctx.silly && typeof ctx.silly.setFocus === 'function') ctx.silly.setFocus(rig.root);
      applyMohawkColor(rig, typeof ctx.mohawkColor === 'function' ? ctx.mohawkColor() : undefined);
      rig.apply(anim);
      sync();
    },
    update(dt, { locked = false, noTurn = false } = {}) {
      const turn = locked || noTurn ? 0 : (input.isDown('KeyQ') ? 1 : 0) - (input.isDown('KeyE') ? 1 : 0);
      st.yaw += turn * 2.2 * dt - input.consumeDrag() * 0.008;
      st.pitch = stepPitch(st.pitch, {
        up: !locked && !!input.isDown('KeyR'),
        down: !locked && !!input.isDown('KeyF'),
        dragY: consumePitchDrag(),
        dt,
      });
      const ix = locked ? 0 : (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
      const iy = locked ? 0 : (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
      const fx = -Math.sin(st.yaw);
      const fz = -Math.cos(st.yaw);
      let mx = fx * iy - fz * ix;
      let mz = fz * iy + fx * ix;
      const len = Math.hypot(mx, mz);
      st.moving = len > 0;
      if (st.moving) {
        mx /= len;
        mz /= len;
        const step = 6 * dt;
        const nx = st.x + mx * step;
        const nz = st.z + mz * step;
        if (typeof move === 'function') {
          const q = move({ x: st.x, z: st.z }, { x: nx, z: nz });
          st.x = q.x;
          st.z = q.z;
        } else if (ok(nx, nz)) {
          st.x = nx;
          st.z = nz;
        } else if (ok(nx, st.z)) {
          st.x = nx;
        } else if (ok(st.x, nz)) {
          st.z = nz;
        }
        const target = Math.atan2(mx, mz);
        const d = Math.atan2(Math.sin(target - st.facing), Math.cos(target - st.facing));
        st.facing += d * Math.min(1, dt * 12);
      }
      const wasAir = st.y > 0;
      let jumped = false;
      if (!locked && st.y <= 0 && input.wasPressed('Space')) {
        st.vy = 8.5;
        jumped = true;
        sfx('jump');
      }
      st.vy -= 24 * dt;
      st.y += st.vy * dt;
      if (st.y < 0) {
        st.y = 0;
        st.vy = 0;
      }
      const landed = wasAir && st.y === 0;
      if (landed) {
        sfx('land');
        if (ctx.silly && typeof ctx.silly.squash === 'function') ctx.silly.squash(rig.root);
      }
      stepAnim(anim, { moving: st.moving, airborne: st.y > 0, vy: st.vy, dt });
      rig.apply(anim);
      sync();
      return { jumped, landed };
    },
  };
}

const RIPPLE_VERT = `
uniform float time;
uniform float amp;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += amp * 1.5 * sin(uv.y * 18.0 + time * 3.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const RIPPLE_FRAG = `
uniform sampler2D map;
uniform float hasMap;
uniform float time;
uniform float amp;
uniform vec3 base;
varying vec2 vUv;
void main() {
  float w = sin(vUv.y * 18.0 + time * 3.0);
  vec2 uv = vUv + amp * vec2(w, sin(vUv.x * 14.0 + time * 2.3));
  uv = clamp(uv, 0.0, 1.0);
  vec3 c = hasMap > 0.5 ? texture2D(map, uv).rgb : base;
  // 明るさは足さない（絵が白く飛ばないように）。揺れは UV と頂点だけ
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}`;

/** 絵を下ごしらえ（線を太らせて縮め、地を紙色・線を濃く）してミップマップ無しで貼る。失敗したら元のまま */
function prepTexture(THREE, tex, anisotropy) {
  let out = tex;
  const img = tex.image;
  const isCanvas = !!img && typeof img.getContext === 'function';
  if (img && !isCanvas && typeof document !== 'undefined') {
    try {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0) {
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        const g = src.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, w, h);
        const prepped = prepareDrawing(g.getImageData(0, 0, w, h));
        const c = document.createElement('canvas');
        c.width = prepped.width;
        c.height = prepped.height;
        c.getContext('2d').putImageData(new ImageData(prepped.data, prepped.width, prepped.height), 0, 0);
        out = new THREE.CanvasTexture(c);
      }
    } catch (err) {
      console.warn('絵の下ごしらえに失敗（元の画像を使います）:', err);
      out = tex;
    }
  }
  out.colorSpace = THREE.SRGBColorSpace;
  out.magFilter = THREE.LinearFilter;
  out.minFilter = THREE.LinearFilter;
  out.generateMipmaps = false;
  if (anisotropy > 0) out.anisotropy = anisotropy;
  out.needsUpdate = true;
  return out;
}

function buildPainting(THREE, painting, {
  maxW, maxH, frameColor, anisotropy = 1,
}) {
  const g = new THREE.Group();
  const uniforms = {
    map: { value: null },
    hasMap: { value: 0 },
    time: { value: 0 },
    amp: { value: 0 },
    base: { value: new THREE.Color(PALETTE.paintingMissing) },
  };
  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 12, 12),
    new THREE.ShaderMaterial({ uniforms, vertexShader: RIPPLE_VERT, fragmentShader: RIPPLE_FRAG }),
  );
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const bars = [0, 1, 2, 3].map(() => new THREE.Mesh(barGeo, frameMat));
  g.add(pic, ...bars);
  const T = 0.18;
  const D = 0.14;
  const resize = (w, h) => {
    pic.scale.set(w, h, 1);
    pic.position.z = 0.03;
    bars[0].scale.set(w + 2 * T, T, D);
    bars[0].position.set(0, h / 2 + T / 2, 0);
    bars[1].scale.set(w + 2 * T, T, D);
    bars[1].position.set(0, -h / 2 - T / 2, 0);
    bars[2].scale.set(T, h, D);
    bars[2].position.set(-w / 2 - T / 2, 0, 0);
    bars[3].scale.set(T, h, D);
    bars[3].position.set(w / 2 + T / 2, 0, 0);
  };
  resize(maxW * 0.85, maxH * 0.85);
  new THREE.TextureLoader().load(
    `textures/drawings/${painting.file}`,
    (loaded) => {
      const img = loaded.image || {};
      const tex = prepTexture(THREE, loaded, anisotropy);
      uniforms.map.value = tex;
      uniforms.hasMap.value = 1;
      const iw = img.naturalWidth || img.width || 0;
      const ih = img.naturalHeight || img.height || 0;
      if (iw > 0 && ih > 0) {
        const f = fitFrame(iw, ih, maxW, maxH);
        resize(f.width, f.height);
      }
    },
    undefined,
    () => console.warn('絵を読めません:', painting.file),
  );
  return { group: g, uniforms };
}

function overlay(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.append(el);
  }
  return el;
}

const HALL_CAST_ANGLES = [10, 45, 135, 170, 205, 240, 275, 305, 335];
const HALL_CAST_IDS = ['murasaki', 'megane', 'sankaku', 'tenshi', 'nagamohi', 'mukimuki', 'ashidake', 'manmaru', 'futatsugao'];

/** 奥の広間に集まる仲間とボスの立ち位置（n 人）。輪に等間隔、廊下の口（+z 側）はあける */
export function gatherSpots(n) {
  const r = L.hallRadius - 5;
  const gap = 0.75; // 廊下の口の左右にあける角度
  const a0 = Math.PI / 2 + gap;
  const span = Math.PI * 2 - 2 * gap;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (n <= 1 ? span / 2 : (span * i) / (n - 1));
    out.push({ x: Math.cos(a) * r, z: L.hallCenterZ + Math.sin(a) * r });
  }
  return out;
}

/** 入口で迎える案内役（最初からいる） */
export const ENTRANCE_CAST = Object.freeze(['tenohira']);
/** 広間の館の住人。ビッグヌスを1人倒すごとに1人ずつ広間に出てくる（依頼者の指摘 2026-11-04:
 *  初めて入ったときから新しい仲間がいた） */
export const HALL_JOIN_ORDER = Object.freeze(['murasaki', 'tenshi', 'nagamohi', 'ashidake', 'manmaru', 'futatsugao']);

/** 館のボスを defeated 人倒したときに歩き回っているキャラ（ボス本人は広間の輪に別に並ぶ） */
export function galleryRoamers(defeated) {
  const n = Math.max(0, Math.min(HALL_JOIN_ORDER.length, Number(defeated) || 0));
  return [...ENTRANCE_CAST, ...HALL_JOIN_ORDER.slice(0, n)];
}

/** 隙間を埋める壁の両端（左右1組ずつ）。廊下の壁の奥の端 → 残した広間の壁の、廊下側の端 */
export function hallGapFillers(SEG = 24, RR = L.hallRadius + 0.2, segW = 2 * RR * Math.sin(Math.PI / SEG) + 0.15) {
  const HW = L.halfWidth;
  const joinZ = L.hallCenterZ + Math.sqrt(L.hallRadius ** 2 - HW ** 2);
  const out = [];
  for (const s of [-1, 1]) {
    let best = null;
    for (let k = 0; k < SEG; k++) {
      const a = (k * Math.PI * 2) / SEG;
      const x = Math.cos(a) * RR;
      if (Math.sin(a) <= 0 || Math.sign(x) !== s || Math.abs(x) < HW + 1.2) continue;
      if (!best || Math.abs(x) < Math.abs(best.x)) best = { a, x, z: L.hallCenterZ + Math.sin(a) * RR };
    }
    if (!best) continue;
    // 区切りの壁の、廊下側の端（接線の向きに半分の幅）
    const ux = -s * Math.sin(best.a);
    const uz = s * Math.cos(best.a);
    out.push([{ x: s * (HW + 0.2), z: joinZ }, { x: best.x + ux * (segW / 2), z: best.z + uz * (segW / 2) }]);
  }
  return out;
}

/** 館の新キャラの置き場所（入口の両脇と、広間の輪。広間のキャラは中心を向く） */
export function gallerySpots() {
  const spots = {
    tenohira: { x: -2.5, z: 0.6, facing: Math.PI / 2 },
    tabako: { x: 2.5, z: 0.6, facing: -Math.PI / 2 },
  };
  const R = 6.2;
  HALL_CAST_IDS.forEach((id, i) => {
    const a = (HALL_CAST_ANGLES[i] * Math.PI) / 180;
    const x = Math.cos(a) * R;
    const z = L.hallCenterZ + Math.sin(a) * R;
    spots[id] = { x, z, facing: Math.atan2(-x, L.hallCenterZ - z) };
  });
  return spots;
}

export function createGalleryScene(ctx) {
  const { THREE, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  let world = null;
  let walker = null;
  const ents = [];
  const decors = [];
  let time = 0;
  let leaving = false;
  let dive = null;
  let flashEl = null;
  let darkEl = null;
  let troupe = null;
  let gathering = null; // 奥の広間に集まった仲間とボス
  let troupeCount = -1; // いま広間を歩いている住人の数のもとになった、倒したビッグヌスの数
  let alibiTold = false; // てのひらくんが「ビッグヌスとは無関係」と言ったか（初めて話したときだけ）
  let stage = 'start'; // 広間の仲間のひとことの段（GATHER_LINES_BY_STAGE）
  const gatherers = [];
  let paintings = { earned: [] };
  const castRng = createRng(timeSeed());
  const CONTROLS = 'WASD: 移動　Space: ジャンプ（絵に向かって跳ぶと飛び込める）　Q/E・R/F・ドラッグ: カメラ';
  // 奥の広間の飾りの絵には飛び込めないので、広間では飛び込みの案内を出さない（依頼者の指摘）
  const CONTROLS_HALL = 'WASD: 移動　Space: ジャンプ　E/Enter: 話す　Q/E・R/F・ドラッグ: カメラ';
  // 絵に近づいても札は出さない（飛び込み方は下のヒントだけ。ゲームの内容は入ったあとの紹介で出す）

  /** 絵の布と、奥の広間に集まる顔ぶれを今の進みに合わせる */
  function applyProgress() {
    try {
      paintings = typeof ctx.paintings === 'function' ? ctx.paintings() : { earned: [] };
    } catch {
      paintings = { earned: [] };
    }
    for (const d of decors) d.cloth.visible = !shownInMansion(paintings, d.painting.id);
    if (!gathering) return;
    const beaten = defeatedMansionGames(paintings).length;
    stage = gatherStage(beaten, allCollected(paintings));
    if (beaten !== troupeCount) {
      troupeCount = beaten;
      if (troupe) world.remove(troupe.group);
      troupe = createCastTroupe(THREE, galleryRoamers(beaten), gallerySpots(), { makeShadow: (r) => ctx.makeShadow(r) });
      world.add(troupe.group);
    }
    gathering.clear();
    gatherers.length = 0;
    const defeated = BOSSES.filter((b) => isBossDefeated(ctx.getProgress(), b.id)).map((b) => b.id);
    const members = [];
    for (const id of rescuedCompanions(defeated)) {
      const npc = NPCS.find((n) => n.id === id);
      if (npc) members.push({ kind: 'npc', id, name: npc.name, model: buildAlinus(THREE, mat, npc.shape) });
    }
    for (const g of defeatedMansionGames(paintings)) {
      const def = getCast(MANSION_BOSSES[g].castId);
      if (def) members.push({ kind: 'cast', id: def.id, name: MANSION_BOSSES[g].name, model: buildCastModel(THREE, def) });
    }
    // 広間の輪に、話しかけられる間をあけて並ぶ（廊下の口はあける）。顔は広間の中心へ
    const pos = gatherSpots(members.length);
    members.forEach((m, i) => {
      const { x, z } = pos[i];
      m.model.root.position.set(x, 0, z);
      m.model.root.rotation.y = Math.atan2(-x, L.hallCenterZ - z);
      const sh = ctx.makeShadow(m.kind === 'npc' ? 1 : 1.2);
      sh.position.set(x, 0.03, z);
      gathering.add(m.model.root, sh);
      gatherers.push({ ...m, x, z, radius: 1.6, phase: i * 0.7, anim: createAnimState() });
    });
  }

  function stepGatherers(dt) {
    for (const g of gatherers) {
      const y = Math.abs(Math.sin(time * 3 + g.phase)) * 0.25;
      g.model.root.position.y = y;
      if (g.kind === 'npc') {
        stepAnim(g.anim, { moving: false, airborne: y > 0.05, dt });
        g.model.apply(g.anim);
      } else if (typeof g.model.update === 'function') {
        g.model.update(time);
      }
    }
  }

  /** いちばん近い飾りの絵の案内（布がかかっていれば入手方法、手に入れていれば一言） */
  function decorHint(s) {
    let best = null;
    let bd = 2.6;
    for (const d of decors) {
      const dd = Math.hypot(s.x - d.x, s.z - d.z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (!best) return null;
    const r = rewardByPainting(best.painting.id);
    if (best.cloth.visible) {
      const how = r ? howToGet(r) : decorHowToGet(paintings, best.painting.id);
      return how ? `？？？　入手方法：${how}` : null;
    }
    const note = getLang() === 'en' ? paintingNoteEn(best.painting.id) : '';
    const comment = r ? r.comment : DECOR_COMMENTS[best.painting.id];
    const base = comment ? `「${best.painting.title}」　${comment}` : `「${best.painting.title}」`;
    return note ? `${translate(base)}  — ${note}` : base;
  }

  function talkToCast(t) {
    const s = walker.st;
    s.facing = Math.atan2(t.x - s.x, t.z - s.z);
    sfx('talk');
    ctx.ui.setHint('');
    if (ctx.silly && typeof ctx.silly.squash === 'function' && t.model) ctx.silly.squash(t.model.root);
    const pool = GATHER_LINES_BY_STAGE[stage] || GATHER_LINES_BY_STAGE.start;
    if (t.id === 'tenohira' && !alibiTold) {
      alibiTold = true;
      ctx.ui.openDialog({ name: t.name, lines: [...TENOHIRA_ALIBI] });
      return;
    }
    const line = t.kind === 'npc' ? pool[Math.floor(castRng() * pool.length)] : pickLine(t.id, castRng);
    ctx.ui.openDialog({ name: t.name, lines: [line] });
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 40, 120);
    ctx.addLights(world);
    const tx = getTextures(THREE);
    const HW = L.halfWidth;
    const WH = L.wallHeight;

    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 12), tx.material('grass', { repeat: textureRepeat(160, 160, 3) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    world.add(ground);

    // 廊下
    const len = L.entryZ + 1 - L.corridorEnd;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(2 * HW + 0.4, 0.2, len),
      tx.material('cobble', { repeat: textureRepeat(2 * HW + 0.4, len, 2.5) }),
    );
    floor.position.set(0, -0.1, L.corridorEnd + len / 2);
    world.add(floor);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(2, 0.03, len - 1), mat('scarf'));
    carpet.position.set(0, 0.015, L.corridorEnd + (len - 1) / 2);
    world.add(carpet);
    const joinZ = L.hallCenterZ + Math.sqrt(L.hallRadius ** 2 - HW ** 2);
    const wallLen = L.entryZ - joinZ;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, WH, wallLen),
        tx.material('brick', { repeat: textureRepeat(wallLen, WH, 2.5) }),
      );
      w.position.set(s * (HW + 0.2), WH / 2, L.entryZ - wallLen / 2);
      world.add(w);
    }
    // 入口のアーチ
    const archMat = tx.material('brick', { repeat: [1, 2] });
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, WH + 1, 0.8), archMat);
      pillar.position.set(s * (HW + 0.2), (WH + 1) / 2, L.entryZ);
      world.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2 * HW + 1.2, 0.9, 0.8), archMat);
    lintel.position.set(0, WH + 0.6, L.entryZ);
    world.add(lintel);
    const exitPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.7),
      new THREE.MeshBasicMaterial({ map: labelTexture(THREE, ['出口'], { w: 160, h: 36 }) }),
    );
    exitPlate.position.set(0, WH + 0.6, L.entryZ - 0.42);
    exitPlate.rotation.y = Math.PI;
    world.add(exitPlate);

    // 円形の広間
    const hallFloor = new THREE.Mesh(
      new THREE.CircleGeometry(L.hallRadius + 0.3, 32),
      tx.material('checker', { repeat: [5, 5] }),
    );
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(0, 0.02, L.hallCenterZ);
    world.add(hallFloor);
    const SEG = 24;
    const RR = L.hallRadius + 0.2;
    const segW = 2 * RR * Math.sin(Math.PI / SEG) + 0.15;
    const segGeo = new THREE.BoxGeometry(segW, WH, 0.4);
    const segMat = tx.material('brick', { repeat: [1, 2] });
    for (let k = 0; k < SEG; k++) {
      const a = (k * Math.PI * 2) / SEG;
      const x = Math.cos(a) * RR;
      if (Math.sin(a) > 0 && Math.abs(x) < HW + 1.2) continue; // 廊下の口
      const m = new THREE.Mesh(segGeo, segMat);
      m.position.set(x, WH / 2, L.hallCenterZ + Math.sin(a) * RR);
      m.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      world.add(m);
    }
    // 廊下の壁の端と、広間の壁のいちばん近い区切りの間を埋める（依頼者の指摘 2026-11-04: 外が見える隙間）
    for (const [a1, a2] of hallGapFillers(SEG, RR, segW)) {
      const len = Math.hypot(a2.x - a1.x, a2.z - a1.z) + 0.6;
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.4, WH, len), segMat);
      f.position.set((a1.x + a2.x) / 2, WH / 2, (a1.z + a2.z) / 2);
      f.rotation.y = Math.atan2(a2.x - a1.x, a2.z - a1.z);
      world.add(f);
    }

    // 入口の絵
    let aniso = 1;
    try {
      const r = ctx.renderer;
      if (r && r.capabilities && typeof r.capabilities.getMaxAnisotropy === 'function') {
        aniso = r.capabilities.getMaxAnisotropy();
      }
    } catch {
      aniso = 1;
    }
    for (const pl of entrancePlacements()) {
      const p = pl.painting;
      const pp = buildPainting(THREE, p, {
        maxW: 2.6, maxH: 2.4, frameColor: p.frame.color, anisotropy: aniso,
      });
      pp.group.position.set(pl.x, pl.y, pl.z);
      pp.group.rotation.y = pl.rotY;
      const game = gameById(p.gameId);
      const title = game ? game.title : p.title;
      world.add(pp.group);
      ents.push({ ...pl, title, uniforms: pp.uniforms });
    }
    // 飾りの絵
    for (const pl of decorPlacements()) {
      const pp = buildPainting(THREE, pl.painting, {
        maxW: pl.maxW || 3, maxH: pl.maxH || 2.6, frameColor: PALETTE.frameGold, anisotropy: aniso,
      });
      pp.group.position.set(pl.x, pl.y, pl.z);
      pp.group.rotation.y = pl.rotY;
      world.add(pp.group);
      // 手に入れるまでは布をかけて見せない（布には「？」）
      const cloth = new THREE.Group();
      const cw = (pl.maxW || 3) + 0.3;
      const chh = (pl.maxH || 2.6) + 0.3;
      const drape = new THREE.Mesh(new THREE.BoxGeometry(cw, chh, 0.08), mat('uiShade'));
      cloth.add(drape);
      const q = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(cw, chh) * 0.5, Math.min(cw, chh) * 0.5),
        new THREE.MeshBasicMaterial({ map: labelTexture(THREE, ['？'], { w: 64, h: 64 }), transparent: true }),
      );
      q.position.z = 0.05;
      cloth.add(q);
      cloth.position.set(pl.x, pl.y, pl.z);
      cloth.rotation.y = pl.rotY;
      cloth.translateZ(0.12);
      world.add(cloth);
      decors.push({ ...pl, uniforms: pp.uniforms, cloth });
    }

    // 館のボス（ビッグヌス）は絵の中にいるので歩き回らない。倒すと奥の広間に集まる。
    // 館の住人も、ビッグヌスを倒すごとに1人ずつ出てくる（applyProgress で置き直す）
    gathering = new THREE.Group();
    world.add(gathering);
    walker = createWalker(ctx, {
      walkable: (x, z) => galleryWalkable(x, z) && !(troupe && troupe.blocks(x, z))
        && !gatherers.some((g) => Math.hypot(x - g.x, z - g.z) < 0.8),
      camInside: galleryCameraInside,
    });
    walker.addTo(world);
  }

  function resetOverlays() {
    if (flashEl) flashEl.style.opacity = '0';
    if (darkEl) darkEl.style.opacity = '0';
  }

  function beginDive(e) {
    const rooms = ctx.readyRooms && typeof ctx.readyRooms === 'object' ? ctx.readyRooms : {};
    const dest = resolveDestination(e.painting.id, rooms);
    if (!dest) return;
    leaving = true;
    ctx.ui.setHint('');
    const s = walker.st;
    const from = { x: s.x, y: s.y, z: s.z };
    const proceed = (entry) => {
      dive = {
        t: 0, e, dest, entry, from, done: false,
      };
      sfx('confirm');
    };
    if (typeof ctx.chooseCarry === 'function') ctx.chooseCarry(dest.gameId, proceed);
    else proceed(null);
  }

  function finishDive() {
    const d = dive.dest;
    const entry = dive.entry;
    const params = {
      gameId: d.gameId,
      title: d.title || (d.params && d.params.title),
      carry: entry && entry.params ? entry.params : {},
    };
    const roomKey = d.kind === 'game' ? (d.room || d.scene) : null;
    const ok = roomKey ? ctx.goto(roomKey, params) : ctx.goto('construction', params);
    if (!ok) {
      dive = null;
      leaving = false;
      walker.rig.root.scale.setScalar(1);
      resetOverlays();
      return;
    }
    // 館のゲームは紹介の画面に「アイテム効果：…」の行があるので、上に重なる帯は出さない
    // （帯が紹介の題名に約3秒重なって読めなかった）
  }

  function stepDive(dt) {
    dive.t += dt;
    const k = Math.min(1, dive.t / 0.6);
    const e = dive.e;
    const tx = e.x - Math.sin(e.rotY) * 0.4;
    const tz = e.z - Math.cos(e.rotY) * 0.4;
    const lerp = (a, b) => a + (b - a) * k;
    const root = walker.rig.root;
    root.position.set(lerp(dive.from.x, tx), lerp(dive.from.y, e.y - 0.8), lerp(dive.from.z, tz));
    root.scale.setScalar(Math.max(0.05, 1 - 0.9 * k));
    walker.shadow.visible = k < 0.5;
    e.uniforms.time.value = time;
    e.uniforms.amp.value = 0.03 + 0.04 * k;
    if (flashEl) {
      if (dive.t < 0.35) {
        flashEl.style.background = PALETTE.checkerLight;
        flashEl.style.opacity = (dive.t / 0.35).toFixed(3);
      } else {
        flashEl.style.background = PALETTE.fade;
        flashEl.style.opacity = '1';
      }
    }
    if (dive.t >= DIVE_TIME && !dive.done) {
      dive.done = true;
      finishDive();
    }
  }

  return {
    enter(params = {}) {
      if (!world) build();
      ctx.setWorld(world);
      flashEl = overlay('dive-flash');
      darkEl = overlay('gallery-dark');
      darkEl.style.background = `radial-gradient(circle, transparent 25%, ${PALETTE.fade} 100%)`;
      setLabelPresenter(null);
      resetOverlays();
      leaving = false;
      dive = null;
      walker.shadow.visible = true;
      applyProgress();
      // 9人目を倒して戻ってきたら、先輩のひとことのあと本当のエンディングへ
      const st = loadStory(ctx.storage);
      // 初めて入ったときは、9人のビッグヌスの宣戦布告から（見終わると fromIntro つきで戻ってくる）
      if (!params.fromIntro && mansionIntroDue(st, defeatedMansionGames(paintings).length)) {
        leaving = true;
        if (ctx.goto('mansionintro', {})) return;
        leaving = false;
      }
      if (finaleDue(defeatedMansionGames(paintings).length, st)) {
        ctx.ui.openDialog({
          name: '先輩アリヌス',
          lines: [...FINALE_LINES],
          onClose: () => {
            leaving = true;
            if (!ctx.goto('ending', { finale: true })) leaving = false;
          },
        });
      } else if (allPaintingsEventDue(allCollected(paintings), st)) {
        leaving = true;
        if (!ctx.goto('allpaintings', {})) leaving = false;
      }
      const back = params.fromPainting ? ents.find((e) => e.painting.id === params.fromPainting) : null;
      if (back) {
        // 出てきた絵の正面に、絵のほうを向いて立つ（飛び込みの射程の外）
        const side = Math.sign(back.x) || 1;
        walker.place(side * (L.halfWidth - 2.4), back.z, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      } else if (params.fromConstruction) walker.place(0, L.hallCenterZ + 2, 0);
      else walker.place(0, 0, Math.PI);
      ctx.ui.refreshHud();
    },
    update(dt) {
      time += dt;
      for (const d of decors) {
        d.uniforms.time.value = time;
        // 飾りの絵は飛び込めないので波打たせない（依頼者の指摘: うねると飛び込めそうに見える）
        d.uniforms.amp.value = 0;
      }
      if (dive) {
        stepDive(dt);
        return;
      }
      if (leaving) return;
      const input = ctx.input;
      const talking = ctx.ui.isDialogOpen();
      if (talking) {
        if (input.wasPressed('Escape', 'Backspace')) ctx.ui.closeDialog();
        else if (input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space')) ctx.ui.advanceDialog();
      }
      const buddy = !talking && troupe ? findTalkTarget(walker.st, [...troupe.talkers, ...gatherers]) : null;
      walker.update(dt, { locked: talking, noTurn: !!buddy });
      if (troupe) troupe.update(dt, walker.st);
      stepGatherers(dt);
      if (buddy && input.wasPressed('KeyE', 'Enter', 'NumpadEnter')) talkToCast(buddy);
      const s = walker.st;
      let near = null;
      let nearD = Infinity;
      let dark = 0;
      for (const e of ents) {
        const d = Math.hypot(s.x - e.x, s.z - e.z);
        e.uniforms.time.value = time;
        e.uniforms.amp.value = rippleStrength(d) * 0.03;
        dark = Math.max(dark, darknessLevel(e.painting.id, d));
        if (d < nearD) {
          nearD = d;
          near = e;
        }
      }
      if (darkEl) darkEl.style.opacity = dark.toFixed(3);
      if (!talking && near && canDive(near.painting.id, { distance: nearD, airborne: s.y > 0.15 })) {
        beginDive(near);
        return;
      }
      const busy = talking || ctx.ui.isDialogOpen();
      if (busy) ctx.ui.setHint('');
      else if (buddy) ctx.ui.setHint(`E/Enter: ${buddy.name}と話す`);
      else ctx.ui.setHint(decorHint(s) || (s.z < L.corridorEnd ? CONTROLS_HALL : CONTROLS));
      if (s.z > L.entryZ + 0.4) {
        leaving = true;
        if (!ctx.goto('hub', { fromGallery: true })) leaving = false;
      }
    },
    // 試し遊び用の状態（布のかかった絵の数・広間に集まった顔ぶれ）
    smokeState() {
      return {
        phase: dive ? 'dive' : 'walk',
        covered: decors.filter((d) => d.cloth.visible).length,
        gathered: gatherers.map((g) => g.id),
        earned: paintings.earned.length,
      };
    },
    exit() {
      dive = null;
      resetOverlays();
      if (walker) {
        walker.rig.root.scale.setScalar(1);
        walker.shadow.visible = true;
      }
      ctx.ui.setHint('');
    },
  };
}
