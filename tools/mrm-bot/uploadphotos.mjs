import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,PLATE,CID,EXT,FROM,TO]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();
const ALL=JSON.parse(readFileSync('photoplan.json','utf8'))[PLATE].slice(+FROM,+TO);
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const ctx=b.contexts()[0];
const DV=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`;
for(let s=0;s<ALL.length;s+=250){const B=ALL.slice(s,s+250);
 const page=await ctx.newPage();const pop=page;
 pop.on('dialog',d=>d.accept().catch(()=>{}));
 await pop.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docupload&domainid=1&objid=${CID}&corole=4&docclassid=2&maxno=250&picwidth=&picheight=&picfixort=&BCO_FLAGMODE=ADD&BCOREAD=&BCOCONTROL=&SHOWLABEL=0&DEFAULTSEL=&nolayout=1&${SESS}`,{waitUntil:'domcontentloaded'});await pop.waitForTimeout(3000);
 await pop.locator('input[type=file]').first().setInputFiles(B.map(x=>x[0]));await pop.waitForTimeout(3000+B.length*80);
 const r=await pop.evaluate((B)=>{const T=[...document.querySelectorAll('select[name=FTYPE]')],D=[...document.querySelectorAll('input[name=FDESC]')];const bad=[];
  B.forEach((x,i)=>{const s=T[i],d=D[i];if(!s||!d){bad.push(i);return;}const o=[...s.options].find(o=>o.text.trim()===x[1]);if(!o){bad.push('type'+i);return;}s.value=o.value;if(window.jQuery)jQuery(s).val(o.value).trigger('change');else s.dispatchEvent(new Event('change',{bubbles:true}));d.value=x[2];d.dispatchEvent(new Event('change',{bubbles:true}));d.dispatchEvent(new Event('input',{bubbles:true}));});
  return {rows:T.length,bad};},B);
 console.log(PLATE,'batch',FROM*1+s,JSON.stringify(r));
 if(r.rows!==B.length||r.bad.length){console.log('ABORT batch');await page.close();break;}
 await pop.locator('button.start,button:has-text("Start upload")').first().click({force:true});
 for(let i=0;i<900;i++){await pop.waitForTimeout(1000);const left=await pop.evaluate(()=>document.querySelectorAll('.template-upload').length).catch(()=>0);if(!left)break;}
 await pop.waitForTimeout(2000);await page.close().catch(()=>{});
}
const p2=await ctx.newPage();await p2.goto(DV,{waitUntil:'domcontentloaded'});await p2.waitForTimeout(3000);
console.log('docs now',await p2.evaluate(()=>document.querySelectorAll('a[href*=SVCDOCAttView]').length));
const t=await p2.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));console.log(t.slice(t.indexOf('Thumbnail'),t.indexOf('Thumbnail')+900));
await p2.close();await b.close();
