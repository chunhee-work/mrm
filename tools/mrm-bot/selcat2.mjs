import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync } from 'fs';
const [,,CID,EXT,SESSF,OUT]=process.argv;const SESS=readFileSync(SESSF,'utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_selection&caseid=${CID}&extid=${EXT}&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(5000);
const r=await page.evaluate(()=>{const lab=c=>{let t='';let n=c.nextSibling;while(n&&!(n.tagName==='INPUT'||n.tagName==='BR')){t+=n.textContent||'';n=n.nextSibling;}if(!t.trim()){const s=c.closest('span,td');t=s?s.textContent:'';}return t.replace(/\s+/g,' ').trim();};
 return {cat:[...document.querySelectorAll('input[type=checkbox][name=CP]')].map(c=>[c.value,lab(c),c.checked]),labs:[...document.querySelectorAll('input[type=checkbox][name=CL]')].map(c=>[lab(c),c.checked]),veh:(document.body.innerText.match(/Vehicle Model:\s*(.{0,90})/)||[])[1]}});
writeFileSync(OUT,JSON.stringify(r));console.log(r.cat.length,r.labs.length,r.veh,r.cat.filter(x=>x[2]).length,'already');
await page.close();await b.close();
