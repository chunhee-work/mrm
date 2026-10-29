// print misc rows (name = price) from dsp_details. usage: node miscread.mjs <cid> <ext>
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4500);
console.log(JSON.stringify(await page.evaluate(()=>{function rowName(el){var tr=el.closest('tr');if(!tr)return'';var tds=tr.querySelectorAll('td');for(var j=0;j<tds.length;j++){var t=(tds[j].innerText||'').trim();if(t&&!/^[<>=*]$/.test(t))return t;}return'';}
 const n=+(document.querySelector('[name=MROWCNT]')||{}).value||0;const o=[];for(let k=1;k<=n;k++){const m=document.querySelector('[name=MMI'+k+']');if(m)o.push([rowName(m).slice(0,60),m.value]);}return o;})));await page.close();await b.close();
