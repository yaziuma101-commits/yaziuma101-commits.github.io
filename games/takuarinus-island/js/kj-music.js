// 怪獣大決戦の音（すべてオリジナル）。行進曲・ファンファーレの楽譜と、効果音の作り方（純データ）。
// three.js・DOM・Web Audio に依存しない。楽譜は audio-music.js が曲にし、効果音は audio.js が合成する。
const f = Object.freeze;

/** 戦いの BGM（勇ましい行進曲）と、タイトル演出のファンファーレの曲名 */
export const KJ_MUSIC = 'kaiju';
export const KJ_FANFARE = 'kaiju-fanfare';

const bars = (...list) => list.join(' ');
const rep = (bar, n) => Array.from({ length: n }, () => bar).join(' ');

// ---- 主題歌：昭和の特撮番組の主題歌のような、勇ましい行進曲（旋律・和音進行はオリジナル） ----
// C 長調・120 BPM・8小節。トランペットの旋律が伸ばしている間にホルンが合いの手を入れ、
// 男声コーラス（「アー」「オー」）が重厚な和音を支え、弦が8分音符で刻み、
// ティンパニ・スネア・シンバル・低音が軍歌のような行進の足取りを作る。

const wv = (type, mul, gain) => f({ type, mul, gain });

/**
 * 主題歌の楽器（音の作り方のデータ。audio.js がこのとおりに合成する）。
 * kind: osc（発振器を重ねてローパス）／ voice（ノコギリ波を声の共鳴＝フォルマントに通す男声）／
 * drum（音程のある太鼓）／ noise（ノイズの打楽器）
 */
export const KJ_INSTRUMENTS = f({
  trumpet: f({
    name: 'トランペット', family: 'brass', kind: 'osc',
    waves: f([wv('sawtooth', 1, 0.8), wv('square', 1, 0.22), wv('sawtooth', 2, 0.12)]),
    lpStart: 800, lp: 2800, attack: 0.03, decay: 0.12, sustain: 0.78, release: 0.09,
    vib: 0.006, vibRate: 5.6, vibDelay: 0.2,
  }),
  horn: f({
    name: 'ホルン', family: 'brass', kind: 'osc',
    waves: f([wv('sawtooth', 1, 0.6), wv('triangle', 1, 0.6), wv('triangle', 0.5, 0.3)]),
    lpStart: 350, lp: 1050, attack: 0.07, decay: 0.15, sustain: 0.82, release: 0.18,
    vib: 0.004, vibRate: 5, vibDelay: 0.25,
  }),
  chorusA: f({
    name: '男声コーラス（アー）', family: 'chorus', kind: 'voice', vowel: 'a',
    formants: f([f([730, 4, 6]), f([1090, 2.2, 8]), f([2440, 0.8, 10])]),
    detune: f([-12, -3, 5, 13]),
    attack: 0.2, decay: 0.2, sustain: 0.9, release: 0.35, vib: 0.009, vibRate: 4.8, vibDelay: 0.3,
  }),
  chorusO: f({
    name: '男声コーラス（オー）', family: 'chorus', kind: 'voice', vowel: 'o',
    formants: f([f([570, 4, 6]), f([840, 2, 8]), f([2410, 0.6, 10])]),
    detune: f([-10, -2, 6, 11]),
    attack: 0.22, decay: 0.2, sustain: 0.9, release: 0.35, vib: 0.008, vibRate: 4.6, vibDelay: 0.3,
  }),
  strings: f({
    name: '弦（刻み）', family: 'strings', kind: 'osc',
    waves: f([wv('sawtooth', 1, 0.55), wv('sawtooth', 1.005, 0.55)]),
    lpStart: 2400, lp: 2400, attack: 0.006, decay: 0.07, sustain: 0.55, release: 0.05, vib: 0,
  }),
  bass: f({
    name: '低音（チューバとコントラバス）', family: 'bass', kind: 'osc',
    waves: f([wv('triangle', 1, 0.9), wv('sawtooth', 1, 0.3)]),
    lpStart: 500, lp: 650, attack: 0.012, decay: 0.12, sustain: 0.6, release: 0.08, vib: 0,
  }),
  timpani: f({
    name: 'ティンパニ', family: 'percussion', kind: 'drum',
    partials: f([f([1, 1]), f([1.5, 0.35]), f([1.98, 0.18])]), bend: 1.06, decay: 0.95, noise: 0.3, noiseLp: 260,
  }),
  snare: f({
    name: 'スネア', family: 'percussion', kind: 'noise', filter: 'highpass', freq: 1700, q: 0.7, decay: 0.16, body: 190, bodyGain: 0.55,
  }),
  cymbal: f({
    name: 'シンバル', family: 'percussion', kind: 'noise', filter: 'highpass', freq: 6500, q: 0.5, decay: 1.3, body: 0, bodyGain: 0,
  }),
});

