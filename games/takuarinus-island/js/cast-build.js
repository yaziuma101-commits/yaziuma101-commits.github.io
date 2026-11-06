// 新キャラの形データ（cast-defs.js）→ THREE.Group。three.js は引数で受け取る。
// モジュールの読み込み時には DOM・three.js に触らない（node --test から import されるため）。
import { translate, JA_CHAR } from './i18n.js';
import { getCast, FACE_CROP } from './cast-defs.js';
import { PALETTE } from './palette.js';
import { crispCanvasSize } from './gallery-labels.js';

const FACE_URL = './models/dotnus-002.png';
const FACE_TEX_SIZE = 1024;

/** 当たり判定の半径（床の上の広がりから概算。0.5〜1.4） */
export function castRadius(def) {
  let r = 0;
  for (const p of (def && def.parts) || []) {
    if (p.onlyForVariant) continue;
    const s = p.size;
    let half;
    if (p.shape === 'box') half = Math.max(s[0], s[2]) / 2;
    else if (p.shape === 'fan') half = s[0] * 0.5;
    else if (p.shape === 'plane') half = s[0] / 2;
    else half = s[0];
    r = Math.max(r, Math.hypot(p.pos[0], p.pos[2]) + half);
  }
  return Math.min(1.4, Math.max(0.5, r * 0.8));
}

/** いちばん上の高さ（記号を浮かべる位置） */
export function castTop(def) {
  let top = 0;
  for (const p of (def && def.parts) || []) {
    if (p.onlyForVariant) continue;
    const s = p.size;
    let up;
    if (p.shape === 'sphere' || p.shape === 'fan') up = s[0];
    else if (p.shape === 'tube') up = s[1];
    else if (p.shape === 'torus') up = s[0] * 0.3;
    else up = s[1] / 2;
    top = Math.max(top, p.pos[1] + up);
  }
  return top;
}

function hashPhase(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h % 100) * 0.37;
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

// ---- 形と材質（キャッシュ） ----
const geoCache = new Map();
const matCache = new Map();
let faceMat = null;

function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function fanGeometry(THREE, [R, deg, t]) {
  const a = (deg * Math.PI) / 180;
  const s0 = Math.PI / 2 - a / 2;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(Math.cos(s0) * R, Math.sin(s0) * R);
  sh.absarc(0, 0, R, s0, s0 + a, false);
  sh.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 16 });
  g.translate(0, 0, -t / 2);
  return g;
}

function tubeGeometry(THREE, [r, len]) {
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    pts.push(new THREE.Vector3(Math.sin(i * 1.4) * r * 2.5, (i / 5) * len, Math.cos(i * 1.1) * r * 0.8 - r * 0.8));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r, 6, false);
}

function geometry(THREE, shape, size) {
  return cachedGeo(`${shape}:${size.join(',')}`, () => {
    switch (shape) {
      case 'sphere': return new THREE.SphereGeometry(size[0], 10, 8);
      case 'box': return new THREE.BoxGeometry(size[0], size[1], size[2]);
      case 'cylinder': return new THREE.CylinderGeometry(size[0], size[0], size[1], 10);
      case 'cone': return new THREE.ConeGeometry(size[0], size[1], 8);
      case 'torus': return new THREE.TorusGeometry(size[0], size[1], 6, 18);
      case 'fan': return fanGeometry(THREE, size);
      case 'tube': return tubeGeometry(THREE, size);
      case 'plane': return new THREE.PlaneGeometry(size[0], size[1]);
      default: return new THREE.BoxGeometry(0.2, 0.2, 0.2);
    }
  });
}

function material(THREE, color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), flatShading: true, roughness: 0.85, metalness: 0,
    });
    matCache.set(color, m);
  }
  return m;
}

