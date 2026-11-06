// 報酬の場面：番長が立つ前で、台座からモヒカンが回りながらせり上がり、紙吹雪。
// 番長の負けのせりふ → 獲得（もう持っていれば1行にまとめる）→ 全部そろった一言 → ゲームのアイテム。
// 規則（rewardPose・rewardLines・claimVictory）は three.js・DOM に依存しない。
// モジュールの読み込み時には DOM・three.js に触らない。
import { PALETTE } from '../palette.js';
import { collectMohican, mohicanCount } from '../progress.js';
import { MOHICAN_TOTAL, findBoss } from '../bosses.js';
import {
  buildMohicanModel, createAnimState, stepAnim, buildAlinus, buildRaceBoss, buildFpsBoss,
} from '../characters.js';
import { createHeroRig, applyMohawkColor } from '../hero-model.js';
import { getTextures } from '../textures.js';
import { textureRepeat } from '../texture-gen.js';
import { fx } from '../fx.js';

// 番長の見た目はモヒカンの色で選ぶ（ボスの id では分岐しない）
const BOSS_BUILDERS_BY_COLOR = Object.freeze({
  mohicanYellow: buildRaceBoss,
  mohicanGreen: buildFpsBoss,
});

/** モヒカンがせり上がる時間（秒） */
export const REWARD_RISE_TIME = 2;
const START_Y = 0.4;
const END_Y = 2.6;

/** モヒカンが全部そろったときの一言 */
export const ALL_MOHAWKS_LINE = 'モヒカンが全部そろった！ 先輩アリヌスに話しかけよう！';

/** せり上がりの姿勢。t≥REWARD_RISE_TIME で止まる */
export function rewardPose(t) {
  const x = typeof t === 'number' && Number.isFinite(t) ? t : 0;
  const k = Math.max(0, Math.min(1, x / REWARD_RISE_TIME));
  const e = 1 - (1 - k) ** 3;
  return {
    y: START_Y + (END_Y - START_Y) * e,
    rotY: e * Math.PI * 4,
    scale: 0.2 + 0.8 * e,
    done: k >= 1,
  };
}

/** アイテムの情報を {name, isNew} にそろえる（grantBossItem の返り値でもよい）。無ければ null */
function itemInfo(item) {
  if (!item || typeof item !== 'object') return null;
  let name = null;
  if (typeof item.name === 'string' && item.name) name = item.name;
  else if (item.item && typeof item.item.name === 'string' && item.item.name) name = item.item.name;
  if (!name) return null;
  return { name, isNew: item.isNew !== false };
}

/**
 * 勝ったときのせりふ。番長の負けのせりふ（dialogue.win）→ 獲得。
 * 新しく手に入れたら「〇〇を手に入れた！」→（全部そろったら一言）→ アイテム獲得。
 * もう持っていれば、モヒカンとアイテムをまとめて1行。勝った直後に dialogue.after は出さない。
 * item は {name, isNew}（省略可）
 */
export function rewardLines(boss, isNew, count, item = null) {
  if (!boss) return [];
  const d = boss.dialogue || {};
  const name = boss.mohican ? boss.mohican.name : 'モヒカン';
  const it = itemInfo(item);
  const lines = [...(Array.isArray(d.win) ? d.win : [])];
  if (isNew) {
    lines.push(`${name}を手に入れた！`);
    if (count === MOHICAN_TOTAL) lines.push(ALL_MOHAWKS_LINE);
    if (it) lines.push(it.isNew ? `アイテム獲得：${it.name}` : `アイテム「${it.name}」はもう持っている。`);
    return lines;
  }
  if (it && !it.isNew) {
    lines.push(`${name}も${it.name}も、もう持っている。`);
  } else {
    lines.push(`${name}はもう持っている。`);
    if (it) lines.push(`アイテム獲得：${it.name}`);
  }
  return lines;
}

/** 勝ちを記録する（冪等）。{state, isNew} */
export function claimVictory(state, bossOrId) {
  const boss = typeof bossOrId === 'string' ? findBoss(bossOrId) : bossOrId;
  if (!boss || !boss.mohican) throw new Error(`未知のボス: ${bossOrId}`);
  return collectMohican(state, boss.mohican.id);
}

const BOSS_SPOT = Object.freeze({ x: 2.8, z: -1.4 });
const BOSS_SCALE = 1.5;
const CONF_KEYS = ['mohicanRed', 'mohicanYellow', 'mohicanGreen', 'uiAccent', 'uiGold', 'heroBody', 'castPink'];
const CONF_N = 90;
const TREES = [[-11, -6, 1.2], [-8, -11, 1], [9, -10, 1.3], [12, -4, 1], [-13, 3, 1.1], [13, 4, 1.2], [-6, -14, 0.9], [5, -14, 1]];

