import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,PLATE,CID,EXT]=process.argv;const SESS=readFileSync('session_base.txt','utf8').trim();const P=JSON.parse(readFileSync('photoplan.json','utf8'))[PLATE].map(x=>x[2]);
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${CID}&extid=${EXT}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000);
const t=await page.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));const seg=t.slice(t.indexOf('Thumbnail Print'),t.indexOf('Documentation 1 per page'));
const L=[...seg.matchAll(/\d+ \d\d\/\d\d\/\d\d \d\d:\d\d (.+?) Load JPG/g)].map(m=>m[1]);
const bad=P.map((n,i)=>n===L[i]?null:i+1+':'+n+'≠'+L[i]).filter(Boolean);// 2026-11-04: photos are uploaded in plan order, so walk both lists; a plan photo with no match is MISSING (batch 9: 3 photos silently dropped)
{const miss=[];let j=0;P.forEach((n,i)=>{if(L[j]===n)j++;else miss.push(i);});if(L.length<P.length)console.log(PLATE,'MISSING',miss.join(','));}
console.log(PLATE,'photos',L.length,'plan',P.length,'mismatch',bad.length,bad.slice(0,5).join(' | '));
await page.close();await b.close();
