// Paintwork Materials: Edit -> Paint Manufacturer "Other" + "anything" -> consumables UNticked -> Submit -> OK -> Save (user video 2026-10-07)
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
export async function paintStep(page){
  const clickOK=async()=>{for(let i=0;i<4;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^(OK|Ok)$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1500);}};
  const has=await page.evaluate(()=>typeof PWEdit==='function');if(!has)return 'noPWEdit';
  await page.evaluate(()=>PWEdit(0,0));await page.waitForTimeout(2000);
  const st=await page.evaluate(()=>{const m=document.getElementById('slePNTMAN');if(!m)return 'noPopup';m.value='-1';m.dispatchEvent(new Event('change',{bubbles:true}));
    const c=document.getElementById('sleMANCUSTOM');c.style.display='';c.value='anything';c.dispatchEvent(new Event('change',{bubbles:true}));c.dispatchEvent(new Event('blur',{bubbles:true}));
    const k=document.getElementById('slePNTCONSUM');if(k&&k.checked)k.click();
    const s=[...document.querySelectorAll('input[type=button]')].find(e=>e.value==='Submit'&&/PWSubmitConfirm/.test(e.getAttribute('onclick')||''));if(!s)return 'noSubmit';s.click();return 'submitted';});
  if(st!=='submitted')return st;
  await page.waitForTimeout(1500);await clickOK();await page.waitForTimeout(4000);await clickOK();
  const man=await page.evaluate(()=>(document.getElementById('pwm_man0')||{}).innerText||'?');
  await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});
  await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});await page.waitForTimeout(5000);await clickOK();
  return 'man='+man;
}
if(process.argv[1].endsWith('pwset.mjs')){
  const PLATES=process.argv[2].split(',');const SESS=readFileSync(process.argv[3],'utf8').trim();const E=JSON.parse(readFileSync(process.argv[4],'utf8'));
  const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const ctx=b.contexts()[0];
  for(const P of PLATES){const D=E[P];const page=await ctx.newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
    const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${D.cid}&extid=${D.extid}&tpins=0&${SESS}`;
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4000);
    const r=await paintStep(page);
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3500);
    const v=await page.evaluate(()=>({man:(document.getElementById('pwm_man0')||{}).innerText||'?',g:JSON.stringify((window.gPWM||{})[0]||{}).slice(0,160),cb:!!document.querySelector('[name=MPWCB1]')}));
    console.log(P,r,'| VERIFY after reload: man='+v.man,'gPWM='+v.g,'MPWCB1present='+v.cb);await page.close();}
  await b.close();}
