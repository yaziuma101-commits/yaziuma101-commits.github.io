// 効果音の合成（Web Audio）。鳴らすかどうか・音量は audio-rules.js の計画に従うだけ。
// モジュールの読み込み時には何もしない（AudioContext は最初に鳴らすときに作る）。
import { stepSeconds, trackByName, isGameTrackName } from './audio-music.js';
import { planShogiSfx, planFfSfx, planLfSfx } from './audio-rules.js';
import {
  planKjSfx, kjRecipe, KJ_SFX_NAMES, kjInstrument,
} from './kj-music.js';
import { decideSfx, normalizeSillyLevel, SILLY_SFX } from './silly-rules.js';
import { createRng, timeSeed } from './seeded-rng.js';

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
/** 最後に作った音の仕組み（場面から gameSfx などで鳴らすため） */
let current = null;

function defaultContext() {
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  return C ? new C() : null;
}

function defaultNow() {
  const p = globalThis.performance;
  return (p && typeof p.now === 'function' ? p.now() : Date.now()) / 1000;
}

/**
 * rules: createAudioRules の返り値
 * env: テスト用の差し替え { createContext, now }
 */
export function createAudio(rules, env = {}) {
  const makeCtx = typeof env.createContext === 'function' ? env.createContext : defaultContext;
  const clock = typeof env.now === 'function' ? env.now : defaultNow;
  let ac = null;
  let bus = null;
  let noiseBuf = null;
  let failed = false;
  let sillyLevel = 0; // main.js が setSillyLevel で入れる。0 なら差し替えなし
  const sillyRng = typeof env.rng === 'function' ? env.rng : createRng(timeSeed());

  function ensure() {
    if (ac || failed) return ac;
    try {
      ac = makeCtx();
    } catch {
      ac = null;
    }
    if (!ac) {
      failed = true;
      return null;
    }
    try {
      bus = ac.createGain();
      bus.gain.value = 1;
      bus.connect(ac.destination);
    } catch {
      ac = null;
      failed = true;
    }
    return ac;
  }

  function noise() {
    if (!noiseBuf) {
      const n = Math.max(1, Math.floor(ac.sampleRate * 0.5));
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // パルス波（デューティ比 25%）。使えなければ矩形波
  let pulseWave = null;
  function pulse() {
    if (pulseWave !== null) return pulseWave;
    pulseWave = false;
    try {
      if (typeof ac.createPeriodicWave === 'function') {
        const N = 32;
        const re = new Float32Array(N);
        const im = new Float32Array(N);
        for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
        pulseWave = ac.createPeriodicWave(re, im) || false;
      }
    } catch {
      pulseWave = false;
    }
    return pulseWave;
  }
  function setWave(osc, type) {
    if (type === 'pulse') {
      const w = pulse();
      if (w && typeof osc.setPeriodicWave === 'function') {
        osc.setPeriodicWave(w);
        return;
      }
      osc.type = 'square';
      return;
    }
    osc.type = type;
  }

  /** 短い ADSR（立ち上がり→指数で減衰） */
  function envelope(t, dur, vol) {
    const g = ac.createGain();
    const a = Math.min(0.01, dur * 0.2);
    const v = Math.max(0.0002, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    return g;
  }

  function tone({
    type = 'triangle', f0, f1 = f0, at = 0, dur = 0.1, vol = 0.3, lp = 0,
  }) {
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = envelope(t, dur, vol);
    if (lp > 0) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(lp, t);
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function burst({
    filter = 'lowpass', freq = 1000, at = 0, dur = 0.1, vol = 0.3,
  }) {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noise();
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    const g = envelope(t, dur, vol);
    src.connect(f);
    f.connect(g);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function seq(notes, { type = 'triangle', step = 0.1, dur = 0.12, vol = 0.3, lp = 0, last = 0 } = {}) {
    notes.forEach((n, i) => {
      const isLast = i === notes.length - 1;
      tone({
        type, f0: NOTE(n), at: i * step, dur: isLast && last > 0 ? last : dur, vol, lp,
      });
    });
  }

  // 柔らかい音色（triangle / sine / lowpass をかけた square）
  const SOUNDS = {
    jump: (v) => tone({ type: 'square', f0: 330, f1: 780, dur: 0.16, vol: 0.4 * v, lp: 2200 }),
    land: (v) => {
      tone({ type: 'sine', f0: 180, f1: 60, dur: 0.12, vol: 0.8 * v });
      burst({ freq: 400, dur: 0.06, vol: 0.3 * v });
    },
    dash: (v) => {
      tone({ type: 'triangle', f0: 220, f1: 660, dur: 0.14, vol: 0.5 * v });
      burst({ filter: 'bandpass', freq: 1500, dur: 0.12, vol: 0.2 * v });
    },
    talk: (v) => {
      tone({ type: 'square', f0: 740, dur: 0.05, vol: 0.25 * v, lp: 1800 });
      tone({ type: 'square', f0: 990, at: 0.05, dur: 0.05, vol: 0.2 * v, lp: 1800 });
    },
    confirm: (v) => {
      tone({ type: 'triangle', f0: 660, dur: 0.08, vol: 0.5 * v });
      tone({ type: 'triangle', f0: 990, at: 0.07, dur: 0.14, vol: 0.5 * v });
    },
    push: (v) => {
      burst({ freq: 300, dur: 0.14, vol: 0.6 * v });
      tone({ type: 'sine', f0: 110, f1: 80, dur: 0.12, vol: 0.5 * v });
    },
    clear: (v) => seq([72, 76, 79, 84], {
      step: 0.09, dur: 0.12, vol: 0.45 * v, last: 0.35,
    }),
    boost: (v) => {
      tone({ type: 'square', f0: 200, f1: 1400, dur: 0.4, vol: 0.3 * v, lp: 2500 });
      tone({ type: 'triangle', f0: 400, f1: 1600, dur: 0.35, vol: 0.25 * v });
    },
    drift: (v) => burst({ filter: 'bandpass', freq: 2600, dur: 0.12, vol: 0.35 * v }),
    punch: (v) => {
      burst({ freq: 900, dur: 0.1, vol: 0.7 * v });
      tone({ type: 'sine', f0: 160, f1: 45, dur: 0.16, vol: 0.9 * v });
    },
    stun: (v) => {
      [1320, 1100, 880, 1100].forEach((f, i) => tone({
        type: 'sine', f0: f, f1: f * 0.9, at: i * 0.11, dur: 0.12, vol: 0.35 * v,
      }));
    },
    shoot: (v) => {
      burst({ filter: 'bandpass', freq: 1800, dur: 0.12, vol: 0.45 * v });
      tone({ type: 'sine', f0: 900, f1: 350, dur: 0.1, vol: 0.3 * v });
    },
    reload: (v) => {
      tone({ type: 'square', f0: 420, dur: 0.05, vol: 0.3 * v, lp: 1500 });
      tone({ type: 'square', f0: 620, at: 0.12, dur: 0.06, vol: 0.3 * v, lp: 1500 });
      burst({ filter: 'bandpass', freq: 900, at: 0.2, dur: 0.15, vol: 0.2 * v });
    },
    hit: (v) => {
      tone({ type: 'square', f0: 360, f1: 110, dur: 0.25, vol: 0.4 * v, lp: 1600 });
      burst({ freq: 700, dur: 0.15, vol: 0.4 * v });
    },
    fanfare: (v) => {
      seq([67, 72, 76, 79, 84], {
        step: 0.13, dur: 0.14, vol: 0.4 * v, last: 0.6,
      });
      seq([55, 60, 64, 67, 72], {
        type: 'square', step: 0.13, dur: 0.14, vol: 0.18 * v, lp: 1400, last: 0.6,
      });
    },
  };
  // 物語の演出の音（既存の SOUNDS の名前の一覧は変えない）
  const STORY_SFX = {
    // 地響き（館がせり上がる）: 低いうなりと土の崩れる音
    rumble: (v) => {
      tone({ type: 'sawtooth', f0: 48, f1: 28, dur: 2.6, vol: 0.55 * v, lp: 180 });
      tone({ type: 'square', f0: 36, f1: 30, at: 0.3, dur: 2.2, vol: 0.3 * v, lp: 120 });
      burst({ freq: 140, dur: 2.4, vol: 0.5 * v });
      burst({ freq: 400, at: 0.8, dur: 1.2, vol: 0.25 * v });
    },
    // 物語の場面が切り替わる「ジャーン」
    reveal: (v) => {
      seq([43, 50, 55, 58], {
        type: 'sawtooth', step: 0.02, dur: 1.4, vol: 0.18 * v, lp: 900, last: 1.6,
      });
      burst({ filter: 'highpass', freq: 3000, dur: 0.9, vol: 0.2 * v });
    },
  };

  // ---- ふざけた効果音 ----
  function wobble({
    type = 'sine', f0, f1 = f0, at = 0, dur = 0.4, vol = 0.3, lp = 0, bp = 0, q = 1,
    rate = 0, depth = 0, hold = 0.6, lin = false,
  }) {
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (lin) osc.frequency.linearRampToValueAtTime(f1, t + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    if (rate > 0 && depth > 0) {
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(rate, t);
      const lg = ac.createGain();
      lg.gain.setValueAtTime(depth, t);
      lg.gain.linearRampToValueAtTime(depth * 0.1, t + dur);
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = ac.createGain();
    const v = Math.max(0.0002, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.015);
    g.gain.setValueAtTime(v, t + Math.max(0.02, dur * hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    let node = osc;
    for (const [ft, freq] of [['lowpass', lp], ['bandpass', bp]]) {
      if (!(freq > 0)) continue;
      const fl = ac.createBiquadFilter();
      fl.type = ft;
      fl.frequency.setValueAtTime(freq, t);
      if (ft === 'bandpass') fl.Q.setValueAtTime(q, t);
      node.connect(fl);
      node = fl;
    }
    node.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function crowd({ f0, f1 = f0, at = 0, dur = 1.3, vol = 0.3, voices = 3 }) {
    const t = ac.currentTime + at;
    for (let i = 0; i < voices; i++) {
      const src = ac.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      const fl = ac.createBiquadFilter();
      fl.type = 'bandpass';
      const k = 1 + i * 0.43;
      fl.frequency.setValueAtTime(f0 * k, t);
      fl.frequency.linearRampToValueAtTime(f1 * k, t + dur);
      fl.Q.setValueAtTime(2.5, t);
      const g = ac.createGain();
      const v = Math.max(0.0002, (vol / voices) * 1.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + dur * 0.35);
      g.gain.setValueAtTime(v, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl);
      fl.connect(g);
      g.connect(bus);
      src.start(t, i * 0.07);
      src.stop(t + dur + 0.05);
    }
  }

  const SILLY = {
    boing: (v) => {
      wobble({ f0: 180, f1: 420, dur: 0.6, vol: 0.5 * v, rate: 14, depth: 90, lin: true, hold: 0.3 });
      wobble({ type: 'triangle', f0: 90, f1: 200, dur: 0.5, vol: 0.2 * v, rate: 14, depth: 40, lin: true, hold: 0.3 });
    },
    slideUp: (v) => wobble({ f0: 320, f1: 1500, dur: 0.55, vol: 0.4 * v, rate: 6, depth: 14 }),
    slideDown: (v) => wobble({ f0: 1400, f1: 260, dur: 0.6, vol: 0.4 * v, rate: 6, depth: 14 }),
    duck: (v) => {
      wobble({ type: 'square', f0: 950, f1: 1500, dur: 0.09, vol: 0.28 * v, bp: 1300, q: 3 });
      wobble({ type: 'square', f0: 1500, f1: 800, at: 0.09, dur: 0.15, vol: 0.28 * v, bp: 1200, q: 3 });
    },
    zuko: (v) => {
      wobble({ type: 'sawtooth', f0: 420, f1: 110, dur: 0.5, vol: 0.3 * v, lp: 1200 });
      burst({ filter: 'highpass', freq: 1800, at: 0.42, dur: 0.2, vol: 0.5 * v });
      tone({ type: 'sine', f0: 150, f1: 50, at: 0.42, dur: 0.25, vol: 0.7 * v });
    },
    crowdWow: (v) => crowd({ f0: 700, f1: 950, dur: 1.4, vol: 0.4 * v, voices: 4 }),
    crowdAww: (v) => crowd({ f0: 900, f1: 380, dur: 1.3, vol: 0.35 * v, voices: 3 }),
    cowbell: (v) => {
      wobble({ type: 'square', f0: 562, dur: 0.3, vol: 0.3 * v, bp: 800, q: 2, hold: 0.05 });
      wobble({ type: 'square', f0: 845, dur: 0.3, vol: 0.25 * v, bp: 800, q: 2, hold: 0.05 });
    },
    trumpetFail: (v) => {
      wobble({ type: 'sawtooth', f0: 392, dur: 0.18, vol: 0.3 * v, lp: 1500 });
      wobble({ type: 'sawtooth', f0: 370, at: 0.22, dur: 0.18, vol: 0.3 * v, lp: 1500 });
      wobble({ type: 'sawtooth', f0: 349, f1: 220, at: 0.44, dur: 0.9, vol: 0.3 * v, lp: 1200, rate: 6, depth: 10 });
    },
  };

  /** ふざけた音を直接鳴らすときの音量（効果音の音量・消音に合わせる） */
  function sillyGain() {
    try {
      const st = rules.state || {};
      if (st.muted || st.unlocked === false) return 0;
      const cand = [
        st.volumes && st.volumes.sfx, st.volume && st.volume.sfx, st.sfx,
        typeof rules.getVolume === 'function' ? rules.getVolume('sfx') : undefined,
      ];
      const n = cand.find((x) => typeof x === 'number' && Number.isFinite(x));
      return n === undefined ? 0.7 : Math.max(0, Math.min(1, n / 10));
    } catch {
      return 0;
    }
  }

  // ---- 新しいゲーム（タッチタッチ・吹っ飛ばし）の効果音 ----
  function sweep({
    filter = 'bandpass', f0, f1 = f0, at = 0, dur = 0.2, vol = 0.3, q = 1, loop = false,
  }) {
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noise();
    if (loop) src.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = filter;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (fl.Q) fl.Q.setValueAtTime(q, t);
    const g = envelope(t, dur, vol);
    src.connect(fl);
    fl.connect(g);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const GAME = {
    // ペチッ
    touch: (v) => {
      burst({ filter: 'highpass', freq: 2500, dur: 0.025, vol: 0.7 * v });
      tone({ type: 'triangle', f0: 1100, f1: 520, dur: 0.09, vol: 0.5 * v });
    },
    // スカッ
    whiff: (v) => sweep({ filter: 'bandpass', f0: 6000, f1: 900, dur: 0.2, vol: 0.45 * v, q: 1.2 }),
    // ボコッ → ヒューン
    refPunch: (v) => {
      tone({ type: 'sine', f0: 150, f1: 45, dur: 0.2, vol: 0.95 * v });
      burst({ freq: 800, dur: 0.12, vol: 0.7 * v });
      wobble({ f0: 400, f1: 1700, at: 0.18, dur: 0.35, vol: 0.35 * v, hold: 0.9 });
      wobble({ f0: 1700, f1: 260, at: 0.53, dur: 0.9, vol: 0.3 * v, hold: 0.1, rate: 7, depth: 30 });
    },
    // ポフッ
    blockLand: (v) => {
      tone({ type: 'sine', f0: 170, f1: 95, dur: 0.1, vol: 0.7 * v });
      burst({ freq: 450, dur: 0.05, vol: 0.3 * v });
    },
    // シュッ
    blockCut: (v) => sweep({ filter: 'bandpass', f0: 1800, f1: 7000, dur: 0.12, vol: 0.4 * v, q: 1.5 }),
    // ドカーン
    blast: (v) => {
      tone({ type: 'sine', f0: 110, f1: 32, dur: 0.7, vol: 1.0 * v });
      burst({ freq: 1500, dur: 0.55, vol: 0.8 * v });
      sweep({ filter: 'lowpass', f0: 3000, f1: 200, dur: 0.8, vol: 0.5 * v, loop: true });
    },
    // じゅわー
    oil: (v) => {
      sweep({ filter: 'bandpass', f0: 3200, f1: 2200, dur: 1.5, vol: 0.45 * v, q: 0.8, loop: true });
      for (let i = 0; i < 8; i++) {
        burst({ filter: 'highpass', freq: 4000, at: 0.05 + i * 0.15 + Math.random() * 0.08, dur: 0.02, vol: 0.25 * v });
      }
    },
  };

  // ---- けん玉・小説の効果音 ----
  const EXTRA = {
    // カツン：短い木質のクリック
    katsun: (v) => {
      burst({ filter: 'bandpass', freq: 2400, dur: 0.03, vol: 0.7 * v });
      tone({ type: 'triangle', f0: 1300, f1: 900, dur: 0.07, vol: 0.45 * v });
    },
    // スカッ：下降する短いノイズ
    sukat: (v) => sweep({ filter: 'bandpass', f0: 5000, f1: 700, dur: 0.22, vol: 0.45 * v, q: 1.2 }),
    // シャキーン
    shakin: (v) => {
      tone({ type: 'square', f0: 800, f1: 3000, dur: 0.25, vol: 0.2 * v, lp: 4500 });
      tone({ type: 'sine', f0: 2400, f1: 4800, at: 0.05, dur: 0.6, vol: 0.25 * v });
    },
    // ペラッ
    pera: (v) => sweep({ filter: 'highpass', f0: 2500, f1: 6000, dur: 0.08, vol: 0.3 * v }),
    // ピンポーン
    pinpon: (v) => {
      tone({ type: 'sine', f0: 1318, dur: 0.25, vol: 0.45 * v });
      tone({ type: 'sine', f0: 1046, at: 0.25, dur: 0.6, vol: 0.45 * v });
    },
    // ピンポンピンポン
    correct: (v) => [1318, 1046, 1318, 1046].forEach((f, i) => tone({
      type: 'sine', f0: f, at: i * 0.14, dur: 0.16, vol: 0.4 * v,
    })),
    // ブブー
    wrong: (v) => {
      tone({ type: 'square', f0: 160, dur: 0.18, vol: 0.3 * v, lp: 1200 });
      tone({ type: 'square', f0: 160, at: 0.22, dur: 0.45, vol: 0.3 * v, lp: 1200 });
    },
    // ブッブー（おふざけ）
    fakeBuzz: (v) => {
      tone({ type: 'square', f0: 120, dur: 0.12, vol: 0.3 * v, lp: 900 });
      tone({ type: 'square', f0: 110, at: 0.16, dur: 0.3, vol: 0.3 * v, lp: 900 });
    },
  };

  // ---- スーパー将棋の効果音（at は遅れ秒） ----
  const SHOGI = {
    // パチッ：短いクリック＋木の高い共鳴
    shogiPlace: (v, at = 0) => {
      burst({ filter: 'highpass', freq: 3500, at, dur: 0.018, vol: 0.8 * v });
      tone({ type: 'triangle', f0: 1750, f1: 1500, at, dur: 0.09, vol: 0.4 * v });
      tone({ type: 'sine', f0: 820, at, dur: 0.06, vol: 0.3 * v });
    },
    // パシーン：広帯域ノイズ＋急減衰
    shogiCapture: (v, at = 0) => {
      burst({ filter: 'lowpass', freq: 9000, at, dur: 0.16, vol: 0.95 * v });
      burst({ filter: 'highpass', freq: 2200, at, dur: 0.05, vol: 0.6 * v });
      tone({ type: 'sine', f0: 240, f1: 70, at, dur: 0.14, vol: 0.6 * v });
    },
    // シャキーン：上昇する金属音
    shogiPromote: (v, at = 0) => {
      tone({ type: 'square', f0: 700, f1: 2800, at, dur: 0.28, vol: 0.2 * v, lp: 4500 });
      tone({ type: 'sine', f0: 2100, f1: 4200, at: at + 0.06, dur: 0.6, vol: 0.25 * v });
      tone({ type: 'sine', f0: 3150, f1: 6300, at: at + 0.06, dur: 0.45, vol: 0.1 * v });
      sweep({ filter: 'highpass', f0: 3000, f1: 9000, at, dur: 0.3, vol: 0.18 * v });
    },
    // ドドン：低い太鼓 2 発
    shogiCheck: (v, at = 0) => {
      for (const k of [0, 0.24]) {
        tone({ type: 'sine', f0: 150, f1: 52, at: at + k, dur: 0.38, vol: 0.95 * v });
        burst({ filter: 'lowpass', freq: 300, at: at + k, dur: 0.1, vol: 0.6 * v });
      }
    },
    // チーン：高い鈴の長い余韻
    shogiMate: (v, at = 0) => {
      tone({ type: 'sine', f0: 2093, at, dur: 2.6, vol: 0.4 * v });
      tone({ type: 'sine', f0: 2093 * 2.76, at, dur: 1.2, vol: 0.1 * v });
      tone({ type: 'sine', f0: 2093 * 5.4, at, dur: 0.5, vol: 0.05 * v });
      tone({ type: 'triangle', f0: 1046.5, at, dur: 1.8, vol: 0.08 * v });
    },
  };
  const shogiLast = new Map();

  // ---- ファイルを見つけろ（モヒカンOS 98）の効果音。すべてオリジナルの合成音（at は遅れ秒） ----
  function ffVoice({
    type = 'sine', f0, f1 = f0, at = 0, attack = 0.01, dur = 0.2, vol = 0.3, lp = 0,
  }) {
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    setWave(osc, type);
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    const v = Math.max(0.0002, vol);
    const a = Math.min(Math.max(0.002, attack), dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    let node = osc;
    if (lp > 0) {
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(lp, t);
      osc.connect(fl);
      node = fl;
    }
    node.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  const FF = {
    // ぽわーん：ゆっくり立ち上がる和音
    ffBoot: (v, at = 0) => {
      [[48, 0], [55, 0.12], [60, 0.24], [64, 0.36], [67, 0.48]].forEach(([n, k]) => ffVoice({
        type: 'sine', f0: NOTE(n) * 0.995, f1: NOTE(n), at: at + k, attack: 0.45, dur: 2.0 - k, vol: 0.16 * v,
      }));
      ffVoice({
        type: 'triangle', f0: NOTE(72), f1: NOTE(79), at: at + 0.6, attack: 0.5, dur: 1.4, vol: 0.08 * v,
      });
    },
    // カチッ
    ffClick: (v, at = 0) => {
      burst({ filter: 'highpass', freq: 3200, at, dur: 0.012, vol: 0.5 * v });
      ffVoice({
        type: 'square', f0: 2000, f1: 1400, at, attack: 0.002, dur: 0.025, vol: 0.12 * v, lp: 3500,
      });
    },
    // ピロッ（開く）
    ffOpen: (v, at = 0) => {
      ffVoice({
        type: 'pulse', f0: 520, f1: 780, at, attack: 0.004, dur: 0.07, vol: 0.22 * v, lp: 3000,
      });
      ffVoice({
        type: 'triangle', f0: 1040, at: at + 0.06, attack: 0.004, dur: 0.1, vol: 0.25 * v,
      });
    },
    // ポーン（エラー）
    ffError: (v, at = 0) => {
      ffVoice({
        type: 'sine', f0: 740, at, attack: 0.004, dur: 0.7, vol: 0.4 * v,
      });
      ffVoice({
        type: 'sine', f0: 1480, at, attack: 0.004, dur: 0.25, vol: 0.1 * v,
      });
      ffVoice({
        type: 'triangle', f0: 370, at, attack: 0.004, dur: 0.35, vol: 0.12 * v,
      });
    },
    // 正解：上がるアルペジオ
    ffOk: (v, at = 0) => {
      [72, 76, 79, 84].forEach((n, i) => ffVoice({
        type: 'pulse', f0: NOTE(n), at: at + i * 0.07, attack: 0.004, dur: i === 3 ? 0.4 : 0.09, vol: 0.2 * v, lp: 4000,
      }));
      ffVoice({
        type: 'sine', f0: NOTE(96), at: at + 0.21, attack: 0.01, dur: 0.5, vol: 0.08 * v,
      });
    },
    // 不正解：下がる低いブザー
    ffNg: (v, at = 0) => {
      ffVoice({
        type: 'square', f0: 311, f1: 294, at, attack: 0.005, dur: 0.16, vol: 0.2 * v, lp: 1400,
      });
      ffVoice({
        type: 'square', f0: 233, f1: 196, at: at + 0.18, attack: 0.005, dur: 0.38, vol: 0.2 * v, lp: 1200,
      });
    },
    // フロッピーのガリガリ：モーターのうなりと、ヘッドの刻み
    ffFloppy: (v, at = 0) => {
      ffVoice({
        type: 'sawtooth', f0: 55, f1: 50, at, attack: 0.02, dur: 0.5, vol: 0.08 * v, lp: 260,
      });
      for (let i = 0; i < 12; i++) {
        const k = at + i * 0.038 + (i % 3 === 0 ? 0.01 : 0);
        burst({
          filter: 'bandpass', freq: 900 + ((i * 397) % 700), at: k, dur: 0.022, vol: (0.35 + (i % 2) * 0.15) * v,
        });
      }
    },
  };
  const ffLast = new Map();

  // ---- レバガチャファイターヌスの効果音（真剣な打撃音。at は遅れ秒） ----
  const LF = {
    // バシッ
    lfPunch: (v, at = 0) => {
      burst({ filter: 'bandpass', freq: 1800, at, dur: 0.06, vol: 0.8 * v });
      tone({ type: 'sine', f0: 180, f1: 80, at, dur: 0.1, vol: 0.85 * v });
    },
    // ドゴッ
    lfKick: (v, at = 0) => {
      burst({ filter: 'lowpass', freq: 900, at, dur: 0.12, vol: 0.9 * v });
      tone({ type: 'sine', f0: 120, f1: 45, at, dur: 0.18, vol: 1.0 * v });
    },
    // ガキン：非整数倍の金属音 2 成分と高域ノイズ
    lfGuard: (v, at = 0) => {
      tone({ type: 'triangle', f0: 1200, at, dur: 0.09, vol: 0.35 * v });
      tone({ type: 'sine', f0: 1870, at, dur: 0.09, vol: 0.25 * v });
      burst({ filter: 'highpass', freq: 5000, at, dur: 0.04, vol: 0.4 * v });
    },
    // K.O.：低く沈む音と低域のノイズ、低いゴング
    lfKo: (v, at = 0) => {
      tone({ type: 'sine', f0: 90, f1: 30, at, dur: 0.9, vol: 1.0 * v });
      sweep({ filter: 'lowpass', f0: 420, f1: 120, at, dur: 0.6, vol: 0.7 * v, loop: true });
      tone({ type: 'sine', f0: 98, at: at + 0.05, dur: 2.2, vol: 0.35 * v });
      tone({ type: 'sine', f0: 98 * 2.76, at: at + 0.05, dur: 1.2, vol: 0.12 * v });
      tone({ type: 'sine', f0: 98 * 5.4, at: at + 0.05, dur: 0.6, vol: 0.05 * v });
    },
    // 溜め：鋸歯波 200→800Hz を 0.35 秒でふくらませる
    lfCharge: (v, at = 0) => {
      const t = ac.currentTime + at;
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.35);
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(900, t);
      fl.frequency.linearRampToValueAtTime(3200, t + 0.35);
      const g = ac.createGain();
      const vol = Math.max(0.0002, 0.28 * v);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.33);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(fl);
      fl.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + 0.45);
    },
    // 発動：ノイズの風切りと低いサインの余韻
    lfSpecial: (v, at = 0) => {
      sweep({ filter: 'bandpass', f0: 600, f1: 4200, at, dur: 0.35, vol: 0.6 * v, q: 0.9 });
      tone({ type: 'sine', f0: 110, f1: 60, at, dur: 0.7, vol: 0.7 * v });
      tone({ type: 'triangle', f0: 220, f1: 180, at, dur: 0.4, vol: 0.2 * v });
    },
    // 発見：400→2400Hz の上昇音「キュイーン」と少しのきらめき
    lfDiscover: (v, at = 0) => {
      tone({ type: 'sine', f0: 400, f1: 2400, at, dur: 0.5, vol: 0.4 * v });
      tone({ type: 'triangle', f0: 800, f1: 4800, at: at + 0.02, dur: 0.45, vol: 0.12 * v });
      [2637, 3136, 3951].forEach((f, i) => tone({
        type: 'sine', f0: f, at: at + 0.32 + i * 0.08, dur: 0.3, vol: 0.08 * v,
      }));
    },
  };
  const lfLast = new Map();

  // ---- 怪獣大決戦の効果音（作り方は kj-music.js の部品。at は遅れ秒） ----
  function playRecipe(parts, v, at) {
    for (const p of parts) {
      const a = at + (p.at || 0);
      if (p.k === 'tone') {
        tone({
          type: p.type, f0: p.f0, f1: p.f1, at: a, dur: p.dur, vol: p.vol * v, lp: p.lp || 0,
        });
      } else if (p.k === 'noise') {
        sweep({
          filter: p.filter, f0: p.f0, f1: p.f1, at: a, dur: p.dur, vol: p.vol * v, q: p.q || 1, loop: p.dur > 0.45,
        });
      } else if (p.k === 'wob') {
        wobble({
          type: p.type,
          f0: p.f0,
          f1: p.f1,
          at: a,
          dur: p.dur,
          vol: p.vol * v,
          lp: p.lp || 0,
          bp: p.bp || 0,
          q: p.q || 1,
          rate: p.rate || 0,
          depth: p.depth || 0,
          hold: Number.isFinite(p.hold) ? p.hold : 0.6,
          lin: !!p.lin,
        });
      }
    }
  }
  const kjLast = new Map();

  function shogiBaseGain() {
    try {
      const st = rules.state || {};
      if (st.muted || st.unlocked === false) return 0;
      return typeof rules.effectiveGain === 'function' ? rules.effectiveGain('sfx') : sillyGain();
    } catch {
      return 0;
    }
  }

  // 溜め：ゲージ値に応じて高くなる連続音（更新が途切れたら tick で止める）
  let chargeNode = null;
  function stopCharge() {
    if (!chargeNode) return;
    const n = chargeNode;
    chargeNode = null;
    try {
      const t = ac.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(Math.max(0.0001, Number(n.g.gain.value) || 0.0001), t);
      n.g.gain.linearRampToValueAtTime(0.0001, t + 0.06);
      n.osc.stop(t + 0.08);
    } catch {
      // 握りつぶす
    }
  }
  function charge(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) {
      stopCharge();
      return false;
    }
    const gain = sillyGain();
    if (!(gain > 0) || !ensure()) {
      stopCharge();
      return false;
    }
    try {
      const k = Math.max(0, Math.min(1, Number(v)));
      const t = ac.currentTime;
      const f = 180 + 900 * k;
      if (!chargeNode) {
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f, t);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12 * gain, t + 0.05);
        osc.connect(lp);
        lp.connect(g);
        g.connect(bus);
        osc.start(t);
        chargeNode = { osc, g, at: 0 };
      } else {
        chargeNode.osc.frequency.setTargetAtTime(f, t, 0.02);
      }
      chargeNode.at = clock();
      return true;
    } catch {
      return false;
    }
  }

  // ---- 音楽（先読みスケジューリング。tick() を毎フレーム呼ぶ） ----
  const LOOKAHEAD = 0.25;
  let musicGain = null;
  let musicScene = null;
  let song = null; // { name, track, out, start, next, step }
  let musicStarts = 0;

  function ensureMusicBus() {
    if (!ensure()) return null;
    if (!musicGain) {
      musicGain = ac.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(ac.destination);
    }
    return musicGain;
  }

  function stopSong() {
    if (!song) return;
    const old = song;
    song = null;
    try {
      const t = ac.currentTime;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    } catch {
      // 握りつぶす
    }
  }

  function startSong(name) {
    const track = trackByName(name);
    if (!track) return;
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(musicGain);
    if (track.delay > 0 && typeof ac.createDelay === 'function') {
      try {
        const d = ac.createDelay(1);
        d.delayTime.value = track.delay;
        const fb = ac.createGain();
        fb.gain.value = 0.3;
        out.connect(d);
        d.connect(fb);
        fb.connect(d);
        d.connect(musicGain);
      } catch {
        // 握りつぶす
      }
    }
    const start = ac.currentTime + 0.1;
    song = {
      name, track, out, start, next: 0, step: stepSeconds(track), nextTick: start,
    };
    musicStarts += 1;
  }

  /** 1 音（短い ADSR。square は lowpass で柔らかく） */
  /** 怪獣大決戦の主題歌の楽器を鳴らす（作り方は kj-music.js の KJ_INSTRUMENTS） */
  function playKjInst(out, inst, voice, ev, t, step) {
    const vol = Math.max(0.0002, Number(voice.vol) || 0.1);
    const f0 = NOTE(ev.midi);
    const kind = inst.kind || 'osc';
    if (kind === 'drum') {
      // ティンパニ：音程のある胴鳴り（少し高く打ってから落ち着く）と、低いノイズ
      const dec = inst.decay > 0 ? inst.decay : 0.8;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      g.connect(out);
      for (const [mul, k] of inst.partials || [[1, 1]]) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * mul * (inst.bend || 1), t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f0 * mul), t + 0.09);
        const og = ac.createGain();
        og.gain.setValueAtTime(k, t);
        osc.connect(og);
        og.connect(g);
        osc.start(t);
        osc.stop(t + dec + 0.05);
      }
      if (inst.noise > 0) {
        const src = ac.createBufferSource();
        src.buffer = noise();
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(inst.noiseLp || 300, t);
        const ng = ac.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.linearRampToValueAtTime(vol * inst.noise, t + 0.003);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        src.connect(lp);
        lp.connect(ng);
        ng.connect(out);
        src.start(t);
        src.stop(t + 0.17);
      }
      return;
    }
    if (kind === 'noise') {
      // スネア・シンバル：フィルタを通したノイズ（スネアは短い胴鳴りつき）
      const dec = inst.decay > 0 ? inst.decay : 0.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      g.connect(out);
      const src = ac.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      const fl = ac.createBiquadFilter();
      fl.type = inst.filter || 'highpass';
      fl.frequency.setValueAtTime(inst.freq || 2000, t);
      if (fl.Q) fl.Q.setValueAtTime(inst.q || 0.7, t);
      src.connect(fl);
      fl.connect(g);
      src.start(t);
      src.stop(t + dec + 0.05);
      if (inst.body > 0) {
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(inst.body, t);
        osc.frequency.exponentialRampToValueAtTime(inst.body * 0.75, t + 0.08);
        const og = ac.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.linearRampToValueAtTime(vol * (inst.bodyGain || 0.5), t + 0.002);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        osc.connect(og);
        og.connect(out);
        osc.start(t);
        osc.stop(t + 0.13);
      }
      return;
    }
    const dur = Math.max(0.05, ev.len * step * (Number(voice.gate) || 0.85));
    const atk = Math.min(inst.attack || 0.02, dur * 0.6);
    const dec = Math.max(0.001, Math.min(inst.decay || 0.1, dur - atk));
    const sus = Math.max(0.0002, vol * (Number.isFinite(inst.sustain) ? inst.sustain : 0.7));
    const rel = inst.release || 0.1;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + atk);
    env.gain.linearRampToValueAtTime(sus, t + atk + dec);
    env.gain.setValueAtTime(sus, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    env.connect(out);
    const end = t + dur + rel + 0.05;
    const oscs = [];
    if (kind === 'voice') {
      // 男声コーラス：少しずつずれたノコギリ波を、声の共鳴（フォルマント）に通して「アー」「オー」にする
      const dets = Array.isArray(inst.detune) && inst.detune.length ? inst.detune : [0];
      const mix = ac.createGain();
      mix.gain.setValueAtTime(1 / dets.length, t);
      for (const [ff, fg, q] of inst.formants || []) {
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(ff, t);
        if (bp.Q) bp.Q.setValueAtTime(q || 5, t);
        const amp = ac.createGain();
        amp.gain.setValueAtTime(fg, t);
        mix.connect(bp);
        bp.connect(amp);
        amp.connect(env);
      }
      for (const d of dets) {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0, t);
        if (osc.detune && typeof osc.detune.setValueAtTime === 'function') osc.detune.setValueAtTime(d, t);
        osc.connect(mix);
        oscs.push(osc);
      }
    } else {
      // 金管・弦・低音：発振器を重ね、ローパスを開きながら鳴らす（金管は吹き始めが明るくなる）
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      const lpEnd = inst.lp || 2000;
      lp.frequency.setValueAtTime(inst.lpStart || lpEnd, t);
      lp.frequency.linearRampToValueAtTime(lpEnd, t + atk * 2 + 0.02);
      lp.connect(env);
      for (const w of inst.waves || [{ type: 'sawtooth', mul: 1, gain: 1 }]) {
        const osc = ac.createOscillator();
        osc.type = w.type;
        osc.frequency.setValueAtTime(f0 * (w.mul || 1), t);
        const og = ac.createGain();
        og.gain.setValueAtTime(w.gain, t);
        osc.connect(og);
        og.connect(lp);
        oscs.push(osc);
      }
    }
    if (inst.vib > 0 && oscs.length) {
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(inst.vibRate || 5.5, t);
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f0 * inst.vib, t + Math.min(dur, inst.vibDelay || 0.2));
      lfo.connect(lg);
      for (const o of oscs) lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(end);
    }
  }

  function playNote(out, voice, ev, t, step) {
    const kjInst = voice && voice.inst ? kjInstrument(voice.inst) : null;
    if (kjInst) {
      playKjInst(out, kjInst, voice, ev, t, step);
      return;
    }
    const vol = voice.vol;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.connect(out);
    if (voice.type === 'taiko') {
      // 和太鼓：ピッチが下がるサイン波＋低いノイズ
      const f = NOTE(ev.midi);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * 2.2, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t + 0.12);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.42);
      const src = ac.createBufferSource();
      src.buffer = noise();
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(260, t);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vol * 0.7, t + 0.003);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(out);
      src.start(t);
      src.stop(t + 0.15);
      return;
    }
    if (voice.type === 'kick') {
      // キック：急に下がるサイン波と短いアタック
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.32);
      const src = ac.createBufferSource();
      src.buffer = noise();
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1200, t);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vol * 0.4, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(out);
      src.start(t);
      src.stop(t + 0.04);
      return;
    }
    if (voice.type === 'snare') {
      // スネア：高域のノイズと短い胴鳴り
      g.gain.linearRampToValueAtTime(vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      const src = ac.createBufferSource();
      src.buffer = noise();
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1500, t);
      src.connect(hp);
      hp.connect(g);
      src.start(t);
      src.stop(t + 0.18);
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(vol * 0.6, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(og);
      og.connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
      return;
    }
    if (voice.type === 'clack') {
      // 拍子木：とても短い高域ノイズ
      g.gain.linearRampToValueAtTime(vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      const src = ac.createBufferSource();
      src.buffer = noise();
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(NOTE(ev.midi), t);
      if (f.Q) f.Q.setValueAtTime(6, t);
      src.connect(f);
      f.connect(g);
      src.start(t);
      src.stop(t + 0.06);
      return;
    }
    if (voice.type === 'cowbell') {
      // カウベル：2つの矩形波（約 540/800Hz）の短い減衰
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(800, t);
      if (bp.Q) bp.Q.setValueAtTime(2, t);
      bp.connect(g);
      for (const fr of [540, 800]) {
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(fr, t);
        osc.connect(bp);
        osc.start(t);
        osc.stop(t + 0.25);
      }
      return;
    }
    if (voice.type === 'koto') {
      // 琴：撥弦（三角波＋倍音の短い減衰）と爪の当たる音
      const f = NOTE(ev.midi);
      const dur = Math.min(1.3, 0.45 + ev.len * step * 0.5);
      g.gain.linearRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const [mul, k, type] of [[1, 1, 'triangle'], [2, 0.22, 'sine'], [3, 0.08, 'sine']]) {
        const osc = ac.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(f * mul * 1.006, t);
        osc.frequency.exponentialRampToValueAtTime(f * mul, t + 0.05);
        const og = ac.createGain();
        og.gain.setValueAtTime(k, t);
        osc.connect(og);
        og.connect(g);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
      const src = ac.createBufferSource();
      src.buffer = noise();
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(3500, t);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vol * 0.25, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(out);
      src.start(t);
      src.stop(t + 0.04);
      return;
    }
    if (voice.type === 'shakuhachi') {
      // 尺八：柔らかいサイン波の持続音＋息のノイズ
      const f = NOTE(ev.midi);
      const dur = Math.max(0.15, ev.len * step * voice.gate);
      g.gain.linearRampToValueAtTime(vol, t + 0.09);
      g.gain.setValueAtTime(vol, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(5, t);
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * (voice.vib || 0.01), t + Math.min(0.4, dur));
      lfo.connect(lg);
      lg.connect(osc.frequency);
      osc.connect(g);
      lfo.start(t);
      lfo.stop(t + dur + 0.22);
      osc.start(t);
      osc.stop(t + dur + 0.22);
      const src = ac.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 1.5, t);
      if (bp.Q) bp.Q.setValueAtTime(1.5, t);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vol * 0.5, t + 0.04);
      ng.gain.linearRampToValueAtTime(vol * 0.15, t + 0.2);
      ng.gain.setValueAtTime(vol * 0.15, t + dur);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(out);
      src.start(t);
      src.stop(t + dur + 0.2);
      return;
    }
    if (voice.type === 'goof') {
      const f = NOTE(ev.midi);
      if (ev.midi >= 60) {
        // 下がるグリッサンド（ひょろろ〜）
        g.gain.linearRampToValueAtTime(vol, t + 0.02);
        g.gain.setValueAtTime(vol, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f / 4), t + 0.85);
        const lfo = ac.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(7, t);
        const lg = ac.createGain();
        lg.gain.setValueAtTime(f * 0.03, t);
        lfo.connect(lg);
        lg.connect(osc.frequency);
        osc.connect(g);
        lfo.start(t);
        lfo.stop(t + 0.95);
        osc.start(t);
        osc.stop(t + 0.95);
      } else {
        // ぷっ
        g.gain.linearRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f * 2, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t + 0.12);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, t);
        osc.connect(lp);
        lp.connect(g);
        osc.start(t);
        osc.stop(t + 0.18);
      }
      return;
    }
    if (voice.type === 'kane') {
      // 鉦：短い矩形波の 2 音（チキチン）
      g.gain.linearRampToValueAtTime(vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      for (const fr of [2600, 3900]) {
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(fr, t);
        osc.connect(g);
        osc.start(t);
        osc.stop(t + 0.14);
      }
      return;
    }
    if (voice.type === 'epiano') {
      // エレピ風：減衰するサイン波＋ローパス
      const dur = Math.max(0.2, ev.len * step * voice.gate);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(NOTE(ev.midi), t);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t);
      osc.connect(lp);
      lp.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.35);
      return;
    }
    if (voice.type === 'noise') {
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      const src = ac.createBufferSource();
      src.buffer = noise();
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(NOTE(ev.midi), t);
      src.connect(f);
      f.connect(g);
      src.start(t);
      src.stop(t + 0.08);
      return;
    }
    const dur = Math.max(0.05, ev.len * step * voice.gate);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + Math.min(dur, 0.1));
    g.gain.setValueAtTime(vol * 0.6, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const osc = ac.createOscillator();
    setWave(osc, voice.type);
    osc.frequency.setValueAtTime(NOTE(ev.midi), t);
    if (voice.vib > 0) {
      // 笛のビブラート（少し遅れてかかる）
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(5.5, t);
      const lg = ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(NOTE(ev.midi) * voice.vib, t + Math.min(0.15, dur));
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    if (voice.lp > 0) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(voice.lp, t);
      osc.connect(f);
      f.connect(g);
    } else {
      osc.connect(g);
    }
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  function tickMusic() {
    if (!song || !ac) return;
    try {
      const now = ac.currentTime;
      const { track, step, out } = song;
      // 長く止まっていた（タブが隠れていた等）ときは、今の時刻から続ける
      const behind = now + 0.03 - (song.start + song.next * step);
      if (behind > 0) song.start += behind;
      let guard = 0;
      while (song.start + song.next * step < now + LOOKAHEAD && guard < 64) {
        const s = song.next % track.length;
        const t = song.start + song.next * step;
        for (const v of track.voices) {
          const evs = v.byStep[s];
          if (evs) for (const ev of evs) playNote(out, v, ev, t, step);
        }
        song.next += 1;
        guard += 1;
      }
      // 時計の秒針（1秒ごと）
      if (track.tickSec > 0) {
        if (song.nextTick < now) song.nextTick = now;
        let g2 = 0;
        while (song.nextTick < now + LOOKAHEAD && g2 < 8) {
          const t = song.nextTick;
          const src = ac.createBufferSource();
          src.buffer = noise();
          const bp = ac.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(3500, t);
          const ng = ac.createGain();
          ng.gain.setValueAtTime(0.0001, t);
          ng.gain.linearRampToValueAtTime(0.08, t + 0.002);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(out);
          src.start(t);
          src.stop(t + 0.05);
          song.nextTick += track.tickSec;
          g2 += 1;
        }
      }
    } catch {
      // 握りつぶす
    }
  }

  /**
   * 場面の曲の計画。新しいゲームの曲は、音の規則が知らなければハブの曲の音量
   * （消音・音量設定に従う）で鳴らす。
   */
  function planFor(scene) {
    let plan = null;
    try {
      plan = rules.planMusic(scene);
    } catch {
      plan = null;
    }
    if (isGameTrackName(scene)) {
      let base = plan;
      if (!base) {
        try {
          base = rules.planMusic('hub');
        } catch {
          base = null;
        }
      }
      return base ? { ...base, track: scene } : null;
    }
    return plan;
  }

  /** いまの場面の曲を鳴らす。同じ曲なら再始動せず音量だけ合わせる */
  function applyMusic() {
    const plan = planFor(musicScene);
    if (!plan || !trackByName(plan.track)) {
      if (ac) stopSong();
      return null;
    }
    if (!ensureMusicBus()) return null;
    try {
      musicGain.gain.setTargetAtTime(Math.max(0, plan.gain), ac.currentTime, 0.05);
      if (!song || song.name !== plan.track) {
        stopSong();
        startSong(plan.track);
      }
    } catch {
      return null;
    }
    return plan.track;
  }

  const api = {
    rules,
    /** 場面の音楽を切り替える（scene は audio-rules の MUSIC_TABLE の名前。null で無音） */
    music(scene) {
      musicScene = typeof scene === 'string' ? scene : null;
      return applyMusic();
    },
    /** 解除・消音・音量の変更のあとに曲を合わせ直す */
    refreshMusic() {
      return applyMusic();
    },
    /** 毎フレーム呼ぶ。少し先までの音符を予約する */
    tick() {
      tickMusic();
      if (chargeNode && clock() - chargeNode.at > 0.25) stopCharge();
    },
    setVolume(channel, n) {
      rules.setVolume(channel, n);
      applyMusic();
    },
    musicState() {
      return {
        scene: musicScene,
        track: song ? song.name : null,
        starts: musicStarts,
        gain: musicGain ? musicGain.gain.value : 0,
      };
    },
    /** 最初のキー入力・クリックで呼ぶ。初めて解除したら true */
    unlock() {
      const first = !rules.state.unlocked;
      rules.unlock();
      const c = ensure();
      try {
        if (c && c.state === 'suspended' && typeof c.resume === 'function') {
          const r = c.resume();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      } catch {
        // 握りつぶす
      }
      return first;
    },
    /** 出来事の効果音を鳴らす。鳴らしたら true */
    play(event) {
      let plan = null;
      try {
        plan = rules.planSfx(event, clock());
      } catch {
        plan = null;
      }
      if (!plan || !(plan.gain > 0)) return false;
      let name = plan.sound;
      try {
        name = decideSfx(plan.sound, sillyLevel, sillyRng);
      } catch {
        name = plan.sound;
      }
      const fn = SOUNDS[name] || SILLY[name] || SOUNDS[plan.sound];
      if (!fn || !ensure()) return false;
      try {
        fn(plan.gain);
        return true;
      } catch {
        return false;
      }
    },
    /** 消音の切り替え。消音になったら true */
    toggleMute() {
      rules.toggleMute();
      applyMusic();
      return rules.state.muted;
    },
    /** ふざけた音を名前で鳴らす（おふざけ度 0 なら鳴らさない） */
    playSilly(name) {
      if (sillyLevel <= 0) return false;
      const fn = SILLY[name];
      const g = sillyGain();
      if (!fn || !(g > 0) || !ensure()) return false;
      try {
        fn(g);
        return true;
      } catch {
        return false;
      }
    },
    setSillyLevel(n) {
      sillyLevel = normalizeSillyLevel(n);
      return sillyLevel;
    },
    getSillyLevel: () => sillyLevel,
    sillyNames: () => Object.keys(SILLY),
    soundNames: () => Object.keys(SOUNDS),
    /** 新しいゲームの効果音を名前で鳴らす（効果音の音量・消音に合わせる） */
    /** 物語の演出の音（地響き・ジャーン）を名前で鳴らす */
    playStory(name) {
      const fn = Object.prototype.hasOwnProperty.call(STORY_SFX, name) ? STORY_SFX[name] : null;
      const g = sillyGain();
      if (!fn || !(g > 0) || !ensure()) return false;
      try {
        fn(g);
        return true;
      } catch {
        return false;
      }
    },
    playGame(name) {
      const fn = Object.prototype.hasOwnProperty.call(GAME, name) ? GAME[name] : null;
      const g = sillyGain();
      if (!fn || !(g > 0) || !ensure()) return false;
      try {
        fn(g);
        return true;
      } catch {
        return false;
      }
    },
    /** スーパー将棋の効果音を名前で鳴らす（効果音の音量・消音・解除に従う）。delay は遅れ秒 */
    playShogi(name, delay = 0) {
      if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SHOGI, name)) return false;
      const plan = planShogiSfx(name, shogiBaseGain(), clock(), shogiLast);
      if (!plan || !ensure()) return false;
      try {
        SHOGI[name](plan.gain, Math.max(0, Number(delay) || 0));
        return true;
      } catch {
        return false;
      }
    },
    shogiSoundNames: () => Object.keys(SHOGI),
    /** ファイルを見つけろの効果音を名前で鳴らす（効果音の音量・消音・解除に従う）。delay は遅れ秒 */
    playFf(name, delay = 0) {
      if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(FF, name)) return false;
      const plan = planFfSfx(name, shogiBaseGain(), clock(), ffLast);
      if (!plan || !ensure()) return false;
      try {
        FF[name](plan.gain, Math.max(0, Number(delay) || 0));
        return true;
      } catch {
        return false;
      }
    },
    ffSoundNames: () => Object.keys(FF),
    /** レバガチャファイターヌスの効果音を名前で鳴らす（効果音の音量・消音・解除に従う） */
    playLf(name, delay = 0) {
      if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LF, name)) return false;
      const plan = planLfSfx(name, shogiBaseGain(), clock(), lfLast);
      if (!plan || !ensure()) return false;
      try {
        LF[name](plan.gain, Math.max(0, Number(delay) || 0));
        return true;
      } catch {
        return false;
      }
    },
    lfSoundNames: () => Object.keys(LF),
    /** 怪獣大決戦の効果音を名前で鳴らす（効果音の音量・消音・解除に従う）。delay は遅れ秒 */
    playKj(name, delay = 0) {
      const parts = kjRecipe(name);
      if (!parts) return false;
      const plan = planKjSfx(name, shogiBaseGain(), clock(), kjLast);
      if (!plan || !ensure()) return false;
      try {
        playRecipe(parts, plan.gain, Math.max(0, Number(delay) || 0));
        return true;
      } catch {
        return false;
      }
    },
    kjSoundNames: () => [...KJ_SFX_NAMES],
    /** けん玉・小説の効果音を名前で鳴らす（消音なら鳴らさない） */
    playExtra(name) {
      const fn = Object.prototype.hasOwnProperty.call(EXTRA, name) ? EXTRA[name] : null;
      const g = sillyGain();
      if (!fn || !(g > 0) || !ensure()) return false;
      try {
        fn(g);
        return true;
      } catch {
        return false;
      }
    },
    extraSoundNames: () => Object.keys(EXTRA),
    /** 溜めの音。v は 0〜1（null で止める） */
    charge,
    stopCharge,
    charging: () => !!chargeNode,
    gameSoundNames: () => Object.keys(GAME),
  };
  current = api;
  return api;
}

