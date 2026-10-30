// close error/extra tabs in the 9222 Chrome; keep the window + one Merimen tab. usage: node closetabs.mjs
import { chromium } from 'playwright-core';
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ps=b.contexts()[0].pages();let kept=null,closed=[];
for(const p of ps){let t='';try{t=await p.evaluate(()=>document.body?document.body.innerText.slice(0,300):'');}catch(e){}
 const err=/Unidentified Error|Session Timeout|User Not Logged/.test(t);const mer=/merimen\.com/.test(p.url());
 if(!err&&mer&&!kept){kept=p;continue;} if(ps.length-closed.length>1){closed.push((err?'ERR ':'')+p.url().slice(0,70));await p.close().catch(()=>{});}}
console.log('kept',kept?kept.url().slice(0,70):'none','closed',closed.length,JSON.stringify(closed));await b.close();
