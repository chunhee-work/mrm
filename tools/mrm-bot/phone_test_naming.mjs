// 2026-11-09: phone test of the 照片命名台 (iPhone size, touch). Own headless Chrome (temp profile), files served by
// request interception from a local folder (no server). Measures how far the tapped card moves on screen.
//   node phone_test_naming.mjs <dir> <page.html>
import { chromium, devices } from 'playwright-core';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
const [DIR, PAGE] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
await ctx.route('https://t.test/**', r => {
  const p = join(DIR, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!existsSync(p)) return r.fulfill({ status: 404, body: '' });
  r.fulfill({ status: 200, body: readFileSync(p), contentType: p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/json' });
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('https://t.test/' + PAGE); await page.waitForTimeout(1500);
const top = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null }, sel);
const res = [];
async function step(label, sel, act) {
  await page.evaluate(s => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 300) }, sel);
  await page.waitForTimeout(400);
  const a = await top(sel); const y0 = await page.evaluate(() => scrollY);
  await act(); await page.waitForTimeout(1200);
  const c = await top(sel); const y1 = await page.evaluate(() => scrollY);
  const ne = await page.evaluate(() => [...document.querySelectorAll(".card.edited")].map(e => e.id).join(","));res.push(`${label}: card moved ${c - a}px (scrollY ${y0} -> ${y1}) edited=[${ne}]`);
}
// 1. tap an "其他可能" option (save -> render)
const alt = await page.$('#grid .card .alts button');
if (alt) { const id = await alt.evaluate(e => '#' + e.closest('.card').id); await step('tap 其他可能', id, () => page.tap(id + ' .alts button')); }
// 2. tap the name box, type, then tap elsewhere (blur -> save)
await step('edit name + blur', '#p6', async () => { await page.tap('#p6 .nm'); await page.waitForTimeout(300); await page.keyboard.type('Bonnet'); await page.tap('#p6 .ph'); });
// 3. tap Copy then Paste on another card
await step('Copy + Paste', '#p8', async () => { await page.tap('#p7 .paste'); await page.waitForTimeout(200); await page.tap('#p8 .paste:nth-of-type(2)'); });
// 4. swipe (scroll) starting ON a button: should only scroll, never save
const n0 = await page.evaluate(() => document.querySelectorAll('.card.edited').length);
const bx = await (await page.$('#p10 .paste')).boundingBox();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx.x + 10, y: bx.y + 10 }] });
for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx.x + 10, y: bx.y + 10 - k * 25 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(800);
const n1 = await page.evaluate(() => document.querySelectorAll('.card.edited').length);
res.push(`swipe on a button: edited cards ${n0} -> ${n1}` + (n1 !== n0 ? '  ❌ swipe saved something' : ''));
// 5. layout: anything wider than the screen?
const wide = await page.evaluate(() => { const W = innerWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > W + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.tabs,.alts') }).slice(0, 5).map(e => e.className || e.tagName) });
res.push('wider than screen: ' + (wide.length ? wide.join(', ') : 'none'));
await page.screenshot({ path: join(DIR, PAGE + '.png') });
console.log(res.join('\n')); await b.close();
