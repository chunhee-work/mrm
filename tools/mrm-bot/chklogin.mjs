// prints OK or LOGGEDOUT for the current session_base.txt (opens the worklist page once)
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
// user 2026-10-30: never test with an OLD account's session (it logs the newly logged-in account out) -> use SESSF, else the NEWEST session_*.txt
import { readdirSync, statSync } from 'fs';
const SF=process.env.SESSF||readdirSync('.').filter(f=>/^session_\w+\.txt$/.test(f)).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0];
if(!process.env.SESSF&&SF!=='session_base.txt'){console.error('newest session is',SF,'(another account) -> not testing session_base; set SESSF');console.log('OTHER-ACCOUNT '+SF);process.exit(0);}
const SESS=readFileSync(SF,'utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&${SESS}`,{waitUntil:'domcontentloaded'}).catch(()=>{});await page.waitForTimeout(2500);
const t=await page.evaluate(()=>document.body?document.body.innerText:'').catch(()=>'');console.log(/Not Logged|Please login|Session Timeout/i.test(t)?'LOGGEDOUT':'OK');await page.close();await b.close();
