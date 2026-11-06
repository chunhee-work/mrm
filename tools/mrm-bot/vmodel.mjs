import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs'; import { readFileSync } from 'fs';
const SESS=readFileSync('/Users/chunhee/mrm-bot/session_base.txt','utf8').trim();
const ids=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split(' '));
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.dismiss().catch(()=>{});});
const out={};
for(const [p,c,e] of ids){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${c}&extid=${e}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000);
 const t=await page.evaluate(()=>document.body.innerText);const m=t.match(/Vehicle Model\s*:?\s*([^\n]+)/);out[p]=m?m[1].trim():(t.includes('Not Logged')?'LOGGEDOUT':'?');}
console.log(JSON.stringify(out,null,1));await page.close();await b.close();
