// 音の規則（three.js・Web Audio・DOM に依存しない）。storage は引数で受け取る。
const e = (sound, gain, minInterval = 0) => Object.freeze({ sound, gain, minInterval });

export const SFX_TABLE = Object.freeze({
  jump: e('jump', 0.5),
  land: e('land', 0.4),
  dash: e('dash', 0.45),
  talk: e('talk', 0.35),
  confirm: e('confirm', 0.5),
  push: e('push', 0.45, 0.25),
  puzzleClear: e('clear', 0.7),
  boostPad: e('boost', 0.6),
  drift: e('drift', 0.35, 0.15),
  punch: e('punch', 0.6),
  stun: e('stun', 0.55),
  shoot: e('shoot', 0.4, 0.08),
  reload: e('reload', 0.45),
  hit: e('hit', 0.6),
  mohawkGet: e('fanfare', 0.8),
});

/** スーパー将棋の効果音（パチッ・パシーン・シャキーン・ドドン・チーン） */
export const SHOGI_SFX_TABLE = Object.freeze({
  shogiPlace: e('shogiPlace', 0.7, 0.04),
  shogiCapture: e('shogiCapture', 0.8, 0.04),
  shogiPromote: e('shogiPromote', 0.6, 0.1),
  shogiCheck: e('shogiCheck', 0.8, 0.3),
  shogiMate: e('shogiMate', 0.7, 0.5),
});

/**
 * 将棋の効果音の計画。baseGain は効果音の音量（消音・未解除なら 0）。
 * lastPlayed（Map）を渡すと minInterval 以内の連打は鳴らさない。鳴らさないなら null
 */
export function planShogiSfx(name, baseGain, now, lastPlayed) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SHOGI_SFX_TABLE, name)) return null;
  const g = Number(baseGain);
  if (!(g > 0)) return null;
  const entry = SHOGI_SFX_TABLE[name];
  const timed = typeof now === 'number' && Number.isFinite(now) && lastPlayed instanceof Map;
  if (timed && entry.minInterval > 0 && lastPlayed.has(name)) {
    if (now - lastPlayed.get(name) < entry.minInterval - 1e-9) return null;
  }
  if (timed) lastPlayed.set(name, now);
  return { sound: entry.sound, gain: entry.gain * g };
}

/** 1手ぶんの効果音（名前と遅れ秒）。取ったら「パシーン」、成りは「シャキーン」、王手「ドドン」、詰み「チーン」 */
export function shogiMoveSounds({
  captured = false, promote = false, kind = 'ongoing', inCheck = false,
} = {}) {
  const out = [{ name: captured ? 'shogiCapture' : 'shogiPlace', delay: 0 }];
  if (promote) out.push({ name: 'shogiPromote', delay: 0.08 });
  if (kind === 'checkmate' || kind === 'nomoves') out.push({ name: 'shogiMate', delay: 0.25 });
  else if (inCheck) out.push({ name: 'shogiCheck', delay: 0.15 });
  return out;
}

/** ファイルを見つけろの効果音（ぽわーん・クリック・開く・ポーン・正解・不正解・ガリガリ） */
export const FF_SFX_TABLE = Object.freeze({
  ffBoot: e('ffBoot', 0.7, 0.5),
  ffClick: e('ffClick', 0.5, 0.03),
  ffOpen: e('ffOpen', 0.6, 0.05),
  ffError: e('ffError', 0.6, 0.15),
  ffOk: e('ffOk', 0.7, 0.2),
  ffNg: e('ffNg', 0.6, 0.2),
  ffFloppy: e('ffFloppy', 0.6, 0.3),
});

/**
 * ファイルを見つけろの効果音の計画。baseGain は効果音の音量（消音・未解除なら 0）。
 * lastPlayed（Map）を渡すと minInterval 以内の連打は鳴らさない。鳴らさないなら null
 */
export function planFfSfx(name, baseGain, now, lastPlayed) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(FF_SFX_TABLE, name)) return null;
  const g = Number(baseGain);
  if (!(g > 0)) return null;
  const entry = FF_SFX_TABLE[name];
  const timed = typeof now === 'number' && Number.isFinite(now) && lastPlayed instanceof Map;
  if (timed && entry.minInterval > 0 && lastPlayed.has(name)) {
    if (now - lastPlayed.get(name) < entry.minInterval - 1e-9) return null;
  }
  if (timed) lastPlayed.set(name, now);
  return { sound: entry.sound, gain: entry.gain * g };
}

