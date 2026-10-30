// reorder photos via the docview "Relabel/Reorder" page (UI click, sets the order boxes SDO*). node reorder_ui.mjs <cid> <ext> <map.json {"<current pos>":["<name now>",<new pos>]}> [save]
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,MF,MODE]=process.argv;const J=JSON.parse(readFileSync(MF,'utf8'));const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ctx=b.contexts()[0];const page=await ctx.newPage();let pop=null;page.on('popup',p=>{pop=p;});page.on('dialog',d=>d.accept().catch(()=>{}));
try{await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2500);
 const links=page.locator('a:has-text("Relabel/Reorder")');const n=await links.count();let target=null;
 for(let i=n-1;i>=0;i--){pop=null;await links.nth(i).click();for(let k=0;k<20&&!pop;k++)await page.waitForTimeout(300);const tp=pop||page;await tp.waitForTimeout(2500);
  const c=await tp.evaluate(()=>document.querySelectorAll('input[name^=ONM]').length).catch(()=>0);if(c>20){target=tp;break;}if(pop)await pop.close();else await page.goBack();await page.waitForTimeout(1500);}
 if(!target){console.log('no photo page');process.exit(1);}
 const r=await target.evaluate((J)=>{const rows=[...document.querySelectorAll('input[name^=ONM]')].map(o=>{const tr=o.closest('tr');return {o,sdo:tr.querySelector('input[name^=SDO]')}});
  const bad=[];rows.forEach((x,i)=>{const k=String(i+1);if(!J[k]){bad.push(k+':no map');return;}if(x.o.value.trim()!==J[k][0])bad.push(k+':is '+x.o.value);if(+x.sdo.value!==i+1)bad.push(k+':sdo '+x.sdo.value);});
  if(rows.length!==Object.keys(J).length)bad.push('count '+rows.length);
  if(!bad.length)rows.forEach((x,i)=>{x.sdo.value=String(J[String(i+1)][1]);x.sdo.dispatchEvent(new Event('change',{bubbles:true}));x.sdo.dispatchEvent(new Event('blur'));});
  return {bad,n:rows.length};},J);
 console.log('rows',r.n,'bad',JSON.stringify(r.bad));
 if(MODE==='save'&&!r.bad.length){await target.evaluate(()=>{const bs=[...document.querySelectorAll('input[type=button],button,input[type=submit]')].find(e=>/^\s*Save\s*$/i.test(e.value||e.innerText||''));if(bs)bs.click();});await target.waitForTimeout(5000);
  for(let i=0;i<3;i++){const ok=await target.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;}).catch(()=>false);if(!ok)break;await target.waitForTimeout(1200);}
  console.log('saved');}
}finally{for(const p of ctx.pages())if(p!==ctx.pages()[0])await p.close().catch(()=>{});await b.close();}