/** 楽器の作り方（未知は null） */
export function kjInstrument(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(KJ_INSTRUMENTS, name)
    ? KJ_INSTRUMENTS[name] : null;
}

/** 前半8小節の和音 */
export const KJ_THEME_CHORDS = f(['C', 'C', 'F', 'G', 'Am', 'F', 'G', 'C']);
/** 後半8小節の和音（短調の色を入れて盛り上げ、最後は主和音に戻る） */
export const KJ_THEME_CHORDS_B = f(['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C']);
/** 全16小節の和音 */
export const KJ_THEME_CHORDS_FULL = f([...KJ_THEME_CHORDS, ...KJ_THEME_CHORDS_B]);

const REST_8 = '. . . . . . . .';
const hold8 = (n) => `${n} - - - - - - -`;

// トランペット：勇ましい旋律。2・4・6・8小節の終わりで長く伸ばし、そこへホルンが答える
const THEME_LEAD = bars(
  'C5 - - G4 C5 - E5 -', 'G5 - - - - - . .', 'A5 - G5 F5 E5 - C5 -', 'D5 - - - - - . .',
  'E5 - - C5 E5 - A5 -', 'A5 - - - - - . .', 'G5 - A5 - B5 - D6 -', 'C6 - - - - - - .',
  'A4 - - C5 E5 - A5 -', 'A5 - - - - - . .', 'G5 - E5 - C5 - E5 -', 'D5 - - - - - . .',
  'C5 - - A4 C5 - E5 -', 'F5 - - - - - . .', 'G5 - F5 - E5 - D5 -', 'C5 - - - - - - .',
);
// ホルン：旋律が伸ばしている・休んでいる所だけに入る合いの手
const THEME_HORN = bars(
  REST_8, '. . E4 G4 C5 - - .', REST_8, '. . G4 B4 D5 - G4 .',
  REST_8, '. . C5 - F5 - A4 .', REST_8, '. . G4 - E4 - C4 -',
  REST_8, '. . F4 A4 C5 - - .', REST_8, '. . B4 D5 G5 - - .',
  REST_8, '. . A4 C5 F5 - C5 .', REST_8, '. . E4 G4 C5 - - .',
);
const CHORUS_HI = ['E4', 'E4', 'F4', 'D4', 'E4', 'F4', 'D4', 'E4', 'E4', 'F4', 'E4', 'D4', 'E4', 'F4', 'D4', 'E4'];
const CHORUS_LO = ['C3', 'C3', 'F2', 'G2', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'G2', 'C3'];
const STR_TONES = f({
  C: ['E4', 'G4'], F: ['A3', 'C4'], G: ['B3', 'D4'], Am: ['C4', 'E4'],
});
const BASS_TONES = f({
  C: ['C2', 'G1'], F: ['F1', 'C2'], G: ['G1', 'D2'], Am: ['A1', 'E2'],
});
const TIMP_TONES = f({
  C: ['C2', 'G2'], F: ['F2', 'C2'], G: ['G2', 'D2'], Am: ['A2', 'E2'],
});
const THEME_STRINGS = bars(...KJ_THEME_CHORDS_FULL.map((c) => rep(`${STR_TONES[c][0]} ${STR_TONES[c][1]}`, 4)));
const THEME_BASS = bars(...KJ_THEME_CHORDS_FULL.map((c) => {
  const [r, v] = BASS_TONES[c];
  return `${r} . ${v} . ${r} . ${v} .`;
}));
const THEME_TIMP = bars(...KJ_THEME_CHORDS_FULL.map((c, i) => {
  if (i % 8 === 3) return 'G2 . G2 . G2 G2 G2 G2';
  if (i % 8 === 7) return 'C2 . . . G2 G2 G2 G2';
  const [r, v] = TIMP_TONES[c];
  return `${r} . . . ${v} . . .`;
}));
const SNARE_BAR = '. . C4 . . . C4 C4';
const SNARE_8 = bars(rep(SNARE_BAR, 3), 'C4 . C4 . C4 C4 C4 C4', rep(SNARE_BAR, 3), 'C4 C4 C4 C4 C4 C4 C4 C4');
const THEME_SNARE = bars(SNARE_8, SNARE_8);
const CYMBAL_8 = bars('C6 . . . . . . .', rep(REST_8, 3), 'C6 . . . . . . .', rep(REST_8, 3));
const THEME_CYMBAL = bars(CYMBAL_8, CYMBAL_8);

