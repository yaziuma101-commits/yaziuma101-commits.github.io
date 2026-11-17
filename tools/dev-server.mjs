// 手元で確かめるためのサーバー（Cloudflare Pages の代わり）。
// 静的なファイルを配り、/api/〇〇 は functions/api/〇〇.js を呼ぶ。KV はメモリの中（止めると消える）。
// 使い方: node tools/dev-server.mjs [ポート]   既定 8766
// 管理用の鍵（足あと帳を消す）は、手元では環境変数 BBS_ADMIN_KEY（無ければ "local-test"）。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8766;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".fbx": "application/octet-stream", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8" };

const store = new Map();
const KV = {
  async get(k) { const v = store.get(k); if (!v) return null; if (v.until && Date.now() > v.until) { store.delete(k); return null; } return v.value; },
  async put(k, value, opt = {}) { store.set(k, { value: String(value), until: opt.expirationTtl ? Date.now() + opt.expirationTtl * 1000 : 0 }); },
};
const env = { COUNTER: KV, BBS_ADMIN_KEY: process.env.BBS_ADMIN_KEY || "local-test" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/g, "");
      const mod = await import(pathToFileURL(join(ROOT, "functions", "api", name + ".js")).href);
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers(req.headers);
      headers.set("cf-connecting-ip", req.socket.remoteAddress || "local");
      const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const r = await mod.onRequest({ request, env });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^[\/]+/, "");
    let file = join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error("外");
    let s = await stat(file).catch(() => null);
    if (s && s.isDirectory()) { file = join(file, "index.html"); s = await stat(file).catch(() => null); }
    if (!s && !extname(file)) { file += ".html"; s = await stat(file).catch(() => null); }
    if (!s) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://localhost:${PORT}`));
