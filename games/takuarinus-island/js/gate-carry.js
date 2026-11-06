// 門で選んだ持ち込みアイテムを、その部屋にいる間おぼえておく（three.js・DOM に依存しない）。
// 門（hub-gate-entry.js）で選んだら remember、部屋でボスに話しかけたときは
// chooseWithGateCarry を通すと、おぼえている選択をそのまま使い、もう一度は選ばせない。

function copyEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const params = entry.params && typeof entry.params === 'object' ? { ...entry.params } : {};
  // 効果の告知は門で済んでいるので、部屋では出さない
  return { ...entry, params, announce: null };
}

export function createGateCarryStore() {
  const map = new Map();
  return {
    /** entry は {params, …} か null（持ち込まない） */
    remember(id, entry) {
      if (typeof id !== 'string' || !id) return false;
      map.set(id, copyEntry(entry));
      return true;
    },
    /** id を省くと全部消す */
    forget(id) {
      if (id === undefined) map.clear();
      else map.delete(id);
    },
    has(id) {
      return map.has(id);
    },
    /** おぼえている選択（未登録は undefined、持ち込まないは null） */
    get(id) {
      return map.has(id) ? copyEntry(map.get(id)) : undefined;
    },
  };
}

const shared = createGateCarryStore();

export const rememberGateCarry = (id, entry) => shared.remember(id, entry);
export const forgetGateCarry = (id) => shared.forget(id);
export const hasGateCarry = (id) => shared.has(id);
export const gateCarryFor = (id) => shared.get(id);

/**
 * 門で選び済みならその選択で onChosen を呼ぶ（chooser は呼ばない）。
 * 選んでいなければ chooser(gameId, onChosen, onCancel) に任せる。chooser も無ければ持ち込みなし。
 */
export function chooseWithGateCarry(gameId, onChosen, onCancel, chooser, store = shared) {
  if (store.has(gameId)) {
    if (typeof onChosen === 'function') onChosen(store.get(gameId));
    return true;
  }
  if (typeof chooser === 'function') return chooser(gameId, onChosen, onCancel);
  if (typeof onChosen === 'function') onChosen(null);
  return true;
}