/**
 * 戦いの BGM（主題歌）。inst は KJ_INSTRUMENTS の楽器、role は役目。
 * type は楽器を合成できないときの代わりの音色（audio.js の既存の音）
 */
export const KJ_MARCH_SCORE = f({
  bpm: 120,
  voices: f([
    f({
      inst: 'trumpet', role: 'melody', type: 'sawtooth', vol: 0.15, lp: 2400, vib: 0.006, gate: 0.9, notes: THEME_LEAD,
    }),
    f({
      inst: 'horn', role: 'answer', type: 'sawtooth', vol: 0.15, lp: 1000, gate: 0.92, notes: THEME_HORN,
    }),
    f({
      inst: 'chorusA', role: 'chorus', type: 'sawtooth', vol: 0.12, lp: 1200, gate: 0.98, notes: bars(...CHORUS_HI.map(hold8)),
    }),
    f({
      inst: 'chorusO', role: 'chorus', type: 'sawtooth', vol: 0.12, lp: 900, gate: 0.98, notes: bars(...CHORUS_LO.map(hold8)),
    }),
    f({
      inst: 'strings', role: 'ostinato', type: 'sawtooth', vol: 0.05, lp: 2200, gate: 0.45, notes: THEME_STRINGS,
    }),
    f({
      inst: 'bass', role: 'bass', type: 'triangle', vol: 0.32, gate: 0.6, notes: THEME_BASS,
    }),
    f({
      inst: 'timpani', role: 'drum', type: 'taiko', vol: 0.42, notes: THEME_TIMP,
    }),
    f({
      inst: 'snare', role: 'drum', type: 'snare', vol: 0.28, notes: THEME_SNARE,
    }),
    f({
      inst: 'cymbal', role: 'drum', type: 'noise', vol: 0.12, notes: THEME_CYMBAL,
    }),
  ]),
});

/** 楽譜で使っている楽器（重複なし） */
export function kjScoreInstruments(score = KJ_MARCH_SCORE) {
  const out = [];
  for (const v of (score && Array.isArray(score.voices) ? score.voices : [])) {
    if (v && typeof v.inst === 'string' && !out.includes(v.inst)) out.push(v.inst);
  }
  return out;
}

/** 役目ごとの声部（melody / answer / chorus / ostinato / bass / drum） */
export function kjVoicesByRole(role, score = KJ_MARCH_SCORE) {
  return (score && Array.isArray(score.voices) ? score.voices : []).filter((v) => v && v.role === role);
}

// ---- タイトルのファンファーレ：C 長調・112 BPM・4小節（約 8.6 秒） ----
export const KJ_FANFARE_SCORE = f({
  bpm: 112,
  voices: f([
    f({
      type: 'sawtooth', vol: 0.15, lp: 2000, vib: 0.01, gate: 0.9,
      notes: bars('G4 G4 G4 C5 - - - -', 'E5 - D5 C5 E5 - G5 -', 'A5 - - - G5 - E5 -', 'C6 - - - - - - .'),
    }),
    f({
      type: 'square', vol: 0.06, lp: 1400, gate: 0.9,
      notes: bars('E4 E4 E4 G4 - - - -', 'C5 - B4 A4 C5 - E5 -', 'F5 - - - E5 - C5 -', 'G5 - - - - - - .'),
    }),
    f({
      type: 'triangle', vol: 0.4, gate: 0.95,
      notes: bars('C3 - - - - - - -', 'C3 - - - G2 - - -', 'F2 - - - G2 - - -', 'C3 - - - - - - .'),
    }),
    f({ type: 'taiko', vol: 0.45, notes: bars('C2 . . . . . . .', '. . . . G2 . G2 .', 'C2 . . . G2 . . .', 'C2 C2 C2 C2 C2 . . .') }),
    f({ type: 'snare', vol: 0.25, notes: bars('. . . . . . . .', '. . C4 . . . C4 .', '. . C4 . . . C4 .', 'C4 C4 C4 C4 C4 . . .') }),
  ]),
});

