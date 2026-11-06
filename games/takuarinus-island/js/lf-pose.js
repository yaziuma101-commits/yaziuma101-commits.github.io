// レバガチャファイターヌスの姿勢の表（three.js・DOM に依存しない）。
// 角度はラジアン。x: 骨の先が前（相手の方向）へ振れる、z: 体の外へ開く、y: ひねり。
// 関節名は主人公（FBX の骨）とムキムキヌス（体の部品）で共通。R が前の手足（カメラ側）。

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const LF_POSE_STATES = Object.freeze([
  'idle', 'walk', 'crouch', 'jump', 'punch', 'kick', 'guard', 'hit', 'down', 'charge', 'wave', 'rising', 'whirl',
  'crouchPunch', 'crouchKick', 'jumpPunch', 'jumpKick',
]);

export const LF_JOINTS = Object.freeze([
  'spine', 'chest', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR',
]);

function stance(t, who) {
  const br = Math.sin(t * 2.6) * 0.035;
  const heavy = who === 'foe' ? 0.18 : 0;
  return {
    spine: v(0.12 + br, 0, 0),
    chest: v(0.04 - br * 0.5, 0, 0),
    head: v(-0.1, 0, 0),
    armR: v(0.9, 0, 0.2 + heavy),
    foreR: v(1.75, 0, 0),
    armL: v(0.6, 0, 0.3 + heavy),
    foreL: v(2.0, 0, 0),
    thighR: v(0.4, 0, 0.1),
    shinR: v(-0.5 - br, 0, 0),
    thighL: v(-0.25, 0, 0.1),
    shinL: v(-0.4 - br, 0, 0),
  };
}

const PATCH = {
  walk: (t) => {
    const s = Math.sin(t * 9);
    return {
      thighR: v(0.4 + 0.35 * s, 0, 0.1),
      thighL: v(-0.25 - 0.35 * s, 0, 0.1),
      shinR: v(-0.5 - 0.35 * Math.max(0, -s), 0, 0),
      shinL: v(-0.4 - 0.35 * Math.max(0, s), 0, 0),
    };
  },
  crouch: () => ({
    spine: v(0.4, 0, 0),
    thighR: v(1.35, 0, 0.15),
    shinR: v(-2.0, 0, 0),
    thighL: v(1.0, 0, 0.15),
    shinL: v(-2.1, 0, 0),
  }),
  jump: () => ({
    thighR: v(1.1, 0, 0.1),
    shinR: v(-1.7, 0, 0),
    thighL: v(0.7, 0, 0.1),
    shinL: v(-1.5, 0, 0),
    armR: v(1.2, 0, 0.2),
    foreR: v(1.4, 0, 0),
    armL: v(1.0, 0, 0.3),
    foreL: v(1.6, 0, 0),
  }),
  punch: () => ({
    spine: v(0.3, 0, 0),
    armR: v(1.55, 0, 0),
    foreR: v(0.08, 0, 0),
    armL: v(0.5, 0, 0.3),
    foreL: v(2.1, 0, 0),
    thighR: v(0.55, 0, 0.1),
    thighL: v(-0.4, 0, 0.1),
  }),
  kick: () => ({
    spine: v(-0.35, 0, 0),
    thighR: v(1.7, 0, 0.05),
    shinR: v(-0.08, 0, 0),
    thighL: v(-0.1, 0, 0.1),
    shinL: v(-0.25, 0, 0),
    armR: v(0.6, 0, 0.3),
    foreR: v(1.6, 0, 0),
    armL: v(0.9, 0, 0.3),
    foreL: v(1.8, 0, 0),
  }),
  guard: () => ({
    spine: v(-0.05, 0, 0),
    head: v(0.15, 0, 0),
    armR: v(1.25, 0, 0.05),
    foreR: v(2.25, 0, 0),
    armL: v(1.15, 0, 0.1),
    foreL: v(2.35, 0, 0),
  }),
  hit: () => ({
    spine: v(-0.5, 0, 0),
    chest: v(-0.2, 0, 0),
    head: v(-0.45, 0, 0),
    armR: v(0.3, 0, 0.7),
    foreR: v(0.4, 0, 0),
    armL: v(0.2, 0, 0.6),
    foreL: v(0.4, 0, 0),
    thighR: v(0.2, 0, 0.1),
    shinR: v(-0.3, 0, 0),
    thighL: v(-0.3, 0, 0.1),
    shinL: v(-0.2, 0, 0),
  }),
  down: () => ({
    spine: v(0, 0, 0),
    chest: v(0, 0, 0),
    head: v(0.1, 0, 0),
    armR: v(0.2, 0, 0.9),
    foreR: v(0.2, 0, 0),
    armL: v(0.2, 0, 0.9),
    foreL: v(0.2, 0, 0),
    thighR: v(0.1, 0, 0.1),
    shinR: v(-0.1, 0, 0),
    thighL: v(0, 0, 0.1),
    shinL: v(-0.1, 0, 0),
  }),
  charge: (t) => {
    const q = Math.sin(t * 40) * 0.02;
    return {
      spine: v(-0.15 + q, 0, 0),
      armR: v(-0.7, 0, 0.3),
      foreR: v(1.3 + q, 0, 0),
      armL: v(-0.5, 0, 0.3),
      foreL: v(1.4 - q, 0, 0),
      thighR: v(0.7, 0, 0.15),
      shinR: v(-1.0, 0, 0),
      thighL: v(0.1, 0, 0.15),
      shinL: v(-0.8, 0, 0),
    };
  },
  wave: () => ({
    spine: v(0.25, 0, 0),
    armR: v(1.55, 0, 0),
    foreR: v(0.05, 0, 0),
    armL: v(1.5, 0, -0.15),
    foreL: v(0.1, 0, 0),
    thighR: v(0.6, 0, 0.1),
    shinR: v(-0.5, 0, 0),
    thighL: v(-0.5, 0, 0.1),
    shinL: v(-0.2, 0, 0),
  }),
  rising: () => ({
    spine: v(-0.1, 0, 0),
    armR: v(2.95, 0, 0.05),
    foreR: v(0.1, 0, 0),
    armL: v(0.3, 0, 0.3),
    foreL: v(1.8, 0, 0),
    thighR: v(1.3, 0, 0.1),
    shinR: v(-1.6, 0, 0),
    thighL: v(-0.1, 0, 0.1),
    shinL: v(-0.2, 0, 0),
  }),
  whirl: () => ({
    spine: v(0, 0, 0),
    armR: v(0.1, 0, 1.4),
    foreR: v(0.1, 0, 0),
    armL: v(0.1, 0, 1.4),
    foreL: v(0.1, 0, 0),
    thighR: v(1.55, 0, 0.2),
    shinR: v(-0.05, 0, 0),
    thighL: v(0, 0, 0.1),
    shinL: v(-0.2, 0, 0),
  }),
};

