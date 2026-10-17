import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,PARTSF,MODE]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const P=JSON.parse(readFileSync(PARTSF,'utf8'));
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
const existing=await page.evaluate(()=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];for(let i=1;i<=n;i++){const d=document.getElementById('PDS'+i);if(d&&d.value)o.push(d.value.trim().toLowerCase());}return o;});
let added=0;
for(const [g,desc,price,qty,cmt] of P){ if(existing.includes(desc.toLowerCase())) continue;
  const r=await page.evaluate(({g,desc,price,qty,cmt})=>{const gp=document.getElementById('PADDGP');gp.setAttribute('KEY',g);gp.value=oest.PGrp[g];
    const ds=document.getElementById('PADDDS');ds.value=desc;const pt=document.getElementById('PADDPT');pt.value=price;
    try{PCloneRow(null,true);}catch(e){return 'ERR '+e.message;}
    const row=document.getElementById('PROWCNT').value;
    if(qty&&qty!=='1'){const q=document.getElementsByName('PBT'+row)[0];if(q){q.value=qty;if(typeof FormStoreUpdate==='function')FormStoreUpdate(q);q.dispatchEvent(new Event('change',{bubbles:true}));}}
    if(cmt){const c=document.getElementById('PCM'+row);if(c){c.value=cmt;if(c.onblur)c.onblur();}}
    return 'ok';},{g,desc,price,qty:qty||'1',cmt:cmt||''});
  if(r!=='ok'){console.log(desc,r);} else added++; await page.waitForTimeout(250);
  for(let i=0;i<2;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(500);}
}
console.log('added',added,'of',P.length,'(existing',existing.length+')');
if(MODE==='save'){await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(6000);
 for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
 const v=await page.evaluate(()=>{const n=+document.querySelector('[name=PROWCNT]').value;const o=[];for(let i=1;i<=n;i++){const d=document.getElementById('PDS'+i);const pt=document.querySelector('[name=PPT'+i+']');if(!d)continue;const tb=d.closest('tbody');let h=tb;while(h&&!(h.previousElementSibling&&/clsPartGroup|grp/i.test(h.previousElementSibling.className||'')))h=h.previousElementSibling;o.push(d.value+'='+(pt?pt.value:'?'));}return n+' rows: '+o.join(' | ');});
 console.log('VERIFY',v);}
await page.close();await b.close();
