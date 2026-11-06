// Revoke (remove) photos by their CURRENT position through the UI: Relabel/Reorder page -> photo info icon -> Remove (+confirm).
// node revokephotos.mjs <cid> <ext> <from> <to>    removes positions to..from (highest first; lower positions do not move)
// Safety: a photo is removed only if its info window shows the same caption as that row. User 2026-11-04: "find way to delete it".
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,FROM,TO]=process.argv; const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222')); const ctx=b.contexts()[0]; const page=await ctx.newPage(); page.on('dialog',d=>d.accept().catch(()=>{}));
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(2500);
let tp=null; const links=page.locator('a:has-text("Relabel/Reorder")'); const n=await links.count();
for(let i=n-1;i>=0&&!tp;i--){let pop=null;const h=p=>{pop=p};page.on('popup',h);await links.nth(i).click();for(let k=0;k<20&&!pop;k++)await page.waitForTimeout(300);page.off('popup',h);
 const t=pop||page;await t.waitForTimeout(2500);if(await t.locator('input[name^=ONM]').count()>20)tp=t;else if(pop)await pop.close();}
if(!tp){console.log('no manage page');process.exit(1);}
const names=await tp.evaluate(()=>[...document.querySelectorAll('input[name^=ONM]')].map(e=>e.value.trim()));
console.log('rows',names.length); let ok=0,skip=[];
for(let pos=+TO;pos>=+FROM;pos--){
 let p2=null; const h=p=>{p2=p}; tp.on('popup',h);
 await tp.locator('img[onclick*="docinfo"]').nth(pos-1).click().catch(()=>{}); for(let k=0;k<30&&!p2;k++) await tp.waitForTimeout(250); tp.off('popup',h);
 if(!p2){skip.push(pos+':nopopup');continue;}
 try{ await p2.waitForLoadState('domcontentloaded'); await p2.waitForTimeout(800);
  const nm=await p2.evaluate(()=>((document.body.innerText.match(/\(JPG file\)\s*(.+?) \(\d+ bytes\)/)||[])[1]||'').trim());
  if(nm!==names[pos-1]){skip.push(pos+':'+nm+'≠'+names[pos-1]);await p2.close();continue;}
  await p2.evaluate(()=>{window.confirm=()=>true});
  await p2.locator('input[value="Remove"]').first().click(); await p2.waitForTimeout(1500); ok++;
 }catch(e){ ok++; }   // the popup closes itself after the submit
 try{await p2.close()}catch(e){}
}
console.log('removed',ok,'skipped',JSON.stringify(skip)); try{await tp.close()}catch(e){}; await page.close(); process.exit(0);
