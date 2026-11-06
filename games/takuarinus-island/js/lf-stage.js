// レバガチャファイターヌスの舞台：夕暮れの屋上（床板・フェンス・遠景のビル影・橙から紫の空・低い太陽）。
// three.js は ctx.THREE から受け取る（このファイルは three を import しない。読み込み時に何もしない）。
import { makeRng } from './lf-rng.js';
import { PALETTE } from './palette.js';

export const LF_STAGE_MIN = -6;
export const LF_STAGE_MAX = 6;

const SKY_STOPS = [
  [-1, PALETTE.lfcSaddlebrown], [0, PALETTE.lfcDarkorange], [0.08, PALETTE.lfcTomato], [0.22, PALETTE.lfcPalevioletred],
  [0.45, PALETTE.lfcMediumpurple], [1, PALETTE.lfcMidnightblue],
];

export function buildLfStage(ctx) {
  const { THREE } = ctx;
  const col = (n) => new THREE.Color(n);
  const lam = (n) => new THREE.MeshLambertMaterial({ color: col(n) });
  const basic = (n, extra = {}) => new THREE.MeshBasicMaterial({ color: col(n), ...extra });
  const world = new THREE.Scene();
  world.background = col(PALETTE.lfcMidnightblue);
  world.fog = new THREE.Fog(col(PALETTE.lfcPalevioletred), 45, 150);
  const add = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    world.add(o);
    return o;
  };

  // 空（下が橙、上が紫）
  const R = 190;
  const skyGeo = new THREE.SphereGeometry(R, 32, 16);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const stops = SKY_STOPS.map(([k, n]) => [k, col(n)]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(-1, Math.min(1, pos.getY(i) / R));
    let j = 0;
    while (j < stops.length - 2 && k > stops[j + 1][0]) j++;
    const [k0, c0] = stops[j];
    const [k1, c1] = stops[j + 1];
    const f = Math.max(0, Math.min(1, (k - k0) / Math.max(1e-6, k1 - k0)));
    c.copy(c0).lerp(c1, f);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  world.add(sky);

  // 低い太陽と光のにじみ
  add(new THREE.SphereGeometry(9, 20, 12), basic(PALETTE.lfcOrange, { fog: false }), -32, 5, -150);
  const glow = add(
    new THREE.SphereGeometry(17, 20, 12),
    basic(PALETTE.lfcGold, { fog: false, transparent: true, opacity: 0.22, depthWrite: false }),
    -32, 5, -152,
  );

  // 遠景のビル影と窓明かり
  const rng = makeRng(20240607);
  const bMat = new THREE.MeshBasicMaterial({ color: col(PALETTE.lfcBlack).lerp(col(PALETTE.lfcIndigo), 0.35) });
  const winA = basic(PALETTE.lfcGold);
  const winB = basic(PALETTE.lfcOrange);
  const winGeo = new THREE.PlaneGeometry(0.9, 1.2);
  for (let x = -150; x < 150;) {
    const w = 6 + rng() * 10;
    const h = 10 + rng() * 42;
    const d = 8 + rng() * 8;
    const z = -75 - rng() * 30;
    add(new THREE.BoxGeometry(w, h, d), bMat, x + w / 2, h / 2 - 25, z);
    const n = Math.floor(rng() * 6);
    for (let k = 0; k < n; k++) {
      const wx = x + 1 + rng() * Math.max(0.1, w - 2);
      const wy = -25 + 3 + rng() * Math.max(0.1, h - 6);
      if (wy < -1) continue;
      add(winGeo, rng() < 0.5 ? winA : winB, wx, wy, z + d / 2 + 0.05);
    }
    x += w + 1 + rng() * 3;
  }

  // 屋上の床
  const roof = add(new THREE.PlaneGeometry(70, 40), lam(PALETTE.lfcDimgray), 0, 0, -6);
  roof.rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(70, 0.7, 0.4), lam(PALETTE.lfcGray), 0, 0.35, -14);
  // 戦う場所の床板
  for (let i = 0; i < 10; i++) {
    add(new THREE.BoxGeometry(14.4, 0.06, 0.47), lam(i % 2 ? PALETTE.lfcSaddlebrown : PALETTE.lfcSienna), 0, 0.03, -2.25 + i * 0.5);
  }
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.15, 0.1, 5.1), lam(PALETTE.lfcDarkslategray), sx * 7.25, 0.05, 0);

  // フェンス
  const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);
  const postMat = lam(PALETTE.lfcGray);
  for (let x = -14; x <= 14; x += 2) add(postGeo, postMat, x, 0.8, -3.4);
  for (const y of [0.1, 0.8, 1.55]) add(new THREE.BoxGeometry(28, 0.04, 0.04), postMat, 0, y, -3.4);
  add(
    new THREE.PlaneGeometry(28, 1.5),
    basic(PALETTE.lfcSilver, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    0, 0.8, -3.42,
  );

  // 給水塔・出入口・室外機・アンテナ
  add(new THREE.CylinderGeometry(1.2, 1.2, 2, 12), lam(PALETTE.lfcSlategray), -9, 2.6, -7.5);
  add(new THREE.ConeGeometry(1.25, 0.6, 12), lam(PALETTE.lfcSlategray), -9, 3.9, -7.5);
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    add(new THREE.BoxGeometry(0.12, 1.6, 0.12), lam(PALETTE.lfcDimgray), -9 + dx, 0.8, -7.5 + dz);
  }
  add(new THREE.BoxGeometry(2.6, 2.6, 2.2), lam(PALETTE.lfcGray), 8.5, 1.3, -7.5);
  add(new THREE.PlaneGeometry(0.9, 1.9), lam(PALETTE.lfcDarkslategray), 8.5, 0.95, -6.38);
  add(new THREE.BoxGeometry(1.1, 0.9, 0.7), lam(PALETTE.lfcLightslategray), 4.4, 0.45, -6.2);
  add(new THREE.BoxGeometry(1.1, 0.9, 0.7), lam(PALETTE.lfcLightslategray), 5.7, 0.45, -6.2);
  add(new THREE.CylinderGeometry(0.05, 0.08, 6, 6), lam(PALETTE.lfcDimgray), 12, 3, -9);
  const beacon = add(new THREE.SphereGeometry(0.15, 8, 6), basic(PALETTE.lfcRed, { fog: false }), 12, 6.1, -9);

  // 光：暖色の平行光と半球光
  world.add(new THREE.HemisphereLight(col(PALETTE.lfcLightsalmon), col(PALETTE.lfcDarkslateblue), 1.0));
  const key = new THREE.DirectionalLight(col(PALETTE.lfcOrange), 1.8);
  key.position.set(-12, 9, 14);
  const rim = new THREE.DirectionalLight(col(PALETTE.lfcOrangered), 0.9);
  rim.position.set(-30, 6, -40);
  world.add(key, rim, new THREE.AmbientLight(col(PALETTE.lfcPlum), 0.3));

  return {
    world,
    update(t) {
      const tt = Number.isFinite(t) ? t : 0;
      glow.scale.setScalar(1 + Math.sin(tt * 0.8) * 0.03);
      beacon.visible = Math.floor(tt * 1.2) % 2 === 0;
    },
  };
}
