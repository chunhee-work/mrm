import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,CID,EXT,SESSF]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate(()=>{const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\s+/g,' ').trim();};
 const o={};for(const nm of ['CP','CL','CLR','CM'])o[nm]=[...new Set([...document.querySelectorAll('input[type=checkbox][name='+nm+']')].filter(c=>c.checked).map(lab))];o.btns=[...document.querySelectorAll('td[onclick]')].map(e=>e.textContent.trim()).filter(t=>/Next|Save/.test(t));return o;});
console.log(JSON.stringify(r,null,0));await page.close();await b.close();
