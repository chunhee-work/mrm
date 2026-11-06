// 2026-11-06: rare-part photo harvest over CDP (port 9222, same as ~/mrm-bot scripts; no AppleScript, NEVER logs in).
// node harvest_rare.mjs [minutes]   cwd = typesafe/photo_train. Reads all_cases.json, done_cases.txt, rare_lt100.json, name_map.tsv.
// Per case: docview list (captions) -> keep photos whose official name is a rare part (+ the photo before/after) -> 256 px JPEGs
// into data/<cid>/NNN_docid.jpg + index.jsonl (same format as harvest.py). Logged out -> NEED_LOGIN flag + stop. PAUSE file -> wait.
import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path';
const H=process.cwd(), MIN=+(process.argv[2]||0), T0=Date.now();
const SESS=fs.readFileSync(path.join(os.homedir(),'mrm-bot/session_base.txt'),'utf8').trim();
const PAUSE=path.join(os.homedir(),'mrm-bot/state/PAUSE_HARVEST'), NEED=path.join(os.homedir(),'mrm-bot/state/NEED_LOGIN');
const cases=JSON.parse(fs.readFileSync('all_cases.json','utf8'));
const done=new Set(fs.existsSync('done_cases.txt')?fs.readFileSync('done_cases.txt','utf8').split(/\s+/):[]);
const RARE=new Set(JSON.parse(fs.readFileSync('rare_lt100.json','utf8')).map(x=>x.name));
const NM={};for(const l of fs.readFileSync('name_map.tsv','utf8').split('\n')){const p=l.split('\t');if(p.length===4&&p[2])NM[p[0]]=p[2];}
const off=n=>NM[n.trim()]||n.trim();
const GEN=/pho\w*\s+of\s+da|damaged parts|damgaed|damgfed|after repair|accident scene|^4 angles|^(photos|others|tyres)$/i;
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const page=await b.contexts()[0].newPage();
await page.goto('https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&'+SESS,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2000);
const todo=Object.keys(cases).filter(c=>!done.has(c)).sort((a,b)=>b-a);let total=0,k=0;
console.log('cases',Object.keys(cases).length,'todo',todo.length);
for(const cid of todo){k++;
  while(fs.existsSync(PAUSE))await new Promise(r=>setTimeout(r,30000));
  if(MIN&&Date.now()-T0>MIN*60000){console.log('STOP: time budget');break;}
  if(fs.statfsSync&&(()=>{const s=fs.statfsSync(H);return s.bavail*s.bsize<15e9})()){console.log('STOP: disk < 15 GB');break;}
  const h=await page.evaluate(async u=>{const r=await fetch(u,{credentials:'include'});return await r.text();},`/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docview&domainid=1&objid=${cid}&corole=4&${SESS}`).catch(e=>'ERR '+e);
  if(!h.includes('cSDdocstate')){
    if(/login|session|logged/i.test(h.slice(0,3000))||h.startsWith('ERR')){fs.mkdirSync(path.dirname(NEED),{recursive:true});fs.writeFileSync(NEED,new Date().toTimeString().slice(0,8)+' harvest');console.log('LOGGEDOUT? stop at',cid);break;}
    fs.appendFileSync('done_cases.txt',cid+'\n');console.log(`${k}/${todo.length} ${cid} no docview`);continue;}
  const rows=[...h.matchAll(/SVCDOCObjRow\(ds,(\d+),(\d+),(\d+),"[^"]*",\d+,"([^"]*)",\s*"([^"]*)"/g)].filter(m=>m[3]==='2').map(m=>({docid:m[1],name:m[5].replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim(),stamp:m[4]}));
  const weak=rows.map(r=>!GEN.test(r.name)&&RARE.has(off(r.name)));
  const keep=rows.map((r,i)=>!GEN.test(r.name)&&(weak[i]||(i>0&&weak[i-1])||(i+1<rows.length&&weak[i+1])));
  const ids=rows.filter((r,i)=>keep[i]).map(r=>r.docid);let n=0;
  if(ids.length){
    const got=await page.evaluate(async({ids,q})=>{const o={};await Promise.all(ids.map(async id=>{try{const r=await fetch('/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_getfile&docid='+id+'&corole=4&'+q,{credentials:'include'});const bm=await createImageBitmap(await r.blob());const s=Math.min(1,256/Math.max(bm.width,bm.height));const c=document.createElement('canvas');c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);o[id]=c.toDataURL('image/jpeg',0.85);}catch(e){o[id]='';}}));return o;},{ids,q:SESS+'&RID=0'});
    fs.mkdirSync(path.join('data',cid),{recursive:true});
    rows.forEach((r,i)=>{const u=got[r.docid];if(!keep[i]||!u||!u.startsWith('data:image'))return;const fn=path.join(cid,String(i+1).padStart(3,'0')+'_'+r.docid+'.jpg');
      fs.writeFileSync(path.join('data',fn),Buffer.from(u.split(',')[1],'base64'));fs.appendFileSync('index.jsonl',JSON.stringify({cid,plate:cases[cid],seq:i+1,docid:r.docid,name:r.name,stamp:r.stamp,file:fn,rare:weak[i]})+'\n');n++;});}
  total+=n;fs.appendFileSync('done_cases.txt',cid+'\n');
  if(n||k%50===0)console.log(`${k}/${todo.length} ${cid} ${cases[cid]} photos=${n} total=${total}`);
}
await page.close();await b.close();
