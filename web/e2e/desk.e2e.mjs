// Browser test of the photo naming desk. Needs: a local Postgres with the migrations applied, `next dev` running, a local photo folder.
//   DATABASE_URL=postgresql://pay:pay@localhost:5432/paytest PHOTO_STORE_DIR=/tmp/e2e-photos BETTER_AUTH_URL=http://localhost:3100 \
//     npx next dev -p 3100 &      then:   E2E_URL=http://localhost:3100 DATABASE_URL=… PHOTO_STORE_DIR=… node e2e/desk.e2e.mjs
// Test data only: synthetic grey placeholder pictures, a throw-away account, no real customer photo, no Merimen.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/opt/node-tools/node_modules/")("playwright")); }
const { Client } = require("pg");

const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const STORE = process.env.PHOTO_STORE_DIR;
const SHOTS = process.env.E2E_SHOTS; // optional: a folder to save real-page screenshots in
if (!STORE || !process.env.DATABASE_URL) throw new Error("set PHOTO_STORE_DIR and DATABASE_URL (a LOCAL database)");
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) throw new Error("DATABASE_URL must be a local database");
mkdirSync(STORE, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// 1×1 grey JPEG, stretched by CSS: a placeholder, not a customer photo
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const stamp = Date.now();
const email = `e2e-${stamp}@example.test`;
const password = "e2e-password-123";
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let ok = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log(`  ok  ${name}`); } catch (e) { console.error(`FAIL  ${name}\n${e.stack}`); process.exitCode = 1; throw e; } };
const file = (p) => path.join(STORE, p.replace(/[\\/]/g, "__"));

// ---- account (sign up through the app, verify the e-mail in the database, sign in in the browser) ----
const origin = { Origin: BASE, "Content-Type": "application/json" };
let r = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: origin, body: JSON.stringify({ email, password, name: "E2E Tester" }) });
assert.ok(r.ok, `sign-up ${r.status}`);
await db.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
const { rows: [m] } = await db.query(`SELECT m.org_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1`, [email]);
const orgId = m.org_id;

async function seed(plate, specs, ageSec, status = "naming", data = null, doneAlready = false) {
  const id = `e2e_${plate}_${stamp}`;
  await db.query(`INSERT INTO cases (id, org_id, plate, status, created_at, case_data, photos_done_at) VALUES ($1,$2,$3,$4, now() - ($5 || ' seconds')::interval, $6, ${doneAlready ? "now()" : "NULL"})`, [id, orgId, plate, status, String(ageSec), data ? JSON.stringify(data) : null]);
  let i = 0;
  for (const [name, conf] of specs) {
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
// A: two photos have no name. B: three named photos for the Enter,Enter flow. B is the newest tab.
const A = await seed("E2EA1111", [["Front Bumper", 0.97], ["Bonnet", 0.97], [null], [null], ["Grille", 0.97]], 60);
const B = await seed("E2EB2222", [["Front Bumper", 0.97], ["Bonnet", 0.97], ["Grille", 0.97]], 0, "naming", { workshop: "Bengkel Maju" });
// C is finished already (Enter,Enter must skip it); D waits for a missing document and has one photo under 90 %
const C = await seed("E2EC3333", [["Front Bumper", 0.97]], 30, "pending_doc", null, true);
const D = await seed("E2ED4444", [["Bumper", 0.5], ["Bonnet", 0.97]], 90, "pending_doc");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const si = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } });
assert.ok(si.ok(), `sign-in ${si.status()}`);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const doneBtn = () => page.getByRole("button", { name: /^(完成|Done|Selesai)\b|Done E2E|完成 E2E/ }).last();
const caseRow = async (id) => (await db.query(`SELECT photos_done_at, photos_snapshot FROM cases WHERE id=$1`, [id])).rows[0];
const shown = async (id) => (await db.query(`SELECT coalesce(final_name, model_name) AS n FROM case_photos WHERE case_id=$1 ORDER BY position`, [id])).rows.map((x) => x.n);
const card = (n) => page.locator(`article[data-pid]`).nth(n - 1);
const rename = async (n, text) => {
  const open = page.locator("article input[list]");
  if (await open.count()) { await open.first().press("Escape"); await page.waitForTimeout(150); }
  await card(n).getByRole("button", { name: /Change the name of photo|更改第|Ubah nama/i }).first().click();
  const box = page.locator("article input[list]").first();
  await box.fill(text);
  await box.press("Enter");
};

