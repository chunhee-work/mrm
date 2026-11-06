// all pages of a worklist (clicks "Next >"): SESSF=<file> node wlpages.mjs <stat> [personal=1] -> "PLATE caseid extid" lines (read-only)
import { chromium } from 'playwright-core'; import { readFileSync } from 'fs';
const [,,STAT='2',PERS='1']=process.argv;const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const page=await b.contexts()[0].newPage();
await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&personal=${PERS}&stat=${STAT}&totalcase=${process.env.TOT||100000}&setpage=0&${SESS}`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForTimeout(5000);
const all=new Set();
for(let pg=0;pg<200;pg++){
 const r=await page.evaluate(()=>[...document.querySelectorAll('tr')].map(t=>{const a=t.querySelector('a[href*="caseid="]');if(!a)return null;const m=a.href.match(/caseid=(\d+)&(?:amp;)?extid=(\d+)/);const pl=(t.innerText.match(/\*([A-Z0-9]+)/)||[])[1];return m&&pl?pl+' '+m[1]+' '+m[2]:null}).filter(Boolean));
 const before=all.size;r.forEach(x=>all.add(x));console.error('page',pg+1,'rows',r.length,'new',all.size-before);
 const has=await page.evaluate(()=>{const a=[...document.querySelectorAll('a')].find(e=>/Next/.test(e.textContent)&&/setPage/.test((e.getAttribute('href')||'')+(e.getAttribute('onclick')||'')));if(!a)return 0;a.setAttribute('data-nx','1');return 1;});
 if(!has||all.size===before)break;
 await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{}),page.click('[data-nx="1"]')]);await page.waitForTimeout(4000);}
console.log([...all].join('\n'));await page.close();await b.close();
