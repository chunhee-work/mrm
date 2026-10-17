import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
await page.evaluate(()=>{const t=[...document.querySelectorAll('td[onclick]')].find(e=>/MClk/.test(e.getAttribute('onclick'))&&/^Next/.test(e.textContent.trim()));t.click();});await page.waitForTimeout(4000);
for(let i=0;i<3;i++){const a=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button,a,td,span')].find(e=>/^Apply & Submit$/.test((e.value||e.textContent||'').trim())&&e.offsetParent!==null);if(t){t.click();return 1}return 0});if(!a)break;await page.waitForTimeout(6000);}
await page.waitForTimeout(5000);console.log('at',(page.url().match(/fuseaction=([a-z_]+)/)||[])[1]);await page.close();await b.close();
