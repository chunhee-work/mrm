// READ-ONLY: open a blank claim form, run the workshop Lookup with each keyword, print every result row. Nothing is saved.
// node wslookup.mjs session_base.txt "kw1|kw2"
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const SESS=readFileSync(process.argv[2],'utf8').trim(); const KWS=process.argv[3].split('|');
const b=await chromium.connectOverCDP('http://127.0.0.1:9222'); const ctx=b.contexts()[0]; const page=await ctx.newPage();
page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&${SESS}`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(3000);
for(const kw of KWS){
  let pop=null; const h=p=>{pop=p}; page.on('popup',h);
  await page.locator('#MTRworkshopbtn').click({force:true,timeout:6000}).catch(()=>{});
  for(let i=0;i<20&&!pop;i++) await page.waitForTimeout(350);
  page.off('popup',h);
  if(!pop){console.log(kw,'NOPOPUP');continue}
  await pop.waitForTimeout(1500);
  await pop.evaluate((kw)=>{var t=document.querySelector('input[name=MTRworkshopslcFilter],input[type=text]');t.value=kw;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));},kw);
  await pop.evaluate(()=>{var b=[...document.querySelectorAll('input[type=button],button')].find(x=>/^\s*Search\s*$/i.test(x.value||x.innerText||''));if(b)b.click();});
  await pop.waitForTimeout(3000);
  const rows=await pop.evaluate(()=>[...document.querySelectorAll('tr')].map(r=>r.innerText.replace(/\s+/g,' ').trim()).filter(t=>t&&t.length<220));
  console.log('== '+kw); rows.slice(0,40).forEach(r=>console.log('   '+r));
  await pop.close().catch(()=>{});
}
await page.close(); console.log('done');
