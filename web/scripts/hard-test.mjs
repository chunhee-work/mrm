/**
 * Hard test, run by `node scripts/smoke.mjs <origin> --hard`. Everything here uses FAKE data only.
 *
 * Read-only part (any allowed target): crawls every page signed out and signed in in EN/BM/中文 at desktop and phone size and
 * reports console errors, failed requests, sideways scroll, untranslated or raw-key text, then clicks every button and
 * visits every link.
 *
 * Write part (LOCAL origin only, and only the smoke account's own org): fake claim uploads with edge cases, fake Merimen
 * credentials, screenshot isolation between users (needs DATABASE_URL of the LOCAL database to seed two extra test users,
 * and PHOTO_STORE_DIR + scripts/fake-blob.mjs on 127.0.0.1:3200). It never talks to Merimen: no worker login is started.
 *
 * Needs: SMOKE_PASSWORD (and for the write part DATABASE_URL, PHOTO_STORE_DIR). No secret is printed or written to the report.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);

// ---------- fake files ----------
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
/** A flat-colour PNG (fake "damage photo"). */
export function fakePng(w = 320, h = 200, rgb = [180, 60, 40]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** A one-page PDF with fake text only. */
export function fakePdf(text = "FAKE police report. No real person. Plate WXY 0000.") {
  const esc = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 12 Tf 50 750 Td (${esc}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out);
}

const KEY_LEAK = /(^|\s)(?:[a-z]{1,10}\.){1,3}[A-Za-z][A-Za-z0-9]{2,}(?=\s|$)/; // looks like a raw translation key: "case.title"
const SAFE_TEXT = /^(?:www\.|https?:|[\w.-]+@[\w.-]+|\d)/; // e-mail, URL, version numbers are not keys
const DANGEROUS = /sign.?out|log.?out|delete|remove|discard|pay|buy|checkout|purchase|退出|登出|删除|移除|购买|付款|buang|keluar|padam|beli/i;

const PUBLIC = ["/", "/login", "/signup", "/forgot-password", "/privacy", "/terms", "/contact", "/faq", "/how-it-works", "/security"];
const AUTH_PAGES = ["/dashboard", "/cases/new", "/billing", "/connection"];
const SIZES = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const LANGS = ["en", "ms", "zh"];

export async function hard({ chromium, origin, local, email, password, add, shotsDir }) {
  const ownHost = new URL(origin).hostname;
  const browser = await chromium.launch();
  const newCtx = async (size, lang) => {
    const ctx = await browser.newContext({ ...SIZES[size], acceptDownloads: false, ignoreHTTPSErrors: true });
    await ctx.addCookies([{ name: "lang", value: lang, url: origin }]);
    return ctx;
  };
  // One real sign-in per account, then the session cookies are reused: the auth service rate-limits repeated sign-ins.
  const sessions = new Map();
  async function login(ctx, mail, pw) {
    if (sessions.has(mail)) { await ctx.addCookies(sessions.get(mail)); return true; }
    const page = await ctx.newPage();
    try {
      await page.goto(origin + "/login", { waitUntil: "load", timeout: 30000 });
      await page.fill('input[type="email"]', mail);
      await page.fill('input[type="password"]', pw);
      await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }), page.press('input[type="password"]', "Enter")]);
      sessions.set(mail, (await ctx.cookies()).filter((c) => /session/i.test(c.name)));
      return true;
    } catch { return false; } finally { await page.close(); }
  }
  /** Watches one page for console errors, own-origin failed requests and page errors. */
  const watch = (page, problems) => {
    page.on("pageerror", (e) => problems.push(`script error: ${String(e.message).slice(0, 80)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/vercel|favicon/.test(m.location()?.url ?? "")) problems.push(`console.error: ${m.text().slice(0, 100)}`); });
    page.on("requestfailed", (r) => { if (new URL(r.url()).hostname === ownHost && !/_rsc|prefetch/.test(r.url()) && r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`request failed: ${new URL(r.url()).pathname} ${r.failure()?.errorText}`); });
    page.on("response", (r) => { if (new URL(r.url()).hostname === ownHost && r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  };
  const verdict = (name, problems, warns = []) => { const u = [...new Set(problems)]; u.length ? add("FAIL", name, u.join("; ")) : warns.length ? add("WARN", name, [...new Set(warns)].join("; ")) : add("PASS", name); };
  const shot = async (page, name) => { if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: join(shotsDir, name.replace(/\W+/g, "_") + ".jpg"), type: "jpeg", quality: 60 }).catch(() => {}); } };

  /** Page-level checks: layout, raw keys, language leakage. enText = visible text of the same page in English. */
  async function inspect(page, lang, enText) {
    const info = await page.evaluate(() => {
      const over = document.documentElement.scrollWidth - innerWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && getComputedStyle(e).position !== "fixed" && !e.closest("[class*=overflow-x],[class*=overflow-auto],[class*=overflow-y],pre,table"); }).slice(0, 3).map((e) => e.tagName.toLowerCase() + "." + String(e.className).slice(0, 30));
      const blocks = [...document.querySelectorAll("h1,h2,h3,p,li,button,a,label,th,td,dt,dd,span")].filter((e) => !e.children.length).map((e) => e.innerText?.trim()).filter(Boolean);
      const imgsNoAlt = [...document.querySelectorAll("img:not([alt])")].length;
      const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(-40));
      return { over, wide, blocks, imgsNoAlt, brokenImgs, lang: document.documentElement.lang, title: document.title };
    });
    const problems = [], warns = [];
    if (info.over > 1) problems.push(`page scrolls sideways by ${info.over}px (${info.wide.join(", ")})`);
    if (info.brokenImgs.length) problems.push(`broken image ${info.brokenImgs[0]}`);
    const keys = info.blocks.filter((t) => t.length < 60 && KEY_LEAK.test(t) && !SAFE_TEXT.test(t) && !/\s/.test(t.trim()) );
    if (keys.length) problems.push(`raw key shown: ${keys.slice(0, 3).join(" | ")}`);
    if (lang !== "en" && enText) {
      const same = info.blocks.filter((t) => t.length >= 18 && /[A-Za-z]{4}/.test(t) && enText.has(t) && !/@|https?:|autopilotclaim|^WhatsApp|^©/i.test(t));
      if (same.length) warns.push(`still English in ${lang}: "${same[0].slice(0, 50)}"${same.length > 1 ? ` (+${same.length - 1})` : ""}`);
    }
    if (info.imgsNoAlt) warns.push(`${info.imgsNoAlt} img without alt`);
    return { problems, warns, blocks: info.blocks };
  }

  // ================= 1. crawl =================
  const en = new Map(); // "size path" -> Set of English texts
  for (const signedIn of [false, true]) {
    if (signedIn && !password) { add("WARN", "signed-in crawl", "SMOKE_PASSWORD not set"); continue; }
    for (const size of Object.keys(SIZES)) for (const lang of ["en", "ms", "zh"]) {
      const ctx = await newCtx(size, lang);
      if (signedIn && !(await login(ctx, email, password))) { add("FAIL", `${size} ${lang} login`, "could not sign in"); await ctx.close(); continue; }
      for (const path of [...(signedIn ? AUTH_PAGES : PUBLIC), ...(signedIn ? [] : ["/dashboard", "/cases/new"]), "/admin", "/no-such-page-xyz"]) {
        const page = await ctx.newPage();
        const problems = [];
        watch(page, problems);
        const expect404 = path === "/no-such-page-xyz" || path === "/admin"; // /admin is hidden (404) from everyone who is not an admin
        const res = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
        const where = new URL(page.url()).pathname;
        const gated = !signedIn && ["/dashboard", "/cases/new"].includes(path);
        if (!res) problems.push("no response");
        else if (expect404) { if (res.status() !== 404) problems.push(`unknown page answered ${res.status()}, expected 404`); problems.splice(0, problems.length, ...problems.filter((p) => !p.startsWith("HTTP 404") && !/status of 404/.test(p))); }
        else if (res.status() >= 400 && !gated) problems.push(`status ${res.status()}`);
        if (gated && !/^\/(login|signup)/.test(where)) problems.push(`not sent to login, landed on ${where}`);
        const k = `${signedIn} ${size} ${path}`;
        const r = await inspect(page, lang, lang === "en" ? null : en.get(k));
        if (lang === "en") en.set(k, new Set(r.blocks));
        // keep the 404 and gated pages out of the sideways check noise only when they are plain redirects
        verdict(`crawl ${signedIn ? "in " : "out"} ${size} ${lang} ${path}`, [...problems, ...r.problems], r.warns);
        if (problems.length || r.problems.length) await shot(page, `crawl-${signedIn}-${size}-${lang}-${path}`);
        await page.close();
      }
      await ctx.close();
    }
  }

  // ================= 1b. hydration (QC B10: React #418 on about 1 in 6 loads of these pages) =================
  if (password) {
    for (const path of ["/forgot-password", "/reset-password?token=bogus-token-123456", "/billing"]) {
      const signed = path === "/billing";
      let bad = 0, firstMsg = "";
      for (let i = 0; i < 8; i++) {
        const ctx = await newCtx(i % 2 ? "phone" : "desktop", ["en", "ms", "zh"][i % 3]);
        if (signed && !(await login(ctx, email, password))) { await ctx.close(); break; }
        const page = await ctx.newPage();
        const seen = [];
        page.on("console", (m) => { if (m.type() === "error" && /hydrat|#418|Minified React error|did not match/i.test(m.text())) seen.push(m.text().slice(0, 140)); });
        page.on("pageerror", (e) => { if (/hydrat|#418|Minified React error/i.test(String(e.message))) seen.push(String(e.message).slice(0, 140)); });
        await page.goto(origin + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(400);
        if (seen.length) { bad++; firstMsg ||= seen[0]; }
        await ctx.close();
      }
      verdict(`hydration: ${path} loads 8 times without a React hydration error`, bad ? [`${bad}/8 loads: ${firstMsg}`] : []);
    }
  }

  // ================= 2. every button and link =================
  if (password) for (const size of Object.keys(SIZES)) {
    const ctx = await newCtx(size, "en");
    await login(ctx, email, password);
    for (const path of [...PUBLIC.filter((p) => p !== "/login" && p !== "/signup" ? true : true), ...AUTH_PAGES]) {
      const page = await ctx.newPage();
      await page.goto(origin + path, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      const items = await page.evaluate(() => [...document.querySelectorAll("a[href],button,[role=tab],summary")].map((e, i) => ({ i, tag: e.tagName.toLowerCase(), href: e.getAttribute("href"), text: (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40), vis: !!(e.offsetWidth || e.offsetHeight) })));
      await page.close();
      // links: same-origin hrefs answer < 400
      const hrefs = [...new Set(items.filter((x) => x.href && /^\/[^/]/.test(x.href)).map((x) => x.href.split("#")[0]).filter(Boolean))];
      const bad = [];
      for (const h of hrefs) { const r = await ctx.request.get(origin + h, { maxRedirects: 5, timeout: 30000 }).catch(() => null); if (!r || r.status() >= 400) bad.push(`${h} → ${r ? r.status() : "no answer"}`); }
      verdict(`links ${size} ${path} (${hrefs.length})`, bad.map((b) => `broken link ${b}`));
      // buttons: each in a fresh load, click, no error, no dialog
      const buttons = items.filter((x) => x.vis && x.tag !== "a" && !DANGEROUS.test(x.text));
      const problems = [];
      for (const b of buttons.slice(0, 40)) {
        const p = await ctx.newPage();
        watch(p, problems);
        let dialog = false; p.on("dialog", async (d) => { dialog = true; await d.dismiss().catch(() => {}); });
        await p.goto(origin + path, { waitUntil: "load", timeout: 30000 }).catch(() => {});
        const loc = p.locator("button,[role=tab],summary").filter({ hasText: b.text || undefined }).nth(0);
        if (b.text) await loc.click({ timeout: 3000, trial: false }).catch(() => {});
        await p.waitForTimeout(250);
        if (dialog) problems.push(`"${b.text}" opened a browser dialog`);
        if (new URL(p.url()).hostname !== ownHost) problems.push(`"${b.text}" left the site`);
        await p.close();
      }
      verdict(`buttons ${size} ${path} (${buttons.length})`, problems);
    }
    await ctx.close();
  }

  if (!local) { add("WARN", "write tests", "skipped: they run on a local origin only"); await browser.close(); return; }
  await writeTests({ browser, origin, email, password, add, newCtx, login, watch, verdict, shot });
  await browser.close();
}

// ================= 3. write tests (local only, smoke org only) =================
async function writeTests({ browser, origin, email, password, add, newCtx, login, watch, verdict, shot }) {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) { add("WARN", "write tests", "DATABASE_URL must point at a LOCAL database"); return; }
  const { Client } = require("pg");
  const db = new Client({ connectionString: dbUrl }); await db.connect();
  const q = (s, a) => db.query(s, a);
  const { hashPassword } = await import("better-auth/crypto");
  const { mkdtempSync, writeFileSync: wf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "hard-"));
  const f = (name, buf) => { const p = join(tmp, name); wf(p, buf); return p; };
  const orgOf = async (mail) => (await q(`SELECT m.org_id, u.id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1`, [mail])).rows[0];
  const A = await orgOf(email);
  if (!A) { add("FAIL", "write tests", "smoke account has no org; run scripts/seed-smoke-user.ts first"); await db.end(); return; }
  const testPw = "Hard-test-pw-" + Math.random().toString(36).slice(2, 10);

  // two more FAKE users, local database only: B in another org, C in the smoke org (same org, other user)
  async function fakeUser(id, mail, orgId) {
    await q(`INSERT INTO "user"(id,name,email,email_verified) VALUES ($1,$2,$3,true) ON CONFLICT (email) DO UPDATE SET email_verified=true`, [id, id, mail]);
    await q(`DELETE FROM account WHERE user_id=$1`, [id]);
    await q(`INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES ($1,$1,'credential',$2,$3)`, [`${id}-acc`, id, await hashPassword(testPw)]);
    if (orgId === "new") { orgId = `${id}-org`; await q(`INSERT INTO organizations(id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [orgId, `${id} org`]); }
    await q(`INSERT INTO memberships(org_id,user_id,role) VALUES ($1,$2,'member') ON CONFLICT (org_id,user_id) DO NOTHING`, [orgId, id]);
    return orgId;
  }
  const bOrg = await fakeUser("hard-user-b", "hard-b@autoclaim.invalid", "new");
  await fakeUser("hard-user-c", "hard-c@autoclaim.invalid", A.org_id);

  // ---- 3a. upload flow ----
  const ctx = await newCtx("desktop", "en");
  if (!(await login(ctx, email, password))) { add("FAIL", "write tests login", "could not sign in"); await db.end(); return; }
  async function newCasePage() { const p = await ctx.newPage(); const problems = []; watch(p, problems); await p.goto(origin + "/cases/new", { waitUntil: "load" }); return { p, problems }; }

  { // empty: no submit button, no crash
    const { p, problems } = await newCasePage();
    const submit = await p.locator("form button.btn-primary").count();
    verdict("upload: nothing chosen shows no upload button", submit ? ["Upload button visible with no files"] : [], problems.filter((x) => !x.startsWith("HTTP 4")));
    await p.close();
  }
  { // wrong types: all skipped with a message, nothing uploaded
    const { p } = await newCasePage();
    await p.setInputFiles("#case-files", [f("virus.exe", Buffer.from("MZ")), f("notes.txt", "hello"), f("sheet.xlsx", Buffer.from("PK"))]);
    const msg = await p.locator('[role=status]').first().innerText().catch(() => "");
    const rows = await p.locator("form ul[aria-label] li").count();
    verdict("upload: wrong file types are refused with a message", [...(rows ? [`${rows} wrong-type file(s) were listed`] : []), ...(msg ? [] : ["no message shown"])]);
    await p.close();
  }
  { // unsupported-but-image types: the picker accepts them, the server must not fail halfway
    const { p, problems } = await newCasePage();
    await p.setInputFiles("#case-files", [f("scan.gif", Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;")), f("scan.bmp", Buffer.from("BM" + "\0".repeat(60)))]);
    const listed = await p.locator("form ul[aria-label] li").count();
    if (listed) { await p.locator("form button.btn-primary").click(); await p.waitForTimeout(4000); }
    const alert = await p.locator('[role=alert]').count();
    const url = new URL(p.url()).pathname;
    verdict("upload: gif/bmp (accepted by the picker) either upload or are refused up front", listed && alert && url === "/cases/new" ? [`picker listed ${listed} file(s) that the server then refused: "${await p.locator('[role=alert]').first().innerText()}"`] : []);
    await p.close();
  }
  { // happy path with fake PDFs and photos, double click on submit, then back button and refresh
    const { p, problems } = await newCasePage();
    await p.setInputFiles("#case-files", [f("police-report.pdf", fakePdf()), f("驾驶执照 复印.pdf", fakePdf("FAKE licence 假的")), f("IMG_0001.png", fakePng()), f("IMG_0002.png", fakePng(320, 200, [40, 90, 180])), f("Laporan kemalangan (salinan).pdf", fakePdf("FAKE laporan polis")), f("a".repeat(180) + ".png", fakePng(64, 64))]);
    await p.waitForTimeout(300);
    const before = Number((await q(`SELECT count(*) FROM cases WHERE org_id=$1`, [A.org_id])).rows[0].count);
    const btn = p.locator("form button.btn-primary");
    await Promise.all([p.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 60000 }).catch(() => {}), btn.dblclick().catch(() => {})]);
    const after = Number((await q(`SELECT count(*) FROM cases WHERE org_id=$1`, [A.org_id])).rows[0].count);
    verdict("upload: fake claim (PDFs, photos, Chinese/Malay/180-char names) creates exactly one case even on double click", [
      ...(new URL(p.url()).pathname.startsWith("/cases/") ? [] : [`did not reach the case page: ${new URL(p.url()).pathname}`]),
      ...(after - before === 1 ? [] : [`${after - before} cases created`]),
    ], problems.filter((x) => !/HTTP 4|sentinel/.test(x)));
    const id = new URL(p.url()).pathname.split("/")[2];
    await p.waitForTimeout(1500);
    await p.reload({ waitUntil: "load" });
    await p.goBack().catch(() => {}); await p.waitForTimeout(500);
    const atNew = new URL(p.url()).pathname;
    await p.goForward().catch(() => {});
    verdict("flow: refresh on the case page and back/forward do not break", new URL(p.url()).pathname.startsWith("/cases/") && atNew === "/cases/new" ? [] : [`after back landed on ${atNew}`]);
    // the read needs the AI key; with none the case must end in a clear failed/retry state, not spin forever
    await p.goto(origin + `/cases/${id}`, { waitUntil: "load" });
    await p.waitForTimeout(8000); await p.reload({ waitUntil: "load" });
    const body = (await p.locator("body").innerText()).slice(0, 600);
    const st = (await q(`SELECT status, error FROM cases WHERE id=$1`, [id])).rows[0];
    verdict("case page: reading ends in a visible state (no endless spinner) when the AI read cannot run", /Retry|Try again|failed|could not|Missing|Documents|read/i.test(body) || st?.status !== "reading" ? [] : [`still "${st?.status}" with no way out; text: ${body.slice(0, 120).replace(/\n/g, " ")}`]);
    await shot(p, "case-after-upload");
    await p.close();
    globalThis.__caseId = id;
  }
  { // many files
    const { p } = await newCasePage();
    const many = Array.from({ length: 60 }, (_, i) => f(`p${String(i).padStart(3, "0")}.png`, fakePng(32, 32, [i * 4, 10, 10])));
    await p.setInputFiles("#case-files", many);
    const listed = await p.locator("form ul[aria-label] li").count();
    const box = await p.locator("form ul[aria-label]").evaluate((e) => ({ h: e.clientHeight, sh: e.scrollHeight })).catch(() => ({ h: 0, sh: 0 }));
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    verdict("upload: 60 files are listed inside a scrolling box, no sideways scroll", [...(listed === 60 ? [] : [`${listed} of 60 listed`]), ...(box.sh > box.h ? [] : ["list is not a fixed scroll box"]), ...(over > 1 ? ["sideways scroll"] : [])]);
    await p.close();
  }
  { // very large (multipart path); the fake blob keeps it in memory, 30 MB is enough to cross the 20 MB multipart limit
    const { p } = await newCasePage();
    await p.setInputFiles("#case-files", [{ name: "big-photo.png", mimeType: "image/png", buffer: Buffer.concat([fakePng(64, 64), Buffer.alloc(30e6)]) }]);
    await Promise.all([p.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 90000 }).catch(() => {}), p.locator("form button.btn-primary").click()]);
    verdict("upload: 30 MB file (multipart) completes", new URL(p.url()).pathname.startsWith("/cases/") ? [] : [`stuck on ${new URL(p.url()).pathname}`]);
    await p.close();
  }
  { // API edge cases: bad bodies are 4xx, never 500; foreign URLs must not be accepted as case files
    const r = ctx.request;
    const post = (data) => r.post(origin + "/api/cases", { data, headers: { "content-type": "application/json" } });
    const cases = [["empty files", { files: [] }], ["no body keys", {}], ["wrong kind", { files: [{ kind: "exe", url: "https://x.example/a", name: "a", size: 1 }] }], ["301 files", { files: Array.from({ length: 301 }, (_, i) => ({ kind: "photo", url: `https://x.example/${i}`, name: "a", size: 1 })) }], ["200k name", { files: [{ kind: "pdf", url: "https://x.example/a", name: "n".repeat(200000), size: 1 }] }], ["negative size", { files: [{ kind: "pdf", url: "https://x.example/a", name: "a", size: -5 }] }]];
    const bad = [];
    for (const [name, body] of cases) { const x = await post(body); if (x.status() >= 500) bad.push(`${name} → ${x.status()}`); }
    const junk = await r.post(origin + "/api/cases", { data: "{not json", headers: { "content-type": "application/json" } });
    if (junk.status() >= 500) bad.push(`invalid JSON → ${junk.status()}`);
    const before = Number((await q(`SELECT count(*) FROM cases WHERE org_id=$1`, [A.org_id])).rows[0].count);
    const foreign = await post({ files: [{ kind: "pdf", url: "http://169.254.169.254/latest/meta-data/", name: "x.pdf", size: 1 }] });
    const after = Number((await q(`SELECT count(*) FROM cases WHERE org_id=$1`, [A.org_id])).rows[0].count);
    if (foreign.ok() && after > before) bad.push("a case was created from a file URL that is not our storage (http://169.254.169.254/…)");
    verdict("api: malformed or hostile case bodies never 500 and foreign file URLs are refused", bad);
  }

  // ---- 3b. fake Merimen credentials (gate seeded for the smoke org; no worker, so nothing contacts Merimen) ----
  await q(`INSERT INTO ext_org_settings(org_id, enabled, consent_authority, consent_reference) VALUES ($1,true,'firm','HARD-TEST-FAKE') ON CONFLICT (org_id) DO UPDATE SET enabled=true, consent_reference='HARD-TEST-FAKE'`, [A.org_id]);
  await q(`INSERT INTO ext_consents(org_id,user_id,wording_version) SELECT $1,$2,'hard' WHERE NOT EXISTS (SELECT 1 FROM ext_consents WHERE org_id=$1)`, [A.org_id, A.id]);
  {
    const r = ctx.request;
    const save = (data) => r.post(origin + "/api/ext/worker/credentials", { data, headers: { "content-type": "application/json" } });
    const bad = [];
    for (const [name, body] of [["empty", {}], ["blank", { username: "  ", password: "  " }], ["numbers", { username: 1, password: 2 }], ["huge", { username: "u".repeat(5000), password: "p".repeat(5000) }]]) {
      const x = await save(body); if (x.status() !== 400) bad.push(`${name} → ${x.status()} (want 400)`);
    }
    const ok = await save({ username: "fake-user-中文", password: "Fake-Pass-密码-1!" });
    const text = await ok.text();
    if (!ok.ok()) bad.push(`valid fake login → ${ok.status()}`);
    if (/Fake-Pass/.test(text)) bad.push("password came back in the response");
    const row = (await q(`SELECT verify_state, login_attempts, password_ct FROM merimen_credentials WHERE org_id=$1`, [A.org_id])).rows[0];
    if (!row || /Fake-Pass/.test(row.password_ct)) bad.push("password stored as plain text or not stored");
    if (row && (row.verify_state !== "queued" || row.login_attempts !== 0)) bad.push(`state changed without the worker: ${row.verify_state}/${row.login_attempts}`);
    verdict("merimen login: fake credentials are validated, sealed, never echoed, and nothing tries Merimen", bad);
    // what the user sees when Merimen would reject the login (state set by hand: the worker is not run)
    await q(`UPDATE merimen_credentials SET verify_state='bad_credentials', blocked=true WHERE org_id=$1`, [A.org_id]);
    for (const lang of LANGS) {
      const c2 = await newCtx("phone", lang); await login(c2, email, password);
      const p = await c2.newPage(); const problems = []; watch(p, problems);
      await p.goto(origin + "/connection", { waitUntil: "networkidle" });
      const t = await p.locator("body").innerText();
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      verdict(`merimen login: rejected-login message shown on /connection (${lang}, phone)`, [...problems, ...(/w\.(bad|banner)/.test(t) ? ["raw key shown"] : []), ...(over > 1 ? ["sideways scroll"] : []), ...(t.length > 80 ? [] : ["page is nearly empty"])]);
      await shot(p, `connection-bad-${lang}`);
      await c2.close();
    }
    await q(`DELETE FROM merimen_credentials WHERE org_id=$1`, [A.org_id]);
  }

  // ---- 3c. screenshot isolation: A (submitter), C (same org), B (other org) ----
  {
    const { writeFileSync: w, mkdirSync: mk } = await import("node:fs");
    const store = process.env.PHOTO_STORE_DIR;
    if (!store) { add("WARN", "screenshot isolation", "PHOTO_STORE_DIR not set"); }
    else {
      mk(store, { recursive: true });
      const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
      const seedCase = async (id, org, user) => { await q(`INSERT INTO cases(id,org_id,created_by,plate,status) VALUES ($1,$2,$3,'HARD1','phase_a') ON CONFLICT DO NOTHING`, [id, org, user]); };
      const seedShot = async (caseId, org, user, step) => {
        const path = `screenshots/${user}/${caseId}/${step}-20261121T010203000000Z.jpg`;
        w(join(store, path.replace(/[\\/]/g, "__")), jpeg);
        return (await q(`INSERT INTO case_screenshots(org_id,user_id,case_id,step,caption_zh,caption_en,blob_pathname) VALUES ($1,$2,$3,$4,'测试','test',$5) RETURNING id`, [org, user, caseId, step, path])).rows[0].id;
      };
      await seedCase("hard-case-a", A.org_id, A.id); await seedCase("hard-case-b", bOrg, "hard-user-b");
      const shotA = await seedShot("hard-case-a", A.org_id, A.id, "case_opened");
      const shotB = await seedShot("hard-case-b", bOrg, "hard-user-b", "case_opened");
      const as = async (mail, pw) => { const c = await newCtx("desktop", "en"); const ok = await login(c, mail, pw); return { c, ok }; };
      const U = { A: await as(email, password), B: await as("hard-b@autoclaim.invalid", testPw), C: await as("hard-c@autoclaim.invalid", testPw) };
      const get = async (who, path) => (await U[who].c.request.get(origin + path, { failOnStatusCode: false })).status();
      const bad = [];
      const expect = async (who, path, want) => { const s = await get(who, path); if (s !== want) bad.push(`${who} GET ${path.replace(/[0-9a-f-]{36}/g, "<id>")} → ${s}, want ${want}`); };
      await expect("A", `/api/cases/hard-case-a/screenshots`, 200);
      await expect("A", `/api/cases/hard-case-a/screenshots/${shotA}`, 200);
      for (const who of ["B", "C"]) { await expect(who, `/api/cases/hard-case-a/screenshots`, 404); await expect(who, `/api/cases/hard-case-a/screenshots/${shotA}`, 404); }
      await expect("A", `/api/cases/hard-case-b/screenshots/${shotB}`, 404);
      await expect("A", `/api/cases/hard-case-a/screenshots/${shotB}`, 404); // B's picture under A's case id
      await expect("B", `/api/cases/hard-case-b/screenshots/${shotA}`, 404); // A's picture under B's own case id
      await expect("B", `/api/cases/hard-case-b/screenshots/${shotB}`, 200);
      const anon = await (await browser.newContext()).request.get(origin + `/api/cases/hard-case-a/screenshots/${shotA}`, { failOnStatusCode: false });
      if (anon.status() !== 401) bad.push(`signed out → ${anon.status()}, want 401`);
      // the page: A sees the timeline, C (same org) and B do not see the case's pictures at all
      const pageHas = async (who, id) => { const p = await U[who].c.newPage(); await p.goto(origin + `/cases/${id}`, { waitUntil: "networkidle" }); const n = await p.locator("#case-shots").count(); const thumbs = await p.locator("#case-shots ~ ol img, section[aria-labelledby=case-shots] img").count(); const status = p.url(); if (who === "A") await shot(p, "timeline-owner"); await p.close(); return { n, thumbs }; };
      const a = await pageHas("A", "hard-case-a"); if (!a.n || a.thumbs !== 1) bad.push(`owner timeline: heading ${a.n}, thumbnails ${a.thumbs}`);
      const c = await pageHas("C", "hard-case-a"); if (c.n) bad.push("same-org other user sees the screenshots section");
      const b = await pageHas("B", "hard-case-a"); if (b.n) bad.push("other-org user sees the screenshots section");
      verdict("screenshot isolation: only the submitter sees a case's pictures (owner, same-org user, other org, signed out)", bad);
      // soft-deleted rows disappear
      await q(`UPDATE case_screenshots SET deleted_at=now() WHERE id=$1`, [shotA]);
      const gone = await get("A", `/api/cases/hard-case-a/screenshots/${shotA}`);
      verdict("screenshot retention: a row with deleted_at is no longer served", gone === 404 ? [] : [`still served (${gone})`]);
      for (const k of Object.values(U)) await k.c.close();
    }
  }
  await ctx.close();
  await db.end();
}
