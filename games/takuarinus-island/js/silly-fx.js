// おふざけの演出（DOM と three.js の薄い利用者）：擬音の文字・画面の揺れ・むにゅっ・カメラ一回転。
// 作るときには DOM に触らない。おふざけ度 0 では何もしない。
import {
  rollFx, pickOnomatopoeia, squashScale, spinAngle, SPIN_TIME, SQUASH_TIME, TEXT_TIME,
  planHubEvent, tofuDropY, fadeOutScale, paradeOffset, handstandPose, giantMohawkRise,
} from './silly-rules.js';
import { buildCastModel } from './cast-build.js';
import { getCast } from './cast-defs.js';
import { PALETTE } from './palette.js';

const SHAKE_TIME = 0.35;

export function createSillyFx({ getLevel = () => 0, rng = Math.random, doc = null } = {}) {
  const D = () => doc || (typeof document !== 'undefined' ? document : null);
  let time = 0;
  let shakeT = 0;
  let shakeAmp = 0;
  let spinT = -1;
  let lastText = -99;
  let focus = null;
  let saved = null;
  const squashes = [];
  const texts = new Set();
  const lv = () => {
    try { return Number(getLevel()) || 0; } catch { return 0; }
  };

  /** 大きな擬音をポンと出す（word 省略で一覧から選ぶ） */
  function popText(word, { cooldown = 0, force = false } = {}) {
    const l = lv();
    if (l <= 0) return false;
    if (cooldown > 0 && time - lastText < cooldown) return false;
    if (!force && !rollFx('text', l, rng)) return false;
    const d = D();
    if (!d || !d.body) return false;
    lastText = time;
    const el = d.createElement('div');
    el.className = 'silly-text';
    el.textContent = word || pickOnomatopoeia(rng);
    el.style.left = `${30 + rng() * 40}%`;
    el.style.top = `${22 + rng() * 30}%`;
    el.style.setProperty('--rot', `${Math.round((rng() - 0.5) * 30)}deg`);
    d.body.append(el);
    texts.add(el);
    setTimeout(() => {
      el.remove();
      texts.delete(el);
    }, TEXT_TIME * 1000 + 100);
    return true;
  }

  function shake(strength = 0.12, { force = false } = {}) {
    if (lv() <= 0 || (!force && !rollFx('shake', lv(), rng))) return false;
    shakeT = SHAKE_TIME;
    shakeAmp = strength;
    return true;
  }

  function squash(obj) {
    if (!obj || !obj.scale || lv() <= 0 || !rollFx('squash', lv(), rng)) return false;
    const s = squashes.find((q) => q.obj === obj);
    if (s) s.t = 0;
    else squashes.push({ obj, t: 0, base: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z } });
    return true;
  }

  function cancelSquash(obj) {
    const i = squashes.findIndex((q) => q.obj === obj);
    if (i < 0) return;
    const q = squashes[i];
    q.obj.scale.set(q.base.x, q.base.y, q.base.z);
    squashes.splice(i, 1);
  }

  function spin() {
    if (lv() <= 0 || !rollFx('spin', lv(), rng)) return false;
    if (spinT < 0) spinT = 0;
    return true;
  }

  return {
    popText,
    shake,
    squash,
    cancelSquash,
    spin,
    /** 着地：擬音（連発しない）と小さな揺れ */
    land() {
      popText(null, { cooldown: 2.5 });
      shake(0.08);
    },
    /** 被弾：揺れ */
    hit() {
      shake(0.2);
    },
    setFocus(obj) { focus = obj || null; },
    getFocus: () => focus,
    level: () => lv(),
    update(dt) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      time += d;
      if (shakeT > 0) shakeT = Math.max(0, shakeT - d);
      if (spinT >= 0) {
        spinT += d;
        if (spinT >= SPIN_TIME) spinT = -1;
      }
      for (let i = squashes.length - 1; i >= 0; i--) {
        const q = squashes[i];
        q.t += d;
        if (q.t >= SQUASH_TIME) {
          q.obj.scale.set(q.base.x, q.base.y, q.base.z);
          squashes.splice(i, 1);
        } else {
          const k = squashScale(q.t);
          q.obj.scale.set(q.base.x * k.xz, q.base.y * k.y, q.base.z * k.xz);
        }
      }
    },
    /** 描画の直前にカメラへ揺れ・回転を足す（描画後に afterRender で戻す） */
    beforeRender(cam) {
      saved = null;
      if (!cam || !cam.position || !cam.quaternion) return;
      const shaking = shakeT > 0;
      const spinning = spinT >= 0;
      if (!shaking && !spinning) return;
      saved = { p: cam.position.clone(), q: cam.quaternion.clone() };
      if (shaking) {
        const a = shakeAmp * (shakeT / SHAKE_TIME);
        cam.position.x += (rng() - 0.5) * 2 * a;
        cam.position.y += (rng() - 0.5) * 2 * a;
      }
      if (spinning) cam.rotateZ(spinAngle(spinT));
    },
    afterRender(cam) {
      if (!saved || !cam) return;
      cam.position.copy(saved.p);
      cam.quaternion.copy(saved.q);
      saved = null;
    },
    clear() {
      for (const q of squashes) q.obj.scale.set(q.base.x, q.base.y, q.base.z);
      squashes.length = 0;
      for (const el of texts) el.remove();
      texts.clear();
      shakeT = 0;
      spinT = -1;
    },
  };
}

