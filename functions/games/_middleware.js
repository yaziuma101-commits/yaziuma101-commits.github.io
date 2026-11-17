// 2本のゲーム（熟成デッキ・タクアリヌスとモヒカンの島）の HTML に「おわる」ボタン（/game-exit.js）を差しこむ。
// ゲームのファイルそのものは書き換えない。熟成デッキを新しい版に入れ替えても、ボタンはここから付き続ける。
const GAMES = ["/games/jukusei-deck/", "/games/takuarinus-island/"];
const TAG = '<script src="/game-exit.js" defer></script>';

export async function onRequest({ request, next }) {
  const res = await next();
  const path = new URL(request.url).pathname;
  const type = res.headers.get("content-type") || "";
  if (request.method !== "GET" || !type.includes("text/html") || !GAMES.some((g) => path.startsWith(g))) return res;
  return new HTMLRewriter()
    .on("body", { element(el) { el.append(TAG, { html: true }); } })
    .transform(res);
}
