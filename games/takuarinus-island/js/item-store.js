// アイテムの所持・持ち込みの選択・保存と移行（three.js・DOM に依存しない）。すべて不変更新。
import { ITEMS } from './item-table.js';

// 保存先の名前（値は 'takuarinus-items-v1'）。部品をつないで作る
export const ITEM_STORAGE_KEY = ['takuarinus', 'items', 'v1'].join('-');
export const NO_CARRY_LABEL = '持ち込まない';

export function createItemState() {
  return { owned: [], carry: null };
}

const ownedOf = (s) => (s && Array.isArray(s.owned) ? s.owned : []);
const carryOf = (s) => (s && typeof s.carry === 'string' ? s.carry : null);

/** クリアしたゲームのアイテムを足す（冪等） */
export function grantItemForClear(state, gameId, { items = ITEMS } = {}) {
  const owned = [...ownedOf(state)];
  for (const it of items) {
    if (it.fromGame === gameId && !owned.includes(it.id)) owned.push(it.id);
  }
  return { owned, carry: carryOf(state) };
}

/** 持ち込むアイテムを1つ選ぶ（null で解除）。未所持は Error */
export function selectCarry(state, itemId, { items = ITEMS } = {}) {
  const owned = [...ownedOf(state)];
  if (itemId === null || itemId === undefined) return { owned, carry: null };
  if (!items.some((i) => i.id === itemId) || !owned.includes(itemId)) {
    throw new Error(`持っていないアイテム: ${itemId}`);
  }
  return { owned, carry: itemId };
}

export function serializeItems(state) {
  return { v: 1, owned: [...ownedOf(state)], carry: carryOf(state) };
}

/** 保存データを読む。壊れていれば新規。clearedGames のアイテムを統合する（既存セーブの移行） */
export function loadItemState(raw, { clearedGames = [], items = ITEMS } = {}) {
  let state = createItemState();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.owned)) {
    const known = items.map((i) => i.id);
    const owned = [];
    for (const id of raw.owned) {
      if (typeof id === 'string' && known.includes(id) && !owned.includes(id)) owned.push(id);
    }
    const carry = typeof raw.carry === 'string' && owned.includes(raw.carry) ? raw.carry : null;
    state = { owned, carry };
  }
  for (const g of Array.isArray(clearedGames) ? clearedGames : []) {
    state = grantItemForClear(state, g, { items });
  }
  return state;
}

/** 選択肢（所持アイテムを定義順に＋「持ち込まない」）と、いま選ばれている位置 */
export function carryChoices(state, { items = ITEMS } = {}) {
  const owned = ownedOf(state);
  const choices = items.filter((i) => owned.includes(i.id)).map((i) => ({ id: i.id, label: i.name }));
  choices.push({ id: null, label: NO_CARRY_LABEL });
  const at = choices.findIndex((c) => c.id === carryOf(state));
  return { choices, index: at >= 0 ? at : choices.length - 1 };
}
