// エンディングの規則（three.js・Web Audio・DOM に依存しない）。storage は引数で受け取る。
export const REQUIRED_MOHAWKS = 3;
const COLOR_IDS = Object.freeze(['red', 'yellow', 'green']);
const CLEARED_KEY = 'takuarinus-cleared';

/** 所持モヒカン色の配列から、エンディングを始めるかを決める（重複・未知の id は数えない） */
export function evaluateEnding(ownedColors) {
  const set = new Set();
  for (const id of Array.isArray(ownedColors) ? ownedColors : []) {
    if (COLOR_IDS.includes(id)) set.add(id);
  }
  const remaining = Math.max(0, REQUIRED_MOHAWKS - set.size);
  const start = remaining === 0;
  return { start, remaining, message: start ? '' : `あと${remaining}個だね` };
}

/** ボスのモヒカン色 id（colorKey 'mohicanGreen' → 'green'）。未知なら null */
export function colorIdOfBoss(boss) {
  const key = boss && boss.mohican && typeof boss.mohican.colorKey === 'string' ? boss.mohican.colorKey : '';
  const id = key.replace(/^mohican/, '').toLowerCase();
  return COLOR_IDS.includes(id) ? id : null;
}

/** 撃破済みのボス id から所持色の配列を作る（ボスの並び順） */
export function ownedColorsFrom(bosses, defeatedIds) {
  const ids = Array.isArray(defeatedIds) ? defeatedIds : [];
  const out = [];
  for (const b of Array.isArray(bosses) ? bosses : []) {
    if (!b || !ids.includes(b.id)) continue;
    const c = colorIdOfBoss(b);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function loadCleared(storage) {
  try {
    return storage.getItem(CLEARED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCleared(storage) {
  try {
    storage.setItem(CLEARED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function clearCleared(storage) {
  try {
    if (typeof storage.removeItem === 'function') storage.removeItem(CLEARED_KEY);
    return true;
  } catch {
    return false;
  }
}

export const ENDING_CAPTION = 'タクアリヌスは モヒカンの王様に なった！';

export const CREDITS_LINES = Object.freeze([
  'タクアリヌスとモヒカンの島',
  '',
  'キャラクターデザイン：タクアリヌス',
  '',
  'ゲーム制作：Claude Code',
  '',
  '',
  'Thank you for playing!',
]);

export const CELEBRATE_SECONDS = 14;
export const CREDITS_SECONDS = 24;

/** 進行の状態機械: celebrate → credits → done */
export function createEnding() {
  let elapsed = 0;
  let skipped = false;
  const phaseOf = () => {
    if (skipped || elapsed >= CELEBRATE_SECONDS + CREDITS_SECONDS) return 'done';
    if (elapsed >= CELEBRATE_SECONDS) return 'credits';
    return 'celebrate';
  };
  return {
    get phase() { return phaseOf(); },
    get finished() { return phaseOf() === 'done'; },
    get creditsProgress() {
      const p = phaseOf();
      if (p === 'celebrate') return 0;
      if (p === 'done') return 1;
      return Math.min(1, Math.max(0, (elapsed - CELEBRATE_SECONDS) / CREDITS_SECONDS));
    },
    update(dt) {
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
      if (phaseOf() === 'done') return;
      elapsed += dt;
    },
    /** スタッフロール中だけ飛ばせる（祝いの最中の Enter は誤爆防止のため無視） */
    skip() {
      if (phaseOf() === 'credits') skipped = true;
    },
  };
}
