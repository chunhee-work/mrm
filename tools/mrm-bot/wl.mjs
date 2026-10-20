import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&personal=1&stat=2&totalcase=60&setpage=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate(()=>[...document.querySelectorAll('tr')].map(t=>{const a=t.querySelector('a[href*="caseid="]');if(!a)return null;const m=a.href.match(/caseid=(\d+)&(?:amp;)?extid=(\d+)/);const pl=(t.innerText.match(/\*([A-Z0-9]+)/)||[])[1];return m&&pl?pl+' '+m[1]+' '+m[2]:null}).filter(Boolean));
console.log([...new Set(r)].join('\n'));await page.close();await b.close();