// ---- ハブのふざけた出来事（当たり判定なし。three.js は引数で受け取る） ----
const TOFU_SIZE = [0.7, 0.5, 0.7];
const EVENT_SOUND = Object.freeze({
  'tofu-rain': 'slideDown', 'mohifry-parade': 'trumpetFail', 'buddy-handstand': 'crowdWow', 'giant-mohawk': 'boing',
});
const EVENT_WORD = Object.freeze({
  'tofu-rain': 'ペチャ', 'mohifry-parade': 'キラーン', 'buddy-handstand': 'ドーン！', 'giant-mohawk': 'ボヨーン',
});

/**
 * buddies(): 仲間の root の配列、view(): {x,z,yaw}（主人公の位置とカメラの向き）
 * start(id) で出来事を始め、毎フレーム update(dt)。clear() で片付ける。
 */
export function createHubEventPlayer(THREE, world, {
  rng = Math.random, buddies = () => [], view = () => ({ x: 0, z: 0, yaw: 0 }), sound = null, popText = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'hub-events';
  world.add(group);
  let active = null;
  let tofuGeo = null;
  let tofuMat = null;
  let fries = null;
  let mohawk = null;
  const call = (fn, v) => {
    if (typeof fn !== 'function') return;
    try { fn(v); } catch (err) { console.warn(err); }
  };

  function startTofu(plan, v) {
    if (!tofuGeo) {
      tofuGeo = new THREE.BoxGeometry(TOFU_SIZE[0], TOFU_SIZE[1], TOFU_SIZE[2]);
      tofuMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.castWhite) });
    }
    const list = plan.drops.map((d) => {
      const m = new THREE.Mesh(tofuGeo, tofuMat);
      m.position.set(v.x + d.dx, d.height, v.z + d.dz);
      m.visible = false;
      group.add(m);
      return { m, d };
    });
    return {
      update(t) {
        const s = Math.max(0.001, fadeOutScale(t, plan.duration));
        for (const { m, d } of list) {
          const lt = t - d.delay;
          m.visible = lt >= 0;
          if (lt < 0) continue;
          const y = tofuDropY(lt, d.height);
          const squish = y < 0.05 ? 0.8 : 1;
          m.scale.set(s / Math.sqrt(squish), s * squish, s / Math.sqrt(squish));
          m.position.y = y + (TOFU_SIZE[1] / 2) * s * squish;
          m.rotation.y = d.spin + lt * 1.5;
        }
      },
      end() {
        for (const { m } of list) group.remove(m);
      },
    };
  }

  function startParade(plan, v) {
    const def = getCast('mohifry');
    if (!def) return null;
    if (!fries) {
      const ribbons = (def.crowd && def.crowd.ribbonCount) || 0;
      const at = Math.floor(plan.count / 2);
      fries = Array.from({ length: plan.count }, (_, i) => {
        const mdl = buildCastModel(THREE, def, { variant: i >= at && i < at + ribbons ? 'ribbon' : null });
        mdl.inner.scale.setScalar(0.6);
        return mdl;
      });
    }
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);
    const dx = Math.cos(v.yaw) * plan.side;
    const dz = -Math.sin(v.yaw) * plan.side;
    const cx = v.x + fx * plan.offset;
    const cz = v.z + fz * plan.offset;
    const heading = Math.atan2(dx, dz);
    for (const f of fries) group.add(f.root);
    return {
      update(t) {
        const head = paradeOffset(t, plan.duration, plan.span);
        fries.forEach((mdl, i) => {
          const s = head - i * plan.gap;
          mdl.update(t);
          mdl.root.position.set(cx + dx * s, Math.abs(Math.sin(t * 9 + i)) * 0.15, cz + dz * s);
          mdl.root.rotation.y = heading;
          mdl.inner.rotation.z = Math.sin(t * 9 + i) * 0.15;
        });
      },
      end() {
        for (const f of fries) group.remove(f.root);
      },
    };
  }

  function startHandstand(plan) {
    const list = (typeof buddies === 'function' ? buddies() : null) || [];
    const root = plan.buddy === null ? null : list[plan.buddy];
    if (!root) return null;
    const base = { y: root.position.y, z: root.rotation.z };
    const box = new THREE.Box3().setFromObject(root);
    const h = Number.isFinite(box.max.y - box.min.y) ? Math.max(0.3, box.max.y - box.min.y) : 1.5;
    const yaw0 = root.rotation.y;
    return {
      update(t) {
        const p = handstandPose(t, plan.duration);
        root.rotation.z = base.z + p.flip;
        root.position.y = base.y + h * p.lift;
        if (p.lift > 0) root.rotation.y = yaw0 + p.spin;
      },
      end() {
        root.rotation.z = base.z;
        root.position.y = base.y;
      },
    };
  }

  function buildMohawk() {
    const g = new THREE.Group();
    const a = (70 * Math.PI) / 180;
    const s0 = Math.PI / 2 - a / 2;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(Math.cos(s0), Math.sin(s0));
    sh.absarc(0, 0, 1, s0, s0 + a, false);
    sh.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -0.06);
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.heroMohican) })));
    const stripeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.heroMohicanStripe) });
    for (const x of [-0.12, 0, 0.12]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.02), stripeMat);
      st.position.set(x, 0.62, 0.07);
      g.add(st);
    }
    return g;
  }

  function startMohawk(plan, v) {
    if (!mohawk) mohawk = buildMohawk();
    const a = v.yaw + plan.angle;
    mohawk.position.set(v.x - Math.sin(a) * plan.dist, 0, v.z - Math.cos(a) * plan.dist);
    mohawk.rotation.set(0, a, 0);
    mohawk.visible = false;
    group.add(mohawk);
    return {
      update(t) {
        const r = giantMohawkRise(t, plan.duration);
        mohawk.visible = r > 0.001;
        mohawk.scale.set(plan.height, Math.max(0.001, plan.height * r), plan.height);
        mohawk.rotation.z = Math.sin(t * 6) * 0.08 * Math.min(1, r);
      },
      end() {
        group.remove(mohawk);
      },
    };
  }

  function clear() {
    if (active) active.ctl.end();
    active = null;
  }

  return {
    start(id) {
      clear();
      const n = ((typeof buddies === 'function' ? buddies() : null) || []).length;
      const plan = planHubEvent(id, rng, { buddyCount: n });
      if (!plan) return false;
      const v = (typeof view === 'function' ? view() : null) || { x: 0, z: 0, yaw: 0 };
      let ctl = null;
      if (id === 'tofu-rain') ctl = startTofu(plan, v);
      else if (id === 'mohifry-parade') ctl = startParade(plan, v);
      else if (id === 'buddy-handstand') ctl = startHandstand(plan);
      else ctl = startMohawk(plan, v);
      if (!ctl) return false;
      active = { plan, t: 0, ctl };
      ctl.update(0);
      call(sound, EVENT_SOUND[id]);
      call(popText, EVENT_WORD[id]);
      return true;
    },
    update(dt) {
      if (!active) return;
      active.t += Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (active.t >= active.plan.duration) {
        active.ctl.update(active.plan.duration);
        clear();
        return;
      }
      active.ctl.update(active.t);
    },
    clear,
    get activeId() { return active ? active.plan.id : null; },
  };
}
