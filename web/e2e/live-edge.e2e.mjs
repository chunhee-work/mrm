// Live edge cases as the smoke account: login errors (on a non-existent address, so the account is never locked), short password at
// sign-up, signed-out redirects, language switch, back/forward, 30 files then Remove all, 320 / 768 px, desk keys, sign out. Writes nothing.
import { createRequire } from "node:module"; import fs from "node:fs";
const { chromium } = createRequire("/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.E2E_URL ?? "https://app.autopilotclaim.com";
const acct = fs.readFileSync(process.env.SMOKE_ACCOUNT_FILE ?? "/mnt/project-files/mrm-web/smoke-account.txt", "utf8");
const email = acct.match(/email:\s*(\S+)/)[1], password = acct.match(/password:\s*(\S+)/)[1];
const SH = process.env.E2E_SHOTS ?? "/tmp/live-edge"; fs.mkdirSync(SH, { recursive: true });
const b = await chromium.launch(); const out = [];
const res = (name, ok, info = "") => { out.push(`${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + info : ""}`); console.log(out.at(-1)); };
async function ctxOf(view = { width: 390, height: 844 }, lang = "en", signed = false) {
  const c = await b.newContext({ viewport: view, ...(view.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await c.addCookies([{ name: "lang", value: lang, url: BASE }]);
  if (signed) { const r = await c.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } }); if (!r.ok()) throw new Error("sign-in " + r.status()); }
  return c;
}
function watch(p) { const e = []; p.on("pageerror", (x) => e.push("pageerror " + x.message.slice(0, 120))); p.on("console", (m) => { if (m.type() === "error" && !/status of 40[0134]/.test(m.text())) e.push(m.text().slice(0, 120)); }); return e; }
const wide = (p) => p.evaluate(() => innerWidth);
// the dashboard is one page now: a case is a line (li[data-line=<id>]) that opens in place, not a link to /cases/<id>
const firstCase = async (p) => { await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" }); return "/cases/" + await p.$eval("li[data-line]", (li) => li.getAttribute("data-line")); };
async function step(name, fn) { try { await fn(); } catch (e) { res(name, false, "threw: " + e.message.split("\n")[0].slice(0, 140)); } }

// 1 login errors (non-existent email so the smoke account is never locked)
await step("login wrong password", async () => { const c = await ctxOf(); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/login", { waitUntil: "networkidle" }); await p.fill("input[type=email]", "nobody-qc@autoclaim.invalid"); await p.fill("input[type=password]", "wrongpass123"); await p.click("button[type=submit]"); await p.waitForTimeout(3000);
  const t = await p.innerText("main"); res("login wrong password", /wrong|salah|错误/i.test(t) && p.url().includes("/login") && !e.length, e.join("; ")); await p.screenshot({ path: `${SH}/login-wrong.png` }); await c.close(); });
await step("login empty submit", async () => { const c = await ctxOf(); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/login", { waitUntil: "networkidle" }); await p.click("button[type=submit]"); await p.waitForTimeout(1000);
  res("login empty submit", p.url().includes("/login") && !e.length, e.join("; ")); await p.screenshot({ path: `${SH}/login-empty.png` }); await c.close(); });
// 2 signup short password: must not create an account
await step("signup short password", async () => { const c = await ctxOf(); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/signup", { waitUntil: "networkidle" });
  const inputs = p.locator("input:visible"); const n = await inputs.count();
  for (let i = 0; i < n; i++) { const t = await inputs.nth(i).getAttribute("type"); if (t === "email") await inputs.nth(i).fill("qc-short-pass@autoclaim.invalid"); else if (t === "password") await inputs.nth(i).fill("short7!"); else if (t === "text" || !t) await inputs.nth(i).fill("QC Test"); else if (t === "checkbox") await inputs.nth(i).check().catch(() => {}); }
  await p.click("button[type=submit]"); await p.waitForTimeout(2500);
  const stay = p.url().includes("/signup"); res("signup short password blocked", stay && !e.length, `url ${new URL(p.url()).pathname} ${e.join("; ")}`); await p.screenshot({ path: `${SH}/signup-short.png` }); await c.close(); });
// 3 forgot password with a bad e-mail
await step("forgot bad email", async () => { const c = await ctxOf(); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/forgot-password", { waitUntil: "networkidle" }); await p.fill("input[type=email]", "not-an-email"); await p.click("button[type=submit]"); await p.waitForTimeout(1500);
  const v = await p.$eval("input[type=email]", (i) => i.validity.valid); res("forgot bad email blocked", !v && !e.length, e.join("; ")); await c.close(); });
// 4 signed out → protected pages go to login (and come back after)
await step("signed-out redirect", async () => { const c = await ctxOf(); const p = await c.newPage();
  for (const u of ["/dashboard", "/cases/new", "/settings", "/billing"]) { await p.goto(BASE + u, { waitUntil: "load" }); res(`signed-out ${u} → login, back after`, new URL(p.url()).pathname === "/login" && (u === "/dashboard" || new URL(p.url()).searchParams.get("next") === u), new URL(p.url()).pathname + new URL(p.url()).search); }
  await c.close(); });
// 5 language switch by UI on the dashboard
await step("language switch", async () => { const c = await ctxOf({ width: 1440, height: 900 }, "en", true); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  // the language lives in the account menu at the foot of the side bar now
  await p.locator('[aria-controls="account-menu"]:visible').first().click(); await p.waitForTimeout(300);
  await p.getByTestId("side-lang").click(); await p.waitForTimeout(300);
  await p.locator('button[lang="zh-CN"]:visible').first().click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  const lang = await p.evaluate(() => document.documentElement.lang); const body = await p.innerText("main");
  res("language switch to 中文", /^zh/.test(lang) && /[一-鿿]/.test(body) && !e.length, `html lang=${lang} ${e.join("; ")}`); await p.screenshot({ path: `${SH}/lang-switch-zh.png` });
  await p.reload({ waitUntil: "networkidle" }); res("language kept after reload", /^zh/.test(await p.evaluate(() => document.documentElement.lang)));
  await c.close(); });
// 6 back / forward through dashboard → the line opened in place → desk
await step("back-forward", async () => { const c = await ctxOf({ width: 390, height: 844 }, "en", true); const p = await c.newPage(); const e = watch(p);
  const href = await firstCase(p);
  await p.locator('li[data-line] [data-testid="home-row"]').first().click({ position: { x: 20, y: 10 } }); await p.waitForTimeout(1200);
  const opened = await p.locator('[data-testid="home-more"]').count();
  await p.goto(BASE + href + "/photos", { waitUntil: "networkidle" });
  await p.goBack(); await p.waitForTimeout(1500);
  const at = new URL(p.url()).pathname; await p.goForward(); await p.waitForTimeout(1500);
  res("back/forward dashboard→open line→desk", opened === 1 && at === "/dashboard" && !e.length && (await wide(p)) === 390, `opened ${opened}, back at ${at} ${e.join("; ")}`); await c.close(); });
// 7 new case: choose 30 files, Remove all, choose again — nothing uploaded
await step("new case many files", async () => { const c = await ctxOf({ width: 390, height: 844 }, "zh", true); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/cases/new", { waitUntil: "networkidle" });
  const J = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  const files = Array.from({ length: 30 }, (_, i) => ({ name: `相片_${i + 1}_非常长的文件名_front_bumper_left_side_close_up.jpg`, mimeType: "image/jpeg", buffer: J }));
  await p.locator('input[type="file"]').first().setInputFiles(files); await p.waitForTimeout(1000);
  const w1 = await wide(p); await p.screenshot({ path: `${SH}/new-case-30-files-zh.png`, fullPage: true });
  const rm = p.getByRole("button", { name: /全部移除|移除全部|Remove all/ }); const had = await rm.count(); if (had) await rm.first().click(); await p.waitForTimeout(500);
  await p.locator('input[type="file"]').first().setInputFiles(files.slice(0, 3)); await p.waitForTimeout(500);
  res("new case 30 files / remove all / again (phone, 中文)", w1 === 390 && (await wide(p)) === 390 && had > 0 && !e.length, `width ${w1}, remove-all button ${had}, ${e.join("; ")}`); await c.close(); });
// 8 small phone 320 and tablet 768 on key pages
for (const vw of [320, 768]) await step(`width ${vw}`, async () => { const c = await ctxOf({ width: vw, height: 800 }, "zh", true); const p = await c.newPage(); const e = watch(p);
  const bad = []; for (const u of ["/dashboard", "/cases/new", "/settings", "/billing"]) { await p.goto(BASE + u, { waitUntil: "networkidle" }); const w = await wide(p); const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (w !== vw || sw > vw + 1) bad.push(`${u} ${w}/${sw}`); await p.screenshot({ path: `${SH}/w${vw}${u.replace(/\//g, "_")}.png` }); }
  const href = await firstCase(p);
  await p.goto(BASE + href + "/photos", { waitUntil: "networkidle" }); const w = await wide(p); if (w !== vw) bad.push(`desk ${w}`); await p.screenshot({ path: `${SH}/w${vw}_desk.png` });
  res(`no sideways scroll at ${vw}px (中文)`, !bad.length && !e.length, bad.join(", ") + " " + e.join("; ")); await c.close(); });
// 9 desk keyboard + help, desktop
await step("desk keyboard", async () => { const c = await ctxOf({ width: 1440, height: 900 }, "en", true); const p = await c.newPage(); const e = watch(p);
  const href = await firstCase(p);
  await p.goto(BASE + href + "/photos", { waitUntil: "networkidle" });
  for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowDown", "Escape", "?"]) { await p.keyboard.press(k); await p.waitForTimeout(150); }
  await p.screenshot({ path: `${SH}/desk-keys.png` }); await p.keyboard.press("Escape");
  res("desk arrow keys / ? / Esc", !e.length, e.join("; ")); await c.close(); });
// 10 sign out from the menu
await step("sign out", async () => { const c = await ctxOf({ width: 390, height: 844 }, "en", true); const p = await c.newPage(); const e = watch(p);
  await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  await p.locator('[aria-controls="app-menu"]:visible, [aria-controls="account-menu"]:visible').first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: /log out|sign out|keluar|退出/i }).or(p.getByRole("menuitem", { name: /log out|sign out|keluar|退出/i })).first().click();
  await p.waitForTimeout(2500); const at = new URL(p.url()).pathname; await p.goto(BASE + "/dashboard", { waitUntil: "load" });
  res("sign out, then /dashboard asks to log in", new URL(p.url()).pathname === "/login" && !e.length, `after sign out at ${at} ${e.join("; ")}`); await c.close(); });
await b.close();
fs.writeFileSync(SH + "/result.txt", out.join("\n"));
console.log(out.filter((x) => x.startsWith("FAIL")).length + " fail / " + out.length);
