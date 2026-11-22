// Hard test (2026-11-22): every form, the wrong way first and then the right way, on a phone (390x844) with a throw-away
// account in a LOCAL database. Sign-up (one password box whose eye shows what was typed, too short, address already used,
// then a good one),
// log in (wrong password, then right), Settings › password (wrong current one, too short, not the same twice, then a
// good change and log in with it), forgot password (an address nobody has must look the same as a real one).
//   DATABASE_URL=postgresql://…@localhost:5432/… E2E_URL=http://localhost:3100 node e2e/forms.e2e.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/opt/node-tools/node_modules/")("playwright")); }
const { Client } = require("pg");
const BASE = process.env.E2E_URL ?? "http://localhost:3100";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL must be a local database");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const stamp = Date.now();
const email = `forms-${stamp}@example.test`, pw1 = "first-password-1", pw2 = "second-password-2";

const browser = await chromium.launch();
let ok = 0;
async function step(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "lang", value: "en", url: BASE }]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  page.on("response", (r) => { if (r.status() >= 500) errs.push(`server ${r.status()} ${new URL(r.url()).pathname}`); });
  try {
    await fn(page, ctx);
    assert.deepEqual(errs, [], "errors on the page");
    assert.equal(await page.evaluate(() => innerWidth), 390, "page got wider than the phone");
    ok++; console.log(`  ok  ${name}`);
  } catch (e) { process.exitCode = 1; console.log(`  ✗  ${name}: ${String(e.message).split("\n")[0]}`); }
  await ctx.close();
}
const text = (p) => p.locator("main").innerText();
async function signUp(p, pass, mail = email) {
  await p.goto(`${BASE}/signup`);
  await p.fill("#email", mail); await p.fill("#password", pass);
  const name = p.locator("#name"); if (await name.count()) await name.fill("Forms Tester");
  const agree = p.locator("#agree"); if (await agree.count()) await agree.check();
  await p.click("button[type=submit]");
  await p.waitForTimeout(1500);
}
async function logIn(p, mail, pass) {
  await p.goto(`${BASE}/login`);
  await p.fill("#email", mail); await p.fill("#password", pass); await p.click("button[type=submit]");
  await p.waitForURL((u) => u.pathname !== "/login", { timeout: 6000 }).catch(() => {});
}
const users = async () => Number((await db.query(`SELECT count(*) FROM "user" WHERE email = $1`, [email])).rows[0].count);

try {
  // UI round 2026-11-22: sign-up asks for the password once; the eye is how a typing slip is caught before sending
  await step("sign-up: one password box, and the eye shows what was typed so a slip is seen before sending", async (p) => {
    await p.goto(`${BASE}/signup`);
    assert.equal(await p.locator("input[type=password]").count(), 1, "sign-up should ask for the password once");
    await p.fill("#password", pw1 + "x");
    await p.getByRole("button", { name: /^show/i }).click();
    assert.equal(await p.locator("#password").getAttribute("type"), "text");
    assert.equal(await p.locator("#password").inputValue(), pw1 + "x");
    assert.equal(await users(), 0);
  });
  await step("sign-up: a 7-letter password is stopped and no account is made", async (p) => {
    await signUp(p, "short-7");
    assert.match(new URL(p.url()).pathname, /\/signup/);
    assert.equal(await users(), 0);
  });
  await step("sign-up: the good one makes the account", async (p) => {
    await signUp(p, pw1);
    await p.waitForTimeout(1500);
    assert.equal(await users(), 1);
    assert.doesNotMatch(await text(p), /something went wrong|error/i);
  });
  await db.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
  await step("sign-up: the same address again is stopped with a clear message", async (p) => {
    await signUp(p, pw1);
    assert.match(new URL(p.url()).pathname, /\/signup/);
    assert.match(await text(p), /already|exists|log in/i);
    assert.equal(await users(), 1);
  });
  await step("log in: wrong password says so and stays on the page", async (p) => {
    await logIn(p, email, "not-the-password");
    assert.equal(new URL(p.url()).pathname, "/login");
    assert.match(await text(p), /wrong|incorrect|invalid|check/i);
  });
  await step("Settings › password: wrong current one, too short, two different ones are each stopped with a message", async (p) => {
    await logIn(p, email, pw1);
    assert.equal(new URL(p.url()).pathname, "/dashboard");
    await p.goto(`${BASE}/settings`);
    await p.getByTestId("pw-open").click(); // the password form is one row until asked for
    const [cur, next, again] = [p.locator("input[autocomplete=current-password]"), p.locator("input[autocomplete=new-password]").first(), p.getByTestId("pw-confirm")];
    const save = p.getByRole("button", { name: /save password/i });
    const msg = async () => { await p.waitForTimeout(1200); return (await text(p)).toLowerCase(); };
    await cur.fill("wrong-current-1"); await next.fill(pw2); await again.fill(pw2); await save.click();
    assert.match(await msg(), /wrong|incorrect|invalid|current/);
    await cur.fill(pw1); await next.fill("short-7"); await again.fill("short-7"); await save.click();
    assert.match(await msg(), /8|short|at least/);
    await cur.fill(pw1); await next.fill(pw2); await again.fill(pw2 + "x"); await save.click();
    assert.match(await msg(), /match|same/);
    await cur.fill(pw1); await next.fill(pw2); await again.fill(pw2); await save.click();
    const done = await msg();
    assert.match(done, /changed|saved|updated/);
    if (process.env.E2E_DEBUG) console.log(done.slice(0, 600));
  });
  await step("log in with the new password works, the old one no longer does", async (p) => {
    await p.waitForTimeout(11000); // log in allows 3 tries in 10 s
    await logIn(p, email, pw1);
    assert.equal(new URL(p.url()).pathname, "/login", "the old password still logs in");
    await logIn(p, email, pw2);
    assert.equal(new URL(p.url()).pathname, "/dashboard", `the new password did not log in: ${(await text(p)).replace(/\s+/g, " ").slice(0, 300)}`);
  });
  await step("forgot password: an address nobody has gets the same answer as a real one (no way to test who has an account)", async (p) => {
    const answer = async (mail) => { await p.goto(`${BASE}/forgot-password`); await p.fill("#email", mail); await p.click("button[type=submit]"); await p.waitForTimeout(1800); return (await text(p)).replace(mail, "<mail>"); };
    const real = await answer(email), nobody = await answer(`nobody-${stamp}@example.test`);
    assert.equal(nobody, real);
  });
  await step("log in: too many tries in a row says so, instead of calling a right password wrong", async (p) => {
    await p.waitForTimeout(11000);
    for (let i = 0; i < 3; i++) await logIn(p, `nobody-${stamp}@example.test`, "not-the-password");
    await logIn(p, email, pw2);
    assert.equal(new URL(p.url()).pathname, "/login");
    const said = await text(p);
    assert.match(said, /too many/i);
    assert.doesNotMatch(said, /wrong email or password/i);
  });
} finally {
  await browser.close();
  await db.query(`DELETE FROM "user" WHERE email = $1`, [email]).catch(() => {}); // the org and its rows go with it where the schema cascades
  await db.end();
  console.log(`${ok} steps passed${process.exitCode ? ", some FAILED" : ""}`);
}
