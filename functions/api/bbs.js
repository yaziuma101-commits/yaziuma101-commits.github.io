// 足あと帳（掲示板）。Cloudflare Pages Functions。
// GET    /api/bbs           → 新しい順に最大 100 件
// POST   /api/bbs           → 書き込む（JSON: name, msg, stamp, hp）
// DELETE /api/bbs?id=…      → 消す（管理用。ヘッダー X-Admin-Key に、Pages の設定の BBS_ADMIN_KEY と同じ文字列）
// KV はカウンターと同じもの（変数名 COUNTER）を使い、キーの名前で分ける（bbs:list, bbs:wait:…）。
// 文字は保存したまま返し、表示するページ側で textContent に入れる（HTML として解釈させない）。
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const LIMITS = { name: 16, msg: 140, keep: 100, waitSec: 60 };
const STAMPS = ["aoi", "kin", "oko", "nemui", "niji", "yaa"];
// URL らしきものは書けない（宣伝よけ）
const URL_LIKE = /(https?:|www\.|:\/\/|\.(com|net|org|jp|io|ru|cn|xyz|info|biz|me|co)\b|ｈｔｔｐ)/i;
// 目に見えない文字や制御文字は消す
const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, "").trim();

function check(body) {
  const name = clean(body.name) || "名なしのモヒカン";
  const msg = clean(body.msg);
  const stamp = STAMPS.includes(body.stamp) ? body.stamp : "aoi";
  if (body.hp) return { error: "書き込めませんでした" }; // 人には見えない欄に何か入っていたら機械とみなす
  if (!msg) return { error: "ひとことを書いてください" };
  if ([...name].length > LIMITS.name) return { error: `お名前は ${LIMITS.name} 文字まで` };
  if ([...msg].length > LIMITS.msg) return { error: `ひとことは ${LIMITS.msg} 文字まで` };
  if (URL_LIKE.test(name + " " + msg)) return { error: "URL は書けません" };
  return { entry: { name, msg, stamp } };
}

async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
async function load(kv) {
  try { return JSON.parse((await kv.get("bbs:list")) || "[]"); } catch { return []; }
}

export async function onRequest({ request, env }) {
  const kv = env.COUNTER;
  if (!kv) return reply({ error: "まだ準備中です" }, 503);
  const url = new URL(request.url);

  if (request.method === "GET") return reply({ list: await load(kv) });

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return reply({ error: "書き込めませんでした" }, 400); }
    const r = check(body || {});
    if (r.error) return reply({ error: r.error }, 400);
    // 連投よけ: 同じ人（IP を伏せた印）は 60 秒あける
    const who = await sha((request.headers.get("cf-connecting-ip") || "local") + "takuan-bbs");
    const waitKey = "bbs:wait:" + who;
    if (await kv.get(waitKey)) return reply({ error: "少し時間をあけてから書いてください（1分）" }, 429);
    await kv.put(waitKey, "1", { expirationTtl: LIMITS.waitSec });
    const list = await load(kv);
    const now = new Date(Date.now() + 9 * 3600 * 1000); // 日本時間
    const entry = { id: crypto.randomUUID().slice(0, 8), at: now.toISOString().slice(0, 16).replace("T", " "), ...r.entry };
    list.unshift(entry);
    await kv.put("bbs:list", JSON.stringify(list.slice(0, LIMITS.keep)));
    return reply({ ok: true, entry });
  }

  if (request.method === "DELETE") {
    const key = env.BBS_ADMIN_KEY;
    if (!key || !sameText(request.headers.get("x-admin-key") || "", key)) return reply({ error: "消す鍵が違います" }, 403);
    const id = url.searchParams.get("id");
    const list = await load(kv);
    const next = list.filter((e) => e.id !== id);
    if (next.length === list.length) return reply({ error: "見つかりません" }, 404);
    await kv.put("bbs:list", JSON.stringify(next));
    return reply({ ok: true });
  }

  return reply({ error: "使えない方法です" }, 405);
}
