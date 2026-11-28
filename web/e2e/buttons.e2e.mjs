// Hard test (owner 2026-11-22: "no bug … from a single small ui, button etc"): press EVERY button, link, tab, toggle and
// picker on every page, one at a time on a freshly opened page, desktop 1440x900 and phone 390x844. After each press it
// fails on: a page error, a console error, a server error (5xx), React #418 / hydration, the page getting wider than the
// screen. It lists separately (not a failure) presses where nothing at all changed: no request, no new text, no new
// address, no open/close state, so a person can look at whether that control is dead.
// Needs a LOCAL database and a running app, like site.e2e.mjs:
//   DATABASE_URL=postgresql://…@localhost:5432/… PHOTO_STORE_DIR=/tmp/e2e-photos E2E_URL=http://localhost:3100 node e2e/buttons.e2e.mjs
// Fake data only (a throw-away account and fake cases). Sign out is pressed last on its own; nothing is paid.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/opt/node-tools/node_modules/")("playwright")); }
const { Client } = require("pg");

const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const STORE = process.env.PHOTO_STORE_DIR;
const ONLY = process.env.E2E_ONLY; // a page name, to re-run one page while fixing
if (!STORE || !process.env.DATABASE_URL) throw new Error("set PHOTO_STORE_DIR and DATABASE_URL (a LOCAL database)");
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) throw new Error("DATABASE_URL must be a local database");
mkdirSync(STORE, { recursive: true });

const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const stamp = Date.now();
const email = `btn-${stamp}@example.test`;
const password = "qc-password-123";
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const file = (p) => path.join(STORE, p.replace(/[\\/]/g, "__"));
const origin = { Origin: BASE, "Content-Type": "application/json" };
const su = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: origin, body: JSON.stringify({ email, password, name: "QC Tester" }) });
if (!su.ok) throw new Error(`sign-up ${su.status}`);
await db.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
const { rows: [m] } = await db.query(`SELECT m.org_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1`, [email]);
const orgId = m.org_id;
await db.query(`INSERT INTO credits_ledger (org_id, delta, reason) VALUES ($1, 5, $2)`, [orgId, `btn-grant-${stamp}`]);

const ids = [];
async function seed(key, plate, status, o = {}) {
  const id = `btn_${key}_${stamp}`;
  ids.push(id);
  await db.query(
    `INSERT INTO cases (id, org_id, plate, status, car_model, insurer, total_rm, pending_doc, error, case_data, photos_done_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${o.done ? "now()" : "NULL"}, now() - ($11 || ' minutes')::interval)`,
    [id, orgId, plate, status, "Perodua Myvi 1.5 AV (FAKE)", "Fake Insurance Bhd", o.total ?? null, o.pending ?? null, o.error ?? null, null, String(o.age ?? 5)]);
  await db.query(`INSERT INTO case_events (case_id, step, message) VALUES ($1,'upload','Received 2 files')`, [id]);
  // a real (fake) picture behind the file row, so a press on its name in the Files list has something to open
  writeFileSync(file(`${orgId}/${id}/docs/IMG_FAKE.jpg`), JPEG);
  await db.query(`INSERT INTO case_files (case_id, kind, blob_url, original_name, size) VALUES ($1,'photo',$2,'IMG_FAKE.jpg',333000)`, [id, `${orgId}/${id}/docs/IMG_FAKE.jpg`]);
  let i = 0;
  for (const [name, conf] of o.photos ?? []) {
    i++;
    const blob = `${orgId}/${id}/photos/h${i}-f-IMG_${i}.jpg`, thumb = `${orgId}/${id}/photos/h${i}-s-IMG_${i}.jpg`;
    writeFileSync(file(blob), JPEG); writeFileSync(file(thumb), JPEG);
    await db.query(
      `INSERT INTO case_photos (case_id, position, orig_n, src_name, blob_path, thumb_path, name_state, model_name, confidence, content_hash, how)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'model')`,
      [id, i - 1, i, `IMG_${i}.jpg`, blob, thumb, name ? "named" : "failed", name, name ? conf : null, `${id}-${i}`]);
  }
  return id;
}
const named = [["Front Bumper", 0.97], ["Bonnet", 0.95], ["Headlamp LH", 0.62], ["Fender Front LH", 0.97]];
// every press can change a case, so each view gets its own fresh set
async function seedAll(tag) {
  return {
    naming: await seed(`naming${tag}`, "QCA1111", "naming", { photos: [...named, [null, null], [null, null]] }),
    finished: await seed(`finished${tag}`, "QCC3333", "pending_doc", { photos: named, done: true, pending: "Police report" }),
    phaseA: await seed(`phasea${tag}`, "QCE5555", "phase_a", { photos: named }),
    done: await seed(`done${tag}`, "QCH8888", "done", { photos: named, done: true, total: "4321.50" }),
    failed: await seed(`failed${tag}`, "QCJ9999", "failed", { error: "Something odd happened" }),
    badFile: await seed(`badfile${tag}`, "QCK1212", "failed", { error: "bad_file:broken.pdf|corrupt" }),
  };
}

