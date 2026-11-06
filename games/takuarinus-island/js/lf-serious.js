// レバガチャファイターヌスは真剣勝負。おふざけ度に関係なく、ふざけた出来事・擬音・ふざけた効果音を出さない。
// three.js・DOM・Web Audio に依存しない。

export const LF_SERIOUS = true;

/** このゲームの中で使うおふざけ度（常に 0） */
export function effectiveSillyLevel() {
  return 0;
}

/** ふざけた出来事を起こしてよいか（常に false） */
export function sillyEventsAllowed() {
  return false;
}
