import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,DESC]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate((DESC)=>{const n=+document.querySelector('[name=PROWCNT]').value;let seen=0,del=[];for(let i=1;i<=n;i++){const pt=document.querySelector('[name=PPT'+i+']');if(!pt)continue;const e=document.getElementById('PDS'+i)||document.getElementById('PTDS'+i);const d=e?(e.tagName==='INPUT'?e.value:e.textContent).replace(/\s+/g,' ').trim():pt.closest('tr').cells[1].textContent.replace(/\s+/g,' ').trim();if(DESC.split("|").includes(d)){PQty(String(i),0);del.push(i+":"+d);}}return del;},DESC);
console.log('deleted rows',r);
await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(6000);
for(let k=0;k<3;k++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
await page.close();await b.close();
