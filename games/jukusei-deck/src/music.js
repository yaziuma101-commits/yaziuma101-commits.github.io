// 音楽を鳴らす（曲は data/music.js）。少し先までの音を予約していく（ずれない鳴らし方）。
// 音を消している間とブラウザが音を許す前は、何もしない。
import TRACKS from "../data/music.js";
import { audio } from "./sfx.js";

const AHEAD = 0.25, VOL = 0.45;
let cur = null, step = 0, next = 0, bus = null, busAc = null, timer = null;
const freq = n => 261.63 * Math.pow(2, n / 12);

function note(ac, wave, n, t, dur, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = wave; o.frequency.value = freq(n);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
}
function drum(A, kind, t) {
  const ac = A.ac;
  if (kind === "x") {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.17);
  } else if (kind === "o" && A.noise) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = A.noise; f.type = "highpass"; f.frequency.value = 1500;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, 0.1); s.stop(t + 0.1);
  }
}
function tick() {
  const A = audio();
  if (!A || !cur) { next = 0; return; }
  if (busAc !== A.ac) { busAc = A.ac; bus = A.ac.createGain(); bus.gain.value = VOL; bus.connect(A.out); }
  const T = TRACKS[cur], beat = 60 / T.bpm / 2, n = T.lead.notes.length;
  if (next < A.ac.currentTime) next = A.ac.currentTime + 0.05;
  while (next < A.ac.currentTime + AHEAD) {
    for (const part of [T.lead, T.bass]) {
      const x = part.notes[step % part.notes.length];
      if (x != null) note(A.ac, part.wave, x, next, beat * 2 * part.len, part.vol);
    }
    const d = T.drum[step % T.drum.length];
    if (d !== ".") drum(A, d, next);
    step = (step + 1) % n; next += beat;
  }
}
export const Music = {
  // 曲を切り替える（同じ曲なら続ける）。null で止める
  play(name) {
    if (name === cur) return;
    cur = name && TRACKS[name] ? name : null; step = 0; next = 0;
    if (!timer) timer = setInterval(tick, 60);
  },
};