/** 合成できる音の名前（テスト用） */
export const SOUND_NAMES = Object.freeze([
  'jump', 'land', 'dash', 'talk', 'confirm', 'push', 'clear', 'boost',
  'drift', 'punch', 'stun', 'shoot', 'reload', 'hit', 'fanfare',
]);

/** ふざけた音の名前（silly-rules の SILLY_SFX と同じ） */
export const SILLY_SOUND_NAMES = SILLY_SFX;

/** 新しいゲームの効果音の名前 */
export const GAME_SFX_NAMES = Object.freeze(['touch', 'whiff', 'refPunch', 'blockLand', 'blockCut', 'blast', 'oil']);

/** スーパー将棋の効果音の名前 */
export const SHOGI_SFX_NAMES = Object.freeze(['shogiPlace', 'shogiCapture', 'shogiPromote', 'shogiCheck', 'shogiMate']);

/** けん玉・小説の効果音の名前 */
export const EXTRA_SFX_NAMES = Object.freeze(['katsun', 'sukat', 'shakin', 'pera', 'pinpon', 'correct', 'wrong', 'fakeBuzz']);

/** ファイルを見つけろの効果音の名前 */
export const FF_SFX_NAMES = Object.freeze(['ffBoot', 'ffClick', 'ffOpen', 'ffError', 'ffOk', 'ffNg', 'ffFloppy']);

