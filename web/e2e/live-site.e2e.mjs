// Live QC pass against the deployed site as the smoke account (no uploads, no case creation, no Merimen). Every page and every case of the
// account, desktop + phone, EN/中文/BM. E2E_COLD=1 E2E_SLOW_JS=600 for first-visit loads. Account file: SMOKE_ACCOUNT_FILE (lines "email: …", "password: …").
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path";
const { chromium } = createRequire("/opt/node-tools/node_modules/")("playwright");
const BASE = process.env.E2E_URL ?? "https://app.autopilotclaim.com";
const acct = fs.readFileSync(process.env.SMOKE_ACCOUNT_FILE ?? "/mnt/project-files/mrm-web/smoke-account.txt", "utf8");
const email = acct.match(/email:\s*(\S+)/)[1], password = acct.match(/password:\s*(\S+)/)[1];
const SHOTS = process.env.E2E_SHOTS; const COLD = !!process.env.E2E_COLD; const SLOW = Number(process.env.E2E_SLOW_JS ?? 0);
const LANGS = (process.env.LANGS ?? "en,zh,ms").split(",");
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

// ---- the checks run on every page ----
const PLURAL = /\b1 (photos|files|cases|parts|documents|credits|changes)\b|\b\d+ \w+\(s\)|\(s\)\b/;
// English words that should not be on a 中文 page (outside names, plates, car models, e-mail, Merimen terms)
const EN_WORDS = /\b(the|and|your|you|with|for|this|that|press|click|photos?|files?|cases?|done|name|read|again|upload|missing|waiting|settings|billing|password|account|sign|log in|show|hide|open|close|remove|add|back|next|continue|confirm|changed|finished)\b/i;
// "Your Company Sdn. Bhd.": the placeholder company name, shown only outside production until the owner sends the real one
const ALLOWED_EN = /(Honda City[^\n]*|Proton[^\n]*|Perodua[^\n]*|Toyota[^\n]*|\(FAKE\)|smoke-tester@autoclaim\.invalid|Copy|Paste|JTE4321|WXY9999|TST1234|Your Company Sdn\. Bhd\.|Perodua Myvi 1\.5 AV \(FAKE\)|Fake Insurance Bhd|Merimen[^\n]*|TypeSafe|WhatsApp|Autopilotclaim|autopilotclaim|QC Tester|qc-\d+@example\.test|claim_bundle_FAKE\.pdf|IMG_\d+\.jpg|broken\.pdf|Front Bumper|Rear Bumper|Bonnet|Headlamp LH|Fender Front LH|Door Front LH|Police report|Insurance schedule|Photographs of Damaged Parts|Enter|Space|Esc|Ctrl|PDF|JPG|PNG|HEIC|ZIP|zip|RM|KB|MB|EN|BM|Bahasa Melayu|English|I-SEARCH|JPJ|RC|PIAM|Lemon Squeezy|toyyibPay|Google|Anthropic|Vercel|Neon)/g;

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
let shots = 0, loads = 0, cookies = null;
async function context(view, lang, signedIn) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: SHOTS ? 2 : 1, ...(view.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: "lang", value: lang, url: BASE }]);
  if (SLOW) await ctx.route(/\/_next\/static\/chunks\/.*\.js/, async (r) => { await new Promise((res) => setTimeout(res, Math.random() * SLOW)); await r.continue(); });
  if (signedIn) {
    if (!cookies) { const si = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: BASE } }); if (!si.ok()) throw new Error(`sign-in ${si.status()}`); cookies = (await ctx.cookies()).filter((c) => c.name !== "lang"); }
    else await ctx.addCookies(cookies);
  }
  return ctx;
}
async function visit(ctx, url, where, view, lang, act) {
  if (ONLY && !ONLY.test(where)) return;
  const page = await ctx.newPage(); const errs = []; loads++;
  page.on("pageerror", (e) => errs.push(`page error: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, "").slice(0, 80)}`); });
  let res; try { res = await page.goto(BASE + url, { waitUntil: "load", timeout: 45000 }); } catch (e) { note(where, `load failed: ${e.message.slice(0, 80)}`); await page.close(); return; }
  if (res && res.status() >= 400) note(where, `HTTP ${res.status()}`);
  if (act) { try { await act(page); } catch (e) { note(where, `action failed: ${e.message.split("\n")[0].slice(0, 120)}`); } }
  await inspect(page, where, view.width, lang, errs);
  if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, `${where.replace(/[^\w.-]+/g, "_")}.png`), fullPage: true }); shots++; }
  await page.close();
}
const PUBLIC = [["landing", "/"], ["faq", "/faq"], ["how-it-works", "/how-it-works"], ["security", "/security"], ["privacy", "/privacy"], ["terms", "/terms"], ["contact", "/contact"],
  ["login", "/login"], ["signup", "/signup"], ["forgot-password", "/forgot-password"], ["reset-password", "/reset-password?token=bogus"], ["not-found", "/this-page-does-not-exist"]];
