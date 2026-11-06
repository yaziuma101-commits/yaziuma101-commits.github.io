// ハブの門に入るときの流れ（three.js・DOM に依存しない）。
// 持ち込むアイテムを選ぶ（chooseCarry）→ そのボスの部屋へ移る（goto('room', {bossId, carry})）。
// 移れなかったとき（キャンセル・goto が偽・例外）は onFail を1回だけ呼ぶ。

import { rememberGateCarry, forgetGateCarry } from './gate-carry.js';

/**
 * @param gate {id}
 * @param opts.chooseCarry (gameId, onChosen(entry|null), onCancel) か null
 * @param opts.goto (key, params) => 真なら移れた
 * @param opts.gameIdOf ボス id → ゲーム id（省略時はボス id のまま）
 * @param opts.onFail 移れなかったときに呼ぶ
 * @returns 流れを始められたら true
 */
export function enterBossGate(gate, {
  chooseCarry = null, goto = null, gameIdOf = null, onFail = null,
} = {}) {
  let settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    if (typeof onFail === 'function') {
      try { onFail(); } catch { /* 握りつぶす */ }
    }
  };
  const bossId = gate && typeof gate.id === 'string' ? gate.id : null;
  if (!bossId || typeof goto !== 'function') {
    fail();
    return false;
  }
  let gameId = bossId;
  if (typeof gameIdOf === 'function') {
    try { gameId = gameIdOf(bossId) || bossId; } catch { gameId = bossId; }
  }
  const go = (entry) => {
    if (settled) return;
    const carry = entry && entry.params && typeof entry.params === 'object' ? entry.params : {};
    // 部屋でボスに話しかけたとき、もう一度選ばせないためにおぼえておく
    rememberGateCarry(gameId, entry);
    if (bossId !== gameId) rememberGateCarry(bossId, entry);
    let ok = false;
    try {
      ok = !!goto('room', { bossId, carry });
    } catch {
      ok = false;
    }
    if (!ok) {
      forgetGateCarry(gameId);
      forgetGateCarry(bossId);
      fail();
      return;
    }
    settled = true;
    if (entry && typeof entry.announce === 'function') {
      try { entry.announce(); } catch { /* 握りつぶす */ }
    }
  };
  if (typeof chooseCarry !== 'function') {
    go(null);
    return true;
  }
  try {
    chooseCarry(gameId, go, fail);
  } catch {
    fail();
  }
  return true;
}