// ---- 効果音の作り方（tone: 発振器 / noise: フィルタを通したノイズ / wob: 揺れる発振器） ----
const N = (m) => 440 * 2 ** ((m - 69) / 12);
const T = (type, f0, f1, at, dur, vol, lp = 0) => f({
  k: 'tone', type, f0, f1, at, dur, vol, lp,
});
const Z = (filter, f0, f1, at, dur, vol, q = 1) => f({
  k: 'noise', filter, f0, f1, at, dur, vol, q,
});
const W = (type, f0, f1, at, dur, vol, o = {}) => f({
  k: 'wob', type, f0, f1, at, dur, vol, ...o,
});

const RECIPES = f({
  // 地響きの足音（低いサイン波＋ノイズ）
  kjStep: f([T('sine', 75, 30, 0, 0.5, 1), Z('lowpass', 420, 110, 0, 0.55, 0.7), T('triangle', 48, 30, 0.02, 0.6, 0.5)]),
  kjFoeStep: f([T('sine', 95, 40, 0, 0.35, 0.7), Z('lowpass', 600, 160, 0, 0.35, 0.5)]),
  // 重い当たり
  kjPunch: f([T('sine', 150, 38, 0, 0.4, 1), Z('lowpass', 1800, 250, 0, 0.3, 0.9), Z('bandpass', 2600, 1200, 0, 0.07, 0.4, 1.5)]),
  kjKick: f([T('sine', 110, 30, 0, 0.5, 1), Z('lowpass', 1000, 180, 0, 0.4, 0.9), T('square', 70, 40, 0, 0.15, 0.2, 500)]),
  kjSwing: f([Z('bandpass', 300, 1500, 0, 0.45, 0.35, 0.9)]),
  kjGuard: f([T('triangle', 260, 180, 0, 0.22, 0.5), Z('lowpass', 700, 200, 0, 0.18, 0.6), T('sine', 820, 780, 0, 0.15, 0.12)]),
  // ビルの崩れる音（長めのノイズと低音、がれきの音）
  kjCollapse: f([
    Z('lowpass', 2400, 140, 0, 1.9, 0.85, 0.7), T('sine', 62, 26, 0, 1.6, 0.9),
    Z('bandpass', 1500, 1500, 0.1, 0.06, 0.5, 2), Z('bandpass', 1100, 1100, 0.35, 0.07, 0.45, 2),
    Z('bandpass', 1800, 1800, 0.6, 0.05, 0.4, 2), Z('bandpass', 900, 900, 0.9, 0.08, 0.35, 2),
    T('triangle', 40, 28, 0.25, 1.4, 0.5),
  ]),
  kjPoleFall: f([Z('bandpass', 2200, 900, 0, 0.12, 0.5, 1.5), T('sine', 120, 50, 0.25, 0.3, 0.6), Z('lowpass', 800, 200, 0.25, 0.3, 0.4)]),
  // 咆哮：ヌスは低いノコギリ波のグライド、メガネ星人は高い金属的な揺れ
  kjRoarHero: f([
    W('sawtooth', 150, 70, 0, 1.5, 0.35, { lp: 900, rate: 7, depth: 12, hold: 0.7 }),
    W('sawtooth', 75, 40, 0, 1.5, 0.3, { lp: 500, rate: 6, depth: 6, hold: 0.7 }),
    Z('bandpass', 500, 300, 0, 1.3, 0.35, 1.2),
  ]),
  kjRoarFoe: f([
    W('square', 520, 860, 0, 1.1, 0.18, { bp: 1400, q: 3, rate: 24, depth: 70, hold: 0.6 }),
    W('triangle', 1300, 980, 0.05, 1.0, 0.12, { rate: 31, depth: 120, hold: 0.5 }),
    Z('highpass', 3000, 1800, 0, 0.9, 0.2),
  ]),
  // メガネ星人の予備動作と光線
  kjFoeWind: f([W('triangle', 300, 700, 0, 0.5, 0.2, { rate: 16, depth: 30, hold: 0.8, lin: true })]),
  kjFoeCharge: f([
    W('sine', 260, 1500, 0, 1.2, 0.25, { rate: 18, depth: 40, hold: 0.9 }),
    W('square', 520, 3000, 0, 1.2, 0.06, { bp: 2000, q: 2, hold: 0.9 }),
  ]),
  kjFoeBeam: f([T('square', 1100, 260, 0, 0.6, 0.25, 2600), Z('bandpass', 2200, 900, 0, 0.5, 0.45, 1.2), T('sine', 260, 90, 0, 0.5, 0.4)]),
  // ヌスの光線の発射（溜めは audio.js の溜めの音を使う）
  kjBeamFire: f([
    T('sawtooth', 1800, 220, 0, 0.7, 0.28, 4200), Z('highpass', 3200, 700, 0, 0.6, 0.45),
    T('sine', 320, 80, 0, 0.8, 0.55), W('sine', 1600, 1200, 0, 0.7, 0.1, { rate: 40, depth: 200 }),
  ]),
  // 勝利と敗北のジングル
  kjWin: f([
    T('sawtooth', N(72), N(72), 0, 0.16, 0.22, 2200), T('sawtooth', N(76), N(76), 0.16, 0.16, 0.22, 2200),
    T('sawtooth', N(79), N(79), 0.32, 0.16, 0.22, 2200), T('sawtooth', N(84), N(84), 0.48, 1.1, 0.24, 2400),
    T('square', N(64), N(64), 0.48, 1.1, 0.08, 1500), T('square', N(67), N(67), 0.48, 1.1, 0.08, 1500),
    T('triangle', N(48), N(48), 0.48, 1.2, 0.4),
  ]),
  kjLose: f([
    T('sawtooth', N(67), N(66), 0, 0.4, 0.2, 1400), T('sawtooth', N(66), N(65), 0.42, 0.4, 0.2, 1400),
    T('sawtooth', N(65), N(64), 0.84, 0.4, 0.2, 1300),
    W('sawtooth', N(64), N(60), 1.26, 1.4, 0.2, { lp: 1100, rate: 5, depth: 6, hold: 0.6 }),
    T('triangle', N(40), N(36), 1.26, 1.5, 0.35),
  ]),
});

