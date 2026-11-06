// print estimate totals (parts/labour/misc/grand) from dsp_details. usage: node esttotal.mjs ids.txt
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const ids=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split(/\s+/));const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',d=>d.accept().catch(()=>{}));
for(const [p,c,e] of ids){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${c}&extid=${e}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4000);
 const t=await page.evaluate(()=>document.body.innerText);const lines=t.split('\n').filter(l=>/total|grand|nett|amount/i.test(l)&&/\d/.test(l)).map(l=>l.replace(/\s+/g,' ').trim()).slice(0,12);console.log(p,JSON.stringify(lines));}
await page.close();await b.close();