/** 主人公テクスチャから顔を切り出して貼る（元ファイルは書き換えない） */
function faceMaterial(THREE) {
  if (faceMat) return faceMat;
  faceMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.faceWindow) });
  if (typeof Image === 'undefined' || typeof document === 'undefined') return faceMat;
  const img = new Image();
  img.onload = () => {
    const kw = (img.naturalWidth || FACE_TEX_SIZE) / FACE_TEX_SIZE;
    const kh = (img.naturalHeight || FACE_TEX_SIZE) / FACE_TEX_SIZE;
    const c = document.createElement('canvas');
    c.width = FACE_CROP.w * 2;
    c.height = FACE_CROP.h * 2;
    const g = c.getContext('2d');
    g.drawImage(img, FACE_CROP.x * kw, FACE_CROP.y * kh, FACE_CROP.w * kw, FACE_CROP.h * kh, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    faceMat.map = tex;
    faceMat.needsUpdate = true;
  };
  img.onerror = () => console.warn('顔のテクスチャを読めません:', FACE_URL);
  img.src = FACE_URL;
  return faceMat;
}

function textTexture(THREE, lines, {
  w = 256, h = 96, bg = PALETTE.signFace, fg = PALETTE.signInk, stroke = null, border = PALETTE.signStripe,
} = {}) {
  const size = crispCanvasSize(w, h);
  const c = document.createElement('canvas');
  c.width = size.width;
  c.height = size.height;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    if (border) {
      const lw = Math.max(3, c.height * 0.05);
      g.strokeStyle = border;
      g.lineWidth = lw;
      g.strokeRect(lw / 2, lw / 2, c.width - lw, c.height - lw);
    }
  }
  const maxChars = Math.max(1, ...lines.map((s) => [...s].length));
  const fs = Math.floor(Math.min((c.height * 0.8) / lines.length, (c.width * 0.9) / maxChars));
  g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", "Meiryo", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((s, i) => {
    const y = (c.height * (i + 0.5)) / lines.length;
    if (stroke) {
      g.lineWidth = fs * 0.14;
      g.strokeStyle = stroke;
      g.strokeText(s, c.width / 2, y);
    }
    g.fillStyle = fg;
    g.fillText(s, c.width / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function makePart(THREE, p) {
  let mesh;
  if (p.role === 'face' && p.shape === 'plane') {
    const round = p.window === 'round';
    const geo = cachedGeo(round ? 'face:round' : 'face:rect', () => (round ? new THREE.CircleGeometry(0.5, 20) : new THREE.PlaneGeometry(1, 1)));
    mesh = new THREE.Mesh(geo, faceMaterial(THREE));
    mesh.scale.set(p.size[0], p.size[1], 1);
  } else {
    mesh = new THREE.Mesh(geometry(THREE, p.shape, p.size), material(THREE, p.color));
  }
  mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
  mesh.userData.castBase = {
    x: p.pos[0], y: p.pos[1], z: p.pos[2], rx: mesh.rotation.x, ry: mesh.rotation.y, rz: mesh.rotation.z,
  };
  mesh.userData.pose = p.pose || null;
  return mesh;
}

/** 看板の文字を2行に分ける（英語は語の切れ目で） */
export function signLines(text) {
  const chars = [...text];
  if (!JA_CHAR.test(text)) {
    if (chars.length <= 14 || !text.includes(' ')) return [text];
    const mid = text.length / 2;
    const cut = [...text.matchAll(/ /g)].map((m) => m.index).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    return [text.slice(0, cut), text.slice(cut + 1)];
  }
  const half = Math.ceil(chars.length / 2);
  return chars.length > 8 ? [chars.slice(0, half).join(''), chars.slice(half).join('')] : [text];
}

function buildSign(THREE, rawText) {
  const g = new THREE.Group();
  const text = translate(rawText);
  const lines = signLines(text);
  const post = new THREE.Mesh(geometry(THREE, 'cylinder', [0.05, 1.4]), material(THREE, PALETTE.boardDark));
  post.position.y = 0.7;
  const back = new THREE.Mesh(geometry(THREE, 'box', [2.2, 0.9, 0.08]), material(THREE, PALETTE.board));
  back.position.y = 1.6;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.8),
    new THREE.MeshBasicMaterial({ map: textTexture(THREE, lines, { w: 256, h: 96 }) }),
  );
  face.position.set(0, 1.6, 0.045);
  g.add(post, back, face);
  return g;
}