/** レバガチャファイターヌスの効果音（真剣な打撃音。ふざけた音は無い） */
export const LF_SFX_TABLE = Object.freeze({
  lfPunch: e('lfPunch', 0.75, 0.03),
  lfKick: e('lfKick', 0.85, 0.03),
  lfGuard: e('lfGuard', 0.6, 0.03),
  lfKo: e('lfKo', 0.9, 0.5),
  lfCharge: e('lfCharge', 0.55, 0.1),
  lfSpecial: e('lfSpecial', 0.75, 0.05),
  lfDiscover: e('lfDiscover', 0.65, 0.5),
});

/** レバガチャファイターヌスの効果音の計画。鳴らさないなら null */
export function planLfSfx(name, baseGain, now, lastPlayed) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LF_SFX_TABLE, name)) return null;
  const g = Number(baseGain);
  if (!(g > 0)) return null;
  const entry = LF_SFX_TABLE[name];
  const timed = typeof now === 'number' && Number.isFinite(now) && lastPlayed instanceof Map;
  if (timed && entry.minInterval > 0 && lastPlayed.has(name)) {
    if (now - lastPlayed.get(name) < entry.minInterval - 1e-9) return null;
  }
  if (timed) lastPlayed.set(name, now);
  return { sound: entry.sound, gain: entry.gain * g };
}

export const MUSIC_TABLE = Object.freeze({
  hub: 'hub', puzzle: 'puzzle', race: 'race', fps: 'fps', ending: 'ending',
});

const KEY = 'takuarinus-audio';
const DEFAULTS = Object.freeze({ muted: false, sfxVolume: 7, musicVolume: 5 });
const BASE = Object.freeze({ sfx: 1.0, music: 0.35 });

const clampVol = (n) => Math.max(0, Math.min(10, Math.round(n)));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function load(storage) {
  const s = { ...DEFAULTS };
  try {
    const text = storage.getItem(KEY);
    if (typeof text !== 'string') return s;
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object') return s;
    if (typeof d.muted === 'boolean') s.muted = d.muted;
    if (typeof d.sfxVolume === 'number' && Number.isFinite(d.sfxVolume)) s.sfxVolume = clampVol(d.sfxVolume);
    if (typeof d.musicVolume === 'number' && Number.isFinite(d.musicVolume)) s.musicVolume = clampVol(d.musicVolume);
  } catch {
    return { ...DEFAULTS };
  }
  return s;
}

export function createAudioRules(storage) {
  const saved = load(storage);
  const state = {
    muted: saved.muted, sfxVolume: saved.sfxVolume, musicVolume: saved.musicVolume, unlocked: false,
  };
  const lastPlayed = new Map();

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify({
        muted: state.muted, sfxVolume: state.sfxVolume, musicVolume: state.musicVolume,
      }));
    } catch {
      // 握りつぶす
    }
  }

  function effectiveGain(channel) {
    if (state.muted || !has(BASE, channel)) return 0;
    const vol = channel === 'sfx' ? state.sfxVolume : state.musicVolume;
    return (vol / 10) ** 2 * BASE[channel];
  }

  return {
    state,
    unlock() {
      state.unlocked = true;
    },
    toggleMute() {
      state.muted = !state.muted;
      save();
    },
    setVolume(channel, n) {
      if (channel !== 'sfx' && channel !== 'music') return;
      if (typeof n !== 'number' || !Number.isFinite(n)) return;
      if (channel === 'sfx') state.sfxVolume = clampVol(n);
      else state.musicVolume = clampVol(n);
      save();
    },
    effectiveGain,
    planSfx(event, now) {
      if (!state.unlocked || state.muted || state.sfxVolume <= 0) return null;
      if (typeof event !== 'string' || !has(SFX_TABLE, event)) return null;
      const entry = SFX_TABLE[event];
      const timed = typeof now === 'number' && Number.isFinite(now);
      if (timed && entry.minInterval > 0 && lastPlayed.has(event)) {
        if (now - lastPlayed.get(event) < entry.minInterval - 1e-9) return null;
      }
      if (timed) lastPlayed.set(event, now);
      return { sound: entry.sound, gain: entry.gain * effectiveGain('sfx') };
    },
    planMusic(scene) {
      if (!state.unlocked || typeof scene !== 'string' || !has(MUSIC_TABLE, scene)) return null;
      return { track: MUSIC_TABLE[scene], gain: effectiveGain('music') };
    },
  };
}
