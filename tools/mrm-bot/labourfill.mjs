// usage: node labourfill.mjs <cid> <extid> <sessFile> <ACC> [apply]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
const [,,CID,EXT,SESSF,ACC,MODE]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const cur=await page.evaluate(()=>{const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\s+/g,' ').trim();};
 const g=nm=>[...document.querySelectorAll('input[type=checkbox][name='+nm+']')];return {parts:g('CP').filter(c=>c.checked).map(lab),haveLab:g('CL').concat(g('CLR')).filter(c=>c.checked).length,haveMisc:g('CM').filter(c=>c.checked).length,labels:g('CL').map(lab),misc:g('CM').map(lab)};});
// manual parts (no-catalogue accounts) from details page
let parts=cur.parts;
if(!parts.length){await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${CID}&extid=${EXT}&tpins=0&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(4000);
 parts=await page.evaluate(()=>{const n=+(document.querySelector('[name=PROWCNT]')||{}).value||0;const o=[];for(let i=1;i<=n;i++){const td=document.getElementById('PTDS'+i)||document.getElementById('PDS'+i);if(!td)continue;o.push((td.tagName==='INPUT'?td.value:td.childNodes[0].textContent).trim());}return o;});
 await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);}
writeFileSync('/tmp/lf_parts.json',JSON.stringify(parts));
const pred=JSON.parse(execSync(`python3 ${process.env.HOME}/mrm-bot/labour_predict.py ${ACC} /tmp/lf_parts.json ${CID}`).toString());
const avail=new Set(cur.labels),availM=new Set(cur.misc);
const N=pred.N.filter(a=>avail.has(a)),R=pred.R.filter(a=>avail.has(a)),M=pred.M.filter(a=>availM.has(a));
console.log(`parts=${parts.length} existingLabourTicks=${cur.haveLab} existingMisc=${cur.haveMisc} neighbours=${pred.neighbours.join(',')}`);
console.log('N:',N.join(' | '));console.log('R:',R.join(' | '));console.log('MISC:',M.join(' | '));
if(MODE==='apply'){
  const doLab=cur.haveLab===0, doMisc=cur.haveMisc===0;
  const r=await page.evaluate(({N,R,M,doLab,doMisc})=>{const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\s+/g,' ').trim();};let k=0;
   if(doLab){document.querySelectorAll('input[type=checkbox][name=CL]').forEach(c=>{if(N.includes(lab(c))&&!c.checked){c.click();k++;}});document.querySelectorAll('input[type=checkbox][name=CLR]').forEach(c=>{if(R.includes(lab(c))&&!c.checked){c.click();k++;}});}
   if(doMisc){document.querySelectorAll('input[type=checkbox][name=CM]').forEach(c=>{if(M.includes(lab(c))&&!c.checked){c.click();k++;}});}
   return k;},{N,R,M,doLab,doMisc});
  console.log('ticked',r,'(labour',doLab?'applied':'SKIPPED-existing',', misc',doMisc?'applied':'SKIPPED-existing',')');
  await page.evaluate(()=>{const t=[...document.querySelectorAll('td[onclick]')].find(e=>/MClk/.test(e.getAttribute('onclick'))&&e.textContent.trim()==='Save');t.click();});await page.waitForTimeout(7000);
  for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
}
await page.close();await b.close();
