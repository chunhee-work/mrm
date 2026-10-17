import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
console.log(JSON.stringify(await page.evaluate(()=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];for(let i=1;i<=n;i++){const pt=document.querySelector('[name=PPT'+i+']');if(!pt)continue;const tr=pt.closest('tr');const e=document.getElementById('PDS'+i)||document.getElementById('PTDS'+i);let d=e?(e.tagName==='INPUT'?e.value:e.textContent):tr.cells[1].textContent;o.push([d.replace(/\s+/g,' ').trim().slice(0,45),(document.querySelector('[name=PBT'+i+']')||{}).value,pt.value,(document.querySelector('[name=PDC'+i+']')||{}).value]);}return o;})));
await page.close();await b.close();