/**
 * 状態 state・時刻 t（秒）の関節の角度表 {関節名: {x,y,z}}。
 * who は 'hero'（主人公の骨）か 'foe'（ムキムキヌスの部品）。未知の状態は idle。
 */
PATCH.crouchPunch = () => ({
  ...PATCH.crouch(),
  armR: v(1.5, 0, 0),
  foreR: v(0.1, 0, 0),
  armL: v(0.5, 0, 0.3),
  foreL: v(2.1, 0, 0),
});
PATCH.crouchKick = () => ({
  spine: v(0.15, 0, 0),
  thighR: v(1.5, 0, 0.1),
  shinR: v(-0.1, 0, 0),
  thighL: v(1.1, 0, 0.15),
  shinL: v(-2.1, 0, 0),
  armR: v(0.6, 0, 0.3),
  foreR: v(1.8, 0, 0),
  armL: v(0.8, 0, 0.3),
  foreL: v(1.9, 0, 0),
});
PATCH.jumpPunch = () => ({
  ...PATCH.jump(),
  spine: v(0.3, 0, 0),
  armR: v(1.3, 0, 0),
  foreR: v(0.1, 0, 0),
});
PATCH.jumpKick = () => ({
  ...PATCH.jump(),
  spine: v(-0.2, 0, 0),
  thighR: v(1.25, 0, 0.1),
  shinR: v(-0.1, 0, 0),
  thighL: v(0.9, 0, 0.1),
  shinL: v(-1.6, 0, 0),
});

/** 2つの角度表を k（0..1）で混ぜる */
export function mixPose(a, b, k) {
  const w = Math.max(0, Math.min(1, Number(k) || 0));
  const out = {};
  for (const j of LF_JOINTS) {
    const p = (a && a[j]) || v();
    const q = (b && b[j]) || v();
    if (w <= 0) out[j] = v(p.x, p.y, p.z);
    else if (w >= 1) out[j] = v(q.x, q.y, q.z);
    else out[j] = v(p.x + (q.x - p.x) * w, p.y + (q.y - p.y) * w, p.z + (q.z - p.z) * w);
  }
  return out;
}

export function poseFor(state, t = 0, who = 'hero') {
  const tt = Number.isFinite(t) ? t : 0;
  const base = stance(tt, who === 'foe' ? 'foe' : 'hero');
  const fn = Object.prototype.hasOwnProperty.call(PATCH, state) ? PATCH[state] : null;
  const out = fn ? { ...base, ...fn(tt) } : base;
  const res = {};
  for (const k of LF_JOINTS) {
    const p = out[k] || v();
    res[k] = v(p.x || 0, p.y || 0, p.z || 0);
  }
  return res;
}

/** 体全体の動き。dy: 身長に対する上下の割合、tilt: 後ろへの倒れ（ラジアン）、spin: その場の回転 */
export function bodyFor(state, t = 0) {
  const tt = Number.isFinite(t) ? t : 0;
  switch (state) {
    case 'crouch':
    case 'crouchPunch':
    case 'crouchKick': return { dy: -0.27, tilt: 0, spin: 0 };
    case 'guard': return { dy: 0, tilt: 0.05, spin: 0 };
    case 'hit': return { dy: 0, tilt: 0.12, spin: 0 };
    case 'down': return { dy: 0.04, tilt: Math.PI / 2 * 0.98, spin: 0 };
    case 'charge': return { dy: -0.06, tilt: 0.04, spin: 0 };
    case 'rising': return { dy: 0, tilt: 0.1, spin: 0 };
    case 'whirl': return { dy: 0.08, tilt: 0, spin: tt * 18 };
    default: return { dy: 0, tilt: 0, spin: 0 };
  }
}

const SWAP = Object.freeze({
  armL: 'armR', armR: 'armL', foreL: 'foreR', foreR: 'foreL',
  thighL: 'thighR', thighR: 'thighL', shinL: 'shinR', shinR: 'shinL',
});

/** 左右を入れ替えた表（左向きのとき、前の手足をカメラ側にそろえる）。ひねりは逆にする */
export function mirrorPose(table) {
  const out = {};
  for (const k of Object.keys(table || {})) {
    const p = table[k] || v();
    const to = SWAP[k] || k;
    out[to] = v(p.x || 0, -(p.y || 0), p.z || 0);
  }
  return out;
}
