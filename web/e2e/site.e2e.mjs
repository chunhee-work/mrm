// Whole-app QC pass in a real browser (QC round 5 onwards: the team runs this loop itself).
// Every page, desktop 1440x900 and phone 390x844, English and 中文. Fails on: console errors, React #418 / hydration,
// a page wider than the screen (innerWidth must stay the screen width, also after choosing files), text or badges cut at
// the screen edge, "1 photos" / "file(s)" style plurals, and English sentences left on a 中文 page.
// Needs a LOCAL database and a running app (prod build: `next build && next start`, or `next dev`):
//   DATABASE_URL=postgresql://…@localhost:5432/… PHOTO_STORE_DIR=/tmp/e2e-photos E2E_URL=http://localhost:3100 \
//     [E2E_SHOTS=/tmp/site-shots] [E2E_COLD=1] [E2E_SLOW_JS=600] node e2e/site.e2e.mjs
// E2E_COLD=1 opens every page in a fresh browser (nothing cached), the case where #418 showed up.
// Fake data only: synthetic placeholder pictures, a throw-away account, no Merimen, nothing is paid.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/opt/node-tools/node_modules/")("playwright")); }
const { Client } = require("pg");

const BASE = process.env.E2E_URL ?? "http://localhost:3100";
const STORE = process.env.PHOTO_STORE_DIR;
const SHOTS = process.env.E2E_SHOTS;
const COLD = !!process.env.E2E_COLD;
const SLOW = Number(process.env.E2E_SLOW_JS ?? 0);
if (!STORE || !process.env.DATABASE_URL) throw new Error("set PHOTO_STORE_DIR and DATABASE_URL (a LOCAL database)");
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL)) throw new Error("DATABASE_URL must be a local database");
mkdirSync(STORE, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const stamp = Date.now();
const email = `qc-${stamp}@example.test`;
const password = "qc-password-123";
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const file = (p) => path.join(STORE, p.replace(/[\\/]/g, "__"));

// ---- account + fake cases in every state ----
const origin = { Origin: BASE, "Content-Type": "application/json" };
const su = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: origin, body: JSON.stringify({ email, password, name: "QC Tester" }) });
if (!su.ok) throw new Error(`sign-up ${su.status}`);
await db.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
const { rows: [m] } = await db.query(`SELECT m.org_id FROM memberships m JOIN "user" u ON u.id = m.user_id WHERE u.email = $1`, [email]);
const orgId = m.org_id;
await db.query(`INSERT INTO credits_ledger (org_id, delta, reason) VALUES ($1, 5, $2)`, [orgId, `qc-grant-${stamp}`]);

