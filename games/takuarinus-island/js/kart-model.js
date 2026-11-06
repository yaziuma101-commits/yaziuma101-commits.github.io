// カートの見た目（低ポリの箱＋円筒）。three.js は引数で受け取る（静的 import しない）。
import { KART } from './kart.js';

export const KART_SIZE = Object.freeze({ seatY: 0.62, seatZ: -0.3 });

/**
 * カートを作る。乗り手は seat（座面の高さ）に add する。
 * 返り値: { root, body, seat, update(kart, dt, steer, surface, t) }
 */
export function buildKart(THREE, mat, { bodyKey = 'heroBody', trimKey = 'checkerLight' } = {}) {
  const S = KART_SIZE;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const add = (geo, key, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat(key));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w, h, d, key, x, y, z) => add(new THREE.BoxGeometry(w, h, d), key, x, y, z);

  // 車体
  box(1.2, 0.26, 2.3, bodyKey, 0, 0.36, 0);
  box(0.95, 0.3, 0.75, bodyKey, 0, 0.52, 0.85);
  box(1.4, 0.1, 0.35, trimKey, 0, 0.3, 1.32);
  for (const s of [-1, 1]) box(0.26, 0.3, 1.1, trimKey, s * 0.72, 0.42, -0.05);
  // 座席
  box(0.85, 0.12, 0.7, 'goggleFrame', 0, S.seatY - 0.06, S.seatZ);
  const back = box(0.85, 0.75, 0.14, 'goggleFrame', 0, S.seatY + 0.32, S.seatZ - 0.4);
  back.rotation.x = -0.2;
  // エンジンと排気管・炎
  box(0.7, 0.42, 0.45, 'tireRim', 0, 0.62, -1.02);
  const pipeGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 6);
  pipeGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.14, 0.7, 6);
  flameGeo.rotateX(-Math.PI / 2); // 先が後ろ（-z）
  const flames = [];
  for (const s of [-1, 1]) {
    add(pipeGeo, 'goggleFrame', s * 0.22, 0.68, -1.38);
    const fl = add(flameGeo, 'roadDark', s * 0.22, 0.68, -1.85);
    fl.visible = false;
    flames.push(fl);
  }
  // ハンドル
  const col = add(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5), 'goggleFrame', 0, 0.8, 0.56);
  col.rotation.x = -0.78;
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(0, 1.0, 0.36);
  wheelPivot.rotation.x = -0.5;
  body.add(wheelPivot);
  const steeringWheel = add(new THREE.TorusGeometry(0.2, 0.04, 4, 10), 'goggleFrame', 0, 0, 0, wheelPivot);

  // 車輪（前輪はかじ取りの入れ物に入れる）
  const wheels = [];
  const steerGroups = [];
  const mkWheel = (x, z, r, w, front) => {
    const holder = new THREE.Group();
    holder.position.set(x, r, z);
    root.add(holder);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), mat('tire'));
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8), mat('tireRim'));
    tire.add(rim);
    holder.add(tire);
    wheels.push({ tire, r });
    if (front) steerGroups.push(holder);
  };
  for (const s of [-1, 1]) {
    mkWheel(s * 0.78, 0.85, 0.32, 0.3, true);
    mkWheel(s * 0.8, -0.8, 0.38, 0.42, false);
  }

  // 乗り手の座る位置
  const seat = new THREE.Group();
  seat.position.set(0, S.seatY, S.seatZ);
  body.add(seat);

  return {
    root,
    body,
    seat,
    update(kart, dt, steer = 0, surface = 'road', t = 0) {
      const speed = Number.isFinite(kart.speed) ? kart.speed : 0;
      const d = Number.isFinite(dt) ? dt : 0;
      for (const w of wheels) w.tire.rotation.x += (speed * d) / w.r;
      const s = Math.max(-1, Math.min(1, steer || 0));
      for (const g of steerGroups) g.rotation.y = -s * 0.4;
      steeringWheel.rotation.z = -s * 0.8;
      const k = Math.min(1, Math.abs(speed) / KART.maxSpeed);
      body.rotation.z = s * k * 0.06;
      const bumpy = surface === 'grass' || surface === 'out';
      body.position.y = bumpy ? Math.sin(t * 30) * 0.03 * Math.min(1, Math.abs(speed) / 5) : 0;
      const boosting = kart.boostTimer > 0;
      for (const fl of flames) {
        fl.visible = boosting;
        if (boosting) fl.scale.z = 0.8 + 0.4 * Math.abs(Math.sin(t * 40));
      }
    },
  };
}
