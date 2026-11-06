import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate(()=>[...document.querySelectorAll('tr')].filter(t=>/Sensor|Hinge/i.test(t.innerText)&&t.innerText.length<200).map(t=>t.innerText.split('\n')[0].trim()+' => '+[...t.querySelectorAll('input[type=text],textarea,input:not([type])')].map(i=>i.name+'='+i.value).filter(s=>/CMT|DESC|REM/i.test(s)).join(',')));
console.log(JSON.stringify(r));await page.close();await b.close();
