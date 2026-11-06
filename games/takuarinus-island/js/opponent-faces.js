// 館のゲームの対戦相手・敵の体。顔はすべて仲間・番長と同じ buildFace（主人公のテクスチャの顔）。
// three.js は引数で受け取る（読み込み時に DOM・three.js に触らない）。
import { buildFace, MODEL_UNIT } from './characters.js';

/** 顔を付けられる対戦相手の種類 */
export const OPPONENT_KINDS = Object.freeze(['dekaAlinus', 'referee', 'mohifry', 'nasu', 'sankaku', 'tabakonus']);

/** 既存の体（group）に主人公と同じ顔を貼る。y・z は顔の中心、scale は大きさ */
export function attachHeroFace(THREE, mat, group, { y = 1, z = 0.5, scale = 1, rotX = 0 } = {}) {
  const face = buildFace(THREE, mat);
  face.position.set(0, y, z);
  face.rotation.x = rotX;
  face.scale.setScalar(scale);
  group.add(face);
  return face;
}

function mesh(THREE, geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

/** 対戦相手を組む。返り値 {root, body, face, update(t)} */
export function buildOpponentModel(THREE, mat, kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  let face;
  const extras = [];
  switch (kind) {
    case 'dekaAlinus': {
      body.add(mesh(THREE, new THREE.CylinderGeometry(0.35, 0.4, 0.8, 8), mat('heroBody'), 0, 0.4, 0));
      body.add(mesh(THREE, new THREE.SphereGeometry(0.9, 10, 8), mat('heroBody'), 0, 1.5, 0));
      body.add(mesh(THREE, new THREE.BoxGeometry(0.2, 0.9, 0.15), mat('mohicanRed'), 0, 2.6, 0));
      face = attachHeroFace(THREE, mat, body, { y: 1.45, z: 0.9, scale: 2.4 });
      break;
    }
    case 'referee': {
      body.add(mesh(THREE, new THREE.CylinderGeometry(0.45, 0.5, 1.4, 8), mat('castWhite'), 0, 0.7, 0));
      body.add(mesh(THREE, new THREE.BoxGeometry(0.92, 0.12, 0.92), mat('goggleFrame'), 0, 1.0, 0));
      body.add(mesh(THREE, new THREE.SphereGeometry(0.06, 6, 4), mat('uiGold'), 0.2, 0.85, 0.5));
      face = attachHeroFace(THREE, mat, body, { y: 1.15, z: 0.47, scale: 1.4 });
      break;
    }
    case 'mohifry': {
      body.add(mesh(THREE, new THREE.ConeGeometry(0.5, 1.6, 8), mat('castFry'), 0, 0.8, 0));
      for (let i = 0; i < 6; i++) {
        body.add(mesh(THREE, new THREE.DodecahedronGeometry(0.12, 0), mat('castFryDark'),
          Math.sin(i * 2) * 0.3, 0.3 + i * 0.18, Math.cos(i * 2) * 0.3));
      }
      body.add(mesh(THREE, new THREE.BoxGeometry(0.15, 0.6, 0.1), mat('mohicanRed'), 0, 1.8, 0));
      face = attachHeroFace(THREE, mat, body, { y: 0.7, z: 0.33, scale: 1.3 });
      break;
    }
    case 'nasu': {
      const b = mesh(THREE, new THREE.SphereGeometry(0.6, 10, 8), mat('nasuBody'), 0, 0.8, 0);
      b.scale.set(1, 1.5, 1);
      body.add(b, mesh(THREE, new THREE.ConeGeometry(0.35, 0.4, 6), mat('nasuCalyx'), 0, 1.75, 0));
      face = attachHeroFace(THREE, mat, body, { y: 0.8, z: 0.6, scale: 1.6 });
      break;
    }
    case 'sankaku': {
      const tri = mesh(THREE, new THREE.ConeGeometry(0.9, 1.8, 3), mat('uiGold'), 0, 0.9, 0);
      tri.rotation.y = Math.PI;
      body.add(tri);
      face = attachHeroFace(THREE, mat, body, { y: 0.6, z: 0.47, scale: 1.4 });
      break;
    }
    case 'tabakonus': {
      // タバコは描かず、シャボン玉を吹く
      body.add(mesh(THREE, new THREE.CylinderGeometry(0.5, 0.55, 1.6, 8), mat('castGray'), 0, 0.8, 0));
      body.add(mesh(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), mat('castPink'), 0.15, 1.0, 0.65));
      const bubMat = mat('goggleLens').clone();
      bubMat.transparent = true;
      bubMat.opacity = 0.5;
      for (let i = 0; i < 3; i++) {
        const bub = mesh(THREE, new THREE.SphereGeometry(0.1 + i * 0.04, 8, 6), bubMat, 0.3, 1.3, 0.8);
        body.add(bub);
        extras.push({ m: bub, i });
      }
      face = attachHeroFace(THREE, mat, body, { y: 1.05, z: 0.52, scale: 1.4 });
      break;
    }
    default: {
      body.add(mesh(THREE, new THREE.CylinderGeometry(0.5, 0.5, 1.4, 8), mat('heroBody'), 0, 0.7, 0));
      face = attachHeroFace(THREE, mat, body, { y: 0.8, z: 0.52, scale: 1.4 });
    }
  }
  root.scale.setScalar(MODEL_UNIT * 1.6);
  function update(t) {
    const T = Number.isFinite(t) ? t : 0;
    body.position.y = Math.abs(Math.sin(T * 2)) * 0.05;
    for (const e of extras) {
      const k = (T * 0.5 + e.i / 3) % 1;
      e.m.position.set(0.3 + k * 0.6, 1.3 + k * 0.8, 0.8);
    }
  }
  update(0);
  return {
    root, body, face, update,
  };
}
