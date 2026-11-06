// 「データを消す」で消す保存（three.js・DOM に依存しない）。store は localStorage 互換。
// 進行・クリアの印・付け替えの色・アイテム・各ゲームの強さなどを消し、音量・おふざけ度は残す。

/** 名前が takuarinus で始まらない保存は、ここに名指しで書く（test/save-reset.test.js が突き合わせる） */
export const NAMED_SAVE_KEYS = Object.freeze(['mohawk-shogi-v1']);
export const SAVE_PREFIX = 'takuarinus';
/** 名前にこの語を含む保存は設定なので残す */
export const KEEP_WORDS = Object.freeze(['audio', 'silly', 'volume', 'sound', 'music', 'lang']);

export function isKeptSetting(key) {
  const k = String(key).toLowerCase();
  return KEEP_WORDS.some((w) => k.includes(w));
}

/** 消すべき保存か（設定は除く） */
export function isSaveKey(key) {
  if (typeof key !== 'string' || isKeptSetting(key)) return false;
  return key.indexOf(SAVE_PREFIX) === 0 || NAMED_SAVE_KEYS.includes(key);
}

/** 消した名前の配列を返す。一覧が取れない store でも名指しの分と extraKeys は消す */
export function clearSaveData(store, extraKeys = []) {
  if (!store) return [];
  const keys = [...NAMED_SAVE_KEYS, ...extraKeys];
  try {
    const n = Number(store.length) || 0;
    for (let i = 0; i < n; i++) {
      const k = store.key(i);
      if (typeof k === 'string' && !keys.includes(k)) keys.push(k);
    }
  } catch {
    // 一覧が取れなくても既知のキーは消す
  }
  const removed = [];
  for (const k of keys) {
    if (!isSaveKey(k)) continue;
    try {
      store.removeItem(k);
      removed.push(k);
    } catch {
      // 握りつぶす
    }
  }
  return removed;
}