const ids = [];
async function seed(key, plate, status, o = {}) {
  const id = `qc_${key}_${stamp}`;
  ids.push(id);
  await db.query(
    `INSERT INTO cases (id, org_id, plate, status, car_model, insurer, total_rm, pending_doc, error, case_data, photos_done_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${o.done ? "now()" : "NULL"}, now() - ($11 || ' minutes')::interval)`,
    [id, orgId, plate, status, o.car ?? "Perodua Myvi 1.5 AV (FAKE)", o.insurer ?? "Fake Insurance Bhd", o.total ?? null, o.pending ?? null, o.error ?? null,
      o.data ? JSON.stringify(o.data) : null, String(o.age ?? 5)]);
  await db.query(`INSERT INTO case_events (case_id, step, message) VALUES ($1,'upload','Received 1 file(s)'), ($1,'upload','Received 2 more file(s)')`, [id]);
  await db.query(`INSERT INTO case_files (case_id, kind, blob_url, original_name, size) VALUES ($1,'pdf',$2,'claim_bundle_FAKE.pdf',333000)`, [id, `local:${id}/claim.pdf`]);
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
const C = {
  naming: await seed("naming", "QCA1111", "naming", { photos: [...named, [null, null], [null, null]] }),
  // same plate again, older: both tabs show their date, which made the open tab wider than a phone's tab strip (R5-U01)
  again: await seed("again", "QCA1111", "naming", { photos: named, age: 90 }),
  one: await seed("one", "QCB2222", "naming", { photos: [["Front Bumper", 0.5]] }),
  finished: await seed("finished", "QCC3333", "pending_doc", { photos: named, done: true, pending: "Police report" }),
  pending: await seed("pending", "QCD4444", "pending_doc", { photos: named, pending: "Police report; Insurance schedule" }),
  phaseA: await seed("phasea", "QCE5555", "phase_a", { photos: named }),
  phaseB: await seed("phaseb", "QCF6666", "phase_b", { photos: named, done: true }),
  checking: await seed("checking", "QCG7777", "checking", { photos: named, done: true }),
  done: await seed("done", "QCH8888", "done", { photos: [["Front Bumper", 0.97], ["Rear Bumper", 0.97], ["Door Front LH", 0.97]], done: true, total: "4321.50" }),
  failed: await seed("failed", "QCJ9999", "failed", { error: "Something odd happened" }),
  badFile: await seed("badfile", "QCK1212", "failed", { error: "bad_file:broken.pdf|corrupt" }),
  noPlate: await seed("noplate", "", "naming", { photos: named }),
};

// ---- the checks run on every page ----
const PLURAL = /\b1 (photos|files|cases|parts|documents|credits|changes)\b|\b\d+ \w+\(s\)|\(s\)\b/;
// English words that should not be on a 中文 page (outside names, plates, car models, e-mail, Merimen terms)
const EN_WORDS = /\b(the|and|your|you|with|for|this|that|press|click|photos?|files?|cases?|done|name|read|again|upload|missing|waiting|settings|billing|password|account|sign|log in|show|hide|open|close|remove|add|back|next|continue|confirm|changed|finished)\b/i;
// "Your Company Sdn. Bhd.": the placeholder company name, shown only outside production until the owner sends the real one
const ALLOWED_EN = /(Your Company Sdn\. Bhd\.|Perodua Myvi 1\.5 AV \(FAKE\)|Fake Insurance Bhd|Merimen[^\n]*|TypeSafe|WhatsApp|Autopilotclaim|autopilotclaim|QC Tester|qc-\d+@example\.test|claim_bundle_FAKE\.pdf|IMG_\d+\.jpg|broken\.pdf|Front Bumper|Rear Bumper|Bonnet|Headlamp LH|Fender Front LH|Door Front LH|Police report|Insurance schedule|Photographs of Damaged Parts|Enter|Space|Esc|Ctrl|PDF|JPG|PNG|HEIC|ZIP|zip|RM|KB|MB|EN|BM|Bahasa Melayu|English|I-SEARCH|JPJ|RC|PIAM|Lemon Squeezy|toyyibPay|Google|Anthropic|Vercel|Neon)/g;

const problems = [];
const note = (where, what) => { problems.push(`${where}: ${what}`); console.log(`  ✗ ${where}: ${what}`); };

async function inspect(page, where, vw, lang, errs) {
  await page.waitForTimeout(900);
  const r = await page.evaluate(({ vw }) => {
    const out = { iw: window.innerWidth, sw: document.documentElement.scrollWidth, cut: [], text: document.body.innerText };
    const scrollsX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    for (const el of document.body.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || el.closest("[aria-hidden=true],.sr-only,svg,canvas")) continue;
      const b = el.getBoundingClientRect();
      if (b.width <= 1 || b.height <= 1 || b.bottom < 0) continue; // nothing to see (screen-reader-only text is 1px)
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      // past the right edge of the screen (and not inside something that scrolls sideways on purpose)
      if (own && b.right > vw + 1 && !scrollsX(el)) out.cut.push(`off-screen ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" right=${Math.round(b.right)}`);
      // text cut inside its box without an ellipsis
      if (own && s.overflow !== "visible" && s.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && !/(auto|scroll)/.test(s.overflowX))
        out.cut.push(`clipped ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
      // a badge or chip partly hidden by a parent that clips (tab strips scroll, so only what is past the strip's edge while it is the open tab)
      if (own && el.closest('[aria-current="true"]')) {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX !== "visible") { const pb = p.getBoundingClientRect(); if (b.right > pb.right + 1 || b.left < pb.left - 1) out.cut.push(`open tab "${el.textContent.trim().slice(0, 30)}" cut by its strip`); break; }
        }
      }
    }
    return out;
  }, { vw });
  if (r.iw !== vw) note(where, `page is ${r.iw}px wide on a ${vw}px screen`);
  if (r.sw > vw + 1) note(where, `scrolls sideways (${r.sw}px)`);
  for (const c of [...new Set(r.cut)].slice(0, 6)) note(where, c);
  const pl = r.text.match(PLURAL);
  if (pl) note(where, `plural: "${pl[0]}"`);
  if (lang === "zh") {
    const rest = r.text.replace(ALLOWED_EN, "").replace(/[\w.+-]+@[\w.-]+/g, "");
    const lines = rest.split("\n").filter((l) => EN_WORDS.test(l) && /[a-z]{3,} [a-z]{2,}/i.test(l));
    for (const l of lines.slice(0, 3)) note(where, `English on a 中文 page: "${l.trim().slice(0, 60)}"`);
  }
  for (const e of errs.splice(0)) note(where, e);
}

const browser = await chromium.launch();
const VIEWS = [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]];
const LANGS = ["en", "zh"];
let shots = 0;
let signedCookies = null;

async function context(view, lang, signedIn) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: SHOTS ? 2 : 1, ...(view.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  // E2E_SLOW_JS=600: each script arrives up to 600 ms late, like a first visit on a slow phone (this is what made #418 show)
  if (SLOW) await ctx.route(/\/_next\/static\/chunks\/.*\.js/, async (r) => { await new Promise((res) => setTimeout(res, Math.random() * SLOW)); await r.continue(); });
  if (signedIn) {
    if (!signedCookies) {
      const si = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } });
      if (!si.ok()) throw new Error(`sign-in ${si.status()}`);
      signedCookies = (await ctx.cookies()).filter((c) => c.name !== "lang");
    } else await ctx.addCookies(signedCookies);
  }
  return ctx;
}

async function visit(ctx, url, where, view, lang, act) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message.slice(0, 140)}`));
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(msg.text())) errs.push(`console: ${msg.text().slice(0, 140)}`); });
  const res = await page.goto(BASE + url, { waitUntil: "load" });
  if (res && res.status() >= 400) note(where, `HTTP ${res.status()}`);
  if (act) await act(page);
  await inspect(page, where, view.width, lang, errs);
  if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, `${where.replace(/[^\w.-]+/g, "_")}.png`), fullPage: true }); shots++; }
  await page.close();
}

