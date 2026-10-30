// read-only price harvest from this account's own cases: node pricegrab.mjs <ids.txt: PLATE caseid extid> <out.json>
// per case: Vehicle Model + every part row that has a part number (catalogue price), from dsp_details. Resumable; 3 tabs at once.
import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync, existsSync } from 'fs';
const [,,IDS,OUT]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();
const C=readFileSync(IDS,'utf8').trim().split('\n').map(l=>l.trim().split(/\s+/)).filter(x=>x.length===3);
const res=existsSync(OUT)?JSON.parse(readFileSync(OUT,'utf8')):{};
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ctx=b.contexts()[0];
async function one([pl,cid,ext]){const page=await ctx.newPage();page.on('dialog',d=>d.dismiss().catch(()=>{}));
 try{await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${cid}&extid=${ext}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(3500);
  const r=await page.evaluate(()=>{const t=document.body.innerText;if(/Session Timeout|Not Logged On|Session not matched/.test(t))return {out:1};
   const n=+((document.querySelector('[name=PROWCNT]')||{}).value||0);const rows=[];
   for(let i=1;i<=n;i++){const pt=document.querySelector('[name=PPT'+i+']');if(!pt)continue;const pn=((document.querySelector('[name=PPN'+i+']')||{}).value||'').trim();
    const e=document.getElementById('PDS'+i)||document.getElementById('PTDS'+i);const tr=pt.closest('tr');let d=e?(e.tagName==='INPUT'?e.value:e.textContent):tr.cells[1].textContent;
    rows.push([d.replace(/\s+/g,' ').trim(),pn,pt.value,tr.innerText.replace(/\s+/g,' ').trim()]);}
   return {model:(t.match(/Vehicle Model:\s*([^\n]+)/)||['',''])[1].trim(),rows};});
  if(r.out){console.error('LOGGEDOUT');process.exit(3);}
  res[pl]={cid,...r};}catch(e){res[pl]={cid,err:e.message.slice(0,80)};}
 await page.close().catch(()=>{});}
const todo=C.filter(([pl])=>!res[pl]||res[pl].err);
for(let i=0;i<todo.length;i+=3){await Promise.all(todo.slice(i,i+3).map(one));writeFileSync(OUT,JSON.stringify(res));process.stdout.write('.');}
const v=Object.values(res);console.log('\ndone',v.length,'errors',v.filter(x=>x.err).length,'rows',v.reduce((a,x)=>a+(x.rows||[]).length,0));await b.close();