const jpg = (n) => ({ name: `IMG_QC_${String(n).padStart(2, "0")}_front_bumper_close_up_view.jpg`, mimeType: "image/jpeg", buffer: JPEG });
const choose = (files) => async (page) => { await page.locator('input[type="file"]').first().setInputFiles(files); await page.waitForTimeout(600); };
// discover the account's cases
const probe = await context(VIEWS[0][1], "en", true); const pp = await probe.newPage();
await pp.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
// the dashboard is one page now: a case is a line (li[data-line=<id>]) that opens in place. E2E_MAX_CASES caps how many are walked.
const caseIds = (await pp.$$eval("li[data-line]", (ls) => [...new Set(ls.map((l) => l.getAttribute("data-line")))])).slice(0, Number(process.env.E2E_MAX_CASES ?? 8));
await probe.close();
console.log("cases", caseIds.length);
const APP = [
  ["dashboard", "/dashboard"], ["dashboard-q", "/dashboard?q=zzz-no-match"], ["dashboard-open", "/dashboard?view=open"], ["dashboard-closed", "/dashboard?view=closed"],
  ["new-case", "/cases/new"],
  // files are sent as soon as they are picked, so on the live site only picks the page refuses are tried (photos with no claim PDF)
  ["new-case-files", "/cases/new", choose([1, 2, 3, 4, 5, 6].map(jpg))],
  ["new-case-bad-files", "/cases/new", choose([{ name: "empty_scan_from_the_workshop.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }, { name: "photo_from_phone.heic", mimeType: "image/heic", buffer: Buffer.from("x") }, jpg(1)])],
  ["case-bogus", "/cases/00000000-0000-0000-0000-000000000000"],
  ...caseIds.map((id) => [`line-${id.slice(0, 8)}`, `/dashboard?open=${id}`, async (p) => { await p.waitForSelector('[data-testid="home-more"]', { timeout: 15000 }); await p.waitForTimeout(1500); }]),
  ...caseIds.map((id) => [`case-${id.slice(0, 8)}`, `/cases/${id}`]),
  ...caseIds.map((id) => [`desk-${id.slice(0, 8)}`, `/cases/${id}/photos`]),
  ["settings", "/settings"], ["billing", "/billing"], ["connection", "/connection"],
  ["menu", "/dashboard", async (p) => { await p.locator('[aria-controls="app-menu"]:visible, [aria-controls="account-menu"]:visible').first().click(); await p.waitForTimeout(300); }],
];
const t0 = Date.now();
for (const [vname, view] of VIEWS) for (const lang of LANGS) {
  console.log(`— ${vname} ${lang}`);
  let pub = await context(view, lang, false), app = await context(view, lang, true);
  for (const [name, url, act] of PUBLIC) { if (COLD) { await pub.close(); pub = await context(view, lang, false); } await visit(pub, url, `${vname}-${lang}-${name}`, view, lang, act); }
  for (const [name, url, act] of APP) { if (COLD) { await app.close(); app = await context(view, lang, true); } await visit(app, url, `${vname}-${lang}-${name}`, view, lang, act); }
  await pub.close(); await app.close();
}
await browser.close();
console.log(`${loads} loads in ${Math.round((Date.now() - t0) / 1000)}s, ${problems.length ? problems.length + " problem(s)" : "clean"}${SHOTS ? `, ${shots} shots` : ""}`);
fs.writeFileSync(process.env.OUT ?? "/tmp/live-site-problems.txt", problems.join("\n"));