const PUBLIC = [["landing", "/"], ["faq", "/faq"], ["how-it-works", "/how-it-works"], ["security", "/security"], ["privacy", "/privacy"], ["terms", "/terms"], ["contact", "/contact"],
  ["login", "/login"], ["signup", "/signup"], ["forgot-password", "/forgot-password"], ["reset-password", "/reset-password?token=bogus"]];
const pdf = { name: "claim_bundle_QC_FAKE_a_rather_long_file_name_for_the_list.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% fake\n") };
const jpg = (n) => ({ name: `IMG_QC_${String(n).padStart(2, "0")}_front_bumper_close_up_view.jpg`, mimeType: "image/jpeg", buffer: JPEG });
const choose = (files) => async (page) => { await page.locator('input[type="file"]').first().setInputFiles(files); await page.waitForTimeout(600); };
const APP = [
  ["dashboard", "/dashboard"],
  ["dashboard-docs", "/dashboard?view=docs"], ["dashboard-open", "/dashboard?view=open"], ["dashboard-closed", "/dashboard?view=closed"], ["dashboard-all", "/dashboard?view=all"],
  ["dashboard-search", "/dashboard?q=QC"], ["dashboard-no-match", "/dashboard?q=zzz-no-match"],
  ["new-case", "/cases/new"],
  ["new-case-files", "/cases/new", choose([pdf, ...[1, 2, 3, 4, 5, 6].map(jpg)])],
  ["new-case-bad-files", "/cases/new", choose([pdf, { name: "empty_scan_from_the_workshop.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }, { name: "photo_from_phone.heic", mimeType: "image/heic", buffer: Buffer.from("x") }, jpg(1)])],
  ...Object.entries(C).map(([k, id]) => [`case-${k}`, `/cases/${id}`]),
  ["desk", `/cases/${C.naming}/photos`],
  ["desk-done-blocked", `/cases/${C.naming}/photos`, async (p) => { await p.getByTestId("done-btn").first().click(); await p.waitForTimeout(700); }],
  ["desk-finished", `/cases/${C.finished}/photos`],
  ["settings", "/settings"],
  ["billing", "/billing"],
  ["connection", "/connection"],
  ["menu", "/dashboard", async (p) => { const b = p.locator('[aria-controls="app-menu"]:visible, [aria-controls="account-menu"]:visible').first(); await b.click(); await p.waitForTimeout(300); }],
];

try {
  for (const [vname, view] of VIEWS) for (const lang of LANGS) {
    console.log(`— ${vname} ${lang}`);
    let pub = await context(view, lang, false), app = await context(view, lang, true);
    for (const [name, url, act] of PUBLIC) {
      if (COLD) { await pub.close(); pub = await context(view, lang, false); }
      await visit(pub, url, `${vname}-${lang}-${name}`, view, lang, act);
    }
    for (const [name, url, act] of APP) {
      if (COLD) { await app.close(); app = await context(view, lang, true); }
      await visit(app, url, `${vname}-${lang}-${name}`, view, lang, act);
    }
    await pub.close(); await app.close();
  }
  // hard test (live, 2026-11-22): a signed-out link to one case must come back to that case after logging in, not to the case list
  {
    const ctx = await context(VIEWS[1][1], "en", false); const page = await ctx.newPage();
    const want = `/cases/${C.naming}/photos`;
    await page.goto(BASE + want, { waitUntil: "load" });
    const at = new URL(page.url());
    if (at.pathname !== "/login" || at.searchParams.get("next") !== want) note("login-next", `signed-out ${want} went to ${at.pathname}${at.search}`);
    await page.fill("input[type=email]", email); await page.fill("input[type=password]", password); await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname !== "/login", { timeout: 20000 }).catch(() => {});
    if (new URL(page.url()).pathname !== want) note("login-next", `after logging in landed on ${new URL(page.url()).pathname}, wanted ${want}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await db.query(`DELETE FROM cases WHERE id = ANY($1)`, [ids]);
  await db.query(`DELETE FROM credits_ledger WHERE reason = $1`, [`qc-grant-${stamp}`]);
  await db.end();
}
console.log(`${problems.length ? problems.length + " problem(s)" : "clean"}${SHOTS ? `, ${shots} screenshots in ${SHOTS}` : ""}`);
if (problems.length) process.exitCode = 1;
