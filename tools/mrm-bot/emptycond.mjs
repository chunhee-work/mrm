import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
// list rows with an EMPTY damage condition. usage (in ~/mrm-bot): node emptycond.mjs ids.txt   (lines: PLATE caseid extid)
const ids=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split(' '));const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
for(const [p,c,e] of ids){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${c}&extid=${e}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3500);
 const r=await page.evaluate(()=>{const n=+(document.querySelector('[name=PROWCNT]')||{}).value||0;const o=[];for(let i=1;i<=n;i++){const e=document.querySelector('[name=PDC'+i+']');const td=document.getElementById('PTDS'+i)||document.getElementById('PDS'+i);if(!e||!td)continue;const d=(td.tagName==='INPUT'?td.value:td.childNodes[0].textContent).trim();if(!(e.value||'').trim())o.push(d+(e.readOnly?' (readonly)':''));}return o;});
 console.log(p,JSON.stringify(r));}
await page.close();await b.close();
