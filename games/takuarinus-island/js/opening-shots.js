// オープニングのカット割り（three.js・DOM に依存しない）。カメラは映画のように動く。
// 各カット: dur（秒）、from/to（カメラの位置と注視点）、roll（傾き・ラジアン）、fov、
// sub（[話し手, ことば]）、caption（大きな見出し）、mood（'day' | 'flashback'）、act（場面の動き）。
import { OPENING_LINES } from './story.js';

const v = (x, y, z) => Object.freeze({ x, y, z });
const shot = (o) => Object.freeze(o);

// 配置: 主人公 (0,0,5)、先輩 (0,0,1.4)、番長3人は回想で台座の奥 (-3〜3, -3)
export const OPENING_SHOTS = Object.freeze([
  shot({ // 1. 海の上から島へ寄っていく空撮
    dur: 5, from: { pos: v(-38, 22, 40), look: v(0, 0, 0) }, to: { pos: v(-14, 9, 16), look: v(0, 1, 2) },
    fov: 50, caption: 'タクアリヌスとモヒカンの島', mood: 'day', act: 'idle',
  }),
  shot({ // 2. 主人公の背中越しに先輩（ドリーイン）
    dur: 4.5, from: { pos: v(1.6, 1.4, 10), look: v(0, 1.4, 1.4) }, to: { pos: v(0.9, 1.6, 7.2), look: v(0, 1.5, 1.4) },
    fov: 45, sub: ['先輩アリヌス', OPENING_LINES[0]], mood: 'day', act: 'idle',
  }),
  shot({ // 3. 先輩を下から見上げる（深刻な話）
    dur: 5, from: { pos: v(-3.2, 0.45, 4.2), look: v(0, 1.9, 1.4) }, to: { pos: v(-2.6, 0.5, 3.7), look: v(0, 2, 1.4) },
    fov: 42, roll: 0.06, sub: ['先輩アリヌス', OPENING_LINES[1]], mood: 'day', act: 'senpaiTalk',
  }),
  shot({ // 4. 回想: 番長たちが仲間をさらう（傾いた画面・手持ちの揺れ）
    dur: 6, from: { pos: v(10, 3.2, 7), look: v(0, 1, -3) }, to: { pos: v(6, 2, 9), look: v(0, 1, -7) },
    fov: 55, roll: -0.18, shake: 0.06, sub: ['先輩アリヌス', OPENING_LINES[2]], mood: 'flashback', act: 'kidnap',
  }),
  shot({ // 5. 主人公の顔に寄る（決意）
    dur: 4, from: { pos: v(0.4, 1.6, 2.6), look: v(0, 1.5, 5) }, to: { pos: v(0.2, 1.6, 3.4), look: v(0, 1.5, 5) },
    fov: 35, sub: ['先輩アリヌス', OPENING_LINES[3]], mood: 'day', act: 'heroFist',
  }),
  shot({ // 6. クレーンで上がり、3つの門を見渡す
    dur: 5, from: { pos: v(0, 2, 9), look: v(0, 1.5, 0) }, to: { pos: v(0, 20, 14), look: v(0, 0, -4) },
    fov: 55, caption: '仲間を助けに行こう！', mood: 'day', act: 'heroFist',
  }),
]);

export const OPENING_TOTAL = OPENING_SHOTS.reduce((a, s) => a + s.dur, 0);

const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const lerpV = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });

/** 経過秒 → いまのカットと、カメラ（位置・注視点・傾き・fov）。最後を過ぎたら done */
export function openingAt(t) {
  let acc = 0;
  for (let i = 0; i < OPENING_SHOTS.length; i++) {
    const s = OPENING_SHOTS[i];
    if (t < acc + s.dur) {
      const k = ease(Math.max(0, (t - acc) / s.dur));
      return {
        index: i, shot: s, k, local: t - acc, done: false,
        pos: lerpV(s.from.pos, s.to.pos, k), look: lerpV(s.from.look, s.to.look, k), roll: s.roll || 0, fov: s.fov || 60,
      };
    }
    acc += s.dur;
  }
  const s = OPENING_SHOTS[OPENING_SHOTS.length - 1];
  return {
    index: OPENING_SHOTS.length - 1, shot: s, k: 1, local: s.dur, done: true, pos: s.to.pos, look: s.to.look, roll: s.roll || 0, fov: s.fov || 60,
  };
}

/** Enter で次のカットの頭へ（いまのカットの始まりの秒を足して返す） */
export function nextShotStart(t) {
  let acc = 0;
  for (const s of OPENING_SHOTS) {
    acc += s.dur;
    if (t < acc - 0.05) return acc;
  }
  return OPENING_TOTAL;
}
