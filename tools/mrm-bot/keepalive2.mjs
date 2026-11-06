// keepalive test (user 2026-11-06: "is it because you are not really mouse clicking?")
// MODE=click : Playwright REAL mouse click on "Continue Session" (trusted input events, not element.click())
// MODE=touch : no click; every 10 min reload the account's Merimen home page in its tab (a real request = account in use)
// MODE=both  : both.   CDP=<port url>.  Never logs in, never types anything.
import { chromium } from 'playwright-core';
const MODE=process.env.MODE||'click', TOUCH_MS=10*60*1000; let lastTouch=Date.now();
const log=(...a)=>console.log(new Date().toISOString().slice(5,19),MODE,...a);
for(;;){
  try{
    const b=await chromium.connectOverCDP(process.env.CDP||'http://127.0.0.1:9222');
    for(;;){
      for(const p of b.contexts()[0].pages()){
        if(!/merimen/.test(p.url()))continue;
        if(MODE!=='touch'){
          const btn=p.getByRole('button',{name:/^continue session$/i}).or(p.locator('input[type=button][value="Continue Session" i],input[type=submit][value="Continue Session" i]')).first();
          if(await btn.isVisible().catch(()=>false)){await btn.click({timeout:5000}).catch(e=>log('click fail',e.message.slice(0,60)));log('REAL click Continue Session');}
        }
        if(MODE!=='click'&&Date.now()-lastTouch>TOUCH_MS&&/fusebox=MTRroot/.test(p.url())){await p.reload({waitUntil:'domcontentloaded'}).catch(()=>{});lastTouch=Date.now();log('touched (reload home)');}
      }
      if(!b.isConnected())break;
      await new Promise(r=>setTimeout(r,15000));
    }
  }catch(e){log('waiting:',e.message.slice(0,60));}
  await new Promise(r=>setTimeout(r,30000));
}
