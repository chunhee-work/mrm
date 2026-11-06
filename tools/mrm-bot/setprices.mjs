import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,PRICEF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const PR=JSON.parse(readFileSync(PRICEF,'utf8'));
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
const readRows=()=>page.evaluate(()=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];for(let i=1;i<=n;i++){const pt=document.querySelector('[name=PPT'+i+']');if(!pt)continue;const de=document.getElementById('PDS'+i)||document.getElementById('PTDS'+i);let d=de?(de.value||de.textContent||''):'';if(!d){const td=pt.closest('tr').querySelector('.clsDesc,td[id^=PTDS],td[id^=PDS]');d=td?td.textContent:'';}o.push({i,d:d.replace(/\s+/g,' ').trim(),p:pt.value,q:(pt.closest('tr').querySelector('input.clsDtlQty')||{}).value});}return o;});
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const rows=await readRows();let set=0;
for(const r of rows){const k=Object.keys(PR).find(k=>k.toLowerCase()===r.d.toLowerCase());if(!k||(process.env.FORCE!=='1'&&r.p&&parseFloat(r.p.replace(/,/g,''))>0))continue;   // FORCE=1: also overwrite a price already set
  await page.evaluate(({i,v})=>{const e=document.querySelector('[name=PPT'+i+']');e.readOnly=false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));if(e.onblur)e.onblur();},{i:r.i,v:PR[k]});set++;}
console.log('prices set',set);
await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(6000);
for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const v=await readRows();console.log('VERIFY',v.filter(r=>Object.keys(PR).some(k=>k.toLowerCase()===r.d.toLowerCase())).map(r=>r.d+' x'+r.q+' @'+r.p).join(' | '));console.log('unpriced:',v.filter(r=>!r.p||r.p==='0.00').map(r=>r.d).join(', ')||'none');
await page.close();await b.close();