/** 1体を組む。返り値の update(t) で待機の揺れとポーズを動かす */
export function buildCastModel(THREE, def, { variant = null } = {}) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const nodes = {};
  const posed = [];
  for (const p of def.parts) {
    if (p.onlyForVariant && p.onlyForVariant !== variant) continue;
    const m = makePart(THREE, p);
    inner.add(m);
    if (!nodes[p.role]) nodes[p.role] = [];
    nodes[p.role].push(m);
    if (m.userData.pose) posed.push(m);
  }
  const top = castTop(def);
  let companion = null;
  const compWings = [];
  if (def.companion) {
    companion = new THREE.Group();
    for (const p of def.companion.parts) {
      const m = makePart(THREE, p);
      companion.add(m);
      if (p.role === 'wing') compWings.push(m);
    }
    inner.add(companion);
  }
  const symbols = [];
  for (const s of def.symbols || []) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textTexture(THREE, [s.text], { w: 64, h: 64, bg: null, fg: PALETTE.uiAccent, stroke: PALETTE.uiShade }),
      transparent: true,
      depthWrite: false,
    }));
    spr.scale.setScalar(0.7);
    spr.position.y = top + 0.5;
    inner.add(spr);
    symbols.push(spr);
  }
  if (def.sign) {
    const sign = buildSign(THREE, def.sign);
    sign.position.set(1.5, 0, 0);
    sign.rotation.y = -0.3;
    root.add(sign);
  }
  const phase = hashPhase(def.id) + (variant ? 1.3 : 0);

  function update(t) {
    const T = (Number.isFinite(t) ? t : 0) + phase;
    let y = Math.sin(T * 1.6) * 0.05;
    if (def.floating) y += 0.25 + Math.sin(T * 1.2) * 0.15;
    const bounce = def.pose === 'arms-curl-bounce';
    if (bounce) y += Math.abs(Math.sin(T * 3.2)) * 0.35;
    inner.position.y = y;
    inner.rotation.z = bounce ? Math.sin(T * 3.2) * 0.06 : 0;
    for (const m of posed) {
      const b = m.userData.castBase;
      if (m.userData.pose === 'paw-up') m.rotation.z = b.rz + Math.sin(T * 3) * 0.3;
      else if (m.userData.pose === 'm-claws') m.rotation.z = b.rz + Math.sin(T * 6) * 0.15;
    }
    if (bounce) {
      for (const m of nodes.arm || []) m.rotation.z = m.userData.castBase.rz + Math.sin(T * 3.2) * 0.5;
    }
    (nodes.smoke || []).forEach((m, i) => {
      const b = m.userData.castBase;
      m.rotation.z = b.rz + Math.sin(T * 1.8 + i) * 0.25;
      m.position.x = b.x + Math.sin(T * 1.2 + i * 1.7) * 0.08;
    });
    (nodes.segment || []).forEach((m, i) => {
      m.position.y = m.userData.castBase.y + Math.sin(T * 3 - i * 0.6) * 0.07;
    });
    (nodes.wing || []).forEach((m, i) => {
      m.rotation.y = m.userData.castBase.ry + Math.sin(T * 8) * 0.35 * (i % 2 ? 1 : -1);
    });
    if (companion) {
      const a = T * 1.4;
      companion.position.set(Math.cos(a) * 0.9, top + 0.35 + Math.sin(T * 3) * 0.15, Math.sin(a) * 0.9);
      companion.rotation.y = -a;
      compWings.forEach((m, i) => {
        m.rotation.y = m.userData.castBase.ry + Math.sin(T * 12) * 0.5 * (i % 2 ? 1 : -1);
      });
    }
    for (const spr of symbols) spr.position.y = top + 0.5 + Math.sin(T * 2) * 0.08;
  }
  update(0);
  return {
    root, inner, def, nodes, update,
  };
}