export function createRewardScene(ctx) {
  const { THREE, mat } = ctx;
  const sfx = (e) => { if (typeof ctx.sfx === 'function') ctx.sfx(e); };
  let world = null;
  let holder = null;
  let rig = null;
  let anim = null;
  let bossSlot = null;
  let bossModel = null;
  let bossAnim = createAnimState();
  const bossModels = new Map();
  const bits = [];
  let sparkT = 0;
  let t = 0;
  let phase = 'rise';
  let boss = null;
  let isNew = false;
  let leaving = false;

  function buildConfetti() {
    const geo = new THREE.PlaneGeometry(0.14, 0.09);
    const mats = CONF_KEYS.map((k) => new THREE.MeshBasicMaterial({ color: PALETTE[k], side: THREE.DoubleSide }));
    for (let i = 0; i < CONF_N; i++) {
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.visible = false;
      world.add(m);
      bits.push({
        mesh: m, life: 0, vx: 0, vy: 0, vz: 0, spin: 0,
      });
    }
  }

  /** 粒子を出す（空いているものだけ使う） */
  function spawn(x, y, z, n, {
    speed = 4, up = 4, life = 2.4, scale = 1,
  } = {}) {
    let left = n;
    for (const b of bits) {
      if (left <= 0) break;
      if (b.life > 0) continue;
      left -= 1;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      b.vx = Math.cos(a) * s;
      b.vz = Math.sin(a) * s;
      b.vy = up * (0.5 + Math.random() * 0.8);
      b.spin = (Math.random() - 0.5) * 16;
      b.life = life * (0.7 + Math.random() * 0.5);
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      b.mesh.scale.setScalar(scale);
      b.mesh.visible = true;
    }
  }

  function stepBits(dt) {
    for (const b of bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy -= 5 * dt;
      const drag = Math.max(0, 1 - 1.4 * dt);
      b.vx *= drag;
      b.vz *= drag;
      const p = b.mesh.position;
      p.set(p.x + b.vx * dt, p.y + b.vy * dt, p.z + b.vz * dt);
      if (p.y < 0.03) {
        p.y = 0.03;
        b.vy = 0;
        b.vx *= 0.5;
        b.vz *= 0.5;
      } else {
        b.mesh.rotation.x += b.spin * dt;
        b.mesh.rotation.y += b.spin * 0.6 * dt;
      }
      if (b.life <= 0) b.mesh.visible = false;
    }
  }

  function clearBits() {
    for (const b of bits) {
      b.life = 0;
      b.mesh.visible = false;
    }
  }

  function build() {
    world = new THREE.Scene();
    world.background = new THREE.Color(PALETTE.sky);
    world.fog = new THREE.Fog(PALETTE.sky, 30, 90);
    ctx.addLights(world);
    const tx = getTextures(THREE);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 16), tx.material('grass', { repeat: textureRepeat(80, 80, 3) }));
    ground.rotation.x = -Math.PI / 2;
    world.add(ground);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(6, 16), tx.material('cobble', { repeat: [4, 4] }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    world.add(plaza);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5);
    const leafGeo = new THREE.IcosahedronGeometry(1.1, 0);
    for (const [x, z, s] of TREES) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(s * 1.6);
      const trunk = new THREE.Mesh(trunkGeo, mat('trunk'));
      trunk.position.y = 0.6;
      const leaf = new THREE.Mesh(leafGeo, mat('leaf'));
      leaf.position.y = 1.8;
      g.add(trunk, leaf);
      world.add(g);
    }
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 1, 12), mat('pedestal'));
    ped.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.15, 12), mat('pedestalTop'));
    top.position.y = 1.05;
    world.add(ped, top);
    holder = new THREE.Group();
    world.add(holder);
    // 番長の立つ場所
    bossSlot = new THREE.Group();
    bossSlot.position.set(BOSS_SPOT.x, 0, BOSS_SPOT.z);
    bossSlot.rotation.y = Math.atan2(-BOSS_SPOT.x, 5 - BOSS_SPOT.z);
    const bsh = ctx.makeShadow(1.6);
    bsh.position.set(BOSS_SPOT.x, 0.04, BOSS_SPOT.z);
    world.add(bossSlot, bsh);
    rig = createHeroRig(THREE, mat);
    rig.root.position.set(0, 0, 2.8);
    rig.root.rotation.y = Math.PI;
    const shadow = ctx.makeShadow(1.1);
    shadow.position.set(0, 0.04, 2.8);
    world.add(rig.root, shadow);
    anim = createAnimState();
    buildConfetti();
  }

  function bossModelFor(b) {
    if (bossModels.has(b.id)) return bossModels.get(b.id);
    let m;
    try {
      const key = b.mohican && b.mohican.colorKey ? b.mohican.colorKey : 'mohicanRed';
      const builder = Object.prototype.hasOwnProperty.call(BOSS_BUILDERS_BY_COLOR, key)
        ? BOSS_BUILDERS_BY_COLOR[key] : null;
      if (builder) m = builder(THREE, mat, { scale: BOSS_SCALE });
      else m = buildAlinus(THREE, mat, { scale: BOSS_SCALE, pose: 'hips', mohicanColor: key });
    } catch (err) {
      console.warn('番長を作れません:', err);
      m = null;
    }
    bossModels.set(b.id, m);
    return m;
  }

  function back() {
    if (leaving) return;
    leaving = true;
    const id = boss ? boss.id : null;
    if (!ctx.goto('hub', { fromBoss: id, bossId: id, fromBossId: id, celebrate: !!isNew })) leaving = false;
  }

  function talk() {
    phase = 'talk';
    sfx('mohawkGet');
    const sf = ctx.silly;
    if (sf && typeof sf.popText === 'function') sf.popText('キラーン');
    spawn(0, END_Y, 0, CONF_N, {
      speed: 4.5, up: 5, life: 3, scale: 1,
    });
    try {
      const ck = boss && boss.mohican && boss.mohican.colorKey ? boss.mohican.colorKey : 'mohicanRed';
      fx.confetti({ x: 0, y: END_Y, z: 0 }, [ck, 'uiGold']);
    } catch {
      // 粒子が出なくても続ける
    }
    // ゲームのアイテム（モヒカンとは別）を獲得・保存する
    let got = null;
    try {
      got = typeof ctx.grantBossItem === 'function' ? ctx.grantBossItem(boss.id) : null;
    } catch {
      got = null;
    }
    const item = got && got.item && typeof got.item.name === 'string' ? { name: got.item.name, isNew: !!got.isNew } : null;
    if (item && item.isNew && ctx.ui && typeof ctx.ui.banner === 'function') ctx.ui.banner(`アイテム獲得：${item.name}`, 3);
    const count = typeof ctx.getProgress === 'function' ? mohicanCount(ctx.getProgress()) : undefined;
    ctx.ui.openDialog({ name: boss.name, lines: rewardLines(boss, isNew, count, item), onClose: back });
  }

  return {
    pausable: false,
    enter(params = {}) {
      if (!world) build();
      boss = findBoss(params.bossId);
      leaving = false;
      if (!boss) {
        ctx.goto('hub', {});
        return;
      }
      isNew = typeof ctx.settleWin === 'function' ? !!ctx.settleWin(boss, params.isNew) : params.isNew !== false;
      holder.clear();
      const moh = buildMohicanModel(THREE, mat, boss.mohican.colorKey);
      moh.scale.setScalar(1.6);
      holder.add(moh);
      bossSlot.clear();
      bossModel = bossModelFor(boss);
      if (bossModel) {
        bossModel.root.rotation.set(0, 0, 0);
        bossSlot.add(bossModel.root);
      }
      bossAnim = createAnimState();
      clearBits();
      sparkT = 0;
      t = 0;
      phase = 'rise';
      applyMohawkColor(rig, typeof ctx.mohawkColor === 'function' ? ctx.mohawkColor() : undefined);
      ctx.camera.position.set(0.8, 2.8, 8);
      ctx.camera.lookAt(0.6, 1.8, 0);
      ctx.setWorld(world);
      fx.init(world, THREE);
      ctx.ui.refreshHud();
      ctx.ui.setHint('');
      const sf = ctx.silly;
      if (sf && typeof sf.popText === 'function') sf.popText('ドーン！');
    },
    update(dt) {
      if (!boss) return;
      const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      t += d;
      const p = rewardPose(t);
      holder.position.y = p.y;
      holder.rotation.y = p.rotY;
      holder.scale.setScalar(p.scale);
      if (p.done) holder.position.y += Math.sin(t * 2.5) * 0.08;
      if (phase === 'rise') {
        // せり上がりの間はキラキラ
        sparkT -= d;
        if (sparkT <= 0) {
          sparkT = 0.08;
          spawn(0, holder.position.y, 0, 2, {
            speed: 1.4, up: 1.5, life: 0.8, scale: 0.6,
          });
        }
      }
      stepBits(d);
      fx.update(dt);
      if (bossModel) {
        stepAnim(bossAnim, { moving: false, airborne: false, dt: d });
        bossModel.apply(bossAnim);
        // 負けてしょんぼり揺れる
        bossModel.root.rotation.z = phase === 'talk' ? Math.sin(t * 1.5) * 0.06 : 0;
        if (typeof bossModel.flutter === 'function') bossModel.flutter(t);
      }
      anim.idle += d;
      rig.apply(anim);
      if (phase === 'rise' && p.done) talk();
    },
    exit() {
      clearBits();
      fx.dispose();
      ctx.ui.setHint('');
    },
  };
}