/** レバガチャファイターヌスの効果音の名前 */
export const LF_SFX_NAMES = Object.freeze(['lfPunch', 'lfKick', 'lfGuard', 'lfKo', 'lfCharge', 'lfSpecial', 'lfDiscover']);

/** 場面からレバガチャファイターヌスの効果音を鳴らす（音の仕組みがまだ無ければ何もしない） */
export function lfSfx(name, delay = 0) {
  try {
    return current ? current.playLf(name, delay) : false;
  } catch {
    return false;
  }
}

/** 場面から怪獣大決戦の効果音を鳴らす（音の仕組みがまだ無ければ何もしない） */
export function kjSfx(name, delay = 0) {
  try {
    return current ? current.playKj(name, delay) : false;
  } catch {
    return false;
  }
}

/** 場面からファイルを見つけろの効果音を鳴らす（音の仕組みがまだ無ければ何もしない） */
export function ffSfx(name, delay = 0) {
  try {
    return current ? current.playFf(name, delay) : false;
  } catch {
    return false;
  }
}

/** 場面からけん玉・小説の効果音を鳴らす */
export function extraSfx(name) {
  try {
    return current ? current.playExtra(name) : false;
  } catch {
    return false;
  }
}

/** 場面からスーパー将棋の効果音を鳴らす（音の仕組みがまだ無ければ何もしない） */
export function shogiSfx(name, delay = 0) {
  try {
    return current ? current.playShogi(name, delay) : false;
  } catch {
    return false;
  }
}

/** 場面の曲がまだ鳴っていれば止める（別の曲に替わっていれば何もしない） */
export function stopGameMusic(scene) {
  try {
    if (!current) return false;
    const st = current.musicState();
    if (st.scene !== scene) return false;
    current.music(null);
    return true;
  } catch {
    return false;
  }
}

/** 場面から効果音を鳴らす（音の仕組みがまだ無ければ何もしない） */
export function gameSfx(name) {
  try {
    return current ? current.playGame(name) : false;
  } catch {
    return false;
  }
}

/** 場面から溜めの音を鳴らす（null で止める） */
export function gameCharge(v) {
  try {
    return current ? current.charge(v) : false;
  } catch {
    return false;
  }
}

/** 場面の曲がまだ選ばれていなければ選ぶ（同じなら何もしない） */
export function ensureGameMusic(scene) {
  try {
    if (!current) return false;
    const st = current.musicState();
    if (st.scene !== scene) current.music(scene);
    return true;
  } catch {
    return false;
  }
}
