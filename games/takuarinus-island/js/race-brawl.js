// レース中の「相手のカートに飛び移ってパンチ」の規則（three.js・DOM に依存しない）
// 乗り手の状態:
//   driving（自分のカートを運転）→ jumping（飛び移り中）→ onKart（相手のカートの上）
//   → punching（パンチ）→ running（走って戻る）→ boarding（乗り込み）→ driving
// パンチされた側（相手のカートの上や、追い出されたとき）:
//   driving → knockedOut（追い出し・気絶）→ running → boarding → driving
// カートに乗ったままパンチされたら driving のまま stun>0（気絶。カートは止まる）
import { nearestOnCenterline } from './race-track.js';

export const BRAWL = Object.freeze({
  jumpRange: 4, // 飛び移れるカート間の距離
  jumpTime: 0.5, // 飛び移りにかかる秒数
  jumpHeight: 2.2,
  punchTime: 0.35,
  stunTime: 3, // 気絶の長さ
  ejectStun: 1.5, // 主人公が追い出されたときの気絶
  ejectFlight: 0.5, // はじき出されて飛ぶ時間
  ejectDist: 5,
  counterWindow: 0.5, // 番長の着地からこの秒数以内なら反撃できる
  rivalPunchDelay: 0.65, // 番長は着地からこの秒数でパンチする
  boardRadius: 2.5, // 乗り込める距離
  boardTime: 0.3,
  hopOffDist: 2.6,
  walkSpeed: 6,
  dashMult: 1.8,
  aiRunSpeed: 9,
  rivalJumpInterval: 8, // 番長の飛び移りの最短間隔（レース開始直後もこの秒数は待つ）
  rivalMinTargetSpeed: 6, // 止まっている相手には飛び移らない
  emptyDecel: 14, // 乗り手のいないカートの減速
  stunDecel: 18, // 気絶した乗り手のカートの減速
});

const SIDES = ['player', 'rival'];
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createRider(id, kart = null) {
  return {
    id,
    state: 'driving',
    t: 0,
    x: num(kart && kart.x),
    z: num(kart && kart.z),
    y: 0,
    heading: num(kart && kart.heading),
    stun: 0,
    stunExtended: false,
    onSide: null,
    from: null,
    to: null,
    moving: false,
    dash: false,
  };
}

export function otherSide(side) {
  return side === 'player' ? 'rival' : 'player';
}

/** 自分のカートを操作できる（乗っていて、気絶していない） */
export function isDriving(r) {
  return !!r && r.state === 'driving' && !(r.stun > 0);
}

export function isStunned(r) {
  return !!r && r.stun > 0;
}

/** 飛び移れるか（自分は運転中、相手は自分のカートに乗っている、距離内） */
export function canJump(self, selfKart, other, otherKart) {
  if (!self || !other || !selfKart || !otherKart) return false;
  if (self.state !== 'driving' || self.stun > 0) return false;
  if (other.state !== 'driving') return false;
  if (other.stun > 0 && other.stunExtended) return false; // 気絶を延ばせるのは1回まで
  return dist(selfKart, otherKart) <= BRAWL.jumpRange + 1e-9;
}

/** 相手のカートの上に着地した直後（反撃できる時間内）か */
export function canCounter(attacker) {
  return !!attacker && attacker.state === 'onKart' && attacker.t <= BRAWL.counterWindow + 1e-9;
}

/** 自分のカートの近くで乗り込めるか */
export function canBoard(rider, kart) {
  return !!rider && !!kart && rider.state === 'running' && !(rider.stun > 0)
    && dist(rider, kart) <= BRAWL.boardRadius + 1e-9;
}

export function startJump(rider, fromKart, targetSide) {
  return {
    ...rider, state: 'jumping', t: 0, from: { x: fromKart.x, z: fromKart.z }, onSide: targetSide, moving: false,
  };
}

export function startPunch(rider) {
  return { ...rider, state: 'punching', t: 0 };
}

export function startBoard(rider) {
  return {
    ...rider, state: 'boarding', t: 0, from: { x: rider.x, z: rider.z }, moving: false, dash: false,
  };
}

/** カートに乗ったままパンチされた（2回目なら延長済みの印を付ける） */
export function stunInKart(victim) {
  const already = victim.stun > 0;
  return { ...victim, stun: BRAWL.stunTime, stunExtended: already };
}

/** 歩いている人を柵の内側に収める */
export function clampWalker(track, p) {
  if (!track) return { x: p.x, z: p.z };
  const n = nearestOnCenterline(track, p.x, p.z);
  const lim = track.fenceHalfWidth - 0.8;
  if (n.dist <= lim || n.dist < 1e-9) return { x: p.x, z: p.z };
  return {
    x: n.x + ((p.x - n.x) / n.dist) * lim,
    z: n.z + ((p.z - n.z) / n.dist) * lim,
  };
}

