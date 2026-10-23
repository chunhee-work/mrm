import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,CMTF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const C=JSON.parse(readFileSync(CMTF,'utf8'));
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const r=await page.evaluate((C)=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];const seen={};for(let i=1;i<=n;i++){const td=document.getElementById('PTDS'+i)||document.getElementById('PDS'+i);if(!td)continue;const d=(td.tagName==='INPUT'?td.value:td.childNodes[0].textContent).trim();seen[d]=(seen[d]||0)+1;const k=(d+'#'+seen[d]) in C?d+'#'+seen[d]:d;if(!(k in C))continue;const cm=AddCmmt('P',String(i));cm.value=C[k];if(typeof FormStoreUpdate==='function')FormStoreUpdate(cm);if(cm.onblur)cm.onblur();o.push(d);}return o;},C);
console.log('comments set on',r.join(', '));
await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(6000);
for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
console.log('VERIFY',await page.evaluate(()=>[...document.querySelectorAll('input.clsCmmt')].map(c=>{const td=c.closest('td');return td.childNodes[0].textContent.trim()+' -> '+c.value}).join(' | ')));
await page.close();await b.close();
