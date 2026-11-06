// 真っ暗ソウルへの持ち込みアイテムの効果と「古いランタン」（three.js・DOM・Web Audio に依存しない）。
// 体力・攻撃・ソウルは無い。効果は「振りほどき・光・電池・スタミナ・足音・番号の手がかり」だけ。
const f = Object.freeze;

export const LANTERN = f({ id: 'old-lantern', name: '古いランタン' });

export const DS_ITEM_DEFAULTS = f({
  breakFree: 0, lightScale: 1, startBattery: 100, staminaBonus: 0, noiseScale: 1, fuseDigitHint: false,
});

/** 効果の項目 */
export const DS_EFFECT_KEYS = f(Object.keys(DS_ITEM_DEFAULTS));

/**
 * 既存10アイテム → 効果。
 * breakFree: 捕まっても振りほどける回数 / lightScale: 光の届く範囲 / startBattery: 最初の電池
 * staminaBonus: スタミナの上限 / noiseScale: 足音が届く距離（>1 で大きい） / fuseDigitHint: 番号の1桁目
 */
export const DS_ITEM_EFFECTS = f({
  hachimaki: f({ breakFree: 1 }),
  floppy: f({ fuseDigitHint: true }),
  agemohawk: f({ lightScale: 0.8 }),
  dekamohawk: f({ noiseScale: 1.25 }),
  movebox: f({ staminaBonus: 25 }),
  turbokart: f({ staminaBonus: 40, startBattery: 70 }),
  watergun: f({ startBattery: 60 }),
  nasukoma: f({ noiseScale: 0.85 }),
  fushigikendama: f({ lightScale: 1.2, startBattery: 50 }),
  shiori: f({ staminaBonus: 15 }),
  'sofubi-kaiju': f({ staminaBonus: 15 }),
});

/** 既定値に表の値を上書きして返す（未知・null は既定値） */
export function applyItemEffects(itemId) {
  const out = { ...DS_ITEM_DEFAULTS };
  if (typeof itemId === 'string' && Object.prototype.hasOwnProperty.call(DS_ITEM_EFFECTS, itemId)) {
    Object.assign(out, DS_ITEM_EFFECTS[itemId]);
  }
  return out;
}

/** 初クリアなら 'old-lantern'、持っていれば null */
export function lanternReward(ownedIds) {
  return Array.isArray(ownedIds) && ownedIds.includes(LANTERN.id) ? null : LANTERN.id;
}

/** 効果表（item-table.js）の params で、持ち込んだアイテムを表すキー */
export const DS_CARRY_KEY = 'dsItem';

const knownDsItem = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(DS_ITEM_EFFECTS, id);

/**
 * 持ち込みの params（{dsItem:'hachimaki', …}）か、アイテム id の文字列 → 真っ暗ソウルでのアイテム id。
 * 効果の無いもの・未知・持ち込みなしは null
 */
export function dsItemFromCarry(carry) {
  if (knownDsItem(carry)) return carry;
  if (!carry || typeof carry !== 'object') return null;
  if (knownDsItem(carry[DS_CARRY_KEY])) return carry[DS_CARRY_KEY];
  if (knownDsItem(carry.itemId)) return carry.itemId;
  return null;
}
