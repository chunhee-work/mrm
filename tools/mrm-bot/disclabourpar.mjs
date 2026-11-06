import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const PLATES=process.argv[2].split(',');
const SESS=readFileSync(process.argv[3],'utf8').trim();
const R=JSON.parse(readFileSync(process.argv[4],'utf8'));
async function one(ctx,PLATE){
  const D=R[PLATE];
  const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${D.cid}&extid=${D.extid}&tpins=0&${SESS}`;
  const page=await ctx.newPage();
  page.on('dialog',async d=>{await d.accept().catch(()=>{});});
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(3800);
    async function fillReal(name,val){try{const loc=page.locator(`[name=${name}]`).first();await loc.click({timeout:2500});await loc.fill(val,{timeout:2500});return true;}catch(e){return false;}}
    await fillReal('PARTDISCPC','10'); await fillReal('SPCDISCPC','0');
    await page.getByText('Labour',{exact:true}).first().click({force:true}).catch(()=>{});
    await page.waitForTimeout(1500);
    for(const n of ['LRPRATE','LMTRATE','LPNRATE','LPARATE']) await fillReal(n,'30');
    await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});
    await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});
    await page.waitForTimeout(4500);
    for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1000);}
    await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2800);
    const v=await page.evaluate(()=>{function g(n){var e=document.querySelector('[name='+n+']');return e?e.value:'?';}return 'PD='+g('PARTDISCPC')+' SP='+g('SPCDISCPC')+' L='+g('LRPRATE')+'/'+g('LMTRATE')+'/'+g('LPNRATE')+'/'+g('LPARATE');});
    const bt=await page.evaluate(()=>{var m=(document.body.innerText.match(/Std Betterment\s*\[([^\]]+)\]/i)||[])[1];return m||'?';});
    await page.close();
    return PLATE+': '+v+' | Betterment='+bt;
  }catch(e){await page.close().catch(()=>{});return PLATE+': ERR '+e.message.slice(0,45);}
}
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));
const ctx=b.contexts()[0];
const r=await Promise.all(PLATES.map(p=>one(ctx,p)));
r.forEach(x=>console.log(x));
await b.close();
