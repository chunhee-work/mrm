#!/usr/bin/env node
/**
 * Renders the landing page's five still frames (public/landing/bay-{0..4}.jpg and -m.jpg) from the live 3D scene.
 * They are what the page shows before the 3D has loaded, with reduced motion, or where WebGL is not available.
 * Run it again whenever the scene in src/components/landing/bay changes.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/landing-posters.mjs [http://localhost:3000]
 *
 * Needs Playwright (`npm i --no-save playwright`). Frames are saved as JPEG by the browser itself.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const origin = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "landing");
mkdirSync(out, { recursive: true });

const STOPS = [0, 0.2, 0.45, 0.7, 1];
const SIZES = [
  { suffix: "", viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, quality: 78 },
  { suffix: "-m", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, quality: 74 },
];
// software WebGL, so this also runs on a machine with no GPU
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const { suffix, quality, ...ctxOpts } of SIZES) {
  const page = await (await browser.newContext(ctxOpts)).newPage();
  await page.goto(`${origin}/?still=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction("window.__bayReady === true", null, { timeout: 180000 });
  // the frame only: no navigation, no words, no buttons
  await page.addStyleTag({ content: 'canvas{transition:none!important;opacity:1!important} header, a[aria-label*="WhatsApp"], .wrap.pointer-events-none, nextjs-portal{display:none!important}' });
  for (let i = 0; i < STOPS.length; i++) {
    await page.evaluate((t) => new Promise((r) => { window.__setT(t); requestAnimationFrame(() => requestAnimationFrame(r)); }), STOPS[i]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(out, `bay-${i}${suffix}.jpg`), type: "jpeg", quality });
    console.log(`bay-${i}${suffix}.jpg`);
  }
}
await browser.close();
