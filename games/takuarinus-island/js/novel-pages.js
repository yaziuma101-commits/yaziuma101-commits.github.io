// 小説の文字の正規化・ページ分け・根拠ページ（three.js・DOM・Web Audio に依存しない）。
// 文字数は正規化後のコードポイント数で数える。

export const PAGE_MIN = 150;
export const PAGE_MAX = 200;
const STOP = '。';

/** 全空白（改行・全角スペース・タブを含む）を除く */
export function normalizeText(text) {
  return String(text ?? '').replace(/\s+/gu, '');
}

/** 残り R 字を [min,max] のページに分けられるか */
export function remainderOk(R, min = PAGE_MIN, max = PAGE_MAX) {
  return R === 0 || (R > 0 && Math.ceil(R / max) <= Math.floor(R / min));
}

/** 全ページを「。」の直後で区切れるならその分け方（各ページはなるべく後ろで切る）。無理なら null */
function stopSplit(chars, min, max) {
  const N = chars.length;
  const cut = new Uint8Array(N + 1);
  cut[N] = 1;
  for (let i = 1; i < N; i++) if (chars[i - 1] === STOP) cut[i] = 1;
  const seg = new Uint8Array(N + 1);
  seg[N] = 1;
  for (let p = N - 1; p >= 0; p--) {
    if (p !== 0 && !cut[p]) continue;
    const hi = Math.min(N, p + max);
    for (let q = p + min; q <= hi; q++) {
      if (cut[q] && seg[q]) {
        seg[p] = 1;
        break;
      }
    }
  }
  if (!seg[0]) return null;
  const pages = [];
  let p = 0;
  while (p < N) {
    let q = Math.min(N, p + max);
    while (q >= p + min && !(cut[q] && seg[q])) q--;
    if (q < p + min) return null;
    pages.push(chars.slice(p, q).join(''));
    p = q;
  }
  return pages;
}

/** 句点で区切りきれないとき：残りが分けられる終端のうち最後の「。」、無ければ均等割り */
function greedySplit(chars, min, max) {
  const N = chars.length;
  const pages = [];
  let p = 0;
  while (p < N) {
    const T = N - p;
    if (T <= max) {
      pages.push(chars.slice(p).join(''));
      break;
    }
    let c = -1;
    for (let k = max; k >= min; k--) {
      if (!remainderOk(T - k, min, max)) continue;
      if (chars[p + k - 1] === STOP) {
        c = k;
        break;
      }
    }
    if (c < 0) {
      const n = Math.ceil(T / max);
      c = Math.max(1, Math.floor(T / n));
    }
    pages.push(chars.slice(p, p + c).join(''));
    p += c;
  }
  return pages;
}

/** 正規化した本文をページに分ける。全ページを連結すると正規化テキストに一致する */
export function paginate(text, { min = PAGE_MIN, max = PAGE_MAX } = {}) {
  const chars = [...normalizeText(text)];
  if (!chars.length) return [];
  if (chars.length < min) return [chars.join('')];
  return stopSplit(chars, min, max) || greedySplit(chars, min, max);
}

/** question.evidence を含むページの index（0 始まり）。無ければ -1 */
export function evidencePageIndex(story, question) {
  const ev = normalizeText(question && question.evidence);
  if (!ev || !story) return -1;
  return paginate(story.text).findIndex((p) => p.includes(ev));
}
