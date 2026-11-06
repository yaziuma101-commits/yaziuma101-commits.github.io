// 5曲の楽譜データ（純データ。three.js・Web Audio・DOM に依存しない）。
// 楽譜は 8 分音符 1 つを 1 文字とする文字列: 音名（C4, F#5, Bb2）/ '-' 前の音を伸ばす / '.' 休符
import {
  KJ_MUSIC, KJ_FANFARE, KJ_MARCH_SCORE, KJ_FANFARE_SCORE,
} from './kj-music.js';

export const STEPS_PER_BEAT = 2;
export const STEPS_PER_BAR = 8;

const BASE = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });

/** 'A4' → 69。読めなければ例外 */
export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(String(name));
  if (!m) throw new Error(`読めない音名: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + BASE[m[1]] + acc;
}

/** 楽譜の文字列 → { length, events: [{step, midi, len}] } */
export function parseVoice(str) {
  const tokens = String(str).trim().split(/\s+/).filter(Boolean);
  const events = [];
  let last = null;
  tokens.forEach((tk, step) => {
    if (tk === '-') {
      if (last) last.len += 1;
      return;
    }
    if (tk === '.') {
      last = null;
      return;
    }
    last = { step, midi: noteToMidi(tk), len: 1 };
    events.push(last);
  });
  return { length: tokens.length, events };
}

const bars = (...list) => list.join(' ');

function track({ bpm, voices }) {
  const parsed = voices.map((v) => {
    const p = parseVoice(v.notes);
    const byStep = Array.from({ length: p.length }, () => null);
    for (const e of p.events) (byStep[e.step] ||= []).push(Object.freeze(e));
    return Object.freeze({
      type: v.type,
      inst: typeof v.inst === 'string' ? v.inst : null,
      vol: v.vol,
      lp: v.lp || 0,
      vib: v.vib || 0,
      gate: v.gate ?? 0.85,
      length: p.length,
      events: Object.freeze(p.events),
      byStep: Object.freeze(byStep),
    });
  });
  const length = Math.max(...parsed.map((v) => v.length));
  return Object.freeze({
    bpm, stepsPerBeat: STEPS_PER_BEAT, length, bars: length / STEPS_PER_BAR, voices: Object.freeze(parsed),
  });
}

/** 1 ステップ（8 分音符）の秒数 */
export function stepSeconds(t) {
  return 60 / t.bpm / (t.stepsPerBeat || STEPS_PER_BEAT);
}

const HAT_OFF = '. C8 . C8 . C8 . C8';

export const TRACKS = Object.freeze({
  // ハブ: C Am F G ×2 ののんびり明るい曲
  hub: track({
    bpm: 120,
    voices: [
      {
        type: 'square', vol: 0.2, lp: 2000,
        notes: bars(
          'E5 . G5 . C6 - G5 .', 'A5 - E5 . C5 . E5 .', 'F5 . A5 . C6 - A5 .', 'G5 - D5 . B4 . G4 .',
          'E5 . G5 . C6 - D6 .', 'E6 - D6 . C6 . A5 .', 'F5 . A5 . G5 - E5 .', 'D5 - G4 - B4 - D5 .',
        ),
      },
      {
        type: 'triangle', vol: 0.45,
        notes: bars(
          'C3 - . C3 G2 - . .', 'A2 - . A2 E2 - . .', 'F2 - . F2 C3 - . .', 'G2 - . G2 D3 - . .',
          'C3 - . C3 G2 - . .', 'A2 - . A2 E2 - . .', 'F2 - . F2 C3 - . .', 'G2 - . G2 D3 - . .',
        ),
      },
      {
        type: 'sine', vol: 0.12, gate: 0.6,
        notes: bars(
          '. E4 . G4 . E4 . G4', '. E4 . A4 . E4 . A4', '. F4 . A4 . F4 . A4', '. D4 . G4 . B4 . G4',
          '. E4 . G4 . E4 . G4', '. E4 . A4 . E4 . A4', '. F4 . A4 . F4 . A4', '. D4 . G4 . B4 . G4',
        ),
      },
    ],
  }),
  // パズル: F Dm Bb C の考えごとの曲
  puzzle: track({
    bpm: 104,
    voices: [
      {
        type: 'triangle', vol: 0.38,
        notes: bars('A4 . C5 . F5 . E5 .', 'D5 - F5 . A5 . F5 .', 'D5 . Bb4 . D5 . F5 .', 'E5 - G5 - C5 - . .'),
      },
      {
        type: 'triangle', vol: 0.4,
        notes: bars('F2 . C3 . F2 . C3 .', 'D2 . A2 . D2 . A2 .', 'Bb1 . F2 . Bb1 . F2 .', 'C2 . G2 . C2 . G2 .'),
      },
      {
        type: 'sine', vol: 0.14, gate: 0.5,
        notes: bars('C6 . . . A5 . . .', 'F5 . . . D5 . . .', 'F5 . . . D5 . . .', 'G5 . . . E5 . . .'),
      },
    ],
  }),
  // レース: G Em C D の速い曲
  race: track({
    bpm: 150,
    voices: [
      {
        type: 'square', vol: 0.2, lp: 2400,
        notes: bars('G5 . G5 B5 D6 . B5 .', 'E5 . G5 B5 E6 - . .', 'C6 . B5 A5 G5 . E5 .', 'D5 - F#5 - A5 - D6 .'),
      },
      {
        type: 'triangle', vol: 0.42, gate: 0.7,
        notes: bars(
          'G2 G3 G2 G3 G2 G3 G2 G3', 'E2 E3 E2 E3 E2 E3 E2 E3',
          'C2 C3 C2 C3 C2 C3 C2 C3', 'D2 D3 D2 D3 D2 D3 D2 D3',
        ),
      },
      { type: 'noise', vol: 0.08, notes: bars(HAT_OFF, HAT_OFF, HAT_OFF, HAT_OFF) },
    ],
  }),
  // FPS: Am F C G の元気な曲
  fps: track({
    bpm: 132,
    voices: [
      {
        type: 'square', vol: 0.18, lp: 1800,
        notes: bars('A4 . C5 E5 A5 . G5 E5', 'F5 . A5 . C6 . A5 F5', 'E5 . G5 . C6 - B5 A5', 'G5 - D5 - B4 - . .'),
      },
      {
        type: 'triangle', vol: 0.42, gate: 0.7,
        notes: bars('A2 . A2 E3 A2 . A2 E3', 'F2 . F2 C3 F2 . F2 C3', 'C3 . C3 G2 C3 . C3 G2', 'G2 . G2 D3 G2 . B2 D3'),
      },
      {
        type: 'noise', vol: 0.07,
        notes: bars('C8 . C8 C8 C8 . C8 .', 'C8 . C8 C8 C8 . C8 .', 'C8 . C8 C8 C8 . C8 .', 'C8 . C8 C8 C8 . C8 .'),
      },
    ],
  }),
  // エンディング: 8 小節のあたたかい曲
  ending: track({
    bpm: 96,
    voices: [
      {
        type: 'triangle', vol: 0.4, gate: 0.92,
        notes: bars(
          'E5 - - - G5 - C6 -', 'B5 - - - G5 - D5 -', 'C6 - - - A5 - E5 -', 'G5 - - - E5 - B4 -',
          'A5 - - - F5 - C6 -', 'G5 - - - E5 - C5 -', 'D5 - F5 - A5 - C6 -', 'B5 - - - D6 - - -',
        ),
      },
      {
        type: 'triangle', vol: 0.4, gate: 0.92,
        notes: bars(
          'C3 - - - G2 - - -', 'G2 - - - D3 - - -', 'A2 - - - E3 - - -', 'E2 - - - B2 - - -',
          'F2 - - - C3 - - -', 'C3 - - - G2 - - -', 'D3 - - - A2 - - -', 'G2 - - - - - - -',
        ),
      },
      {
        type: 'sine', vol: 0.11, gate: 0.7,
        notes: bars(
          'C4 E4 G4 E4 C4 E4 G4 E4', 'B3 D4 G4 D4 B3 D4 G4 D4', 'A3 C4 E4 C4 A3 C4 E4 C4', 'G3 B3 E4 B3 G3 B3 E4 B3',
          'F3 A3 C4 A3 F3 A3 C4 A3', 'E3 G3 C4 G3 E3 G3 C4 G3', 'D3 F3 A3 F3 D3 F3 A3 F3', 'D3 G3 B3 G3 D3 G3 B3 D4',
        ),
      },
    ],
  }),

});

/** 物語の場面の曲（オープニングなど）。既存の TRACKS には混ぜない */
export const STORY_TRACKS = Object.freeze({
  // オープニング: Dm–B♭–Gm–A の重々しい曲。後半で明るく持ち上げて「冒険のはじまり」
  opening: track({
    bpm: 76,
    voices: [
      {
        type: 'sawtooth', vol: 0.18, gate: 0.95, lp: 1600, vib: 4,
        notes: bars(
          'D5 - - - A4 - - -', 'Bb4 - - - F5 - E5 -', 'D5 - - - G4 - Bb4 -', 'A4 - - - - - - -',
          'D5 - - - F5 - A5 -', 'Bb5 - - - A5 - G5 -', 'F5 - E5 - D5 - E5 -', 'A5 - - - - - - -',
        ),
      },
      {
        type: 'triangle', vol: 0.45, gate: 0.9,
        notes: bars(
          'D2 - - - D2 - - -', 'Bb1 - - - Bb1 - - -', 'G1 - - - G1 - - -', 'A1 - - - A1 - A2 -',
          'D2 - - - D2 - - -', 'Bb1 - - - Bb1 - - -', 'G1 - - - C2 - - -', 'A1 - A1 - A1 - A2 -',
        ),
      },
      {
        type: 'square', vol: 0.06, gate: 0.6, lp: 1200,
        notes: bars(
          'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 Bb4 F4 D4 F4 Bb4 F4', 'D4 G4 Bb4 G4 D4 G4 Bb4 G4', 'C#4 E4 A4 E4 C#4 E4 A4 E4',
          'D4 F4 A4 F4 D4 F4 A4 F4', 'D4 F4 Bb4 F4 D4 F4 Bb4 F4', 'C4 E4 G4 E4 C4 E4 G4 E4', 'C#4 E4 A4 C#5 E5 A4 E4 C#4',
        ),
      },
    ],
  }),
  // タイトル: C–Em–F–G のにぎやかなファンファーレ（依頼者の指摘 2026-11-04: 起動時は演出と BGM をたっぷり）
  title: track({
    bpm: 140,
    voices: [
      {
        type: 'square', vol: 0.16, lp: 2600, gate: 0.8,
        notes: bars(
          'C5 . E5 . G5 - C6 .', 'B5 . G5 . E5 - G5 .', 'A5 . F5 . C6 - A5 .', 'G5 - - . E5 . G5 .',
          'C6 . B5 . A5 . G5 .', 'F5 . A5 . C6 - D6 .', 'E6 - D6 . C6 . B5 .', 'C6 - - - G5 - C6 -',
        ),
      },
      {
        type: 'triangle', vol: 0.45,
        notes: bars(
          'C3 . G2 . C3 . G2 .', 'E2 . B2 . E2 . G2 .', 'F2 . C3 . F2 . A2 .', 'G2 . D3 . G2 . B2 .',
          'A2 . E3 . A2 . E3 .', 'F2 . C3 . F2 . C3 .', 'G2 . D3 . G2 . D3 .', 'C3 . G2 . C3 - - .',
        ),
      },
      {
        type: 'sine', vol: 0.1, gate: 0.6,
        notes: bars(
          'E4 G4 C5 G4 E4 G4 C5 G4', 'E4 G4 B4 G4 E4 G4 B4 G4', 'F4 A4 C5 A4 F4 A4 C5 A4', 'D4 G4 B4 G4 D4 G4 B4 G4',
          'E4 A4 C5 A4 E4 A4 C5 A4', 'F4 A4 C5 A4 F4 A4 C5 A4', 'D4 G4 B4 G4 D4 G4 B4 G4', 'E4 G4 C5 G4 E4 G4 C5 G4',
        ),
      },
      { type: 'kick', vol: 0.55, notes: Array(8).fill('C2 . . . C2 . . .').join(' ') },
      { type: 'snare', vol: 0.3, notes: Array(8).fill('. . C4 . . . C4 .').join(' ') },
      { type: 'noise', vol: 0.06, notes: Array(8).fill('. C8 . C8 . C8 . C8').join(' ') },
    ],
  }),
});

/** 楽譜の音名をオクターブずらす（'.' と '-' はそのまま） */
export function shiftOctave(str, k = 1) {
  return String(str).trim().split(/\s+/).map((tk) => {
    const m = /^([A-G][#b]?)(\d)$/.exec(tk);
    return m ? `${m[1]}${Number(m[2]) + k}` : tk;
  }).join(' ');
}

const rep = (bar, n) => Array.from({ length: n }, () => bar).join(' ');

// タッチタッチ（相撲風）：D–E♭–G–A–B♭。度数 [0,0,3,2,0,3,4,3,2,0,2,3,4,3,2,0] を基調に、後半は1オクターブ上
const SUMO_A = bars(
  'D5 D5 A5 G5 D5 A5 Bb5 A5', 'G5 D5 G5 A5 Bb5 A5 G5 D5',
  'A5 A5 Bb5 A5 G5 - Eb5 D5', 'G5 A5 Bb5 - A5 G5 D5 -',
);
const SUMO_BASS_A = bars('D2 . D3 . A2 . D3 .', 'D2 . D3 . A2 . D3 .', 'D2 . D3 . A2 . D3 .', 'G2 . G3 . A2 . A3 .');

/** 新しいゲームの曲（タッチタッチ・吹っ飛ばし）。taiko / clack / cowbell は打楽器の声 */
export const GAME_TRACKS = Object.freeze({
  touch: track({
    bpm: 176,
    voices: [
      { type: 'triangle', vol: 0.34, vib: 0.012, gate: 0.8, notes: bars(SUMO_A, shiftOctave(SUMO_A, 1)) },
      { type: 'square', vol: 0.09, lp: 1500, gate: 0.7, notes: bars(shiftOctave(SUMO_A, -1), SUMO_A) },
      { type: 'triangle', vol: 0.36, gate: 0.6, notes: bars(SUMO_BASS_A, SUMO_BASS_A) },
      { type: 'taiko', vol: 0.55, notes: bars(rep('D2 . . . D2 . A2 A2', 7), 'D2 . D2 . D2 D2 A2 A2') },
      { type: 'clack', vol: 0.28, notes: bars(rep('. . C7 . . . C7 .', 7), '. . C7 . . C7 C7 C7') },
    ],
  }),
  stack: track({
    bpm: 132,
    voices: [
      {
        type: 'triangle', vol: 0.36, vib: 0.014, gate: 0.85,
        notes: bars(
          'C5 - E5 - G5 - E5 -', 'D5 - F5 - A5 - F5 -', 'E5 - G5 - C6 - G5 -', 'D5 - G5 - B5 - G5 -',
          'C6 - B5 A5 G5 - E5 -', 'A5 - G5 F5 E5 - D5 -', 'G5 - F5 E5 D5 - C5 -', 'D5 E5 D5 B4 C5 - - -',
        ),
      },
      {
        type: 'triangle', vol: 0.4, gate: 0.55,
        notes: bars(
          'C3 . G2 . C3 . G2 .', 'D3 . A2 . D3 . A2 .', 'C3 . G2 . C3 . G2 .', 'G2 . D3 . G2 . B2 .',
          'A2 . E3 . A2 . E3 .', 'F2 . C3 . F2 . C3 .', 'C3 . G2 . G2 . B2 .', 'G2 . D3 . C3 . G2 .',
        ),
      },
      { type: 'cowbell', vol: 0.14, notes: rep('. C5 . C5 . C5 . C5', 8) },
      { type: 'taiko', vol: 0.3, notes: rep('C2 . . . C2 . . C2', 8) },
    ],
  }),
});

// ---- スーパー将棋：E のニロ抜き長音階（E G# A B D#）、84 BPM の落ち着いた和風の曲 ----
// koto: 撥弦（三角波＋短い減衰） / shakuhachi: サイン波＋息のノイズ / goof: 間の抜けた音
// （goof は 60 以上の音名なら下がるグリッサンド、60 未満なら「ぷっ」）
const KOTO_A = bars(
  'E5 . B4 . A4 . G#4 -', 'A4 . B4 . E5 - - .', 'G#5 . E5 . D#5 . B4 .', 'A4 - G#4 . E4 - - .',
  'B4 . D#5 . E5 . G#5 .', 'A5 - G#5 . E5 . D#5 .', 'E5 . B4 . A4 . B4 .', 'E5 - - - . . . .',
);
const KOTO_B = bars(
  'A4 . A4 B4 E5 . . .', 'D#5 . E5 . B4 - - .', 'G#4 . A4 . B4 . D#5 .', 'E5 - B4 . A4 - - .',
  'E5 . G#5 . A5 . B5 .', 'A5 . G#5 . E5 - - .', 'D#5 . B4 . A4 . G#4 .', 'E4 - - - . . . .',
);
const KOTO_LOW = bars(
  'E3 . B3 . E4 . B3 .', 'E3 . B3 . E4 . B3 .', 'A2 . E3 . A3 . E3 .', 'E3 . B3 . G#3 . . .',
  'G#2 . D#3 . G#3 . D#3 .', 'A2 . E3 . A3 . E3 .', 'B2 . E3 . A3 . . .', 'E3 . B3 . E4 - - .',
);
const SHAKU_A = bars(
  'B4 - - - - - . .', '. . . . . . . .', 'G#4 - - - A4 - - .', '. . . . . . . .',
  'D#5 - - - - - E5 -', '- - - . . . . .', 'B4 - - - A4 - - -', 'G#4 - - - . . . .',
);
const SHAKU_B = bars(
  '. . . . E5 - - -', 'D#5 - - - B4 - . .', '. . . . . . . .', 'A4 - - - G#4 - - .',
  '. . . . . . . .', 'E5 - - - - - . .', 'D#5 - - - B4 - - -', 'E4 - - - - - . .',
);
const REST_BAR = '. . . . . . . .';
const GOOF = bars(rep(REST_BAR, 7), '. . . . . . B5 .', rep(REST_BAR, 7), '. . . . . E3 . .');

/** スーパー将棋の曲（既存の曲表とは別の表） */
export const SHOGI_TRACKS = Object.freeze({
  shogi: track({
    bpm: 84,
    voices: [
      { type: 'koto', vol: 0.2, notes: bars(KOTO_A, KOTO_B) },
      { type: 'koto', vol: 0.13, notes: bars(KOTO_LOW, KOTO_LOW) },
      { type: 'shakuhachi', vol: 0.09, vib: 0.012, gate: 0.95, notes: bars(SHAKU_A, SHAKU_B) },
      { type: 'goof', vol: 0.16, notes: GOOF },
    ],
  }),
});

// ---- 第4弾：けん玉（お囃子風・D のヨナ抜き）と小説（深夜のローファイ） ----
/** 小説の曲の秒針の間隔（秒）。1拍ごとではなく1秒ごと */
export const CLOCK_TICK_SEC = 1;

const FUE = bars(
  'D5 E5 F#5 A5 B5 - A5 F#5', 'E5 - D5 E5 F#5 - . .',
  'A5 B5 D6 - B5 A5 F#5 E5', 'D5 - E5 F#5 A5 - - .',
  'B5 A5 F#5 A5 B5 D6 B5 A5', 'F#5 - E5 D5 E5 F#5 A5 .',
  'B4 D5 E5 F#5 E5 D5 B4 A4', 'D5 - - - . . . .',
);
const HOLD = (n) => `${n} - - - - - - -`;
const chordVoice = (a, b, c, d) => bars(HOLD(a), HOLD(b), HOLD(c), HOLD(d));

export const PHASE4_TRACKS = Object.freeze({
  kendama: track({
    bpm: 152,
    voices: [
      { type: 'triangle', vol: 0.34, vib: 0.012, gate: 0.85, notes: FUE },
      { type: 'triangle', vol: 0.36, gate: 0.6, notes: bars(rep('D3 . A2 . D3 . A2 .', 4), rep('B2 . F#2 . A2 . E3 .', 4)) },
      { type: 'taiko', vol: 0.5, notes: bars(rep('D2 . . D2 D2 . . .', 7), 'D2 . D2 D2 D2 . D2 .') },
      { type: 'kane', vol: 0.12, notes: rep('. . C7 C7 . C7 . .', 8) },
    ],
  }),
  novel: Object.freeze({
    ...track({
      bpm: 72,
      voices: [
        {
          type: 'epiano', vol: 0.16, gate: 0.9,
          notes: bars('. . A5 - G5 . F5 E5', 'D5 - . B4 . D5 E5 .', 'G5 - E5 . D5 - B4 .', 'C#5 - . E5 . G5 F5 -'),
        },
        { type: 'epiano', vol: 0.14, gate: 0.95, notes: chordVoice('D3', 'G2', 'C3', 'A2') },
        { type: 'epiano', vol: 0.09, gate: 0.95, notes: chordVoice('F4', 'B3', 'E4', 'C#4') },
        { type: 'epiano', vol: 0.09, gate: 0.95, notes: chordVoice('A4', 'F4', 'B4', 'G4') },
        { type: 'epiano', vol: 0.08, gate: 0.95, notes: chordVoice('C5', 'A4', 'D5', 'F5') },
        { type: 'epiano', vol: 0.07, gate: 0.95, notes: chordVoice('E5', 'E5', 'G5', 'E5') },
      ],
    }),
    tickSec: CLOCK_TICK_SEC,
    delay: 0.3,
  }),
});

// ---- 第5弾：ファイルを見つけろ（90年代のパソコンらしい軽いシンセ。C 長調・100 BPM のオリジナル曲） ----
// pulse はデューティ比 25% のパルス波（audio.js が PeriodicWave で鳴らす。使えなければ矩形波）
export const FF_TRACKS = Object.freeze({
  findfile: track({
    bpm: 100,
    voices: [
      {
        type: 'square', vol: 0.15, lp: 2600, gate: 0.8,
        notes: bars(
          'E5 . G5 C6 . G5 E5 .', 'F5 . A5 C6 - A5 F5 .', 'G5 . B5 D6 . B5 G5 .', 'E5 - C5 - . . . .',
          'A5 . C6 E6 . C6 A5 .', 'F5 . A5 C6 . D6 C6 A5', 'G5 - F5 E5 D5 - B4 .', 'C5 - - - . . G4 .',
        ),
      },
      {
        type: 'pulse', vol: 0.07, lp: 3000, gate: 0.5,
        notes: bars(
          'C5 E5 G5 E5 C5 E5 G5 E5', 'C5 F5 A5 F5 C5 F5 A5 F5', 'D5 G5 B5 G5 D5 G5 B5 G5', 'C5 E5 G5 E5 C5 E5 G5 E5',
          'C5 E5 A5 E5 C5 E5 A5 E5', 'C5 F5 A5 F5 C5 F5 A5 F5', 'B4 D5 G5 D5 B4 D5 G5 D5', 'C5 E5 G5 C6 G5 E5 C5 .',
        ),
      },
      {
        type: 'triangle', vol: 0.4, gate: 0.6,
        notes: bars(
          'C3 . C3 G2 C3 . G2 .', 'F2 . F2 C3 F2 . C3 .', 'G2 . G2 D3 G2 . D3 .', 'C3 . C3 G2 C3 . E3 .',
          'A2 . A2 E3 A2 . E3 .', 'F2 . F2 C3 F2 . A2 .', 'G2 . G2 D3 G2 . B2 .', 'C3 . G2 . C3 . . .',
        ),
      },
      { type: 'noise', vol: 0.05, notes: rep(HAT_OFF, 8) },
    ],
  }),
});

// ---- 第6弾：レバガチャファイターヌス（本格的な格闘ゲーム風。168 BPM・E マイナーのオリジナル曲） ----
// kick / snare は audio.js の打楽器の声（キックは 1・3拍と裏拍、スネアは 2・4拍）
/** リードのモチーフ（E からの半音）。2小節で1周 */
export const LF_MOTIF = Object.freeze([0, 3, 7, 10, 12, 10, 7, 3, 0, 0, 5, 7, 8, 7, 5, 3]);
const LF_LEAD = bars('E5 G5 B5 D6 E6 D6 B5 G5', 'E5 E5 A5 B5 C6 B5 A5 G5');
const LF_BASS = bars(
  'E2 E2 G2 E2 A2 E2 Bb2 A2', 'E2 E2 G2 E2 A2 E2 B2 D3',
  'E2 E2 G2 E2 A2 E2 Bb2 A2', 'C3 C3 B2 B2 A2 A2 B2 B2',
);
const LF_KICK = 'E2 . . E2 E2 . . E2';
const LF_SNARE = '. . C4 . . . C4 .';

export const LF_TRACKS = Object.freeze({
  'lever-fighter': track({
    bpm: 168,
    voices: [
      { type: 'square', vol: 0.15, lp: 2600, gate: 0.75, notes: rep(LF_LEAD, 2) },
      { type: 'sawtooth', vol: 0.3, lp: 950, gate: 0.7, notes: LF_BASS },
      { type: 'kick', vol: 0.7, notes: rep(LF_KICK, 4) },
      { type: 'snare', vol: 0.4, notes: rep(LF_SNARE, 4) },
      { type: 'noise', vol: 0.05, notes: rep(HAT_OFF, 4) },
    ],
  }),
});

// ---- 第6弾の追加：試合が終わったあとの曲（勝ち：夕日に合う静かで誇り高い曲／負け：重く悔しさの残る短調の曲） ----
export const LF_BATTLE_TRACK = 'lever-fighter';
export const LF_WIN_TRACK = 'lever-fighter-win';
export const LF_LOSE_TRACK = 'lever-fighter-lose';

// 勝ち：E 長調・72 BPM。弦（鋸歯波を柔らかく）が旋律、ピアノ風が分散和音
const LF_WIN_LEAD = bars(
  'B4 - - - E5 - G#5 -', 'G#5 - - - F#5 - E5 -', 'C#5 - - - E5 - A5 -', 'B5 - - - - - A5 G#5',
  'G#5 - - - B5 - E6 -', 'D#6 - - - B5 - G#5 -', 'A5 - C#6 - B5 - F#5 -', 'E5 - - - - - - .',
);
const LF_WIN_ARP_E = 'E4 G#4 B4 E5 B4 G#4 E4 G#4';
const LF_WIN_PIANO = bars(
  LF_WIN_ARP_E, 'C#4 E4 G#4 C#5 G#4 E4 C#4 E4', 'A3 C#4 E4 A4 E4 C#4 A3 C#4', 'B3 D#4 F#4 B4 F#4 D#4 B3 D#4',
  LF_WIN_ARP_E, 'G#3 B3 D#4 G#4 D#4 B3 G#3 B3', 'A3 C#4 E4 A4 B3 D#4 F#4 B4', 'E4 G#4 B4 E5 - - - .',
);
const LF_WIN_BASS = bars(
  'E2 - - - - - - -', 'C#2 - - - - - - -', 'A1 - - - - - - -', 'B1 - - - - - - -',
  'E2 - - - - - - -', 'G#1 - - - - - - -', 'A1 - - - B1 - - -', 'E2 - - - - - - .',
);

// 負け：C 短調・66 BPM。低い弦の旋律、まばらなピアノ、重い太鼓。最後は解決せずに終わる
const LF_LOSE_LEAD = bars(
  'G4 - - - Ab4 - G4 -', 'Eb5 - - - D5 - C5 -', 'Ab4 - - - G4 - F4 -', 'G4 - - - - - B3 -',
  'C5 - - - Eb5 - D5 -', 'C5 - - - Bb4 - Ab4 -', 'F4 - Ab4 - G4 - F4 -', 'Eb4 - - - D4 - - .',
);
const LF_LOSE_PIANO = bars(
  '. C4 . Eb4 . G4 . Eb4', '. Ab3 . C4 . Eb4 . C4', '. F3 . Ab3 . C4 . Ab3', '. G3 . B3 . D4 . B3',
  '. C4 . Eb4 . G4 . Eb4', '. Ab3 . C4 . Eb4 . C4', '. F3 . Ab3 . C4 . Ab3', '. G3 . B3 . D4 - .',
);
const LF_LOSE_BASS = rep(bars('C2 - - - - - - -', 'Ab1 - - - - - - -', 'F1 - - - - - - -', 'G1 - - - - - - -'), 2);
const LF_LOSE_DRUM = rep('C2 . . . . . . .', 8);

/** 試合の終わりの曲（既存の曲表とは別の表） */
export const LF_RESULT_TRACKS = Object.freeze({
  [LF_WIN_TRACK]: track({
    bpm: 72,
    voices: [
      { type: 'sawtooth', vol: 0.1, lp: 1500, vib: 0.01, gate: 0.98, notes: LF_WIN_LEAD },
      { type: 'epiano', vol: 0.11, gate: 0.9, notes: LF_WIN_PIANO },
      { type: 'triangle', vol: 0.3, gate: 0.97, notes: LF_WIN_BASS },
    ],
  }),
  [LF_LOSE_TRACK]: track({
    bpm: 66,
    voices: [
      { type: 'sawtooth', vol: 0.1, lp: 1100, vib: 0.014, gate: 0.97, notes: LF_LOSE_LEAD },
      { type: 'epiano', vol: 0.09, gate: 0.85, notes: LF_LOSE_PIANO },
      { type: 'triangle', vol: 0.36, gate: 0.97, notes: LF_LOSE_BASS },
      { type: 'taiko', vol: 0.3, notes: LF_LOSE_DRUM },
    ],
  }),
});

// ---- 第8弾：怪獣大決戦（勇ましい行進曲とタイトルのファンファーレ。楽譜は kj-music.js） ----
export const KJ_TRACKS = Object.freeze({
  [KJ_MUSIC]: track(KJ_MARCH_SCORE),
  [KJ_FANFARE]: track(KJ_FANFARE_SCORE),
});

const LF_MODE_TRACK = Object.freeze({ battle: LF_BATTLE_TRACK, win: LF_WIN_TRACK, lose: LF_LOSE_TRACK });
// いまの試合の曲の種類（'battle' | 'win' | 'lose'）。'lever-fighter' の中身がこれで決まる
let lfMode = 'battle';

/** 曲の種類を決める（未知は 'battle'）。決まった種類を返す */
export function setLfMusicMode(mode) {
  lfMode = Object.prototype.hasOwnProperty.call(LF_MODE_TRACK, mode) ? mode : 'battle';
  return lfMode;
}

export function lfMusicMode() {
  return lfMode;
}

/** 曲の種類 → 曲の名前 */
export function lfTrackNameForMode(mode) {
  return Object.prototype.hasOwnProperty.call(LF_MODE_TRACK, mode) ? LF_MODE_TRACK[mode] : LF_BATTLE_TRACK;
}

/** 曲の名前 → 楽譜（既存の曲と新しいゲームの曲）。無ければ null */
export function trackByName(name) {
  if (typeof name !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(TRACKS, name)) return TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(GAME_TRACKS, name)) return GAME_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(STORY_TRACKS, name)) return STORY_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(SHOGI_TRACKS, name)) return SHOGI_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(PHASE4_TRACKS, name)) return PHASE4_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(FF_TRACKS, name)) return FF_TRACKS[name];
  if (name === LF_BATTLE_TRACK && lfMode !== 'battle') return LF_RESULT_TRACKS[lfTrackNameForMode(lfMode)];
  if (Object.prototype.hasOwnProperty.call(LF_TRACKS, name)) return LF_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(LF_RESULT_TRACKS, name)) return LF_RESULT_TRACKS[name];
  if (Object.prototype.hasOwnProperty.call(KJ_TRACKS, name)) return KJ_TRACKS[name];
  return null;
}

/** 音の規則（MUSIC_TABLE）に載っていない、新しいゲームの曲か */
export function isGameTrackName(name) {
  return typeof name === 'string' && (Object.prototype.hasOwnProperty.call(GAME_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(STORY_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(SHOGI_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(PHASE4_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(FF_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(LF_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(LF_RESULT_TRACKS, name)
    || Object.prototype.hasOwnProperty.call(KJ_TRACKS, name));
}

const SCENE_TO_MUSIC = Object.freeze({
  title: 'title', hub: 'hub', room: 'hub', reward: 'hub', ending: 'ending', opening: 'opening', gallerymode: 'ending', touch: 'touch', stack: 'stack', shogi: 'shogi',
  kendama: 'kendama', novel: 'novel', findfile: 'findfile', leverfighter: 'lever-fighter', kaijuBattle: 'kaiju',
});
const BOSS_MUSIC = Object.freeze(['puzzle', 'race', 'fps']);

/** main.js の場面名（とボス id）→ 音楽の場面名。曲が無ければ null（タイトルなど） */
export function musicSceneFor(name, params = {}) {
  if (name === 'minigame') {
    const id = params && params.bossId;
    return BOSS_MUSIC.includes(id) ? id : 'hub';
  }
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(SCENE_TO_MUSIC, name)
    ? SCENE_TO_MUSIC[name]
    : null;
}
