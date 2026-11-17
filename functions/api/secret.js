// 隠しページを見つけた人数。GET で人数、POST で 1 足す（ページ側で、同じブラウザからは1回だけ送る）。
// KV はカウンターと同じもの（変数名 COUNTER）。キーは "secret:total"。
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export async function onRequest({ request, env }) {
  const kv = env.COUNTER;
  if (!kv) return reply({ error: "まだ準備中です" }, 503);
  if (request.method !== "GET" && request.method !== "POST") return reply({ error: "GET か POST だけ" }, 405);
  let count = parseInt((await kv.get("secret:total")) || "0", 10) || 0;
  if (request.method === "POST") {
    count += 1;
    await kv.put("secret:total", String(count));
  }
  return reply({ count });
}
