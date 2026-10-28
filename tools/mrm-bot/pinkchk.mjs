// list empty required (pink) fields + police station on the Adjuster Report. usage: node pinkchk.mjs ids.txt
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const ids=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split(/\s+/));const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',d=>d.accept().catch(()=>{}));
for(const [p,c,e] of ids){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain&caseid=${c}&extid=${e}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
 const r=await page.evaluate(()=>{const pink=[...document.querySelectorAll('input,select,textarea')].filter(x=>getComputedStyle(x).backgroundColor==='rgb(242, 204, 204)'&&!(x.value||'').trim()&&x.offsetParent!==null).map(x=>x.name||x.id);
  const g=n=>{const x=document.querySelector('[name='+n+']');return x?(x.value||''):'-'};return {pink,station:g('vaCDPOLICESTATION'),ipd:g('slePOLICEDCODE'),odo:g('sleODO'),colour:(document.querySelector('[name=ddlbCOLORID]')||{}).selectedOptions?.[0]?.text||''};});
 console.log(p,JSON.stringify(r));}
await page.close();await b.close();
