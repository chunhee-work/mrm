// READ-ONLY: list the branch options (ddlbINSCOID) of an insurer on a blank claim form. node branchopts.mjs session_base.txt <insCOID>
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const SESS=readFileSync(process.argv[2],'utf8').trim(); const INS=process.argv[3];
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222')); const page=await b.contexts()[0].newPage(); page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&${SESS}`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(3000);
await page.evaluate(v=>{var s=document.querySelector('select[name=ddlbInsurer]');s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();},INS); await page.waitForTimeout(3500);
console.log(JSON.stringify(await page.evaluate(()=>[...(document.querySelector('select[name=ddlbINSCOID]')||{options:[]}).options].map(o=>o.text.trim()))));
await page.close();
