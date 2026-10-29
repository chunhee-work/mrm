// prints OK or LOGGEDOUT for the current session_base.txt (opens the worklist page once)
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&${SESS}`,{waitUntil:'domcontentloaded'}).catch(()=>{});await page.waitForTimeout(2500);
const t=await page.evaluate(()=>document.body?document.body.innerText:'').catch(()=>'');console.log(/Not Logged|Please login|Session Timeout/i.test(t)?'LOGGEDOUT':'OK');await page.close();await b.close();
