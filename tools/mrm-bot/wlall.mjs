// list this account's cases from the adjuster worklist: node wlall.mjs <stat> [totalcase] [setpage]  -> "PLATE caseid extid" lines (read-only)
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,STAT='2',TOT='500',PG='0']=process.argv;const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&personal=${process.env.PERSONAL||1}&stat=${STAT}&totalcase=${TOT}&setpage=${PG}&${SESS}`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForTimeout(6000);
const r=await page.evaluate(()=>[...document.querySelectorAll('tr')].map(t=>{const a=t.querySelector('a[href*="caseid="]');if(!a)return null;const m=a.href.match(/caseid=(\d+)&(?:amp;)?extid=(\d+)/);const pl=(t.innerText.match(/\*([A-Z0-9]+)/)||[])[1];return m&&pl?pl+' '+m[1]+' '+m[2]:null}).filter(Boolean));
const out=[...new Set(r)];console.log(out.join('\n'));console.error('stat',STAT,'cases',out.length);await page.close();await b.close();
