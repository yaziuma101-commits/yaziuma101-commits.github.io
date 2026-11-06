// 真っ暗ソウルの音の数値規則（Web Audio・three.js・DOM に依存しない）。
const f = Object.freeze;

const FAR = 12;
const NEAR = 2;

/** 最も近い敵までの距離 → 鼓動の速さと大きさ（近いほど速く大きい） */
export function heartbeatParams(nearestDist) {
  const d = Number(nearestDist);
  if (nearestDist === null || nearestDist === undefined || !Number.isFinite(d) || d >= FAR) {
    return { bpm: 55, volume: 0.05 };
  }
  if (d <= NEAR) return { bpm: 150, volume: 1 };
  const k = (FAR - d) / (FAR - NEAR);
  return { bpm: 55 + 95 * k, volume: 0.05 + 0.95 * k };
}

/** 鼓動の間隔（秒） */
export function heartbeatInterval(bpm) {
  const b = Number(bpm);
  return b > 0 && Number.isFinite(b) ? 60 / b : 60 / 55;
}

/** 位置 from から一番近いもの（dead のものは除く）までの距離。無ければ null */
export function nearestDistance(from, list) {
  if (!from || !Array.isArray(list)) return null;
  let best = null;
  for (const p of list) {
    if (!p || p.dead || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** 床の材質ごとの足音 */
export const FOOTSTEP_VOICES = f({
  wood: f({ freq: 180, noise: 0.6, decay: 0.12 }),
  carpet: f({ freq: 110, noise: 0.25, decay: 0.07 }),
  tile: f({ freq: 420, noise: 0.5, decay: 0.09 }),
  concrete: f({ freq: 240, noise: 0.8, decay: 0.15 }),
});

export const FOOTSTEP_INTERVAL = f({ walk: 0.5, run: 0.3 });

/** 床の材質の足音（未知・部屋の外は木の床） */
export function footstepVoice(material) {
  return Object.prototype.hasOwnProperty.call(FOOTSTEP_VOICES, material)
    ? FOOTSTEP_VOICES[material] : FOOTSTEP_VOICES.wood;
}

/** 足音の間隔（秒） */
export function footstepInterval(running) {
  return running ? FOOTSTEP_INTERVAL.run : FOOTSTEP_INTERVAL.walk;
}

/** 聞き手（{x,z,yaw}）から見た左右（-1 左 〜 1 右）。右は (-cos yaw, sin yaw) */
export function panFor(listener, src) {
  if (!listener || !src) return 0;
  const dx = src.x - listener.x;
  const dz = src.z - listener.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) return 0;
  const yaw = Number(listener.yaw) || 0;
  const v = (dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / d;
  return Math.max(-1, Math.min(1, v));
}

/** 真っ暗ソウルが鳴らす効果音の全リスト */
export const DS_SFX = f(['bgm', 'heartbeat', 'footstep', 'door', 'cat', 'click', 'hit', 'roll', 'scare']);

/** 効果音ごとの基本の大きさ */
export const DS_SFX_GAIN = f({
  bgm: 1, heartbeat: 0.9, footstep: 0.45, door: 0.7, cat: 0.35, click: 0.5, hit: 0.75, roll: 0.5, scare: 1,
});

/** 効果音の計画。DS_SFX に無い名前・音量 0 なら null（ふざけた音は鳴らせない） */
export function planDsSfx(name, baseGain) {
  if (typeof name !== 'string' || !DS_SFX.includes(name)) return null;
  const g = Number(baseGain);
  if (!(g > 0) || !Number.isFinite(g)) return null;
  return { name, gain: DS_SFX_GAIN[name] * g };
}

/** 暗い持続音（旋律なし。動かない低い音の重なりを、フィルターと音量でゆっくりうねらせる） */
export const DRONE = f({
  voices: f([
    f({ type: 'sawtooth', freq: 41.2, detune: 0, gain: 0.5 }),
    f({ type: 'sawtooth', freq: 41.2, detune: 9, gain: 0.45 }),
    f({ type: 'sine', freq: 30.9, detune: 0, gain: 0.7 }),
    f({ type: 'triangle', freq: 61.7, detune: 0, gain: 0.18 }),
    f({ type: 'sine', freq: 43.65, detune: 0, gain: 0.12 }),
  ]),
  filterHz: 170,
  filterQ: 3,
  filterSweep: 80,
  sweepRate: 0.07,
  swellRate: 0.11,
  swellDepth: 0.3,
  rumble: 0.35,
  wind: 0.08,
  level: 2.5,
});

/** 遠くの物音（きしみ・物音）と遠い猫の声の間隔（秒） */
export const AMBIENT_DELAY = f({ creak: f([7, 18]), cat: f([24, 50]) });

/** 次の遠くの音までの秒数（未知は Infinity） */
export function nextAmbientDelay(kind, rng = Math.random) {
  const r = Object.prototype.hasOwnProperty.call(AMBIENT_DELAY, kind) ? AMBIENT_DELAY[kind] : null;
  if (!r) return Infinity;
  return r[0] + rng() * (r[1] - r[0]);
}