/** カートの横（道の外側寄り）の地点 */
export function sidePoint(kart, d, track = null) {
  let dx = -Math.cos(kart.heading); // 右
  let dz = Math.sin(kart.heading);
  if (track) {
    const n = nearestOnCenterline(track, kart.x, kart.z);
    if (n.dist > 0.5) {
      dx = (kart.x - n.x) / n.dist;
      dz = (kart.z - n.z) / n.dist;
    }
  }
  return clampWalker(track, { x: kart.x + dx * d, z: kart.z + dz * d });
}

/** カートから追い出して気絶させる */
export function eject(victim, kart, stun, track = null) {
  const to = sidePoint(kart, BRAWL.ejectDist, track);
  return {
    ...victim,
    state: 'knockedOut',
    t: 0,
    x: kart.x,
    z: kart.z,
    from: { x: kart.x, z: kart.z },
    to,
    stun,
    stunExtended: false,
    onSide: null,
    moving: false,
    dash: false,
  };
}

/** 乗り手のいない（または気絶した乗り手の）カートは減速して止まる */
export function coastKart(kart, dt, decel = BRAWL.emptyDecel) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let s = num(kart.speed);
  s = s > 0 ? Math.max(0, s - decel * h) : Math.min(0, s + decel * h);
  return {
    ...kart,
    speed: s,
    boostTimer: Math.max(0, num(kart.boostTimer) - h),
    drifting: false,
    x: num(kart.x) + Math.sin(kart.heading) * s * h,
    z: num(kart.z) + Math.cos(kart.heading) * s * h,
  };
}

/** 時間で進む移り変わり（着地・パンチ後の飛び降り・気絶の終わり・乗り込みの完了） */
export function advanceRider(rider, dt, kartOf = () => null, track = null) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  let r = { ...rider, t: rider.t + h };
  if (r.stun > 0) {
    r.stun = Math.max(0, r.stun - h);
    if (r.stun <= 0) {
      r.stun = 0;
      r.stunExtended = false;
    }
  }
  if (r.state === 'jumping' && r.t >= BRAWL.jumpTime - 1e-9) {
    r = { ...r, state: 'onKart', t: 0 };
  } else if (r.state === 'punching' && r.t >= BRAWL.punchTime - 1e-9) {
    const k = kartOf(r.onSide);
    const p = k ? sidePoint(k, BRAWL.hopOffDist, track) : { x: r.x, z: r.z };
    r = {
      ...r, state: 'running', t: 0, x: p.x, z: p.z, y: 0, onSide: null, from: null,
    };
  } else if (r.state === 'knockedOut' && r.stun <= 0) {
    const to = r.to || { x: r.x, z: r.z };
    r = {
      ...r, state: 'running', t: 0, x: to.x, z: to.z, y: 0, from: null, to: null,
    };
  } else if (r.state === 'boarding' && r.t >= BRAWL.boardTime - 1e-9) {
    r = { ...r, state: 'driving', t: 0, from: null };
  }
  return r;
}

function walk(r, pa, h, track) {
  if (r.state !== 'running' || r.stun > 0) {
    return r.moving || r.dash ? { ...r, moving: false, dash: false } : r;
  }
  const m = pa.move || {};
  let mx = num(m.x);
  let mz = num(m.z);
  const l = Math.hypot(mx, mz);
  if (l < 1e-6) return { ...r, moving: false, dash: false };
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  const sp = BRAWL.walkSpeed * (pa.dash ? BRAWL.dashMult : 1);
  const p = clampWalker(track, { x: r.x + mx * sp * h, z: r.z + mz * sp * h });
  return {
    ...r, x: p.x, z: p.z, heading: Math.atan2(mx, mz), moving: true, dash: !!pa.dash,
  };
}

function aiRun(r, kart, h, track, ev) {
  if (r.state !== 'running' || r.stun > 0) return r;
  const dx = kart.x - r.x;
  const dz = kart.z - r.z;
  const d = Math.hypot(dx, dz);
  const stopAt = BRAWL.boardRadius * 0.6;
  let n = { ...r, moving: false };
  if (d > stopAt) {
    const len = Math.min(BRAWL.aiRunSpeed * h, d - stopAt);
    const p = clampWalker(track, { x: r.x + (dx / d) * len, z: r.z + (dz / d) * len });
    n = {
      ...r, x: p.x, z: p.z, heading: Math.atan2(dx, dz), moving: true, dash: true,
    };
  }
  if (canBoard(n, kart)) {
    n = startBoard(n);
    ev.push('rival-board');
  }
  return n;
}

/** 番長が今飛び移るか（間隔・距離・相手が走っていること） */
export function rivalShouldJump(b) {
  const P = b.player;
  const R = b.rival;
  return num(b.rivalCooldown) <= 0
    && P.rider.state === 'driving'
    && Math.abs(num(P.kart.speed)) >= BRAWL.rivalMinTargetSpeed
    && canJump(R.rider, R.kart, P.rider, P.kart);
}

