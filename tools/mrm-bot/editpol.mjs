// 2026-11-11: fix the AT-FAULT policy block of an existing case (dsp_clmreg) — policy no., cover, period. Insurer is not touched.
// node editpol.mjs <cid> <ext> <policyNo> <coverRegex> <from dd/mm/yyyy> <to dd/mm/yyyy> [save]
// Without "save": prints the current values + the cover options, changes nothing.
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [, , CID, EXT, POL, COV, FROM, TO, DO] = process.argv;
const SESS = readFileSync(process.env.SESSF || 'session_base.txt', 'utf8').trim();
const b = await chromium.connectOverCDP((process.env.CDP || 'http://127.0.0.1:9222'));
const page = await b.contexts()[0].newPage();
page.on('dialog', async d => { await d.accept().catch(() => {}); });
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&caseid=${CID}&extid=${EXT}&${SESS}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const cur = () => page.evaluate(() => { const g = n => { const e = document.querySelector('[name=' + n + ']'); if (!e) return '?'; return e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : (e.type === 'checkbox' ? e.checked : e.value); };
  return { pol: g('slePOLNO'), cn: g('siISCOVERNOTE'), cover: g('ddlbPOLCOVER'), from: g('slePOLFROM'), to: g('slePOLTO'), dis: (document.querySelector('[name=slePOLNO]') || {}).disabled,
    opts: [...(document.querySelector('select[name=ddlbPOLCOVER]') || { options: [] }).options].map(o => o.text.trim()) }; });
console.log('BEFORE', JSON.stringify(await cur()));
if (DO !== 'save') { await page.close(); await b.close(); process.exit(0); }
await page.evaluate(({ POL, COV, FROM, TO }) => {
  const T = (n, v) => { const e = document.querySelector('[name=' + n + ']'); if (!e) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  T('slePOLNO', POL); T('slePOLFROM', FROM); T('slePOLTO', TO);
  const c = document.querySelector('input[name=siISCOVERNOTE]'); if (c && c.checked) c.click();
  const s = document.querySelector('select[name=ddlbPOLCOVER]'); const o = [...s.options].find(x => new RegExp(COV, 'i').test(x.text.trim()));
  if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); if (s.onchange) s.onchange(); }
}, { POL, COV, FROM, TO });
await page.evaluate(() => { ['sleTRAILERREGNO', 'sleTRAILERTPREGNO'].forEach(n => { const e = document.querySelector('[name=' + n + ']'); if (e) e.removeAttribute('chkrequired'); }); });
await page.locator('a:has-text("Next (Save & Return)")').first().click({ force: true, timeout: 5000 }).catch(async () => { await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(e => /Next \(Save & Return\)/.test(e.innerText || '')); if (a) a.click(); }); });
await page.waitForTimeout(4000);
for (let i = 0; i < 6; i++) { const ok = await page.evaluate(() => { const t = [...document.querySelectorAll('input,button')].find(e => ((e.value || e.innerText || '').trim() === 'OK') && e.offsetParent !== null); if (t) { t.click(); return true; } return false; }); if (!ok) break; await page.waitForTimeout(1200); }
console.log('SAVED ->', (page.url().match(/fuseaction=([a-z_]+)/i) || [])[1]);
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&caseid=${CID}&extid=${EXT}&${SESS}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
console.log('AFTER', JSON.stringify(await cur()));
await page.close(); await b.close();
