// 手書きの絵の中の文字は絵のままにして、英語のときだけ説明を添える（依頼者の指定 2026-11-04）。
/** 絵の id → 絵に書いてある文字の英語の説明 */
export const PAINTING_TEXT_EN = Object.freeze({
  takakute: "The writing is a made-up song: \"Too high to reach — where love goes, and the goddesses' donut… everyone gathers round… a lovely fluttering heart… hmm-hm-hmmm, fu-fuun-nus♪\"",
  junban: "Read right to left: \"I'll shuffle the cards.\" → \"Your card is… this one, right?\" → (the cards slip away) → \"Oh, THIS one!\"",
  'kami-nobita': 'The writing says: "My hair grew."',
  otabe: 'The writing says: "Otabe" — here, have a bite!',
  safe: 'The writing says: "Safe!"',
  single: 'The writing says: "Single."',
});

/** 英語のときに添える説明（無ければ空） */
export function paintingNoteEn(paintingId) {
  return PAINTING_TEXT_EN[paintingId] || '';
}
