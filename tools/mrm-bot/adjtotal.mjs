// Adj Rpt grand total from the Claim Subfolder page (the RM figure the 6k rule uses). usage: node adjtotal.mjs ids.txt
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const ids=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split(/\s+/));const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',d=>d.accept().catch(()=>{}));
for(const [p,c,e] of ids){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_clmheader&caseid=${c}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3500);
 const t=await page.evaluate(()=>document.body.innerText);const m=[...t.matchAll(/RM\s?([\d,]+\.\d\d)/g)].map(x=>x[1]);console.log(p,m.length?m[0]:(t.includes('Not Logged')?'LOGGEDOUT':'?'),JSON.stringify(m.slice(0,3)));}
await page.close();await b.close();
