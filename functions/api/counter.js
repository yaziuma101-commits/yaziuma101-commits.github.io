// アクセスカウンター（Cloudflare Pages Functions）
// GET  /api/counter → 今の人数を返す
// POST /api/counter → 1 足してから返す（ページ側で、1回の訪問につき1回だけ送る）
// 数は KV（Pages の設定で変数名 COUNTER として結びつける）の "total" に入れる。
// KV は同時の書き込みで1つ取りこぼすことがあるが、個人サイトのカウンターには十分。
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export async function onRequest({ request, env }) {
  const kv = env.COUNTER;
  if (!kv) return reply({ error: "KV がまだ結びついていません" }, 503);
  if (request.method !== "GET" && request.method !== "POST") return reply({ error: "GET か POST だけ" }, 405);
  let count = parseInt((await kv.get("total")) || "0", 10) || 0;
  if (request.method === "POST") {
    count += 1;
    await kv.put("total", String(count));
  }
  return reply({ count });
}
