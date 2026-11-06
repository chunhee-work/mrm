import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'fs';
const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const MAKES=process.argv[2].split(',');
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));
const page=await b.contexts()[0].newPage();
page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000);
const out={};
const SV=(n,v)=>page.evaluate(({n,v})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,v});
await SV('ddlbInsurer','46');await page.waitForTimeout(2500);
await page.evaluate(()=>{var s=document.querySelector('select[name=ddlbINSCOID]');if(s){var o=[...s.options].find(x=>/HQ|Head/i.test(x.text));if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();}}});await page.waitForTimeout(2500);
await page.evaluate(()=>{var s=document.querySelector('select[name=ddlbCLAIMTYPE]');if(s){var o=[...s.options].find(x=>/^TP/i.test(x.text.trim()));if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();}}});await page.waitForTimeout(3000);
for(const mk of MAKES){
  const ok=await page.evaluate((mk)=>{var s=document.querySelector('select[name=ddlbMan]');if(!s)return 'noMan';var o=[...s.options].find(x=>x.text.trim().toUpperCase()===mk);if(!o)return 'noOpt';s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},mk);
  await page.waitForTimeout(3000);
  out[mk]=await page.evaluate(()=>{var s=document.querySelector('select[name=ddlbModel]');return s?[...s.options].map(o=>({v:o.value,t:o.text.trim(),c:o.className})):[];});
  console.log(mk,ok,out[mk].length);
}
out.__ins3=await page.evaluate(()=>{var s=document.querySelector('select[name=ddlb3INSCOID]');return s?[...s.options].map(o=>o.value+'='+o.text.trim()):[];});{let old={};try{old=JSON.parse(readFileSync('model_opts_sinar.json','utf8'))}catch(e){};writeFileSync('model_opts_sinar.json',JSON.stringify({...old,...out}));}   // 2026-11-04: MERGE with the makes already dumped (a SUZUKI-only dump wiped PERODUA etc.)
await page.close();await b.close();
