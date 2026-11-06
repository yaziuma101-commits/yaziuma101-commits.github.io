// 仲間・キャラクターが起こすふざけた出来事（three.js と DOM の薄い利用者）。
// 規則・一覧・動きの計算は cast-events.js。作るときには DOM に触らない。当たり判定は持たない。
import { PALETTE } from './palette.js';
import { buildCastModel } from './cast-build.js';
import { getCast } from './cast-defs.js';
import { HERO_HEIGHT } from './characters.js';
import { labelTexture } from './scenes/gallery.js';
import { fadeOutScale } from './silly-rules.js';
import {
  castEventById, liftCurve, knockbackDelta, chaseStep, ringCrossed, hitsAlongPath,
} from './cast-events.js';

const TAU = Math.PI * 2;
const GRAV = 20;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const norm2 = (x, z) => {
  const d = Math.hypot(x, z);
  return d > 1e-6 ? { x: x / d, z: z / d } : { x: 0, z: 1 };
};

/**
 * hero(): {x,z,y,yaw}、buddies(): 仲間の root の配列、castRoot(id): ハブに置いたキャラの root（隠すため）。
 * nudgeHero(dx,dz) で主人公を押し、setHeroLift(h) で主人公を浮かせる。
 */
export function createCastEventPlayer(THREE, world, {
  rng = Math.random, hero = null, buddies = null, castRoot = null, sound = null, popText = null,
  toast = null, shake = null, nudgeHero = null, setHeroLift = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'cast-events';
  world.add(group);
  const geos = new Map();
  const mats = new Map();
  const models = new Map();
  const assets = new Map();
  const stamps = new Set();
  let active = null;

  const call = (fn, ...a) => {
    if (typeof fn !== 'function') return undefined;
    try { return fn(...a); } catch (err) { console.warn(err); return undefined; }
  };
  const play = (n) => { if (n) call(sound, n); };
  const say = (w) => { if (w) call(popText, w); };
  const lift = (h) => call(setHeroLift, h);
  const heroNow = () => {
    const h = call(hero) || {};
    return {
      x: Number.isFinite(h.x) ? h.x : 0,
      z: Number.isFinite(h.z) ? h.z : 0,
      y: Number.isFinite(h.y) ? h.y : 0,
      yaw: Number.isFinite(h.yaw) ? h.yaw : 0,
    };
  };
  const once = (key, make) => {
    if (!assets.has(key)) assets.set(key, make());
    return assets.get(key);
  };
  const geo = (key, make) => {
    let g = geos.get(key);
    if (!g) {
      g = make();
      geos.set(key, g);
    }
    return g;
  };
  function mat(color, {
    double = false, transparent = false, opacity = 1, basic = false,
  } = {}) {
    const key = `${color}|${double}|${transparent}|${opacity}|${basic}`;
    let m = mats.get(key);
    if (!m) {
      const M = basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
      m = new M({
        color: new THREE.Color(color),
        side: double ? THREE.DoubleSide : THREE.FrontSide,
        transparent,
        opacity,
        depthWrite: !transparent,
      });
      mats.set(key, m);
    }
    return m;
  }
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const sphere = (key, r) => geo(key, () => new THREE.SphereGeometry(r, 8, 6));

  function fanGeo(R, deg, t) {
    const a = (deg * Math.PI) / 180;
    const s0 = Math.PI / 2 - a / 2;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(Math.cos(s0) * R, Math.sin(s0) * R);
    sh.absarc(0, 0, R, s0, s0 + a, false);
    sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 12 });
    g.translate(0, 0, -t / 2);
    return g;
  }

  /** キャラの模型（使い回す）。位置・向き・大きさを戻して返す */
  function model(id, key = id, variant = null, scale = 1) {
    let m = models.get(key);
    if (!m) {
      const def = getCast(id);
      if (!def) return null;
      m = buildCastModel(THREE, def, { variant });
      models.set(key, m);
    }
    m.root.position.set(0, 0, 0);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(1);
    m.root.visible = true;
    m.inner.rotation.set(0, 0, 0);
    m.inner.position.set(0, 0, 0);
    m.inner.scale.setScalar(scale);
    return m;
  }

  /** ハブに置いてあるそのキャラを出来事の間だけ隠す。戻す関数を返す */
  function hideCast(id) {
    const r = call(castRoot, id);
    if (r && r.visible) {
      r.visible = false;
      return () => { r.visible = true; };
    }
    return () => {};
  }

  function frame(v) {
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    return {
      fx, fz, rx, rz, at: (d, s = 0) => ({ x: v.x + fx * d + rx * s, z: v.z + fz * d + rz * s }),
    };
  }
  const faceTo = (obj, from, to) => {
    obj.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  };
  const popScale = (lt, dur = 0.3) => (lt < dur
    ? Math.sin(((lt / dur) * Math.PI) / 2) * (1 + 0.3 * Math.sin((lt / dur) * Math.PI)) : 1);

  // ---- 肉球スタンプ（画面に押す） ----
  function stampPaw() {
    if (typeof document === 'undefined' || !document.body) return;
    const el = document.createElement('div');
    el.className = 'paw-stamp';
    const rot = Math.round((rng() - 0.5) * 40);
    Object.assign(el.style, {
      position: 'fixed',
      left: `${25 + rng() * 50}%`,
      top: `${25 + rng() * 40}%`,
      width: '24vmin',
      height: '24vmin',
      pointerEvents: 'none',
      zIndex: '40',
      opacity: '0',
      transform: `translate(-50%, -50%) rotate(${rot}deg) scale(1.8)`,
      transition: 'transform 0.12s ease-out, opacity 0.3s ease-out',
    });
    const pad = (l, tp, w, h) => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: `${l}%`, top: `${tp}%`, width: `${w}%`, height: `${h}%`, borderRadius: '50%', background: PALETTE.castPink,
      });
      el.append(d);
    };
    pad(24, 44, 52, 44);
    pad(6, 20, 20, 24);
    pad(28, 2, 20, 24);
    pad(52, 2, 20, 24);
    pad(74, 20, 20, 24);
    document.body.append(el);
    stamps.add(el);
    setTimeout(() => {
      el.style.opacity = '0.85';
      el.style.transform = `translate(-50%, -50%) rotate(${rot}deg) scale(1)`;
    }, 20);
    setTimeout(() => { el.style.opacity = '0'; }, 1000);
    setTimeout(() => {
      el.remove();
      stamps.delete(el);
    }, 1400);
  }

  // ---- 1. おなすくん：ナスを撒き散らす ----
  function startOnasu(ev, g, v, F) {
    const m = model('onasu');
    if (!m) return null;
    const restore = hideCast('onasu');
    const p = F.at(5, -2);
    m.root.position.set(p.x, 0, p.z);
    faceTo(m.root, p, v);
    g.add(m.root);
    const pool = once('nasu', () => Array.from({ length: 8 }, () => {
      const n = new THREE.Group();
      const body = mesh(sphere('nasuBody', 0.22), mat(PALETTE.castPurple));
      body.scale.set(1, 1, 1.7);
      const cap = mesh(geo('nasuCap', () => new THREE.ConeGeometry(0.15, 0.2, 6)), mat(PALETTE.leaf));
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.42;
      n.add(body, cap);
      return n;
    }));
    const list = pool.map((n, i) => {
      const a = rng() * TAU;
      const sp = 2.5 + rng() * 2.5;
      n.visible = false;
      n.scale.setScalar(1);
      g.add(n);
      return {
        n, x: p.x, y: 1.8, z: p.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5 + rng() * 3, roll: 0, delay: 0.35 + i * 0.07,
      };
    });
    say(ev.words[0]);
    play(ev.sfx[0]);
    let bounced = false;
    return {
      update(t, dt) {
        m.update(t);
        m.root.position.y = t < 1.6 ? Math.abs(Math.sin(t * 9)) * 0.35 : 0;
        const s = Math.max(0.001, fadeOutScale(t, ev.duration));
        for (const q of list) {
          if (t < q.delay) continue;
          q.n.visible = true;
          q.vy -= GRAV * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.z += q.vz * dt;
          if (q.y < 0.22) {
            q.y = 0.22;
            if (q.vy < -1.5) {
              q.vy = -q.vy * 0.45;
              if (!bounced) {
                bounced = true;
                play(ev.sfx[1]);
              }
            } else q.vy = 0;
            const fr = Math.max(0, 1 - dt * 0.8);
            q.vx *= fr;
            q.vz *= fr;
          }
          q.roll += (Math.hypot(q.vx, q.vz) * dt) / 0.22;
          q.n.position.set(q.x, q.y, q.z);
          q.n.rotation.set(0, Math.atan2(q.vx, q.vz) + Math.PI / 2, q.roll);
          q.n.scale.setScalar(s);
        }
      },
      end: restore,
    };
  }

  // ---- 2. モヒフライ：油の鍋に飛び込んで揚がる ----
  function startFry(ev, g, v, F) {
    const pc = F.at(6, 0);
    const pot = once('pot', () => {
      const p = new THREE.Group();
      const wall = mesh(geo('potWall', () => new THREE.CylinderGeometry(1.2, 1.0, 0.9, 14, 1, true)), mat(PALETTE.goggleFrame, { double: true }));
      wall.position.y = 0.45;
      const oil = mesh(geo('potOil', () => new THREE.CircleGeometry(1.15, 14)), mat(PALETTE.mohicanYellow));
      oil.rotation.x = -Math.PI / 2;
      oil.position.y = 0.78;
      const rim = mesh(geo('potRim', () => new THREE.TorusGeometry(1.2, 0.08, 5, 18)), mat(PALETTE.gunNozzle));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.9;
      p.add(wall, oil, rim);
      const bubbles = Array.from({ length: 8 }, (_, i) => {
        const b = mesh(sphere('bubble', 0.09), mat(PALETTE.castWhite));
        const a = (i / 8) * TAU + i;
        const r = 0.3 + (i % 3) * 0.25;
        b.userData.at = { x: Math.cos(a) * r, z: Math.sin(a) * r };
        p.add(b);
        return b;
      });
      return { group: p, bubbles };
    });
    pot.group.position.set(pc.x, 0, pc.z);
    pot.group.scale.setScalar(1);
    g.add(pot.group);
    const fries = [0, 1, 2, 3].map((i) => {
      const m = model('mohifry', `fry${i}`, i === 0 ? 'ribbon' : null, 0.5);
      const a = (i / 4) * TAU + rng();
      const from = { x: pc.x + Math.cos(a) * 3.5, z: pc.z + Math.sin(a) * 3.5 };
      g.add(m.root);
      return {
        m, from, a, tIn: 0.3 + i * 0.25,
      };
    });
    const IN_TIME = 0.6;
    const T_OUT = 2.9;
    let sizzled = false;
    let popped = false;
    return {
      update(t) {
        const fade = Math.max(0.001, fadeOutScale(t, ev.duration));
        pot.group.scale.setScalar(fade);
        const boil = t > fries[0].tIn + IN_TIME && t < T_OUT + 0.6;
        pot.bubbles.forEach((b, i) => {
          b.visible = boil;
          const k = (t * 2.2 + i * 0.37) % 1;
          b.position.set(b.userData.at.x, 0.78 + k * 0.45, b.userData.at.z);
          b.scale.setScalar(0.6 + k);
        });
        fries.forEach((fr, i) => {
          const r = fr.m.root;
          fr.m.update(t);
          r.scale.setScalar(fade);
          if (t < fr.tIn) {
            r.position.set(fr.from.x, 0, fr.from.z);
            faceTo(r, fr.from, pc);
            return;
          }
          const tin = t - fr.tIn;
          if (tin < IN_TIME) {
            const k = tin / IN_TIME;
            r.visible = true;
            r.position.set(lerp(fr.from.x, pc.x, k), Math.sin(Math.PI * k) * 2.5 + k * 0.3, lerp(fr.from.z, pc.z, k));
            r.rotation.x = k * Math.PI;
            return;
          }
          if (!sizzled) {
            sizzled = true;
            play(ev.sfx[0]);
            say(ev.words[0]);
          }
          const tOut = T_OUT + i * 0.12;
          if (t < tOut) {
            r.visible = false;
            return;
          }
          if (!popped) {
            popped = true;
            play(ev.sfx[1]);
            say(ev.words[1]);
          }
          r.visible = true;
          r.rotation.x = 0;
          const lt = t - tOut;
          const k = clamp01(lt / 0.5);
          const ang = fr.a + lt * 1.8;
          const rad = 1.8 + k * 1.2;
          const x = lerp(pc.x, pc.x + Math.cos(ang) * rad, k);
          const z = lerp(pc.z, pc.z + Math.sin(ang) * rad, k);
          const y = k < 1 ? Math.sin(Math.PI * k) * 2 + 0.3 * (1 - k) : Math.abs(Math.sin(lt * 7 + i)) * 0.9;
          r.position.set(x, y, z);
          r.rotation.y = -ang;
          r.rotation.z = Math.sin(t * 11 + i) * 0.3;
        });
      },
      end() {},
    };
  }

  // ---- 3. とうふアリヌス：とうふを積み上げて崩れる ----
  function startTofu(ev, g, v, F) {
    const m = model('tofu');
    if (!m) return null;
    const restore = hideCast('tofu');
    const p = F.at(5, -2.6);
    m.root.position.set(p.x, 0, p.z);
    faceTo(m.root, p, v);
    g.add(m.root);
    const base = F.at(5, 0.6);
    const H = 0.45;
    const N = 7;
    const tower = once('tofuTower', () => new THREE.Group());
    tower.position.set(base.x, 0, base.z);
    tower.rotation.set(0, v.yaw, 0);
    g.add(tower);
    const blocks = once('tofuBlocks', () => Array.from({ length: N }, () => mesh(
      geo('tofuBlock', () => new THREE.BoxGeometry(0.7, H, 0.7)),
      mat(PALETTE.castWhite),
    )));
    const st = blocks.map((b, i) => {
      tower.add(b);
      b.visible = false;
      b.scale.setScalar(1);
      b.rotation.set(0, (rng() - 0.5) * 0.3, 0);
      b.position.set(0, (i + 0.5) * H, 0);
      return {
        b, ti: 0.3 + i * 0.3, vx: 0, vy: 0, vz: 0, spin: 0,
      };
    });
    const TW = 0.3 + N * 0.3;
    const TC = TW + 1.4;
    let wobbled = false;
    let fallen = false;
    let fellAt = 0;
    const wp = new THREE.Vector3();
    play(ev.sfx[0]);
    return {
      update(t, dt) {
        m.update(t);
        const fade = Math.max(0.001, fadeOutScale(t, ev.duration));
        if (!fallen) {
          const w = t > TW ? t - TW : 0;
          if (w > 0 && !wobbled) {
            wobbled = true;
            say(ev.words[0]);
          }
          tower.rotation.z = w > 0 ? Math.sin(w * 7) * 0.06 * (1 + w * 1.6) : 0;
          for (let i = 0; i < N; i++) {
            const s = st[i];
            if (t < s.ti) {
              s.b.visible = false;
              continue;
            }
            s.b.visible = true;
            const k = Math.min(1, (t - s.ti) / 0.25);
            s.b.position.y = (i + 0.5) * H + (1 - k * k) * 3;
          }
          if (t >= TC) {
            fallen = true;
            fellAt = t;
            play(ev.sfx[1]);
            say(ev.words[1]);
            tower.updateWorldMatrix(true, true);
            const lean = Math.sign(tower.rotation.z) || 1;
            for (let i = 0; i < N; i++) {
              const s = st[i];
              s.b.getWorldPosition(wp);
              g.add(s.b);
              s.b.position.copy(wp);
              s.b.rotation.set(0, rng() * TAU, 0);
              const a = rng() * TAU;
              const sp = 0.8 + rng() * 1.5;
              s.vx = Math.cos(a) * sp - F.rx * lean * i * 0.4;
              s.vz = Math.sin(a) * sp - F.rz * lean * i * 0.4;
              s.vy = 1 + rng() * 2;
              s.spin = (rng() - 0.5) * 8;
            }
          }
        } else {
          m.root.position.y = t - fellAt < 1 ? Math.abs(Math.sin((t - fellAt) * 10)) * 0.3 : 0;
          for (const s of st) {
            const b = s.b;
            s.vy -= GRAV * dt;
            b.position.x += s.vx * dt;
            b.position.y += s.vy * dt;
            b.position.z += s.vz * dt;
            if (b.position.y < H / 2) {
              b.position.y = H / 2;
              s.vy = s.vy < -1.5 ? -s.vy * 0.3 : 0;
              const fr = Math.max(0, 1 - dt * 5);
              s.vx *= fr;
              s.vz *= fr;
              s.spin *= fr;
            } else {
              b.rotation.x += s.spin * dt;
            }
          }
        }
        for (const s of st) s.b.scale.setScalar(fade);
      },
      end: restore,
    };
  }

  // ---- 4. タバコヌス：煙の輪を通り抜けると看板 ----
  function startTabako(ev, g, v, F) {
    const m = model('tabako');
    if (!m) return null;
    const p = F.at(6, 2.4);
    m.root.position.set(p.x, 0, p.z);
    faceTo(m.root, p, v);
    g.add(m.root);
    const n = norm2(v.x - p.x, v.z - p.z);
    const rings = once('smokeRings', () => [0, 1, 2].map(() => mesh(
      geo('smokeRing', () => new THREE.TorusGeometry(0.9, 0.12, 6, 20)),
      mat(PALETTE.castGray, { transparent: true, opacity: 0.8 }),
    )));
    const rs = rings.map((r, i) => {
      r.visible = false;
      r.rotation.set(0, Math.atan2(n.x, n.z), 0);
      g.add(r);
      return { r, te: 0.4 + i * 1.2, prev: null };
    });
    const sign = once('ageSign', () => {
      const sg = new THREE.Group();
      const post = mesh(geo('signPost', () => new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6)), mat(PALETTE.boardDark));
      post.position.y = 0.8;
      const board = mesh(geo('signBoard', () => new THREE.BoxGeometry(2.0, 1.0, 0.08)), mat(PALETTE.board));
      board.position.y = 1.9;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.9),
        new THREE.MeshBasicMaterial({ map: labelTexture(THREE, ['20才に', 'なってから！'], { w: 128, h: 64 }) }),
      );
      face.position.set(0, 1.9, 0.045);
      sg.add(post, board, face);
      return sg;
    });
    sign.visible = false;
    g.add(sign);
    let prevHero = heroNow();
    let signT = -1;
    play(ev.sfx[0]);
    return {
      update(t) {
        m.update(t);
        const h = heroNow();
        const fade = fadeOutScale(t, ev.duration);
        for (const q of rs) {
          if (t < q.te) continue;
          const lt = t - q.te;
          const d = 0.5 + lt * 1.6;
          const cur = {
            x: p.x + n.x * d, z: p.z + n.z * d, nx: n.x, nz: n.z,
          };
          q.r.visible = true;
          q.r.position.set(cur.x, lerp(3.4, 1.3, clamp01(lt)), cur.z);
          q.r.scale.setScalar(Math.max(0.001, (0.4 + 0.6 * clamp01(lt / 0.8)) * fade));
          if (q.prev && signT < 0 && lt > 0.8 && ringCrossed(q.prev, cur, prevHero, h, 0.9)) {
            signT = t;
            say(ev.words[0]);
            play(ev.sfx[1]);
            call(toast, 'タバコのコスプレは20才になってから', 2);
            const sp = { x: h.x + F.rx * 1.3, z: h.z + F.rz * 1.3 };
            sign.position.set(sp.x, 0, sp.z);
            faceTo(sign, sp, { x: h.x + Math.sin(h.yaw) * 7, z: h.z + Math.cos(h.yaw) * 7 });
          }
          q.prev = cur;
        }
        prevHero = h;
        if (signT >= 0) {
          sign.visible = true;
          sign.scale.setScalar(Math.max(0.001, popScale(t - signT, 0.35) * fade));
        }
      },
      end() {},
    };
  }

  // ---- 5. てのひらくん：ハイタッチで吹っ飛ぶ ----
  function startHand(ev, g, v, F) {
    const m = model('tenohira');
    if (!m) return null;
    const start = F.at(9, 3);
    g.add(m.root);
    const HIT = 0.9;
    let hitAt = -1;
    let away = { x: 0, z: 1 };
    let pos = { x: start.x, z: start.z };
    let landed = false;
    return {
      update(t, dt) {
        m.update(t);
        const h = heroNow();
        if (hitAt < 0) {
          const k = clamp01(t / HIT);
          pos = { x: lerp(start.x, h.x, k * 0.85), z: lerp(start.z, h.z, k * 0.85) };
          m.root.position.set(pos.x, lerp(1.5, 0.3, k), pos.z);
          faceTo(m.root, pos, h);
          m.root.rotation.z = Math.sin(t * 10) * 0.2;
          if (t >= HIT) {
            hitAt = t;
            away = norm2(h.x - pos.x, h.z - pos.z);
            play(ev.sfx[0]);
            say(ev.words[0]);
          }
          return;
        }
        const lt = t - hitAt;
        const d = knockbackDelta(Math.max(0, lt - dt), lt, 2.5, ev.hold);
        if (d > 0) call(nudgeHero, away.x * d, away.z * d);
        if (lt < ev.hold) lift(0.7 * Math.sin((Math.PI * lt) / ev.hold));
        else if (!landed) {
          landed = true;
          lift(0);
          play(ev.sfx[1]);
        }
        m.root.position.set(pos.x - away.x * lt * 3, 0.3 + lt * 2.5, pos.z - away.z * lt * 3);
        m.root.rotation.z = Math.sin(lt * 14) * 0.5;
        m.root.scale.setScalar(Math.max(0.001, fadeOutScale(t, ev.duration)));
      },
      end() { lift(0); },
    };
  }

  // ---- 6. ねこアリヌス：追いかけ回して肉球スタンプ ----
  function startNeko(ev, g, v, F) {
    const m = model('neko', 'neko', null, 0.7);
    if (!m) return null;
    const restore = hideCast('neko');
    let pos = F.at(9, -3);
    g.add(m.root);
    let mode = 'chase';
    let fleeAt = 0;
    let flee = { x: 0, z: 1 };
    play(ev.sfx[0]);
    say(ev.words[0]);
    return {
      update(t, dt) {
        m.update(t);
        const h = heroNow();
        if (mode === 'chase') {
          pos = chaseStep(pos, h, 6.5, dt);
          faceTo(m.root, pos, h);
          if (Math.hypot(h.x - pos.x, h.z - pos.z) < 1.2) {
            mode = 'flee';
            fleeAt = t;
            flee = norm2(pos.x - h.x, pos.z - h.z);
            stampPaw();
            play(ev.sfx[1]);
            say(ev.words[1]);
          } else if (t > 5) {
            mode = 'flee';
            fleeAt = t;
            flee = norm2(pos.x - h.x, pos.z - h.z);
            play(ev.sfx[2]);
          }
        } else {
          pos = { x: pos.x + flee.x * 8 * dt, z: pos.z + flee.z * 8 * dt };
          m.root.rotation.y = Math.atan2(flee.x, flee.z);
          if (t - fleeAt > 1.5) return 'done';
        }
        m.root.position.set(pos.x, Math.abs(Math.sin(t * 12)) * 0.25, pos.z);
        return undefined;
      },
      end: restore,
    };
  }

  // ---- 7. ながモヒ：長い体が橋のように並ぶ ----
  function startNaga(ev, g, v, F) {
    const N = 40;
    const GAP = 0.5;
    const SPAN = 12;
    const c = F.at(7, 0);
    const dir = { x: F.rx, z: F.rz };
    const parts = once('naga', () => {
      const segs = Array.from({ length: N }, () => mesh(sphere('nagaSeg', 0.42), mat(PALETTE.heroBody)));
      const head = new THREE.Group();
      head.add(mesh(geo('nagaHead', () => new THREE.SphereGeometry(0.55, 10, 8)), mat(PALETTE.heroBody)));
      for (const s of [-1, 1]) {
        const eye = mesh(sphere('nagaEye', 0.15), mat(PALETTE.faceWindow));
        eye.position.set(s * 0.2, 0.15, 0.45);
        const pupil = mesh(sphere('nagaPupil', 0.07), mat(PALETTE.faceInk));
        pupil.position.set(s * 0.2, 0.15, 0.58);
        const hand = mesh(sphere('nagaHand', 0.1), mat(PALETTE.heroBody));
        hand.position.set(s * 0.45, -0.3, 0.3);
        head.add(eye, pupil, hand);
      }
      const tail = mesh(geo('nagaTail', () => fanGeo(0.9, 90, 0.08)), mat(PALETTE.heroMohican));
      return { segs, head, tail };
    });
    for (const s of parts.segs) g.add(s);
    g.add(parts.head, parts.tail);
    const travel = 2 * SPAN + N * GAP + 4;
    const speed = travel / Math.max(1, ev.duration - 0.3);
    const yaw = Math.atan2(dir.x, dir.z);
    const place = (obj, s, t, i) => {
      const lat = Math.sin(s * 0.9 - t * 5) * 0.35;
      const arch = 2.2 * Math.max(0, Math.cos((Math.PI * s) / (2 * SPAN)));
      obj.position.set(
        c.x + dir.x * s + F.fx * lat,
        0.45 + arch + Math.sin(t * 6 - i * 0.5) * 0.05,
        c.z + dir.z * s + F.fz * lat,
      );
      obj.visible = Math.abs(s) < SPAN + 2;
    };
    play(ev.sfx[0]);
    say(ev.words[0]);
    let passed = false;
    return {
      update(t) {
        const s0 = -SPAN - 1 + speed * t;
        place(parts.head, s0, t, -1);
        parts.head.rotation.y = yaw;
        parts.segs.forEach((seg, i) => place(seg, s0 - (i + 1) * GAP, t, i));
        place(parts.tail, s0 - (N + 1) * GAP, t, N);
        parts.tail.rotation.set(0, yaw + Math.PI / 2, Math.sin(t * 8) * 0.3);
        if (!passed && s0 > SPAN) {
          passed = true;
          play(ev.sfx[1]);
        }
      },
      end() {},
    };
  }

  // ---- 8. メガネ星人：UFO の光で浮き上がる ----
  function startUfo(ev, g, v, F) {
    const u = once('ufo', () => {
      const ufo = new THREE.Group();
      const disc = mesh(geo('ufoDisc', () => new THREE.CylinderGeometry(1.7, 1.1, 0.4, 16)), mat(PALETTE.castGray));
      const dome = mesh(
        geo('ufoDome', () => new THREE.SphereGeometry(0.85, 12, 8, 0, TAU, 0, Math.PI / 2)),
        mat(PALETTE.goggleLens, { transparent: true, opacity: 0.6 }),
      );
      dome.position.y = 0.15;
      ufo.add(disc, dome);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const l = mesh(sphere('ufoLight', 0.12), mat(PALETTE.mohicanYellow, { basic: true }));
        l.position.set(Math.cos(a) * 1.45, -0.05, Math.sin(a) * 1.45);
        ufo.add(l);
      }
      const beam = mesh(
        geo('ufoBeam', () => new THREE.ConeGeometry(1.5, 1, 20, 1, true)),
        mat(PALETTE.mohicanYellow, {
          basic: true, transparent: true, opacity: 0.35, double: true,
        }),
      );
      return { ufo, beam };
    });
    const m = model('megane', 'megane', null, 0.32);
    if (m) {
      m.root.position.set(0, 0.1, 0);
      u.ufo.add(m.root);
    }
    u.ufo.rotation.set(0, 0, 0);
    g.add(u.ufo, u.beam);
    const from = F.at(12, 4);
    let pos = { x: from.x, z: from.z, y: 9 };
    const BEAM = 1.0;
    const END = BEAM + ev.hold;
    let on = false;
    let off = false;
    return {
      update(t, dt) {
        if (m) m.update(t);
        const h = heroNow();
        u.ufo.rotation.y += dt * 3;
        if (t < BEAM) {
          const k = t / BEAM;
          pos = { x: lerp(from.x, h.x, k), z: lerp(from.z, h.z, k), y: lerp(9, 6.5, k) };
        } else if (t < END) {
          if (!on) {
            on = true;
            play(ev.sfx[0]);
            say(ev.words[0]);
          }
          const k = Math.min(1, dt * 6);
          pos = { x: lerp(pos.x, h.x, k), z: lerp(pos.z, h.z, k), y: 6.5 };
          lift(liftCurve(t - BEAM, ev.hold, 1.7));
        } else {
          if (!off) {
            off = true;
            lift(0);
            play(ev.sfx[1]);
          }
          const lt = t - END;
          pos = { x: pos.x + F.fx * dt * 6, z: pos.z + F.fz * dt * 6, y: 6.5 + lt * lt * 6 };
        }
        u.ufo.position.set(pos.x, pos.y, pos.z);
        const beamOn = t >= BEAM && t < END;
        u.beam.visible = beamOn;
        if (beamOn) {
          u.beam.scale.set(1, pos.y, 1);
          u.beam.position.set(pos.x, pos.y / 2, pos.z);
        }
      },
      end() { lift(0); },
    };
  }

  // ---- 9. 天使アリヌス：頭に天使の輪 ----
  function startTenshi(ev, g, v, F) {
    const m = model('tenshi');
    if (!m) return null;
    const from = F.at(5, -7);
    const to = F.at(5, 7);
    g.add(m.root);
    faceTo(m.root, from, to);
    const halo = once('heroHalo', () => mesh(
      geo('heroHaloG', () => new THREE.TorusGeometry(0.32, 0.05, 6, 20)),
      mat(PALETTE.mohicanYellow, { basic: true }),
    ));
    halo.visible = false;
    halo.rotation.set(Math.PI / 2, 0, 0);
    g.add(halo);
    const PASS = 4;
    const HALO = PASS * 0.4;
    const HALO_END = ev.duration - 0.2;
    let haloOn = false;
    play(ev.sfx[1]);
    return {
      update(t) {
        m.update(t);
        const k = clamp01(t / PASS);
        m.root.position.set(lerp(from.x, to.x, k), 1 + Math.sin(t * 3) * 0.2, lerp(from.z, to.z, k));
        m.root.visible = t < PASS;
        if (t >= HALO && !haloOn) {
          haloOn = true;
          play(ev.sfx[0]);
          say(ev.words[0]);
        }
        halo.visible = haloOn && t < HALO_END;
        if (halo.visible) {
          const h = heroNow();
          halo.position.set(h.x, h.y + HERO_HEIGHT + 0.25 + Math.sin(t * 4) * 0.05, h.z);
          halo.scale.setScalar(Math.max(0.001, popScale(t - HALO) * Math.min(1, (HALO_END - t) / 0.3)));
        }
      },
      end() {},
    };
  }

  // ---- 10. ムキムキヌス：腕立て伏せのたびに地面が揺れる ----
  function startMuki(ev, g, v, F) {
    const m = model('mukimuki');
    if (!m) return null;
    const p = F.at(6, -2.5);
    m.root.position.set(p.x, 0, p.z);
    m.root.rotation.y = Math.atan2(F.rx, F.rz);
    g.add(m.root);
    const T0 = 0.4;
    const PERIOD = 0.9;
    const COUNT = 5;
    let done = 0;
    return {
      update(t) {
        m.update(t);
        const lt = t - T0;
        const k = lt > 0 && lt < COUNT * PERIOD ? (lt / PERIOD) % 1 : 0;
        const up = 0.5 - 0.5 * Math.cos(k * TAU);
        m.inner.rotation.x = Math.PI / 2 - up * 0.15;
        m.inner.position.y = 0.45 + up * 0.45;
        const nb = lt > 0 ? Math.min(COUNT, Math.floor(lt / PERIOD)) : 0;
        while (done < nb) {
          done++;
          call(shake, 0.16);
          play(ev.sfx[0]);
          say(done % 2 ? ev.words[0] : ev.words[1]);
          if (done === COUNT) play(ev.sfx[1]);
        }
        m.root.scale.setScalar(Math.max(0.001, fadeOutScale(t, ev.duration)));
      },
      end() {
        m.inner.rotation.x = 0;
        m.inner.position.y = 0;
      },
    };
  }

  // ---- 11. デカ頭アリヌス：巨大モヒカンに引っかかって持ち上げられる ----
  function startDeka(ev, g, v, F) {
    const m = model('dekaatama', 'dekaatama', null, 1.2);
    if (!m) return null;
    const restore = hideCast('dekaatama');
    const start = F.at(8, -5);
    let pos = { x: start.x, z: start.z };
    g.add(m.root);
    const HOOK = 1.2;
    const END = HOOK + ev.hold;
    let hooked = false;
    let released = false;
    return {
      update(t, dt) {
        m.update(t);
        const h = heroNow();
        const spot = { x: h.x + F.rx * 1.3, z: h.z + F.rz * 1.3 };
        if (t < HOOK) {
          const k = t / HOOK;
          pos = { x: lerp(start.x, spot.x, k), z: lerp(start.z, spot.z, k) };
          faceTo(m.root, start, spot);
          m.root.position.set(pos.x, Math.abs(Math.sin(t * 8)) * 0.15, pos.z);
          return;
        }
        if (t < END) {
          if (!hooked) {
            hooked = true;
            play(ev.sfx[0]);
            say(ev.words[0]);
          }
          pos = spot;
          m.root.rotation.y = h.yaw;
          m.root.rotation.z = Math.sin(t * 6) * 0.12;
          m.root.position.set(pos.x, 0, pos.z);
          lift(liftCurve(t - HOOK, ev.hold, 2.4));
          return;
        }
        if (!released) {
          released = true;
          lift(0);
          play(ev.sfx[1]);
        }
        m.root.rotation.z = 0;
        pos = { x: pos.x - F.fx * dt * 3 + F.rx * dt * 2, z: pos.z - F.fz * dt * 3 + F.rz * dt * 2 };
        m.root.rotation.y = Math.atan2(F.rx - F.fx, F.rz - F.fz);
        m.root.position.set(pos.x, Math.abs(Math.sin(t * 8)) * 0.15, pos.z);
        m.root.scale.setScalar(Math.max(0.001, fadeOutScale(t, ev.duration)));
      },
      end() {
        lift(0);
        restore();
      },
    };
  }

  // ---- 12. まんまる親子：転がって仲間をなぎ倒す ----
  function startBowling(ev, g, v, F) {
    const big = model('manmaru', 'mmBig', null, 1);
    const small = model('manmaru', 'mmSmall', 'family1', 0.55);
    if (!big || !small) return null;
    const roots = (call(buddies) || []).filter((r) => r && r.position && r.rotation);
    const target = roots.length ? roots[Math.min(roots.length - 1, Math.floor(rng() * roots.length))] : null;
    let a;
    let b;
    if (target) {
      const tp = { x: target.position.x, z: target.position.z };
      const rad = norm2(tp.x, tp.z);
      const sgn = rng() < 0.5 ? -1 : 1;
      const tan = { x: -rad.z * sgn, z: rad.x * sgn };
      a = { x: tp.x - tan.x * 9, z: tp.z - tan.z * 9 };
      b = { x: tp.x + tan.x * 9, z: tp.z + tan.z * 9 };
    } else {
      a = F.at(6, -9);
      b = F.at(6, 9);
    }
    const dir = norm2(b.x - a.x, b.z - a.z);
    const len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
    const hits = hitsAlongPath(a, b, roots.map((r) => ({ x: r.position.x, z: r.position.z })), 1.4)
      .map((hh) => ({
        root: roots[hh.index], k: hh.k, at: -1, rx: roots[hh.index].rotation.x,
      }));
    g.add(big.root, small.root);
    const T0 = 0.2;
    const ROLL = 3.4;
    const SPEED = len / ROLL;
    let strikes = 0;
    let ended = false;
    play(ev.sfx[0]);
    say(ev.words[0]);
    const roll = (mm, s, back, t) => {
      const d = (t - T0) * SPEED - back;
      mm.update(t);
      const th = d / (0.6 * s);
      mm.root.position.set(a.x + dir.x * d, 0, a.z + dir.z * d);
      mm.root.rotation.y = Math.atan2(dir.x, dir.z);
      mm.inner.rotation.set(th, 0, 0);
      mm.inner.position.set(0, 0.6 * s - 0.85 * s * Math.cos(th), -0.85 * s * Math.sin(th));
    };
    return {
      update(t) {
        roll(big, 1, 0, t);
        roll(small, 0.55, 1.8, t);
        const prog = ((t - T0) * SPEED) / len;
        for (const hh of hits) {
          if (hh.at < 0 && prog >= hh.k) {
            hh.at = t;
            strikes++;
            play(ev.sfx[1]);
            if (strikes === 2) {
              play(ev.sfx[2]);
              say(ev.words[1]);
            } else if (strikes === 1) say(ev.words[2]);
          }
          if (hh.at >= 0) {
            const lt = t - hh.at;
            let k = 0;
            if (lt < 0.15) k = lt / 0.15;
            else if (lt < 1.5) k = 1;
            else k = Math.max(0, 1 - (lt - 1.5) / 0.35);
            hh.root.rotation.x = hh.rx - 1.35 * k;
          }
        }
        if (!ended && prog >= 1) {
          ended = true;
          if (!strikes) {
            play(ev.sfx[3]);
            say(ev.words[3]);
          }
        }
        const fade = Math.max(0.001, fadeOutScale(t, ev.duration));
        big.root.scale.setScalar(fade);
        small.root.scale.setScalar(fade);
      },
      end() {
        for (const hh of hits) hh.root.rotation.x = hh.rx;
      },
    };
  }

  const STARTERS = {
    'onasu-scatter': startOnasu,
    'mohifry-fry': startFry,
    'tofu-tower': startTofu,
    'tabako-ring': startTabako,
    'tenohira-highfive': startHand,
    'neko-chase': startNeko,
    'nagamohi-bridge': startNaga,
    'megane-ufo': startUfo,
    'tenshi-halo': startTenshi,
    'mukimuki-pushups': startMuki,
    'dekaatama-lift': startDeka,
    'manmaru-bowling': startBowling,
  };

  function clear() {
    if (active) {
      try { active.ctl.end(); } catch (err) { console.warn(err); }
      group.remove(active.g);
    }
    active = null;
    lift(0);
    for (const el of stamps) el.remove();
    stamps.clear();
  }

  return {
    start(id) {
      clear();
      const ev = castEventById(id);
      const fn = STARTERS[id];
      if (!ev || !fn) return false;
      const v = heroNow();
      const g = new THREE.Group();
      group.add(g);
      let ctl = null;
      try {
        ctl = fn(ev, g, v, frame(v));
      } catch (err) {
        console.warn(err);
      }
      if (!ctl) {
        group.remove(g);
        return false;
      }
      active = {
        ev, g, ctl, t: 0,
      };
      try { ctl.update(0, 0); } catch (err) { console.warn(err); }
      return true;
    },
    update(dt) {
      if (!active) return;
      const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      active.t += d;
      let done = active.t >= active.ev.duration;
      if (!done) {
        try {
          done = active.ctl.update(active.t, d) === 'done';
        } catch (err) {
          console.warn(err);
          done = true;
        }
      }
      if (done) clear();
    },
    clear,
    get activeId() { return active ? active.ev.id : null; },
  };
}
