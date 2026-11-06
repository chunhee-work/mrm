// print every row comment as {"<display name>": "<comment>"} (same reader as setcmt VERIFY). usage: node cmtread.mjs <cid> <ext>
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
console.log(JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('input.clsCmmt')].map(c=>{const td=c.closest('td');return [td.childNodes[0].textContent.trim(),c.value]}))));await page.close();await b.close();
