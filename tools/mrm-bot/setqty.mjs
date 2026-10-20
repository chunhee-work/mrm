import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,JS]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const Q=JSON.parse(JS);
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
try{
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const r=await page.evaluate((Q)=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];for(let i=1;i<=n;i++){const td=document.getElementById('PTDS'+i)||document.getElementById('PDS'+i);if(!td)continue;const d=(td.tagName==='INPUT'?td.value:td.childNodes[0].textContent).trim();for(const k in Q){if(d.startsWith(k)){const e=document.querySelector('[name=PBT'+i+']');if(e){e.readOnly=false;e.value=Q[k];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));if(e.onchange)e.onchange();o.push(d+'='+Q[k]);}}}}return o;},Q);
console.log('set',r.join(', '));
await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(6000);
for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
}finally{await page.close().catch(()=>{});await b.close();}