const problems = [], quiet = [];
const note = (where, what) => { problems.push(`${where}: ${what}`); console.log(`  ✗ ${where}: ${what}`); };

// what a person can press, with a name that stays the same on a fresh load of the page
const LIST = (scope) => {
  const sel = "button, a[href], [role=button], [role=tab], [role=switch], [role=menuitem], summary, input[type=checkbox], input[type=radio], select";
  const seen = new Map(), out = [];
  for (const el of document.querySelectorAll(scope ? scope.split(",").map((x) => `${x.trim()} :is(${sel})`).join(",") : sel)) {
    if (el.closest("[inert]") || el.disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el.tagName !== "SUMMARY" && el.closest("details:not([open])")) continue; // folded away: reached by its own pass with the section open
    const b = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (b.width < 2 || b.height < 2 || s.visibility === "hidden" || s.pointerEvents === "none") continue;
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const kind = el.tagName.toLowerCase() + (el.getAttribute("role") ? `[${el.getAttribute("role")}]` : "") + (el.getAttribute("href") ? `→${el.getAttribute("href")}` : "");
    const key = `${kind} "${label}"`;
    // the same control repeated (one per photo card) is pressed once, on the first copy
    const n = seen.get(key) ?? 0; seen.set(key, n + 1);
    if (n === 0) out.push(key);
  }
  return out;
};
const MARK = ([want, scope]) => {
  const sel = "button, a[href], [role=button], [role=tab], [role=switch], [role=menuitem], summary, input[type=checkbox], input[type=radio], select";
  for (const el of document.querySelectorAll(scope ? scope.split(",").map((x) => `${x.trim()} :is(${sel})`).join(",") : sel)) {
    if (el.closest("[inert]") || el.disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el.tagName !== "SUMMARY" && el.closest("details:not([open])")) continue; // folded away: reached by its own pass with the section open
    const b = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (b.width < 2 || b.height < 2 || s.visibility === "hidden" || s.pointerEvents === "none") continue;
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const kind = el.tagName.toLowerCase() + (el.getAttribute("role") ? `[${el.getAttribute("role")}]` : "") + (el.getAttribute("href") ? `→${el.getAttribute("href")}` : "");
    if (`${kind} "${label}"` === want) { el.setAttribute("data-qc-press", "1"); return el.tagName.toLowerCase(); }
  }
  return null;
};
const STATE = () => JSON.stringify([location.href, document.body.innerText.length, document.body.innerText.slice(0, 4000),
  [...document.querySelectorAll("[aria-expanded],[aria-pressed],[aria-selected],[aria-checked],[open],dialog,[role=dialog]")].map((e) => [e.getAttribute("aria-expanded"), e.getAttribute("aria-pressed"), e.getAttribute("aria-selected"), e.getAttribute("aria-checked"), e.hasAttribute("open")].join()).join("|"),
  document.activeElement?.tagName, [...document.querySelectorAll("input,textarea")].map((e) => e.value).join("|")]);
// leaving the site, signing out, or deleting the whole account are checked on their own, never in the loop
const SKIP = /(→https?:\/\/(?!localhost)|→mailto:|→tel:|wa\.me|sign out|log out|logout|log keluar|退出登录|delete (my )?account)/i;