/** 主人公への案内: 'counter' | 'punch' | 'board' | 'jump' | 'return' | null */
export function playerPrompt(b) {
  const P = b.player;
  const R = b.rival;
  if (R.rider.state === 'onKart' && R.rider.onSide === 'player'
    && P.rider.state === 'driving' && canCounter(R.rider)) return 'counter';
  if (P.rider.state === 'onKart') return 'punch';
  if (canBoard(P.rider, P.kart)) return 'board';
  if (canJump(P.rider, P.kart, R.rider, R.kart)) return 'jump';
  if (P.rider.state === 'running') return 'return';
  return null;
}

/** 乗り手の位置をカートに合わせる（カートの上・飛び移り中・はじき出され中） */
export function syncRiders(b) {
  const kartOf = (s) => (s === 'player' ? b.player.kart : s === 'rival' ? b.rival.kart : null);
  for (const side of SIDES) {
    const S = b[side];
    const r = S.rider;
    const own = S.kart;
    let n = r;
    if (r.state === 'driving') {
      n = {
        ...r, x: own.x, z: own.z, y: 0, heading: own.heading,
      };
    } else if (r.state === 'boarding') {
      const s = clamp01(r.t / BRAWL.boardTime);
      const f = r.from || r;
      n = {
        ...r,
        x: lerp(f.x, own.x, s),
        z: lerp(f.z, own.z, s),
        y: 4 * 0.8 * s * (1 - s),
        heading: own.heading,
      };
    } else if (r.state === 'jumping') {
      const k = kartOf(r.onSide);
      const f = r.from || r;
      const s = clamp01(r.t / BRAWL.jumpTime);
      n = {
        ...r,
        x: lerp(f.x, k.x, s),
        z: lerp(f.z, k.z, s),
        y: 4 * BRAWL.jumpHeight * s * (1 - s),
        heading: Math.atan2(k.x - f.x, k.z - f.z),
      };
    } else if (r.state === 'onKart' || r.state === 'punching') {
      const k = kartOf(r.onSide);
      n = {
        ...r, x: k.x, z: k.z, y: 0, heading: k.heading + Math.PI,
      };
    } else if (r.state === 'knockedOut') {
      const f = r.from || r;
      const to = r.to || r;
      const s = clamp01(r.t / BRAWL.ejectFlight);
      n = {
        ...r, x: lerp(f.x, to.x, s), z: lerp(f.z, to.z, s), y: 4 * 1.2 * s * (1 - s),
      };
    }
    S.rider = n;
  }
}

/**
 * 1ステップ進める。b = { player:{kart,rider}, rival:{kart,rider}, rivalCooldown } を書き換える。
 * acts.player = { action(F), punch(左クリック), board(E), move:{x,z}, dash }
 * 起きたことを文字列の配列で返す。
 */
export function stepBrawl(b, acts = {}, dt = 0, track = null) {
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const ev = [];
  const P = b.player;
  const R = b.rival;
  const kartOf = (s) => (s === 'player' ? P.kart : s === 'rival' ? R.kart : null);
  const pa = (acts && acts.player) || {};
  b.rivalCooldown = Math.max(0, num(b.rivalCooldown, BRAWL.rivalJumpInterval) - h);

  P.rider = advanceRider(P.rider, h, kartOf, track);
  R.rider = advanceRider(R.rider, h, kartOf, track);

  // ---- 主人公 ----
  if (pa.action || pa.punch) {
    const pr = P.rider;
    const rr = R.rider;
    if (rr.state === 'onKart' && rr.onSide === 'player') {
      // 番長が飛び乗ってきた: 着地直後だけ反撃できる
      if (pr.state === 'driving' && canCounter(rr)) {
        R.rider = eject(rr, P.kart, BRAWL.stunTime, track);
        ev.push('player-counter');
      }
    } else if (pr.state === 'onKart' && pr.onSide === 'rival') {
      P.rider = startPunch(pr);
      ev.push('player-punch');
      if (rr.state === 'driving') {
        R.rider = stunInKart(rr);
        ev.push('rival-stunned');
      }
    } else if (pa.action && canJump(pr, P.kart, rr, R.kart)) {
      P.rider = startJump(pr, P.kart, 'rival');
      ev.push('player-jump');
    }
  }
  if (pa.board && canBoard(P.rider, P.kart)) {
    P.rider = startBoard(P.rider);
    ev.push('player-board');
  }
  P.rider = walk(P.rider, pa, h, track);

  // ---- レース番長 ----
  const rr = R.rider;
  if (rr.state === 'onKart' && rr.onSide === 'player' && rr.t >= BRAWL.rivalPunchDelay - 1e-9) {
    R.rider = startPunch(rr);
    ev.push('rival-punch');
    if (P.rider.state === 'driving') {
      P.rider = eject(P.rider, P.kart, BRAWL.ejectStun, track);
      ev.push('player-ejected');
    }
  } else if (rivalShouldJump(b)) {
    R.rider = startJump(rr, R.kart, 'player');
    b.rivalCooldown = BRAWL.rivalJumpInterval;
    ev.push('rival-jump');
  }
  R.rider = aiRun(R.rider, R.kart, h, track, ev);

  syncRiders(b);
  return ev;
}
