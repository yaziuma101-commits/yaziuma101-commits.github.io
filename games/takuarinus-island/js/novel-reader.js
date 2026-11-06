// 小説のページ送り（three.js・DOM・Web Audio に依存しない）。自動ではめくれない：→ で進み、← で戻る。
// 状態: {total, pageSec, page, furthest, timer, hold, finished}。元の状態は変えない。
// timer はいまのページを開いている秒数（表示用）。finished は自動めくりの名残で、常に false。
import { PAGE_SEC } from './novel-rules.js';

export function createReader(total, { pageSec = PAGE_SEC } = {}) {
  const n = Math.max(1, Math.floor(Number(total)) || 1);
  const ps = Number.isFinite(pageSec) && pageSec > 0 ? pageSec : PAGE_SEC;
  return {
    total: n, pageSec: ps, page: 0, furthest: 0, timer: 0, hold: 0, finished: false,
  };
}

/** 時間を進める。ページは変えない（自分でめくる）。hold の間はタイマーを止める */
export function tickReader(reader, dt, { speed = 1 } = {}) {
  if (!reader || reader.finished) return reader;
  const h = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (reader.hold > 0) return { ...reader, hold: Math.max(0, reader.hold - h) };
  const sp = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return { ...reader, timer: reader.timer + h * sp };
}

/** → キー／クリック。1ページ進んでタイマーを 0 に。最終ページでは進まない */
export function nextPage(reader) {
  if (!reader || reader.page >= reader.total - 1) return reader;
  const page = reader.page + 1;
  return {
    ...reader, page, furthest: Math.max(reader.furthest, page), timer: 0,
  };
}

/** ← キー。1ページ戻ってタイマーを 0 に。furthest は下がらない */
export function prevPage(reader) {
  if (!reader || reader.page <= 0) return reader;
  return { ...reader, page: reader.page - 1, timer: 0 };
}

/** しおり：pages 前へ瞬時に戻り、hold 秒止まる */
export function bookmarkJump(reader, { pages = 2, hold = 3 } = {}) {
  if (!reader) return reader;
  return {
    ...reader, page: Math.max(0, reader.page - pages), timer: 0, hold,
  };
}
