// Print how many PDF document rows a case has in Merimen (dsp_docview). usage: node listdocs_pdf.mjs <cid> <ext>
import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs'; import { readFileSync } from 'fs';
const SESS = readFileSync(process.env.SESSF || '/Users/chunhee/mrm-bot/session_base.txt', 'utf8').trim(); const [, , cid, ext] = process.argv;
const b = await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222')); const page = await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${cid}&extid=${ext}&corole=4&` + SESS, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /\d+\s[^]*Load (PDF|JPG)/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
// a document row reads "<n>\t<date>\t<name>\t\tLoad PDF" (the page header row also contains the words, so require the row number first)
const n = await page.evaluate(() => [...document.querySelectorAll('tr')].filter(tr => (/^\s*\d+\s/.test(tr.innerText) && /Load PDF/.test(tr.innerText))).length);
console.log(n); await page.close(); await b.close();
