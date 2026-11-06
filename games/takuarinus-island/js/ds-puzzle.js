// 真っ暗ソウルの謎（金庫の番号・手がかり・ヒューズと電池の置き場所）。
// three.js・DOM・Web Audio に依存しない。同じ種なら同じ謎になる。
import { makeRng, rngInt, shuffle } from './ds-rng.js';

const f = Object.freeze;

/** ヒューズが置かれうる部屋（このうち3つに置く） */
export const FUSE_ROOMS = f(['corridor', 'study', 'kids', 'kitchen']);
/** 電池が置かれうる部屋（このうち3つに置く） */
export const BATTERY_ROOMS = f(['corridor', 'study', 'kids', 'kitchen', 'basement']);
/** 手がかりの種類 */
export const CLUE_SOURCES = f(['clock', 'graffiti', 'calendar']);
/** 手がかりのある部屋 */
export const CLUE_ROOMS = f({ clock: 'corridor', graffiti: 'kids', calendar: 'kitchen' });

const nth = (p) => `${p + 1}桁目`;
const pad2 = (n) => String(n).padStart(2, '0');

export function clockText(hour, minute, positions) {
  return `廊下の柱時計は ${hour}時${pad2(minute)}分 で止まっている。`
    + `短い針の指す数字が${nth(positions[0])}、長い針の指す数字が${nth(positions[1])}に関係がありそうだ（12 を指していれば 0）。`;
}

export function graffitiText(count, positions) {
  const scratches = count > 0
    ? `その下に、ひっかき傷が ${count}本 ある。`
    : 'その下には、ひっかき傷はひとつもない（0本）。';
  return `子ども部屋の壁に、クレヨンで「${nth(positions[0])}は　ひっかききずの　かず」と書いてある。${scratches}`;
}

export function calendarText(day, positions) {
  return `台所のカレンダーは、${day}日 にだけ赤い丸がついている。`
    + `余白に「${nth(positions[0])}は　日にちの　いちのくらい」と小さく書いてある。`;
}

function normSeed(seed) {
  const n = Number(seed);
  return Number.isFinite(n) ? (Math.floor(n) >>> 0) : 0;
}

/** 種から謎を作る */
export function generatePuzzle(seed) {
  const sd = normSeed(seed);
  const rng = makeRng(sd);
  const digits = [0, 1, 2, 3].map(() => rngInt(rng, 10));
  const code = digits.join('');
  const digitSources = shuffle(rng, ['clock', 'clock', 'graffiti', 'calendar']);
  const clockPos = [];
  let gPos = 0;
  let cPos = 0;
  digitSources.forEach((src, i) => {
    if (src === 'clock') clockPos.push(i);
    else if (src === 'graffiti') gPos = i;
    else cPos = i;
  });
  const hd = digits[clockPos[0]];
  const hour = hd === 0 ? 12 : hd;
  const minute = digits[clockPos[1]] * 5;
  const count = digits[gPos];
  const cd = digits[cPos];
  const days = [cd, cd + 10, cd + 20].filter((x) => x >= 1 && x <= 28);
  const day = days[rngInt(rng, days.length)];
  const fuseRooms = shuffle(rng, FUSE_ROOMS).slice(0, 3);
  const batteryRooms = shuffle(rng, BATTERY_ROOMS).slice(0, 3);
  return {
    seed: sd,
    code,
    digitSources,
    clues: {
      clock: {
        room: CLUE_ROOMS.clock, hour, minute, positions: [...clockPos], text: clockText(hour, minute, clockPos),
      },
      graffiti: {
        room: CLUE_ROOMS.graffiti, count, positions: [gPos], text: graffitiText(count, [gPos]),
      },
      calendar: {
        room: CLUE_ROOMS.calendar, day, positions: [cPos], text: calendarText(day, [cPos]),
      },
    },
    fuseRooms,
    batteryRooms,
  };
}

const isInt = (v) => Number.isInteger(v);

/** 3つの手がかりから番号を復元する。欠け・重なり・範囲外は null */
export function solveCode(clues) {
  if (!clues || typeof clues !== 'object') return null;
  const { clock, graffiti, calendar } = clues;
  if (!clock || !graffiti || !calendar) return null;
  const cp = clock.positions;
  const gp = graffiti.positions;
  const kp = calendar.positions;
  if (!Array.isArray(cp) || cp.length !== 2) return null;
  if (!Array.isArray(gp) || gp.length !== 1) return null;
  if (!Array.isArray(kp) || kp.length !== 1) return null;
  const all = [...cp, ...gp, ...kp];
  if (!all.every((p) => isInt(p) && p >= 0 && p <= 3)) return null;
  if (new Set(all).size !== 4) return null;
  const { hour, minute } = clock;
  if (!isInt(hour) || hour < 1 || hour > 12) return null;
  const hDigit = hour % 12;
  if (hDigit > 9) return null;
  if (!isInt(minute) || minute < 0 || minute > 59 || minute % 5 !== 0) return null;
  const mDigit = minute / 5;
  if (mDigit > 9) return null;
  const { count } = graffiti;
  if (!isInt(count) || count < 0 || count > 9) return null;
  const { day } = calendar;
  if (!isInt(day) || day < 1 || day > 31) return null;
  const out = [null, null, null, null];
  out[cp[0]] = hDigit;
  out[cp[1]] = mDigit;
  out[gp[0]] = count;
  out[kp[0]] = day % 10;
  return out.join('');
}
