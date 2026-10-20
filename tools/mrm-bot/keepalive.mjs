// User rule: always click "Continue Session". Watches every Merimen tab in the automation Chrome (port 9222) every 15 s
// and clicks the "Continue Session" button when the expiry warning shows. Never logs in, never navigates.
import { chromium } from 'playwright-core';
const log=(...a)=>console.log(new Date().toISOString().slice(5,19),...a);
for(;;){
  try{
    const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
    for(;;){
      for(const p of b.contexts()[0].pages()){
        if(!/merimen/.test(p.url()))continue;
        const r=await p.evaluate(()=>{const b=[...document.querySelectorAll('button,input[type=button],input[type=submit],a')].filter(e=>/^continue session$/i.test((e.innerText||e.value||'').replace(/\s+/g,' ').trim())&&e.offsetParent!==null);if(!b.length)return '';b[0].click();return 'CLICKED';}).catch(()=>'');
        if(r)log('clicked Continue Session',p.url().slice(0,60));
      }
      if(!b.isConnected())break;
      await new Promise(r=>setTimeout(r,15000));
    }
  }catch(e){log('waiting for automation Chrome:',e.message.slice(0,60));}
  await new Promise(r=>setTimeout(r,30000));
}
