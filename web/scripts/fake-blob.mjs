#!/usr/bin/env node
/**
 * A tiny stand-in for the Vercel Blob API, for LOCAL hard tests only (no network, nothing leaves this machine).
 * Point the app at it with VERCEL_BLOB_API_URL / NEXT_PUBLIC_VERCEL_BLOB_API_URL = http://127.0.0.1:3200 and a made-up
 * BLOB_READ_WRITE_TOKEN (vercel_blob_rw_<store>_<secret>). Supports put, multipart put, delete, and GET of what was stored.
 *   node scripts/fake-blob.mjs [port]
 */
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { readFileSync } from "node:fs";

const port = Number(process.argv[2] || process.env.FAKE_BLOB_PORT || 3200);
// Browsers only stream an upload body over HTTP/2, so with FAKE_BLOB_TLS_KEY/CERT the stand-in speaks https + h2 (self-signed, local only).
const tls = process.env.FAKE_BLOB_TLS_KEY && process.env.FAKE_BLOB_TLS_CERT ? { key: readFileSync(process.env.FAKE_BLOB_TLS_KEY), cert: readFileSync(process.env.FAKE_BLOB_TLS_CERT), allowHTTP1: true } : null;
const base = `${tls ? "https" : "http"}://127.0.0.1:${port}`;
const files = new Map(); // pathname -> { buf, type }
const parts = new Map(); // uploadId -> { path, type, parts: Map }
let n = 0;

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS", "access-control-expose-headers": "*" };
const send = (res, code, body, extra = {}) => { res.writeHead(code, { ...cors, "content-type": "application/json", ...extra }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, no) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); req.on("error", no); });
const meta = (p) => ({ url: `${base}/${p}`, downloadUrl: `${base}/${p}?download=1`, pathname: p, contentType: files.get(p).type, contentDisposition: "inline", etag: `"e${++n}"` });

(tls ? (h) => createSecureServer(tls, h) : createServer)(async (req, res) => {
  const u = new URL(req.url, `${base}`);
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method === "GET" && u.pathname !== "/" && u.pathname !== "/delete" && !u.pathname.startsWith("/_")) {
    const p = decodeURIComponent(u.pathname.slice(1));
    const f = files.get(p);
    if (!f) return send(res, 404, { error: "not found" });
    res.writeHead(200, { ...cors, "content-type": f.type }); return res.end(f.buf);
  }
  if (req.method === "POST" && u.pathname === "/delete") {
    const { urls } = JSON.parse((await readBody(req)).toString() || "{}");
    for (const x of urls ?? []) files.delete(decodeURIComponent(String(x).replace(/^https?:\/\/[^/]+\//, "")));
    return send(res, 200, {});
  }
  if (req.method === "PUT") {
    const path = u.searchParams.get("pathname") ?? "";
    const action = req.headers["x-mpu-action"];
    const type = String(req.headers["x-content-type"] || "application/octet-stream");
    if (action === "create") { const id = `u${++n}`; parts.set(id, { path, type, parts: new Map() }); return send(res, 200, { uploadId: id, key: path }); }
    if (action === "upload") { const m = parts.get(String(req.headers["x-mpu-upload-id"])); const num = Number(req.headers["x-mpu-part-number"]); m.parts.set(num, await readBody(req)); return send(res, 200, { etag: `p${num}` }); }
    if (action === "complete") {
      const m = parts.get(String(req.headers["x-mpu-upload-id"])); await readBody(req);
      files.set(m.path, { buf: Buffer.concat([...m.parts.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1])), type: m.type }); parts.delete(String(req.headers["x-mpu-upload-id"]));
      return send(res, 200, meta(m.path));
    }
    files.set(path, { buf: await readBody(req), type }); return send(res, 200, meta(path));
  }
  if (req.method === "GET" && u.searchParams.has("url")) { // head()
    const p = decodeURIComponent(u.searchParams.get("url").replace(/^https?:\/\/[^/]+\//, "")); const f = files.get(p);
    return f ? send(res, 200, { ...meta(p), size: f.buf.length, uploadedAt: new Date().toISOString(), cacheControl: "" }) : send(res, 404, { error: { code: "not_found" } });
  }
  send(res, 404, { error: "unsupported" });
}).listen(port, "127.0.0.1", () => console.log(`fake blob on ${port}`));