function buildCrowd(THREE, def, spot, shadowOf, group) {
  const n = def.crowd.size;
  const ribbons = def.crowd.ribbonCount || 0;
  const ribbonAt = Math.floor(n / 2);
  const scale = spot.scale > 0 ? spot.scale : 0.7;
  const members = [];
  for (let i = 0; i < n; i++) {
    const variant = i >= ribbonAt && i < ribbonAt + ribbons ? 'ribbon' : null;
    const model = buildCastModel(THREE, def, { variant });
    model.inner.scale.setScalar(scale);
    group.add(model.root);
    const sh = shadowOf(0.5 * scale);
    if (sh) group.add(sh);
    members.push({ model, sh });
  }
  const R = spot.ring > 0 ? spot.ring : 4.5;
  const speed = Number.isFinite(spot.speed) ? spot.speed : 0.25;
  const gap = Number.isFinite(spot.gap) ? spot.gap : 0.28;
  const talker = {
    id: def.id, name: def.name, x: spot.x, z: spot.z, radius: 0.6, model: members[0].model,
  };
  function update(t) {
    members.forEach((m, i) => {
      const a = t * speed - i * gap;
      const x = spot.x + Math.cos(a) * R;
      const z = spot.z + Math.sin(a) * R;
      m.model.update(t);
      m.model.root.position.set(x, Math.abs(Math.sin(t * 8 + i)) * 0.12, z);
      m.model.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      m.model.inner.rotation.z = Math.sin(t * 8 + i) * 0.15;
      if (m.sh) m.sh.position.set(x, 0.025, z);
      if (i === 0) {
        talker.x = x;
        talker.z = z;
      }
    });
  }
  update(0);
  return { talker, update };
}

/**
 * キャラの一座を置く。spots は {id: {x,z,facing}}（群れは {x,z,ring,speed,gap,scale}）。
 * talkers は findTalkTarget にそのまま渡せる。obstacles は {x,z,r}。
 */
export function createCastTroupe(THREE, ids, spots = {}, { makeShadow = null } = {}) {
  const group = new THREE.Group();
  const actors = [];
  const talkers = [];
  const obstacles = [];
  const crowds = [];
  let time = 0;
  const shadowOf = (r) => (typeof makeShadow === 'function' ? makeShadow(r) : null);

  for (const id of Array.isArray(ids) ? ids : []) {
    const def = getCast(id);
    const spot = spots[id];
    if (!def || !spot) continue;
    if (def.crowd) {
      const c = buildCrowd(THREE, def, spot, shadowOf, group);
      crowds.push(c);
      talkers.push(c.talker);
      continue;
    }
    const facing = Number.isFinite(spot.facing) ? spot.facing : 0;
    const members = Array.isArray(def.family) && def.family.length ? def.family : [{ scale: 1 }];
    const r = castRadius(def);
    let first = null;
    members.forEach((mem, k) => {
      const sc = mem.scale > 0 ? mem.scale : 1;
      const model = buildCastModel(THREE, def, { variant: k ? `family${k}` : null });
      model.inner.scale.setScalar(sc);
      const off = k * r * 1.6;
      const x = spot.x + Math.cos(facing) * off;
      const z = spot.z - Math.sin(facing) * off;
      model.root.position.set(x, 0, z);
      model.root.rotation.y = facing;
      group.add(model.root);
      const sh = shadowOf(r * 1.2 * sc);
      if (sh) {
        sh.position.set(x, 0.025, z);
        group.add(sh);
      }
      actors.push({
        model, x, z, facing, look: spot.look !== false,
      });
      obstacles.push({ x, z, r: r * sc });
      if (!first) first = model;
    });
    talkers.push({
      id, name: def.name, x: spot.x, z: spot.z, radius: r, model: first,
    });
  }

  return {
    group,
    talkers,
    obstacles,
    /** 歩く人（半径 pad）がキャラにめり込むか */
    blocks(x, z, pad = 0.35) {
      return obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);
    },
    update(dt, focus) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      time += d;
      for (const a of actors) {
        a.model.update(time);
        if (a.look && focus) {
          const dist = Math.hypot(focus.x - a.x, focus.z - a.z);
          const want = dist < 4 ? Math.atan2(focus.x - a.x, focus.z - a.z) : a.facing;
          a.model.root.rotation.y = lerpAngle(a.model.root.rotation.y, want, Math.min(1, d * 4));
        }
      }
      for (const c of crowds) c.update(time);
    },
  };
}
