import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,SESSF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&personal=1&stat=2&totalcase=60&setpage=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const h=await page.content();const m=h.match(new RegExp('caseid='+CID+'&(?:amp;)?extid=(\\d+)'));console.log(m?m[1]:'NOTFOUND');
const a=await page.evaluate((CID)=>{const r=[...document.querySelectorAll('tr')].find(t=>t.innerHTML.includes('caseid='+CID));return r?r.innerText.replace(/\s+/g,' ').slice(0,200):''},CID);console.log(a);
await page.close();await b.close();