const browser = await chromium.launch();
const VIEWS = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]];
let cookies = null;
async function context(view, signedIn) {
  const ctx = await browser.newContext({ viewport: view, ...(view.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: "lang", value: "en", url: BASE }]);
  if (signedIn) {
    if (!cookies) {
      const si = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } });
      if (!si.ok()) throw new Error(`sign-in ${si.status()}`);
      cookies = (await ctx.cookies()).filter((c) => c.name !== "lang");
    } else await ctx.addCookies(cookies);
  }
  return ctx;
}

async function open(ctx, url, prep) {
  await ctx.addCookies([{ name: "lang", value: "en", url: BASE }]); // a press on Settings › language changes it for the next pages
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message.slice(0, 160)}`));
  page.on("console", (msg) => { if (msg.type() === "error" && !/status of 40[0-9]/.test(msg.text())) errs.push(`console: ${msg.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 500) errs.push(`server ${r.status()} on ${new URL(r.url()).pathname}`); });
  page.on("dialog", (d) => d.dismiss().catch(() => {})); // "are you sure?" questions: answer No, nothing is thrown away
  await page.goto(BASE + url, { waitUntil: "load" });
  await page.waitForTimeout(500);
  if (prep) await prep(page).catch((e) => errs.push(`could not get the page ready (${new URL(page.url()).pathname}): ${String(e.message).split("\n")[0].slice(0, 100)}`));
  return { page, errs };
}

let presses = 0;
async function pressAll(ctx, where, url, vw, prep, scope = null) {
  const first = await open(ctx, url, prep);
  const keys = (await first.page.evaluate(LIST, scope)).filter((k) => !SKIP.test(k));
  for (const e of first.errs.splice(0)) note(`${where} (on load)`, e);
  await first.page.close();
  for (const key of keys) {
    const { page, errs } = await open(ctx, url, prep);
    let reqs = 0;
    page.on("request", (r) => { if (["fetch", "xhr", "document"].includes(r.resourceType()) && !r.headers()["next-router-prefetch"]) reqs++; });
    // a link that opens a new tab (an uploaded file): the press did something, and the new tab must load
    page.on("filechooser", () => { reqs++; }); // New case opens the file picker in place
    page.on("popup", (pop) => { reqs++; pop.on("response", (r) => { if (r.request().isNavigationRequest() && r.status() >= 400) errs.push(`new tab: ${r.status()} on ${new URL(r.url()).pathname}`); }); });
    const tag = await page.evaluate(MARK, [key, scope]);
    if (!tag) { await page.close(); continue; } // only there after another press (a menu item, an undo)
    const before = await page.evaluate(STATE);
    reqs = 0;
    const el = page.locator("[data-qc-press]");
    try {
      if (tag === "select") { const v = await el.evaluate((s) => s.options[(s.selectedIndex + 1) % s.options.length]?.value); await el.selectOption(v ?? ""); }
      else await el.click({ timeout: 4000 });
    } catch (e) { note(`${where} ${key}`, `could not be pressed: ${String(e.message).split("\n")[0].slice(0, 120)}`); await page.close(); continue; }
    presses++;
    await page.waitForTimeout(900);
    await page.waitForLoadState("load").catch(() => {});
    const after = await page.evaluate(STATE).catch(() => "gone");
    const r = await page.evaluate(() => ({ iw: window.innerWidth, sw: document.documentElement.scrollWidth })).catch(() => null);
    if (r && r.iw !== vw) note(`${where} ${key}`, `page became ${r.iw}px wide on a ${vw}px screen`);
    if (r && r.sw > vw + 1) note(`${where} ${key}`, `page scrolls sideways after the press (${r.sw}px)`);
    for (const e of errs.splice(0)) note(`${where} ${key}`, e);
    if (after === before && reqs === 0) quiet.push(`${where} ${key}`);
    for (const other of ctx.pages()) if (other !== page) await other.close().catch(() => {});
    await page.close();
  }
  console.log(`  ${where}: ${keys.length} controls${process.env.E2E_LIST ? "\n    " + keys.join("\n    ") : ""}`);
}

const PUBLIC = [["landing", "/"], ["faq", "/faq"], ["how-it-works", "/how-it-works"], ["security", "/security"], ["contact", "/contact"],
  ["login", "/login"], ["signup", "/signup"], ["forgot-password", "/forgot-password"], ["reset-password", "/reset-password?token=bogus"]];
