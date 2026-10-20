import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync, existsSync } from 'fs';
const [,,TF,OUT]=process.argv;const T=JSON.parse(readFileSync(TF,'utf8'));const SESS=readFileSync(process.env.HOME+'/mrm-bot/session_base.txt','utf8').trim();
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();
await page.goto('https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_main&'+SESS,{waitUntil:'domcontentloaded'});
for(const t of T){for(const [k,fn] of [['main',t.id+'.jpg'],['nb1',t.id+'_1.jpg'],['nb2',t.id+'_2.jpg']]){const id=t.docs[k];if(!id)continue;const p=OUT+'/'+fn;if(existsSync(p))continue;
 const u=await page.evaluate(async([id,q])=>{try{const r=await fetch('/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_getfile&docid='+id+'&corole=4&'+q,{credentials:'include'});const bm=await createImageBitmap(await r.blob());const s=Math.min(1,1280/Math.max(bm.width,bm.height));const c=document.createElement('canvas');c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.88);}catch(e){return 'ERR '+e}},[id,SESS]);
 if(u.startsWith('data:image')){writeFileSync(p,Buffer.from(u.split(',')[1],'base64'));}else console.log(fn,u.slice(0,80));}}
console.log('done');await page.close();await b.close();
