import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
// set misc prices only (no paint popup, no conditions). usage: node miscfix.mjs <cid> <ext> session_base.txt
const [,,CID,EXT,SF]=process.argv; const SESS=readFileSync(SF,'utf8').trim();
function misc(name){var n=(name||'').toLowerCase();
 if(/paintwork material.*water|water.*paintwork/.test(n))return null;
 if(/paintwork material.*solvent/.test(n))return'500.00'; // user 2026-10-10 (PGU1010 screenshot): Solvent line = 500
 if(/paintwork/.test(n))return'500.00'; // generic Paintwork Materials row (popup Other/anything) = 500 — user 2026-10-11
 if(/car-o-liner|frame aligner|aligner bench|frame bench/.test(n))return'400.00';
 if(/electrical/.test(n))return'35.00';
 if(/underseal/.test(n))return'60.00';
 if(/road test/.test(n))return'30.00';
 if(/road wheel align|alignment/.test(n))return'45.00';
 if(/balancing/.test(n))return'35.00';
 if(/number plate/.test(n))return'25.00';
 if(/windscreen sealant|glass sealant/.test(n))return'120.00'; // user 2026-10-23 screenshot
 if(/floor ?board sealant/.test(n))return'60.00'; // user 2026-10-23
 if(/tail ?lamp sealant/.test(n))return'15.00'; // user 2026-10-23
 if(/sealant/.test(n))return'30.00';
 if(/other items/.test(n))return'35.00';
 if(/\btyre\b/.test(n))return'350.00';
 if(/air.?cond|r134/.test(n))return'150.00';
 if(/fogging/.test(n))return'45.00';
 if(/radiator coolant|coolant/.test(n))return'35.00'; // user 2026-10-10
 return null;}
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`;
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222')); const page=await b.contexts()[0].newPage();
page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
const ch=await page.evaluate((miscSrc)=>{var misc=eval('('+miscSrc+')');var out=[];
 function rowName(el){var tr=el.closest('tr');if(!tr)return'';var tds=tr.querySelectorAll('td');for(var j=0;j<tds.length;j++){var t=(tds[j].innerText||'').trim();if(t&&!/^[<>=*]$/.test(t))return t;}return'';}
 var mn=+(document.querySelector('[name=MROWCNT]')||{}).value||0;
 for(var k=1;k<=mn;k++){var m=document.querySelector('[name=MMI'+k+']');if(!m||m.readOnly)continue;var nm=rowName(m);if(/paintwork/i.test(nm))continue;var p=misc(nm);if(p==null||(+m.value)===(+p))continue;out.push(nm.slice(0,30)+':'+m.value+'->'+p);m.value=p;m.dispatchEvent(new Event('input',{bubbles:true}));m.dispatchEvent(new Event('change',{bubbles:true}));}
 return out;},misc.toString());
if(ch.length){await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});
 await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(5000);}
console.log(JSON.stringify(ch)); await page.close(); await b.close();