const pdf = { name: "claim_bundle_QC_FAKE.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% fake\n") };
const jpg = (n) => ({ name: `IMG_QC_${n}.jpg`, mimeType: "image/jpeg", buffer: JPEG });
const choose = (files) => async (page) => { await page.locator('input[type="file"]').first().setInputFiles(files); await page.waitForTimeout(600); };

try {
  for (const [vname, view] of VIEWS) {
    console.log(`— ${vname}`);
    const C = await seedAll(vname);
    const APP = [
      ["dashboard", "/dashboard"], ["dashboard-open", "/dashboard?view=open"], ["dashboard-closed", "/dashboard?view=closed"], ["new-case", "/cases/new"], ["new-case-files", "/cases/new", choose([pdf, jpg(1), jpg(2)])],
      ...Object.entries(C).map(([k, id]) => [`case-${k}`, `/cases/${id}`]),
      ["case-files-open", `/cases/${C.naming}`, async (p) => { await p.getByTestId("case-files").click(); await p.waitForTimeout(300); }, '[data-testid="files-window"]'], // the Files window: the list, then a file inside it (owner 2026-11-29)
      ["case-file-shown", `/cases/${C.naming}`, async (p) => { await p.getByTestId("case-files").click(); await p.getByTestId("files-item").first().click(); await p.waitForTimeout(300); }, '[data-testid="files-window"]'],
      ["desk", `/cases/${C.naming}/photos`], ["desk-finished", `/cases/${C.finished}/photos`],
      ["settings", "/settings"], ["billing", "/billing"], ["connection", "/connection"],
      ["menu-open", "/dashboard", async (p) => { const b = p.locator('[aria-controls="app-menu"]:visible, [aria-controls="account-menu"]:visible').first(); if (await b.count()) { await b.click(); await p.waitForTimeout(300); } }, "#app-menu, #account-menu"], // with the menu open only its own items can be reached
    ];
    const pub = await context(view, false), app = await context(view, true);
    for (const [name, url, prep] of PUBLIC) if (!ONLY || ONLY.split(",").includes(name)) await pressAll(pub, `${vname} ${name}`, url, view.width, prep);
    for (const [name, url, prep, scope] of APP) if (!ONLY || ONLY.split(",").includes(name)) await pressAll(app, `${vname} ${name}`, url, view.width, prep, scope);
    await pub.close(); await app.close();
  }
  // sign out, on its own: it must end on a signed-out page, and the case list must then ask to log in again
  if (!ONLY) {
    const ctx = await browser.newContext({ viewport: VIEWS[0][1] });
    const si = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } });
    if (!si.ok()) throw new Error(`sign-in ${si.status()}`);
    const { page, errs } = await open(ctx, "/settings");
    const out = page.getByRole("button", { name: /sign out|log out/i }).first();
    if (!(await out.count())) { const menu = page.locator('[aria-controls="account-menu"]:visible, [aria-controls="app-menu"]:visible').first(); if (await menu.count()) await menu.click(); }
    const btn = page.getByRole("button", { name: /sign out|log out/i }).or(page.getByRole("menuitem", { name: /sign out|log out/i })).first();
    if (!(await btn.count())) note("sign out", "no sign-out button found on Settings or in the menu");
    else {
      await btn.click();
      await page.waitForURL((u) => !/\/settings/.test(u.pathname), { timeout: 10000 }).catch(() => note("sign out", "stayed on Settings"));
      await page.goto(BASE + "/dashboard");
      if (new URL(page.url()).pathname !== "/login") note("sign out", `after signing out the case list opened at ${new URL(page.url()).pathname}`);
    }
    for (const e of errs) note("sign out", e);
    await ctx.close();
  }
} finally {
  await browser.close();
  await db.query(`DELETE FROM cases WHERE id = ANY($1)`, [ids]);
  await db.query(`DELETE FROM credits_ledger WHERE reason = $1`, [`btn-grant-${stamp}`]);
  await db.end();
}
if (quiet.length) { console.log(`\n${quiet.length} presses changed nothing (look at these):`); for (const q of quiet) console.log(`  · ${q}`); }
console.log(`\n${presses} presses, ${problems.length ? problems.length + " problem(s)" : "clean"}`);
if (problems.length) process.exitCode = 1;
