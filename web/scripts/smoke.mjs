#!/usr/bin/env node
/**
 * Autopilotclaim smoke test (pattern from the oeru-onhand smoke tester): a real browser opens every page in EN/BM/中文 on a
 * laptop and a phone and says plainly what broke. Then it logs in as the smoke account, opens the signed-in pages and
 * checks the signed-out gate. It writes nothing, uploads nothing, spends nothing.
 *
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke.mjs https://autoclaim-web.vercel.app [--report f.md] [--shots dir]
 *   node scripts/smoke.mjs http://127.0.0.1:3100            (public pages only when no SMOKE_PASSWORD)
 *
 * Exit: 0 all pass (WARN allowed), 1 any FAIL, 2 bad usage / environment.
 * Needs Playwright (`npm i --no-save playwright && npx playwright install chromium`).
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

// ---- target guard: only our own site or this machine; never a path, login-in-URL or other host ----
export const ALLOWED_HOSTS = /^(?:autoclaim-web(?:-[a-z0-9-]+)?\.vercel\.app|(?:www\.)?autopilotclaim\.com)$/;
export function smokeTarget(raw) {
  let u;
  try { u = new URL(String(raw ?? "").trim().replace(/\/+$/, "")); } catch { return { ok: false, why: "not a URL" }; }
  if (u.username || u.password) return { ok: false, why: "no login in the address" };
  if (u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { ok: false, why: "give the origin only" };
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) return { ok: true, origin: u.origin, local };
  if (u.protocol !== "https:") return { ok: false, why: "HTTPS only off this machine" };
  if (u.port) return { ok: false, why: "no port" };
  if (!ALLOWED_HOSTS.test(host)) return { ok: false, why: "not the Autopilotclaim site (autopilotclaim.com or autoclaim-web*.vercel.app) or localhost" };
  return { ok: true, origin: u.origin, local };
}

const LANGS = ["en", "ms", "zh"];
const HTML_LANG = { en: "en", ms: "ms", zh: "zh-CN" };
const PUBLIC = ["/", "/login", "/signup", "/forgot-password", "/privacy", "/terms", "/contact"];
const SIGNED_IN = ["/dashboard", "/cases/new"];
const SIZES = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
const ERROR_PAGE = /Application error|This page could not be found|\b404\b/i;
const IGNORED = /(^|\.)vercel\.(live|com)$|va\.vercel-scripts\.com|vitals\.vercel-insights\.com/;

if (import.meta.url === `file://${process.argv[1]}`) await run();

async function run() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const target = smokeTarget(args.find((a) => !a.startsWith("--") && a !== opt("--report") && a !== opt("--shots")));
  if (!target.ok) { console.error(`Target refused: ${target.why}`); process.exit(2); }
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { console.error("Playwright missing: npm i --no-save playwright && npx playwright install chromium"); process.exit(2); }

  const email = (process.env.SMOKE_EMAIL ?? "smoke-tester@autoclaim.invalid").trim();
  const password = process.env.SMOKE_PASSWORD ?? "";
  const reportFile = opt("--report") ?? join(tmpdir(), "autoclaim-smoke.md");
  const shotsDir = opt("--shots");
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const browser = await chromium.launch();
  const rows = [];
  const add = (level, name, note = "") => { rows.push({ level, name, note }); console.log(`${level.padEnd(4)} ${name}${note ? " — " + note : ""}`); };
  const origin = target.origin;
  const ownHost = new URL(origin).hostname;

  async function ctxFor(size, lang) {
    const ctx = await browser.newContext({ ...SIZES[size] });
    await ctx.addCookies([{ name: "lang", value: lang, url: origin }]);
    return ctx;
  }
  /** Opens a page, collects problems. expectPath: where we must end up (default = the same path). */
  async function check(ctx, path, label, { expectPath = path, signedInProbe = false } = {}) {
    const page = await ctx.newPage();
    const problems = [], warns = [];
    page.on("pageerror", () => problems.push("page script error"));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const src = m.location()?.url ? new URL(m.location().url).hostname : "";
      if (IGNORED.test(src)) return;
      (!src || src === ownHost ? problems : warns).push(`console.error${src ? " from " + src : ""}`);
    });
    const t0 = Date.now();
    let res;
    try { res = await page.goto(origin + path, { waitUntil: "load", timeout: 30000 }); } catch { res = null; }
    const ms = Date.now() - t0;
    if (!res) problems.push("no response");
    else if (res.status() >= 400) problems.push(`status ${res.status()}`);
    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== expectPath) problems.push(`landed on ${finalPath}, expected ${expectPath}`);
    const info = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, text: document.body?.innerText?.slice(0, 2000) ?? "", over: document.documentElement.scrollWidth - innerWidth })).catch(() => null);
    if (info) {
      if (new URL(page.url()).hostname === ownHost) {
        const want = HTML_LANG[label.lang];
        if (info.lang !== want) problems.push(`<html lang> is "${info.lang}", expected "${want}"`);
        if (ERROR_PAGE.test(info.title) || ERROR_PAGE.test(info.text.slice(0, 400))) problems.push("error or not-found page");
        if (info.over > 1) problems.push("page scrolls sideways");
      } else problems.push("left our site");
    }
    if (ms > 8000) warns.push(`slow load ${(ms / 1000).toFixed(1)}s`);
    if (shotsDir && problems.length) await page.screenshot({ path: join(shotsDir, `${label.size}-${label.lang}-${path.replace(/\W+/g, "_")}.jpg`), type: "jpeg", quality: 60 }).catch(() => {});
    await page.close();
    const name = `${label.size} ${label.lang} ${path}`;
    problems.length ? add("FAIL", name, problems.join("; ")) : warns.length ? add("WARN", name, warns.join("; ")) : add("PASS", name);
  }

  // 1. public pages, signed out
  for (const size of Object.keys(SIZES)) for (const lang of LANGS) {
    const ctx = await ctxFor(size, lang);
    for (const p of PUBLIC) await check(ctx, p, { size, lang });
    // signed-out gate: protected pages must send you to /login
    for (const p of SIGNED_IN) await check(ctx, p, { size, lang }, { expectPath: "/login" });
    await ctx.close();
  }

  // 2. signed in as the smoke account
  if (!password) add("WARN", "signed-in checks", "SMOKE_PASSWORD not set, skipped");
  else for (const size of Object.keys(SIZES)) for (const lang of LANGS) {
    const ctx = await ctxFor(size, lang);
    const page = await ctx.newPage();
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) { // one retry: a cold start can swallow the first submit
      try {
        await page.goto(origin + "/login", { waitUntil: "load", timeout: 30000 });
        await page.fill('input[type="email"]', email);
        await page.fill('input[type="password"]', password);
        await Promise.all([page.waitForURL("**/dashboard", { timeout: 20000 }), page.press('input[type="password"]', "Enter")]);
        ok = true;
      } catch { /* retried, then reported below */ }
    }
    await page.close();
    if (!ok) { add("FAIL", `${size} ${lang} log in as smoke account`, "did not reach /dashboard"); await ctx.close(); continue; }
    add("PASS", `${size} ${lang} log in as smoke account`);
    for (const p of SIGNED_IN) await check(ctx, p, { size, lang });
    await ctx.close();
  }
  await browser.close();

  const n = (l) => rows.filter((r) => r.level === l).length;
  const md = [`# Autopilotclaim smoke: ${n("PASS")} pass, ${n("WARN")} warn, ${n("FAIL")} fail`, `Target: ${origin}`, "",
    "| | page | note |", "|---|---|---|", ...rows.map((r) => `| ${r.level} | ${r.name} | ${r.note} |`)].join("\n");
  writeFileSync(reportFile, md + "\n");
  console.log(`\n${n("PASS")} pass, ${n("WARN")} warn, ${n("FAIL")} fail  (report: ${reportFile})`);
  process.exit(n("FAIL") ? 1 : 0);
}
