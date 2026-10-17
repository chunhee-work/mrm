import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,JS]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const U=JSON.parse(JS);
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate((U)=>{const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\s+/g,' ').trim();};
 let k=[];for(const nm in U)document.querySelectorAll('input[type=checkbox][name='+nm+']').forEach(c=>{if(c.checked&&U[nm].includes(lab(c))){c.click();k.push(nm+':'+lab(c));}});return k;},U);console.log('unticked',r);
await page.evaluate(()=>{const t=[...document.querySelectorAll('td[onclick]')].find(e=>/MClk/.test(e.getAttribute('onclick'))&&e.textContent.trim()==='Save');t.click();});await page.waitForTimeout(3500);
for(let i=0;i<3;i++){const a=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button,a,td,span')].find(e=>/^Apply & Submit$/.test((e.value||e.textContent||'').trim())&&e.offsetParent!==null);if(t){t.click();return 1}return 0});if(!a)break;console.log('thatcham');await page.waitForTimeout(6000);}
await page.close();await b.close();
