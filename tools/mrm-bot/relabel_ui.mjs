// relabel photos via the docview "Relabel/Reorder" link (UI click, no hand-built URL)
// node relabel_ui.mjs <cid> <extid> '{"9":["General View","Side View"]}' [save]
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,JS,MODE]=process.argv;const J=JSON.parse(JS);const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const ctx=b.contexts()[0];const page=await ctx.newPage();let pop=null;page.on('popup',p=>{pop=p;});page.on('dialog',d=>d.accept().catch(()=>{}));
try{
 await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2500);
 const links=page.locator('a:has-text("Relabel/Reorder")');const n=await links.count();
 // the photos section's link is the one nearest to the photo rows: try each and pick the page whose ONM count matches the photo count
 let target=null;
 for(let i=n-1;i>=0;i--){pop=null;await links.nth(i).click();for(let k=0;k<20&&!pop;k++)await page.waitForTimeout(300);
  const tp=pop||page;await tp.waitForTimeout(2500);
  const c=await tp.evaluate(()=>[...document.querySelectorAll('input[name^=ONM]')].map(e=>e.value)).catch(()=>[]);
  console.log('link',i,'popup',!!pop,'ONM',c.length,c.slice(0,3));
  if(c.length>20){target=tp;break;} if(pop)await pop.close();else await page.goBack();await page.waitForTimeout(1500);}
 if(!target){console.log('no photo relabel page');}
 else{
  const r=await target.evaluate((J)=>{const onm=[...document.querySelectorAll('input[name^=ONM]')];const out=[],bad=[];
   for(const k in J){const e=onm[+k-1];if(!e){bad.push(k+':missing');continue;}if(e.value.trim()!==J[k][0]){bad.push(k+':is '+e.value);continue;}e.value=J[k][1];e.dispatchEvent(new Event('change',{bubbles:true}));out.push(k+'->'+J[k][1]);}
   return {out,bad};},J);
  console.log('set',r.out.length,'bad',JSON.stringify(r.bad));
  if(MODE==='save'&&!r.bad.length){await target.evaluate(()=>{var bs=[...document.querySelectorAll('input[type=button],button,input[type=submit]')].find(e=>/^\s*Save\s*$/i.test(e.value||e.innerText||''));if(bs)bs.click();});await target.waitForTimeout(4000);
   for(let i=0;i<3;i++){const ok=await target.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;}).catch(()=>false);if(!ok)break;await target.waitForTimeout(1200);}
   console.log('saved');}
 }
}finally{for(const p of ctx.pages().slice(1))await p.close().catch(()=>{});await b.close();}