const e = (gain, minInterval = 0) => f({ gain, minInterval });
/** 効果音の音量と、連打を止める間隔（秒） */
export const KJ_SFX_TABLE = f({
  kjStep: e(0.8, 0.15),
  kjFoeStep: e(0.7, 0.15),
  kjPunch: e(0.85, 0.05),
  kjKick: e(0.9, 0.05),
  kjSwing: e(0.6, 0.1),
  kjGuard: e(0.7, 0.05),
  kjCollapse: e(0.85, 0.12),
  kjPoleFall: e(0.6, 0.08),
  kjRoarHero: e(0.8, 0.5),
  kjRoarFoe: e(0.75, 0.5),
  kjFoeWind: e(0.6, 0.2),
  kjFoeCharge: e(0.7, 0.3),
  kjFoeBeam: e(0.8, 0.2),
  kjBeamFire: e(0.85, 0.2),
  kjWin: e(0.85, 1),
  kjLose: e(0.85, 1),
});

export const KJ_SFX_NAMES = f(Object.keys(RECIPES));

/** 効果音の作り方（部品の配列）。未知は null */
export function kjRecipe(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(RECIPES, name) ? RECIPES[name] : null;
}

/** 咆哮の名前（ヌスとメガネ星人で違う） */
export function kjRoarFor(who) {
  return who === 'foe' ? 'kjRoarFoe' : 'kjRoarHero';
}

/** 勝敗のジングルの名前 */
export function kjJingleFor(outcome) {
  return outcome === 'win' ? 'kjWin' : 'kjLose';
}

/**
 * 効果音の計画。baseGain は効果音の音量（消音・未解除なら 0）。
 * lastPlayed（Map）を渡すと minInterval 以内の連打は鳴らさない。鳴らさないなら null
 */
export function planKjSfx(name, baseGain, now, lastPlayed) {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(KJ_SFX_TABLE, name)) return null;
  const g = Number(baseGain);
  if (!(g > 0)) return null;
  const entry = KJ_SFX_TABLE[name];
  const timed = typeof now === 'number' && Number.isFinite(now) && lastPlayed instanceof Map;
  if (timed && entry.minInterval > 0 && lastPlayed.has(name)) {
    if (now - lastPlayed.get(name) < entry.minInterval - 1e-9) return null;
  }
  if (timed) lastPlayed.set(name, now);
  return { sound: name, gain: entry.gain * g };
}
