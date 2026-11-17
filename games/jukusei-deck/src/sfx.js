// 効果音。生成AIも音の素材も使わず、WebAudio の波形と雑音で鳴らす。
// ブラウザは最初のクリックまで音を出させないので、unlock() をクリックで呼ぶ。
let ac = null, out = null, noiseBuf = null, muted = false;
try { muted = localStorage.getItem("jukusei-mute") === "1"; } catch { /* 保存できなくても鳴らす */ }
const VOL = 0.32;

export function unlock() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!C) return;
  ac = new C();
  out = ac.createGain(); out.gain.value = muted ? 0 : VOL;
  // 角を少し丸める（ピコピコが耳に痛くならないように）
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6000;
  out.connect(lp); lp.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const isMuted = () => muted;
// 音楽（src/music.js）が使う。音を許す前・消している間は null
export const audio = () => (ac && !muted ? { ac, out, noise: noiseBuf } : null);
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem("jukusei-mute", muted ? "1" : "0"); } catch { /* 無視 */ }
  if (out) out.gain.value = muted ? 0 : VOL;
}

// 音1つ：波形・高さ（始め→終わり）・長さ・大きさ・遅れ（秒）。vib は揺らぎ（腐った音）
function tone(type, f0, f1, dur, vol = 0.4, at = 0, vib = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 9; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
// 雑音：帯域を f0→f1 へ動かす（札の擦れ・打撃・泡）
function hiss(dur, vol = 0.4, at = 0, f0 = 2000, f1 = 400, q = 1) {
  if (!ac || muted) return;
  const t = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const notes = (type, fs, step, dur, vol, at = 0) => fs.forEach((f, i) => tone(type, f, f, dur, vol, at + i * step));
// 五音（ド レ ミ ソ ラ）で明るく
const N = { C4: 262, D4: 294, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047 };

export const SFX = {
  click: () => tone("square", 880, 660, 0.04, 0.15),
  card: () => { hiss(0.09, 0.35, 0, 3000, 900, 0.8); tone("triangle", 520, 780, 0.06, 0.15) },
  hit: n => {
    const big = n >= 12;
    tone("square", big ? 200 : 300, 50, big ? 0.28 : 0.13, big ? 0.45 : 0.35);
    hiss(big ? 0.25 : 0.1, big ? 0.6 : 0.4, 0, 1800, 150, 0.6);
    if (big) tone("sawtooth", 90, 40, 0.35, 0.3, 0.02);
  },
  blocked: () => { tone("triangle", 1200, 1100, 0.09, 0.25); tone("square", 600, 580, 0.05, 0.12) },
  hurt: () => { tone("sawtooth", 180, 45, 0.28, 0.4); hiss(0.18, 0.5, 0, 900, 120, 0.5) },
  guard: () => { tone("triangle", 660, 660, 0.06, 0.25); tone("triangle", 990, 990, 0.1, 0.2, 0.05) },
  heal: () => notes("sine", [N.C5, N.E5, N.G5], 0.06, 0.12, 0.25),
  poison: () => { for (let i = 0; i < 4; i++) tone("sine", 300 + i * 90, 700 + i * 120, 0.06, 0.2, i * 0.05) },
  age: () => tone("sine", 520, 780, 0.07, 0.12),
  rot: () => { tone("sawtooth", 330, 80, 0.45, 0.28, 0, 18); hiss(0.4, 0.2, 0.05, 600, 150, 2) },
  ferment: () => {                                   // 腐った札が化ける：泡が立ち、上がっていく
    for (let i = 0; i < 6; i++) tone("sine", 200 + i * 60, 500 + i * 140, 0.07, 0.22, i * 0.045);
    notes("square", [N.C5, N.E5, N.G5, N.C6], 0.07, 0.12, 0.18, 0.28);
  },
  mold: () => { tone("sawtooth", 140, 100, 0.35, 0.22, 0, 12); hiss(0.3, 0.25, 0, 400, 200, 3) },
  steal: () => { tone("square", 1100, 1500, 0.08, 0.2); tone("square", 1000, 1400, 0.1, 0.2, 0.12) },
  compost: () => { hiss(0.2, 0.45, 0, 500, 90, 0.7); tone("sine", 120, 60, 0.2, 0.3) },
  fresh: () => notes("triangle", [N.G5, N.E5, N.A5], 0.05, 0.08, 0.2),
  turn: () => { tone("triangle", 392, 392, 0.07, 0.15); tone("triangle", 523, 523, 0.09, 0.15, 0.07) },
  win: () => notes("square", [N.C5, N.E5, N.G5, N.E5, N.G5, N.C6], 0.09, 0.16, 0.2),
  reward: () => notes("triangle", [N.G4, N.C5, N.E5], 0.06, 0.1, 0.22),
  lose: () => notes("triangle", [N.G4, N.E4, N.D4, N.C4], 0.16, 0.3, 0.25),
  boss: () => { tone("sawtooth", 110, 55, 0.6, 0.35); hiss(0.5, 0.4, 0, 300, 80, 0.8); notes("square", [N.A4, N.E4, N.A4], 0.14, 0.2, 0.15, 0.25) },
  clear: () => notes("square", [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.G5, N.C6], 0.1, 0.2, 0.2),
};