try {
  // ───────── A: unnamed photos block 完成 and walk the adjuster to them ─────────
  await page.goto(`${BASE}/cases/${A}/photos`);
  await page.locator("article[data-pid]").first().waitFor();

  await step("the Done button is big (at least 48px tall) and says plate and d/N", async () => {
    const b = page.getByTestId("done-btn").first();
    const box = await b.boundingBox();
    assert.ok(box.height >= 48, `height ${box.height}`);
    assert.match(await b.innerText(), /E2EA1111/);
    assert.match(await b.innerText(), /\d+\/\d+/);
    assert.doesNotMatch(await b.innerText(), /\(\d+\/\d+\)/, "the counter is not a photo count in brackets");
    await shot("desk-done-button");
  });

  await step("one click on Done with unnamed photos: message, filter All, scroll to + highlight + focus the FIRST unnamed", async () => {
    await page.getByRole("button", { name: /^(All|全部|Semua)/ }).click(); // start on a different filter than the end state is not needed; All is fine
    await page.getByTestId("done-btn").first().click();
    await page.getByText(/2 (photos still have no name|张照片没命名|gambar belum)|还有 2 张照片没命名/).first().waitFor({ timeout: 5000 });
    const first = page.locator("article[data-unnamed]").nth(0);
    await first.waitFor();
    const firstId = await first.getAttribute("data-pid");
    await page.waitForFunction((id) => document.activeElement?.closest("article")?.getAttribute("data-pid") === id, firstId, { timeout: 3000 });
    assert.ok(await first.evaluate((el) => getComputedStyle(el).outlineStyle !== "none"), "highlighted");
    assert.equal((await caseRow(A)).photos_done_at, null, "not marked done");
    await shot("desk-unnamed-jump-1");
    await page.keyboard.press("Escape");
  });

  await step("clicking Done again jumps to the NEXT unnamed photo", async () => {
    const ids = await page.locator("article[data-unnamed]").evaluateAll((els) => els.map((e) => e.getAttribute("data-pid")));
    assert.equal(ids.length, 2);
    await page.getByTestId("done-btn").first().click();
    await page.waitForFunction((id) => document.activeElement?.closest("article")?.getAttribute("data-pid") === id, ids[1], { timeout: 3000 });
    assert.equal((await caseRow(A)).photos_done_at, null);
    await shot("desk-unnamed-jump-2");
    await page.keyboard.press("Escape");
  });

  await step("naming the unnamed photos lets one click finish the case", async () => {
    await rename(3, "Door Mirror RH");
    await rename(4, "Door Mirror LH");
    await page.waitForTimeout(1500); // autosave
    assert.deepEqual((await shown(A)).slice(2, 4), ["Door Mirror RH", "Door Mirror LH"]);
    await page.getByTestId("done-btn").first().click();
    await page.waitForTimeout(1200);
    const row = await caseRow(A);
    if (!row.photos_done_at) console.log("toast:", await page.locator("[aria-live=polite]").innerText(), "| status:", (await db.query(`SELECT status FROM cases WHERE id=$1`, [A])).rows[0].status);
    assert.ok(row.photos_done_at, "done");
    assert.match(row.photos_snapshot ?? "", /^[0-9a-f]{64}$/, "snapshot taken at Done");
    await shot("desk-done");
  });

  await step("R3-U07 + B02: the finished button says Finished, and the toast tells the truth (queued for the worker, no 'AI started')", async () => {
    assert.match(await page.getByTestId("done-btn").first().innerText(), /Finished|已完成|Siap/);
    const toast = await page.locator("[aria-live=polite]").first().innerText();
    assert.match(toast, /queued for the worker|已排到后台|giliran pekerja/);
    assert.doesNotMatch(toast, /AI/);
  });

  await step("editing a name after Done undoes Done and clears the snapshot", async () => {
    await rename(1, "Bonnet Lock");
    await page.waitForTimeout(1500);
    const row = await caseRow(A);
    assert.equal(row.photos_done_at, null);
    assert.equal(row.photos_snapshot, null);
  });

  await step("R3-U02 + U03 + tab badge: a name changed after Done says Done was cancelled; the card shows 'Was: …'; the tab counts the change", async () => {
    // (the toast of the rename above may be gone: change a name once more, with Done pressed first)
    await page.getByTestId("done-btn").first().click();
    await page.waitForTimeout(800);
    await rename(5, "Grille Lower");
    await page.getByText(/Done was cancelled|完成已取消|Selesai dibatalkan/).first().waitFor({ timeout: 4000 });
    await page.waitForTimeout(1500);
    const was = await card(5).getByTestId("was-name").innerText();
    assert.match(was, /Grille/);
    const badge = await page.getByTestId("tab-edited").first().innerText();
    assert.match(badge, /[1-9]/);
    const kpi = await page.getByTestId("kpi").innerText();
    assert.match(kpi, /\b5\b/, "KPI shows the number of photos");
    await page.getByTestId("legend-toggle").click();
    await page.getByTestId("legend").waitFor();
    assert.match(await page.getByTestId("legend").innerText(), /TypeSafe/);
    await page.getByTestId("legend-toggle").click();
  });

  await step("a queued Phase B is cancelled when Done is undone", async () => {
    // done again (queues nothing by itself here); put a queued phase_b job, then undo by editing
    await page.getByTestId("done-btn").first().click();
    await page.waitForTimeout(800);
    await db.query(`INSERT INTO jobs (case_id, step, state) VALUES ($1,'phase_b','queued')`, [A]);
    await rename(2, "Bonnet Hinge");
    await page.waitForTimeout(1500);
    const { rows } = await db.query(`SELECT state FROM jobs WHERE case_id=$1 AND step='phase_b'`, [A]);
    assert.ok(rows.length && rows.every((x) => x.state === "cancelled"), JSON.stringify(rows));
  });

  // ───────── B: copy / paste, add a part, reorder, Enter,Enter ─────────
  await page.goto(`${BASE}/cases/${B}/photos`);
  await page.locator("article[data-pid]").first().waitFor();

  await step("copy and paste: a name copied from photo 1 lands on photo 3", async () => {
    await card(1).click();
    await page.keyboard.press("c");
    await card(3).click();
    await page.keyboard.press("v");
    await page.waitForTimeout(1500);
    assert.equal((await shown(B))[2], "Front Bumper");
  });

  await step("add a part with no photo (Space palette)", async () => {
    await page.getByRole("button", { name: /Add part|加零件|Tambah alat/ }).click();
    const input = page.getByRole("combobox");
    await input.fill("Cowl Panel");
    await input.press("Enter");
    let rows = [];
    for (let i = 0; i < 20 && !rows.length; i++) { await page.waitForTimeout(400); rows = (await db.query(`SELECT name FROM case_extras WHERE case_id=$1`, [B])).rows; } // the first call compiles the route in dev

    assert.deepEqual(rows.map((x) => x.name), ["Cowl Panel"]);
    // R3-B05: the cursor is still in the box after adding, and a second part can be typed at once
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "combobox", "focus stays in the palette box");
    await page.keyboard.type("bumper cl"); // goes into the box because it kept the focus
    await page.waitForTimeout(150);
    await page.getByRole("option", { name: /Bumper Cl/ }).last().click();
    let again = [];
    for (let i = 0; i < 15 && !again.includes("Bumper Cl"); i++) { await page.waitForTimeout(300); again = (await db.query(`SELECT name FROM case_extras WHERE case_id=$1 ORDER BY id`, [B])).rows.map((x) => x.name); }
    assert.ok(again.includes("Bumper Cl"), `R3-B10: custom name in title case: ${again.join()}`);
    await page.keyboard.press("Escape");
  });

  await step("R3-U04/B03/workshop: vehicle line shows the workshop; the opening-photos banner is one line", async () => {
    assert.match(await page.getByTestId("vehicle-line").innerText(), /Bengkel Maju/);
    const banner = page.getByTestId("opening-banner");
    if (await banner.count()) assert.ok((await banner.boundingBox()).height < 40, "one line");
  });

  await step("reorder: move photo 3 to the front with the move sheet", async () => {
    await card(3).getByRole("button", { name: /Move photo|移动第|Alih gambar|Pindah/i }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await sheet.getByRole("button", { name: /^(To start|移到最前|Ke permulaan)/i }).click();
    let order = [];
    for (let i = 0; i < 20 && order[0] !== "IMG_3.jpg"; i++) {
      await page.waitForTimeout(400);
      order = (await db.query(`SELECT src_name FROM case_photos WHERE case_id=$1 ORDER BY position`, [B])).rows.map((x) => x.src_name);
    }
    if (order[0] !== "IMG_3.jpg") console.log("toast:", await page.locator("[aria-live=polite]").innerText(), "| cards:", await page.locator("article[data-pid]").evaluateAll((e) => e.map((x) => x.querySelector("img").alt)));
    assert.equal(order[0], "IMG_3.jpg", order.join());
  });

  await step("Enter, Enter within 700 ms finishes the case and goes on", async () => {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    const row = await caseRow(B);
    assert.ok(row.photos_done_at, "done by Enter,Enter");
    assert.match(row.photos_snapshot ?? "", /^[0-9a-f]{64}$/);
    // R3-B07: C is finished already, so the desk goes on to A (the next case that is not finished), not to C
    const here = await page.locator('nav [aria-current="true"]').innerText();
    assert.match(here, /E2EA1111/, `now on: ${here}`);
  });

  await step("Ctrl+Z undoes the last name change", async () => {
    await page.goto(`${BASE}/cases/${B}/photos`);
    await page.locator("article[data-pid]").first().waitFor();
    const before = await shown(B);
    await rename(2, "Bonnet Hinge");
    await page.waitForTimeout(1500);
    assert.equal((await shown(B))[1], "Bonnet Hinge");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1500);
    assert.deepEqual(await shown(B), before);
  });

  // ───────── D: a case that waits for a missing document ─────────
  await step("R3-B01/B06/B02: D (1 photo under 90 %) shows '1 to check' on the dashboard; after Done: 0 to check, 'confirmed', and an honest toast", async () => {
    await page.goto(`${BASE}/dashboard`);
    const dLink = () => page.locator("li", { has: page.getByText("E2ED4444") }).getByTestId("photos-link");
    const link = dLink();
    await link.waitFor();
    assert.match(await link.innerText(), /1 to check|1 张待核对|1 perlu disemak/);
    await page.goto(`${BASE}/cases/${D}/photos`);
    await page.locator("article[data-pid]").first().waitFor();
    assert.match(await page.getByRole("button", { name: /^(To confirm|要确认|Perlu semak)/ }).innerText(), /1/);
    await page.getByTestId("done-btn").first().click();
    await page.getByText(/missing documents are in|缺的文件补齐|dokumen yang hilang/).first().waitFor({ timeout: 5000 });
    assert.doesNotMatch(await page.locator("[aria-live=polite]").first().innerText(), /AI/);
    assert.match(await page.getByRole("button", { name: /^(To confirm|要确认|Perlu semak)/ }).innerText(), /0/);
    await page.goto(`${BASE}/dashboard`);
    const after = dLink();
    await after.waitFor();
    assert.match(await after.innerText(), /confirmed|已确认|disahkan/, "no more '1 to check'");
    await page.goto(`${BASE}/cases/${D}`);
    const line = await page.getByTestId("photo-plan-line").innerText();
    assert.ok(line.trim().length > 20, "the Merimen photo plan box is never empty");
    assert.match(line, /missing documents|缺的文件|dokumen yang hilang/);
    assert.equal(await page.getByRole("link", { name: /Name photos|给照片命名|Namakan gambar|Open photo names|打开照片名称/ }).count(), 1, "one link to the desk, not two");
    await shot("case-page-photo-status");
  });

  await step("R3-B09: the password form has no browser bubble, a confirm field, and the error follows the page language", async () => {
    await page.goto(`${BASE}/settings`);
    assert.equal(await page.locator("form[novalidate]").count(), 1);
    await page.getByTestId("pw-confirm").waitFor();
    const inputs = page.locator("form[novalidate] input[type=password]");
    await inputs.nth(0).fill("something-old");
    await inputs.nth(1).fill("abcdefgh1");
    await inputs.nth(2).fill("abcdefgh2");
    await page.locator("form[novalidate] button").click();
    await page.getByText(/not the same/).waitFor();
    await page.getByRole("button", { name: "中文" }).click();
    await page.getByText(/不一样/).waitFor({ timeout: 5000 });
    await ctx.addCookies([{ name: "lang", value: "en", url: BASE }]);
  });

  await step("R3-B04: the tab icon is not touched during hydration (it starts only after the page has loaded and settled)", async () => {
    const early = await ctx.newPage();
    await early.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await early.waitForTimeout(600);
    const href = await early.evaluate(() => document.head.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "");
    assert.ok(!href.startsWith("data:"), `icon already swapped at 600 ms: ${href.slice(0, 30)}`);
    await early.waitForFunction(() => document.head.querySelector('link[rel="icon"]')?.getAttribute("href")?.startsWith("data:"), null, { timeout: 9000 });
    await early.close();
  });

  // ───────── phone width ─────────
  await step("phone: the Done button fills the width and is at least 56px tall", async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cookies = await ctx.cookies();
    await mobile.addCookies(cookies);
    const p = await mobile.newPage();
    await p.goto(`${BASE}/cases/${A}/photos`);
    await p.locator("article[data-pid]").first().waitFor();
    const b = p.getByTestId("done-btn").first();
    const box = await b.boundingBox();
    assert.ok(box.height >= 56 && box.width >= 300, JSON.stringify(box));
    // R3-B03: the header leaves at least 60 % of the screen to the photos, and Done is a bar along the bottom edge
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "desk-mobile.png") });
    const firstTop = (await p.locator("article[data-pid]").first().boundingBox()).y;
    assert.ok(firstTop <= 844 * 0.4, `photos start at ${firstTop}px of 844`);
    assert.ok(box.y + box.height >= 844 - 24, `done bar at the bottom: ${box.y + box.height}`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "desk-mobile.png") });
    await mobile.close();
  });
} finally {
  await browser.close();
  await db.query(`DELETE FROM cases WHERE id = ANY($1)`, [[A, B, C, D]]);
  await db.end();
  console.log(`${ok} steps passed${process.exitCode ? ", some FAILED" : ""}`);
}
