import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const PLATES=process.argv[2].split(',');
const SESS=readFileSync(process.argv[3],'utf8').trim();
const R=JSON.parse(readFileSync(process.argv[4],'utf8'));
const portionMap={'rear':'rear','front':'front','right-side':'right side','left-side':'left side','rear-left':'rear left','front-right':'front right','rear-right':'rear right','front-left':'front left'};
function narrs(D){const portion=portionMap[D.impact]||'side';const m=(D.betterment||'').match(/([\d.]+)\s*yr\(s\)\s*-\s*(\d+)%/);const age=m?m[1]:'?',pct=m?m[2]:'0';var P='The accident occurred due to the subject vehicle was said to have knocked by a third party '+(D.tpKind||'m/car')+' reg. no. '+D.afplate+' on the '+portion+' portion.';var C='Our visual inspection of the subject vehicle upon sighting the police report No: '+D.police+' revealed that the damage noted is consistent with the reported accident.';var N={500:P,510:C,520:'We have recommended the parts pricing based on franchise parts prices where in a discount of 10% have been applied.',530:'This report is strictly on a Without Prejudice basis.',540:'In view that the age of the subject vehicle is '+age+' years, we have applied '+pct+'% betterment on all franchise parts recommended.'};if(D.TL==='Yes'||D.TL===true)N[550]='In view of the extent of damage sustained, the subject vehicle is deemed BEYOND ECONOMICAL REPAIR and we recommend this claim be settled on a TOTAL LOSS basis.';return N;}
async function one(ctx,PLATE){
  const D=R[PLATE]; const N=narrs(D); const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain&caseid=${D.cid}&extid=${D.extid}&${SESS}`;
  const page=await ctx.newPage(); page.on('dialog',async d=>{await d.accept().catch(()=>{});});
  try{
    for(let attempt=0;attempt<2;attempt++){
      await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
      await page.evaluate(()=>{var t=[...document.querySelectorAll('[onclick*="mseClick"]')].find(e=>/Narratives/.test(e.innerText||''));if(t)t.click();});
      await page.waitForTimeout(2200);
      await page.evaluate((N)=>{var isTL=!N[540];Object.keys(N).forEach(function(slot){var cb=document.querySelector('input[name=cbxNarr][value="'+slot+'"]');if(cb&&!cb.checked)cb.click();var para=document.querySelector('[name=mlePara'+slot+']');if(para){para.value=N[slot];para.dispatchEvent(new Event('change',{bubbles:true}));}if(slot==='530'){var tt=document.querySelector('[name=AWTitle530]');if(tt){tt.value='WITHOUT PREJUDICE';tt.dispatchEvent(new Event('change',{bubbles:true}));}}if(slot==='550'){var t5=document.querySelector('[name=AWTitle550]');if(t5){t5.value='TOTAL LOSS';t5.dispatchEvent(new Event('change',{bubbles:true}));}}});},N);
      await page.waitForTimeout(700);
      await page.evaluate(()=>{try{SaveReport(1);}catch(e){}});
      await page.waitForTimeout(6000);
      for(let i=0;i<4;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1300);}
      await page.waitForTimeout(1200);
    }
    // verify
    await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
    await page.evaluate(()=>{var t=[...document.querySelectorAll('[onclick*="mseClick"]')].find(e=>/Narratives/.test(e.innerText||''));if(t)t.click();});
    await page.waitForTimeout(2200);
    const chk=await page.evaluate((slots)=>{return slots.map(function(slot){var cb=document.querySelector('input[name=cbxNarr][value="'+slot+'"]');var para=document.querySelector('[name=mlePara'+slot+']');return slot+':'+(cb&&cb.checked?'✓':'✗')+(para&&para.value.trim().length>5?'T':'0');}).join(' ');},Object.keys(N));
    await page.close(); return PLATE+' VERIFY: '+chk;
  }catch(e){await page.close().catch(()=>{});return PLATE+': ERR '+e.message.slice(0,45);}
}
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx=b.contexts()[0];
const r=await Promise.all(PLATES.map(p=>one(ctx,p)));
r.forEach(x=>console.log(x));
await b.close();
