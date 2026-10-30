// close error/extra tabs in the 9222 Chrome; keep the window + one Merimen tab. usage: node closetabs.mjs
import { chromium } from 'playwright-core';
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ps=b.contexts()[0].pages();let kept=null,closed=[];
for(const p of ps){let t='';try{t=await p.evaluate(()=>document.body?document.body.innerText.slice(0,300):'');}catch(e){}
 const err=/Unidentified Error|Session Timeout|User Not Logged/.test(t);const mer=/merimen\.com/.test(p.url());
 if(!err&&mer&&!kept){kept=p;continue;} if(ps.length-closed.length>1){closed.push((err?'ERR ':'')+p.url().slice(0,70));await p.close().catch(()=>{});}}
if(!kept){const np=await b.contexts()[0].newPage();await np.goto('https://www.merimen.com.my/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});kept=np;}  // user 2026-10-30: always leave a merimen.com.my page open (login needs it)
console.log('kept',kept?kept.url().slice(0,70):'none','closed',closed.length,JSON.stringify(closed));await b.close();
