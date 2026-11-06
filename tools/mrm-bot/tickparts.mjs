import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF,VALS]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();const V=VALS.split('|');
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const n=await page.evaluate((V)=>{let k=[];document.querySelectorAll('input[type=checkbox][name=CP]').forEach(c=>{if(V.includes(c.value)&&!c.checked){c.click();k.push(c.value);}});return k;},V);console.log('ticked',n.length,n.join(','));
await page.evaluate(()=>{const t=[...document.querySelectorAll('td[onclick]')].find(e=>/MClk/.test(e.getAttribute('onclick'))&&e.textContent.trim()==='Save');t.click();});await page.waitForTimeout(7000);
for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>/^OK$/.test((e.value||e.innerText||'').trim())&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
await page.close();await b.close();
