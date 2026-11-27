// Browser test of the photo naming desk. Needs: a local Postgres with the migrations applied, `next dev` running, a local photo folder.
//   DATABASE_URL=postgresql://pay:pay@localhost:5432/paytest PHOTO_STORE_DIR=/tmp/e2e-photos BETTER_AUTH_URL=http://localhost:3100 \
//     npx next dev -p 3100 &      then:   E2E_URL=http://localhost:3100 DATABASE_URL=… PHOTO_STORE_DIR=… node e2e/desk.e2e.mjs
// Test data only: synthetic grey placeholder pictures, a throw-away account, no real customer photo, no Merimen.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const { zipSync, strToU8 } = createRequire(import.meta.url)("fflate");

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
  // a spec is [name, confidence, state]. No name and no state = the model found no name that fits (named, empty):
  // the photo simply asks for a name. "failed" = the naming call itself failed, which the desk tries again by itself.
  for (const [name, conf, state] of specs) {
    i++;
    const blob = `${orgId}/${id}/photos/h${i}-f-IMG_${i}.jpg`, thumb = `${orgId}/${id}/photos/h${i}-s-IMG_${i}.jpg`;
    writeFileSync(file(blob), JPEG); writeFileSync(file(thumb), JPEG);
    await db.query(
      `INSERT INTO case_photos (case_id, position, orig_n, src_name, blob_path, thumb_path, name_state, model_name, confidence, content_hash, how)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'model')`,
      [id, i - 1, i, `IMG_${i}.jpg`, blob, thumb, state ?? "named", name, name ? conf : null, `${id}-${i}`]);
  }
  return id;
}
// A: two photos have no name. B: three named photos for the Enter,Enter flow. B is the newest tab.
const A = await seed("E2EA1111", [["Front Bumper", 0.97], ["Bonnet", 0.97], [null], [null], ["Grille", 0.97]], 60);
const B = await seed("E2EB2222", [["Front Bumper", 0.97], ["Bonnet", 0.97], ["Grille", 0.97]], 0, "naming", { workshop: "Bengkel Maju" });
// C is finished already (Enter,Enter must skip it); D waits for a missing document and has one photo under 90 %
const C = await seed("E2EC3333", [["Front Bumper", 0.97]], 30, "pending_doc", null, true);
const D = await seed("E2ED4444", [["Bumper", 0.5], ["Bonnet", 0.97]], 90, "pending_doc");
let F = null; // made by its own step: a case where the naming call failed on two photos

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

  await step("R4-U02: Done sits in the same row as the filters (not alone), the header is short, and the photos sit two in a line (owner 2026-11-22: always two, on every screen)", async () => {
    await shot("desk-r4-done-in-row");
    const d = await page.getByTestId("done-btn").first().boundingBox();
    const f = await page.getByRole("group", { name: /^(Show|显示|Papar)$/ }).first().boundingBox();
    assert.ok(Math.abs((d.y + d.height / 2) - (f.y + f.height / 2)) < 30, `done y ${d.y}, filter y ${f.y}`);
    const first = await page.locator("article[data-pid]").first().boundingBox();
    assert.ok(first.y < 380, `the first photos start at ${first.y}px`);
    const ys = [];
    for (let i = 0; i < 3; i++) ys.push(Math.round((await card(i + 1).boundingBox()).y));
    assert.ok(ys[0] === ys[1] && ys[2] > ys[1], `two photos in a line, the third starts the next: ${ys}`);
    // the same on a very wide screen
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wide = [];
    for (let i = 0; i < 3; i++) wide.push(Math.round((await card(i + 1).boundingBox()).y));
    assert.ok(wide[0] === wide[1] && wide[2] > wide[1], `two photos in a line at 1920 px: ${wide}`);
    await page.setViewportSize({ width: 1280, height: 860 });
    await shot("desk-r4-done-in-row");
  });

  await step("one click on Done with unnamed photos: message, filter All, scroll to + highlight + focus the FIRST unnamed", async () => {
    // the first filter shows every photo: "Photos" on a wide screen (the number tiles are the filter), "All" on a phone
    await page.getByRole("group", { name: /^(Show|显示|Papar)$/ }).getByRole("button").first().click();
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

  await step("R4-U05: tapping Finished takes Done back with an Undo button in the toast; Undo puts Done back", async () => {
    await page.getByTestId("done-btn").first().click();
    await page.getByTestId("toast-action").waitFor({ timeout: 4000 });
    assert.equal((await caseRow(A)).photos_done_at, null);
    await page.getByTestId("toast-action").click();
    await page.waitForTimeout(1200);
    assert.notEqual((await caseRow(A)).photos_done_at, null, "Done is back after Undo");
    assert.match(await page.getByTestId("done-btn").first().innerText(), /Finished|已完成|Siap/);
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
    // owner 2026-11-22: the plate on a tab is big and bold so it stands out, and "n changed" is a soft label, not a black block
    const look = await page.locator('nav button[aria-current="true"]').evaluate((el) => {
      const s = getComputedStyle(el), b = el.querySelector('[data-testid="tab-edited"]');
      return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight), badge: b ? getComputedStyle(b).backgroundColor : null };
    });
    assert.ok(look.size >= 15 && look.weight >= 700, `the plate of the open tab: ${look.size}px, weight ${look.weight}`);
    assert.ok(look.badge && look.badge !== "rgb(10, 14, 19)", `the changed label is a black block: ${look.badge}`);
    // owner 2026-11-22: the head is one compact row. The three numbers sit on the filter itself; there are no number
    // tiles, no legend panel and no "Legend and how to use" switch.
    assert.match(await page.getByTestId("desk-filter").innerText(), /\b5\b/, "the filter shows the number of photos");
    for (const id of ["kpi", "legend", "legend-toggle", "legend-toggle-m", "help-open", "photo-plan"]) assert.equal(await page.getByTestId(id).count(), 0, `${id} is gone`);
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

  await step("R3-U04/B03/workshop: vehicle line shows the workshop; no line about missing opening photos (owner 2026-11-22)", async () => {
    assert.match(await page.getByTestId("vehicle-line").innerText(), /Bengkel Maju/);
    assert.equal(await page.getByTestId("opening-banner").count(), 0);
    assert.doesNotMatch(await page.locator("body").innerText(), /opening photos? missing|Opening photos missing/i);
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
  await step("R3-B01/B06/B02: D (1 photo under 90 %) shows '1 to check' on its case page; after Done: 0 to check, 'confirmed', and an honest toast", async () => {
    // the first page is now the count (owner 2026-11-22): D is one of the cases behind "Waiting for documents", and its case page carries the photo line
    await page.goto(`${BASE}/dashboard?view=docs`);
    await page.getByTestId("case-table").getByRole("link", { name: "E2ED4444" }).waitFor();
    await page.goto(`${BASE}/cases/${D}`);
    const link = page.getByTestId("desk-link");
    await link.waitFor();
    assert.match(await link.innerText(), /1 to check|1 张待核对|1 perlu disemak/);
    await page.goto(`${BASE}/cases/${D}/photos`);
    await page.locator("article[data-pid]").first().waitFor();
    assert.match(await page.getByRole("button", { name: /^(To confirm|要确认|Perlu semak)/ }).innerText(), /1/);
    await page.getByTestId("done-btn").first().click();
    await page.getByText(/missing documents are in|缺的文件补齐|dokumen yang hilang/).first().waitFor({ timeout: 5000 });
    assert.doesNotMatch(await page.locator("[aria-live=polite]").first().innerText(), /AI/);
    assert.match(await page.getByRole("button", { name: /^(To confirm|要确认|Perlu semak)/ }).innerText(), /0/);
    await page.goto(`${BASE}/cases/${D}`);
    const after = page.getByTestId("photo-plan-line");
    await after.waitFor();
    assert.match(await after.innerText(), /confirmed|已确认|disahkan/, "no more '1 to check'");
    assert.doesNotMatch(await page.getByTestId("desk-link").innerText(), /to check|待核对|perlu disemak/);
    await page.goto(`${BASE}/cases/${D}`);
    const line = await page.getByTestId("photo-plan-line").innerText();
    assert.ok(line.trim().length > 20, "the Merimen photo plan box is never empty");
    assert.match(line, /missing documents|缺的文件|dokumen yang hilang/);
    assert.equal(await page.getByRole("link", { name: /Name photos|给照片命名|Namakan gambar|Open photo names|打开照片名称/ }).count(), 1, "one link to the desk, not two");
    await shot("case-page-photo-status");
  });

  await step("R3-B09: the password form has no browser bubble, a confirm field, and the error follows the page language", async () => {
    await page.goto(`${BASE}/settings`);
    // the form stays folded until "Change password" is pressed (one row instead of three empty boxes)
    assert.equal(await page.locator("form[novalidate]").count(), 0);
    await page.getByTestId("pw-open").click();
    assert.equal(await page.locator("form[novalidate]").count(), 1);
    await page.getByTestId("pw-confirm").waitFor();
    const inputs = page.locator("form[novalidate] input[type=password]");
    await inputs.nth(0).fill("something-old");
    await inputs.nth(1).fill("abcdefgh1");
    await inputs.nth(2).fill("abcdefgh2");
    await page.locator("form[novalidate] button").click();
    await page.getByText(/not the same/).waitFor();
    // owner 2026-11-22: the language is changed in Settings; the top bar has no globe any more
    assert.equal(await page.locator("header").getByRole("button", { name: /^Language/ }).count(), 0, "no language button in the top bar");
    await page.getByTestId("set-lang").getByRole("button", { name: /中文/ }).click();
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

  await step("R4-B04: the case page tab title carries the plate", async () => {
    await page.goto(`${BASE}/cases/${A}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);
    assert.match(await page.title(), /^E2EA1111 · .+ · Autopilotclaim$/);
  });

  await step("uploaded files open with a click (owner 2026-11-22), only for the case they belong to and only when signed in", async () => {
    const add = async (caseId, name, p, bytes) => {
      writeFileSync(file(p), bytes);
      return (await db.query(`INSERT INTO case_files (case_id, kind, blob_url, original_name, size) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [caseId, /\.pdf$/.test(name) ? "pdf" : /\.zip$/.test(name) ? "bundle_zip" : "photo", p, name, bytes.length])).rows[0].id;
    };
    const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
    const pdf = await add(A, "报告 report.pdf", `${orgId}/${A}/docs/report.pdf`, PDF);
    const jpg = await add(A, "IMG_1.JPG", `${orgId}/${A}/docs/img1.jpg`, JPEG);
    const zip = await add(A, "bundle.zip", `${orgId}/${A}/docs/bundle.zip`, Buffer.from("PK"));
    const html = await add(A, "page.html", `${orgId}/${A}/docs/page.html`, Buffer.from("<script>1</script>"));
    const outside = await add(A, "other.pdf", `someone-else/${A}/docs/other.pdf`, PDF); // a path outside this organisation's folder is never read
    const url = (c, f) => `${BASE}/api/cases/${c}/files/${f}`;

    await page.goto(`${BASE}/cases/${A}`);
    await page.getByTestId("case-files").locator("summary").click();
    const link = page.getByTestId("file-open").filter({ hasText: "报告 report.pdf" });
    assert.equal(await link.getAttribute("href"), `/api/cases/${A}/files/${pdf}`);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await page.getByTestId("file-open").count(), 5);
    assert.ok((await link.boundingBox()).height >= 44, "a file row is tall enough for a finger");

    let r = await ctx.request.get(url(A, pdf));
    assert.equal(r.status(), 200);
    assert.equal(r.headers()["content-type"], "application/pdf");
    assert.match(r.headers()["content-disposition"], /^inline; filename="__ report\.pdf"; filename\*=UTF-8''%E6%8A%A5%E5%91%8A%20report\.pdf$/);
    assert.equal(r.headers()["cache-control"], "private, no-store");
    assert.equal(r.headers()["x-content-type-options"], "nosniff");
    assert.ok((await r.body()).equals(PDF));
    r = await ctx.request.get(url(A, jpg));
    assert.equal(r.headers()["content-type"], "image/jpeg");
    // a zip, and anything the browser could run, is a download and never a page of ours
    for (const id of [zip, html]) {
      r = await ctx.request.get(url(A, id));
      assert.equal(r.status(), 200);
      assert.equal(r.headers()["content-type"], "application/octet-stream");
      assert.match(r.headers()["content-disposition"], /^attachment; /);
    }
    assert.equal((await ctx.request.get(url(D, pdf))).status(), 404, "a file of another case");
    assert.equal((await ctx.request.get(url(A, outside))).status(), 404, "a path outside the organisation's folder");
    assert.equal((await ctx.request.get(url(A, 999999999))).status(), 404);
    assert.equal((await ctx.request.get(url(A, "abc"))).status(), 404);
    assert.equal((await ctx.request.get(url("no-such-case", pdf))).status(), 404);
    assert.equal((await fetch(url(A, pdf))).status, 401, "signed out");
    await db.query(`DELETE FROM case_files WHERE case_id = $1`, [A]);
  });

  await step("R4-B01/U04: the case table has no '1 photos' and no tick typed into the words; the first page counts the cases", async () => {
    await page.goto(`${BASE}/dashboard?view=all`);
    await page.getByTestId("case-table").waitFor();
    const lines = await page.getByTestId("case-table").locator("li").allInnerTexts();
    assert.ok(lines.length >= 4, `the four cases are listed: ${lines.length}`);
    for (const t of lines) { assert.doesNotMatch(t, /\b1 photos\b/); assert.ok((t.match(/✓/g) ?? []).length === 0, `a tick inside the text: ${t}`); }
    // the table has no "New case" of its own, so the bar keeps it there
    assert.equal(await page.getByTestId("new-case").count(), 1, "New case in the bar of the table");
    // the first page (owner 2026-11-22, reworked 2026-11-27): welcome, search, two buttons, and every open case with its own step bar
    await page.goto(`${BASE}/dashboard`);
    assert.match(await page.getByTestId("home-welcome").innerText(), /E2E Tester/);
    for (const id of ["home-search", "home-new", "home-closed", "home-open", "home-list"]) assert.equal(await page.getByTestId(id).count(), 1, id);
    // nothing twice (owner 2026-11-22): one "New case" (the page's, not the bar's) and one "Billing" (the bar's, not the page's)
    assert.equal(await page.getByTestId("new-case").count(), 0, "no second New case in the bar of the first page");
    assert.equal(await page.getByTestId("home-billing").count(), 0, "no Billing button on the first page");
    assert.equal(await page.locator('a[href="/cases/new"]').count(), 1, "one way to a new case");
    assert.equal(await page.getByTestId("case-table").count(), 0, "no separate case table on the first page");
    assert.ok(await page.getByTestId("step-dots").count() >= 1, "each open case shows its step bar");
    assert.equal(await page.getByTestId("step-dots").count(), await page.getByTestId("home-list").locator(":scope > li").count(), "one step bar per case");
    // files dragged onto the first page: a full-page overlay while they hover, a text drag shows nothing,
    // the overlay clears on its own if the browser misses the dragleave, and a drop opens New case with the files
    const drag = (type, kind = "file") => page.evaluate(([type, kind]) => {
      const dt = new DataTransfer();
      if (kind === "file") dt.items.add(new File(["%PDF-1.4"], "dropped.pdf", { type: "application/pdf" })); else dt.setData("text/plain", "hello");
      window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [type, kind]);
    await drag("dragenter", "text");
    await page.waitForTimeout(150);
    assert.equal(await page.getByTestId("home-overlay").count(), 0, "a text drag is not a file drop");
    await drag("dragenter");
    await page.getByTestId("home-overlay").waitFor();
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(250); await drag("dragover"); } // a file held still for 2 s
    assert.equal(await page.getByTestId("home-overlay").count(), 1, "the overlay stays while dragover keeps coming");
    await page.getByTestId("home-overlay").waitFor({ state: "detached", timeout: 2000 }); // then no dragover, no dragleave: it clears by itself
    await drag("dragenter"); await drag("dragenter"); await drag("dragleave");
    await page.waitForTimeout(150);
    assert.equal(await page.getByTestId("home-overlay").count(), 1, "leaving a child element keeps it");
    await drag("dragleave");
    await page.getByTestId("home-overlay").waitFor({ state: "detached", timeout: 500 });
    // a drop sends at once, with no press of Upload (owner 2026-11-27): the first thing it does is ask for the balance.
    // Answer "no credit" here so nothing goes up and the page stays, showing the file and the refusal.
    let creditAsked = 0;
    await page.route("**/api/cases/credit*", (r) => { creditAsked++; return r.fulfill({ status: 402, body: "{}" }); });
    await drag("dragenter");
    await drag("drop");
    await page.waitForURL(/\/cases\/new$/); // the ?dropped=1 marker is taken off once read
    await page.getByText("dropped.pdf").waitFor();
    assert.equal(await page.getByText("dropped.pdf").count(), 1, "listed once");
    await page.locator('[role="alert"]').filter({ hasText: /no credits|点数不够|tiada kredit/i }).first().waitFor();
    assert.equal(creditAsked, 1, "the upload started by itself, once");
    await page.unroute("**/api/cases/credit*");
    // the new-case drop zone runs on the same hook: it lights up, and a drop there adds the file
    await drag("dragenter");
    await page.locator('[data-over="true"]').first().waitFor();
    await page.evaluate(() => {
      const dt = new DataTransfer(); dt.items.add(new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.getByText("second.pdf").waitFor();
    // a plain New case never gets dropped files; a ?dropped=1 visit with nothing held says so
    await page.goto(`${BASE}/cases/new?dropped=1`);
    await page.getByText(/did not arrive|没有带过来|tidak sampai/).waitFor();
    // a drop with a file left out does not send: the note stays and Upload waits for a press
    await page.goto(`${BASE}/dashboard`);
    await page.getByTestId("home-new").waitFor();
    let sent = 0;
    await page.route("**/api/cases/credit*", (r) => { sent++; return r.fulfill({ status: 402, body: "{}" }); });
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["%PDF-1.4"], "mixed.pdf", { type: "application/pdf" }));
      dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForURL(/\/cases\/new$/);
    await page.getByText("mixed.pdf").waitFor();
    await page.getByText(/notes\.txt/).first().waitFor();
    await page.waitForTimeout(800);
    assert.equal(sent, 0, "nothing sent while a file was left out");
    // a drop of one zip holding two cars does not send either: the "makes 2 cases" line waits for a press
    const twoCars = Buffer.from(zipSync({ "DCD4004/claim.pdf": strToU8("%PDF-1.4"), "TBD8129/claim.pdf": strToU8("%PDF-1.4") })).toString("base64");
    await page.goto(`${BASE}/dashboard`);
    await page.getByTestId("home-new").waitFor();
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "two-cars.zip", { type: "application/zip" }));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, twoCars);
    await page.waitForURL(/\/cases\/new$/);
    await page.getByText(/holds 2 cars|2 辆|2 kereta/).first().waitFor();
    await page.waitForTimeout(800);
    assert.equal(sent, 0, "a zip that makes several cases is not sent unseen");
    await page.unroute("**/api/cases/credit*");
    await page.goto(`${BASE}/dashboard`);
    // every job is done on this page (owner 2026-11-27: "all done in the first page, never jump to others pages"):
    // the photo button opens the line with the photo desk inside it
    for (const tag of await page.getByTestId("home-act").evaluateAll((els) => els.map((e) => e.tagName))) assert.equal(tag, "BUTTON", "no action button leaves the first page");
    const photoLine = page.getByTestId("home-list").locator(":scope > li[data-bucket=photos]").first();
    if (await photoLine.count()) {
      await photoLine.getByTestId("home-act").click();
      await photoLine.getByTestId("home-desk").getByTestId("done-btn").waitFor();
      assert.equal(new URL(page.url()).pathname, "/dashboard", "the photo desk opens inside the line");
      await photoLine.getByTestId("home-row").click();
      await photoLine.getByTestId("home-desk").waitFor({ state: "detached" });
    }
    // a press on a line opens its details right there (owner 2026-11-27: "by clicking the whole box can open it down"); a second press closes them
    const row = page.getByTestId("home-row").first();
    await row.click();
    await page.getByTestId("home-more").waitFor();
    assert.equal(await row.getAttribute("aria-expanded"), "true");
    assert.match(await page.getByTestId("home-open-case").getAttribute("href"), /^\/cases\/[^/]+$/, "the details lead into the case page");
    assert.equal(new URL(page.url()).pathname, "/dashboard", "opening the details stays on the first page");
    await row.click();
    await page.getByTestId("home-more").waitFor({ state: "detached" });
    const rows0 = await page.getByTestId("home-list").locator(":scope > li").count();
    // typing narrows the list on this page at once, no trip to another page
    await page.getByTestId("home-search").locator("input").fill("zz-no-such-plate");
    await page.getByTestId("home-empty").waitFor();
    assert.equal(new URL(page.url()).search, "", "typing stays on the first page");
    await page.getByTestId("home-search").locator("input").fill("");
    assert.equal(await page.getByTestId("home-list").locator(":scope > li").count(), rows0);
    await page.getByTestId("home-search").locator("input").fill("e2ed");
    await page.getByTestId("home-search").locator("button").click();
    await page.waitForURL(/q=e2ed/);
    assert.equal(await page.getByTestId("case-table").locator("li").count(), 1, "the search finds the one case");
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
    // R3-B03: the header leaves at least 57 % of the screen to the photos, and Done is a bar along the bottom edge
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "desk-mobile.png") });
    const firstTop = (await p.locator("article[data-pid]").first().boundingBox()).y;
    assert.ok(firstTop <= 844 * 0.43, `photos start at ${firstTop}px of 844`);
    assert.ok(box.y + box.height >= 844 - 24, `done bar at the bottom: ${box.y + box.height}`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "desk-mobile.png") });
    await mobile.close();
  });

  await step("R4-U01/U03: on a phone the numbers are shown once (on the filter buttons) and there is no legend; the open tab's badge is fully in view", async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mobile.addCookies(await ctx.cookies());
    const p = await mobile.newPage();
    await p.goto(`${BASE}/cases/${A}/photos`);
    await p.locator("article[data-pid]").first().waitFor();
    const numbers = p.getByRole("group", { name: /^(Show|显示|Papar)$/ });
    assert.equal(await numbers.count(), 1, "one row of numbers, not two");
    assert.match(await numbers.innerText(), /\d/);
    assert.equal(await p.getByTestId("kpi-line").count(), 0);
    assert.equal(await p.getByTestId("legend-toggle-m").count(), 0);
    assert.equal(await p.getByTestId("legend").count(), 0);
    const tab = p.locator('button[aria-current="true"]').first();
    const nav = await tab.locator("xpath=ancestor::nav[1]").boundingBox();
    const tb = await tab.boundingBox();
    assert.ok(tb.x + tb.width <= nav.x + nav.width + 1, `the open tab is cut off: ${tb.x + tb.width} > ${nav.x + nav.width}`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "desk-mobile-r4.png") });
    await mobile.close();
  });
  await step("speed (hard test): the open case's photos come with the page (no extra list request) and the first screen of photos loads at once", async () => {
    const p = await ctx.newPage();
    const asked = [];
    p.on("request", (r) => { if (new URL(r.url()).pathname === `/api/cases/${A}/photos` && r.method() === "GET") asked.push(r.url()); });
    await p.goto(`${BASE}/cases/${A}/photos`);
    await p.locator("article[data-pid]").first().waitFor();
    await p.waitForTimeout(800);
    assert.equal(asked.length, 0, "the page asked for the photo list again");
    const first = await p.locator("article[data-pid] img").first();
    assert.equal(await first.getAttribute("loading"), "eager");
    assert.equal(await first.getAttribute("fetchpriority"), "high");
    const later = await p.locator("article[data-pid] img").nth(6);
    if (await later.count()) assert.equal(await later.getAttribute("loading"), "lazy");
    await p.close();
  });
  await step("speed (hard test): a click on another page shows the top bar at once, and it goes away when the page is there", async () => {
    const p = await ctx.newPage();
    await p.route(/_rsc=/, async (r) => { await new Promise((res) => setTimeout(res, 900)); await r.continue(); }); // a slow phone line
    await p.goto(`${BASE}/dashboard`);
    const link = p.locator("a[href='/billing']:visible").first();
    await link.waitFor();
    await p.evaluate(() => { window.__barSeen = 0; new MutationObserver(() => { if (document.querySelector("[data-testid=nav-progress]")) window.__barSeen ||= performance.now(); }).observe(document.body, { childList: true, subtree: true }); });
    const t0 = await p.evaluate(() => performance.now());
    await link.click();
    await p.waitForURL("**/billing");
    await p.getByTestId("nav-progress").waitFor({ state: "detached", timeout: 3000 });
    const seen = await p.evaluate(() => window.__barSeen);
    assert.ok(seen > 0, "the top bar never showed");
    assert.ok(seen - t0 < 300, `the top bar showed ${Math.round(seen - t0)} ms after the click`);
    await p.close();
  });
  await step("speed (hard test): saying No to 'leave while uploading?' keeps you on the page and leaves no top bar running", async () => {
    const p = await ctx.newPage();
    await p.route("**/api/cases/credit", () => {}); // never answers: the upload stays busy
    await p.goto(`${BASE}/cases/new`);
    await p.locator('input[type="file"]').first().setInputFiles([{ name: "claim.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") }]);
    await p.waitForTimeout(400);
    await p.locator("form button.btn-primary").first().click();
    await p.waitForSelector("form[aria-busy=true]");
    let asked = 0;
    p.on("dialog", (d) => { asked++; d.dismiss(); });
    await p.locator("a[href='/billing']:visible").first().click();
    await p.waitForTimeout(700);
    assert.equal(asked, 1, "the leave question was not asked");
    assert.ok(new URL(p.url()).pathname === "/cases/new", `left the page: ${p.url()}`);
    assert.equal(await p.getByTestId("nav-progress").count(), 0, "the top bar kept running after No");
    await p.close();
  });
  await step("a naming call that failed is tried again by the desk itself: no failure line, no Try again button; what is left simply asks for a name (owner 2026-11-22)", async () => {
    F = await seed("E2EF6666", [["Front Bumper", 0.97], [null, null, "failed"], [null, null, "failed"]], 120);
    await page.goto(`${BASE}/cases/${F}/photos`);
    await page.locator("article[data-pid]").first().waitFor();
    // on arrival the two photos are being named again (nothing says "failed"), and nothing has to be pressed
    await page.getByTestId("naming-line").waitFor({ timeout: 5000 });
    assert.equal(await page.locator("article[data-unnamed]").count(), 0, "still being named, not asking for a name yet");
    const never = /could not be named|没命名成功|tidak dapat dinamakan|Try again|再试一次|Cuba lagi/;
    assert.doesNotMatch(await page.locator("body").innerText(), never);
    // a test machine has no model to call, so every try fails (with a model, it finds no name for this grey square):
    // either way, after the last quiet try the two photos simply ask for a name
    await page.waitForFunction(() => document.querySelectorAll("article[data-unnamed]").length === 2 && !document.querySelector("[data-testid=naming-line]"), null, { timeout: 90000 });
    assert.doesNotMatch(await page.locator("body").innerText(), never);
    const { rows } = await db.query(`SELECT name_state FROM case_photos WHERE case_id = $1 ORDER BY position`, [F]);
    assert.ok(rows.every((r) => r.name_state === "named" || r.name_state === "failed"), `nothing is left waiting: ${rows.map((r) => r.name_state).join()}`);
    // naming one by hand works as for any photo without a name
    await rename(2, "Door Mirror RH");
    await page.waitForTimeout(1500);
    assert.equal(await page.locator("article[data-unnamed]").count(), 1);
  });
  await step("case page after reading (owner 2026-11-27): says what happens now and next; on the user's turn the button is in that row, said once", async () => {
    const W = await seed("E2EW5555", [], 30, "phase_a");
    try {
      await page.goto(`${BASE}/cases/${W}`);
      const row = page.getByTestId("case-next");
      await row.waitFor();
      assert.match(await row.innerText(), /Merimen/);
      assert.match(await row.innerText(), /Nothing for you to do|不需要你做什么|Tiada apa/);
      assert.equal(await page.getByText(/^(Creating case|创建案件中|Mencipta kes)$/).count(), 0, "no second status at the top right");
    } finally { await db.query(`DELETE FROM cases WHERE id = $1`, [W]); }
    // a case still naming with a photo to check: the row is the user's turn and holds the one desk button
    const Y = await seed("E2EY6666", [["Front Bumper", 0.4], ["Bonnet", 0.97]], 30, "naming");
    try {
      await page.goto(`${BASE}/cases/${Y}`);
      const row = page.getByTestId("case-next");
      await row.waitFor();
      assert.match(await row.innerText(), /Your turn|轮到你|Giliran anda/);
      assert.equal(await row.getByTestId("desk-link").count(), 1, "the button sits in the row");
      assert.equal(await page.getByTestId("desk-link").count(), 1, "and nowhere else");
      assert.ok(await page.getByTestId("case-log").isVisible(), "the activity list is open without a click");
    } finally { await db.query(`DELETE FROM cases WHERE id = $1`, [Y]); }
  });
  await step("signed out while naming (session ended in another tab): the desk says so once and offers to log in again, back to this case", async () => {
    await page.goto(`${BASE}/cases/${B}/photos`);
    await page.locator("article[data-pid]").first().waitFor();
    await db.query(`DELETE FROM session WHERE user_id = (SELECT id FROM "user" WHERE email = $1)`, [email]);
    await rename(1, "Grille");
    const bar = page.getByTestId("signed-out");
    await bar.waitFor({ timeout: 5000 });
    const href = await bar.getByRole("link").getAttribute("href");
    assert.equal(href, `/login?next=${encodeURIComponent(`/cases/${B}/photos`)}`);
  });
} finally {
  await browser.close();
  await db.query(`DELETE FROM cases WHERE id = ANY($1)`, [[A, B, C, D, F].filter(Boolean)]);
  await db.end();
  console.log(`${ok} steps passed${process.exitCode ? ", some FAILED" : ""}`);
}
