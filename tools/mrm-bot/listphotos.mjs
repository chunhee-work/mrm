import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000);
const r=await page.evaluate(()=>[...document.querySelectorAll('a[href*="SVCDOCAttView"]')].map(a=>{const t=a.closest('tr');return (a.getAttribute('href').match(/SVCDOCAttView\((\d+)/)||[])[1]+' '+(t?t.innerText.replace(/\s+/g,' ').slice(0,70):'')}));
console.log(r.join('\n'));await page.close();await b.close();
