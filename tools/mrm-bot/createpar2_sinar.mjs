import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const PLATES=process.argv[2].split(',');
const SESS=readFileSync(process.argv[3],'utf8').trim();
const ALL=JSON.parse(readFileSync(process.argv[4],'utf8'));
const DO=process.argv[5]==='submit';
function fmtIC(s){s=(''+(s||'')).replace(/[^0-9]/g,'');return s.length==12?s.slice(0,6)+'-'+s.slice(6,8)+'-'+s.slice(8):(s||'-');}
async function createOne(ctx,PLATE){
 const D=ALL[PLATE]; const page=await ctx.newPage();
 let pop=null; page.on('popup',p=>{pop=p;});
 const dialogs=[]; page.on('dialog',async d=>{dialogs.push(d.message().slice(0,80));await d.accept().catch(()=>{});});
 const T=(n,v)=>page.evaluate(({n,v})=>{var e=document.querySelector('[name='+n+']');if(!e)return 0;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 1;},{n,v});
 const SV=(n,rx)=>page.evaluate(({n,rx})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;var o=[...s.options].find(x=>new RegExp(rx,'i').test(x.text.trim()));if(!o)return 0;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,rx});
 const SVval=(n,v)=>page.evaluate(({n,v})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,v});
 const SVhour=(n,hh)=>page.evaluate(({n,hh})=>{var s=document.querySelector('select[name='+n+']');if(!s){var t=document.querySelector('input[name='+n+']');if(!t)return 0;t.value=(hh.length>2?hh:hh+':00');t.dispatchEvent(new Event('change',{bubbles:true}));if(t.onblur)t.onblur();return 'txt';}var o=[...s.options].find(x=>new RegExp('^'+hh+':').test(x.text.trim()));if(!o)return 0;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,hh});
 const log=[];
 try{
  await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRclaim&fuseaction=dsp_clmreg&${SESS}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3000);
  await SVval('ddlbInsurer',D.insCOID); await page.waitForTimeout(2800);
  log.push('branch='+await SV('ddlbINSCOID',D.branchMatch||'HQ|Head')); await page.waitForTimeout(1500);
  await SVval('ddlbCLAIMTYPE','TP'); await page.waitForTimeout(2800);
  if(D.insCOID==='64') await SV('ddlbVehClass_TMI','Private');
  await T('sleCURINSCOID',D.insCOID);
  await T('sleACCDATE',D.acc.date); log.push('time='+await SVhour('sleACCTIME',(await page.evaluate(()=>!!document.querySelector('input[name=sleACCTIME]')))?D.acc.time:D.acc.time.slice(0,2)));
  if(D.client.isCompany){await page.evaluate(()=>{var r=document.querySelector('input[name=sleCLMnmsel][value="1"]');if(r)r.click();var c=document.querySelector('input[name=sleCLMID1cel][value="1"]');if(c){c.checked=true;c.click();c.dispatchEvent(new Event('change',{bubbles:true}));}});await page.waitForTimeout(500);await T('sleCLMnm',D.client.name);await T('sleCLMID1',D.client.nric);}
  else{await page.evaluate(()=>{var r=document.querySelector('input[name=sleCLMnmsel][value="2"]');if(r)r.click();});await T('sleCLMnm',D.client.name);await T('sleCLMID1',fmtIC(D.client.nric));}
  await T('sleREGNO',PLATE); await T('sleCHANO',D.veh.chassis);
  // WORKSHOP via Lookup popup
  await page.locator('#MTRworkshopbtn').click({force:true,timeout:6000}).catch(()=>{});
  for(let i=0;i<20 && !pop;i++) await page.waitForTimeout(350);
  if(pop){
    await pop.waitForTimeout(1500);
    await pop.evaluate((kw)=>{var t=document.querySelector('input[name=MTRworkshopslcFilter],input[type=text]');t.value=kw;t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));},D.workshopKeyword);
    await pop.evaluate(()=>{var b=[...document.querySelectorAll('input[type=button],button')].find(x=>/^\s*Search\s*$/i.test(x.value||x.innerText||''));if(b)b.click();});
    await pop.waitForTimeout(2500);
    const sel=await pop.evaluate((mt)=>{var t=[...document.querySelectorAll('tr,a,td')].find(e=>new RegExp(mt.replace(/[-]/g,'.'),'i').test((e.innerText||'').replace(/\s+/g,' ')));if(!t)return'no';var c=t.closest('a')||t;c.click();return'clicked';},D.workshopMatch);
    log.push('ws='+sel); await page.waitForTimeout(2500); pop=null;
  } else log.push('ws=NOPOPUP');
  log.push('rep='+await page.evaluate(()=>(document.querySelector('[name=ddlbREPCOID]')||{}).value));
  await T('slePOLNO',D.atfault.policy);
  if(D.atfault.isCoverNote){await page.evaluate(()=>{var c=document.querySelector('input[name=siISCOVERNOTE]');if(c&&!c.checked)c.click();});}
  await T('slePOLFROM',D.atfault.from); await T('slePOLTO',D.atfault.to); await SVval('ddlbNEWPOL','1');
  var insId=D.atfault.ownerNric||D.atfault.driverNric, insName=D.atfault.ownerNric?D.atfault.ownerName:D.atfault.driverName;
  await T('sleInm',insName); var isPass=/[A-Za-z]/.test(insId); await T('sleIID1',isPass?insId:fmtIC(insId));
  if(isPass){await page.evaluate(()=>{var r=document.querySelector('input[name=sleIID1sel][value="3"]');if(r){r.checked=true;r.click();r.dispatchEvent(new Event('change',{bubbles:true}));}});}
  await T('sleIPhone1',(D.client.phone||'').replace(/[^0-9]/g,''));
  if(D.client.isCompany){await page.evaluate(()=>{var r=document.querySelector('input[name=sleTPnmsel][value="1"]');if(r)r.click();var c=document.querySelector('input[name=sleTPID1cel][value="1"]');if(c){c.checked=true;c.click();c.dispatchEvent(new Event('change',{bubbles:true}));}});await T('sleTPnm',D.client.name);await T('sleTPID1',D.client.nric);}
  else{await T('sleTPnm',D.client.name);await T('sleTPID1',fmtIC(D.client.nric));}
  await T('sleTPREGNO',D.atfault.plate); if(D.client.policy) await T('sleTPPOLNO',D.client.policy);
  if(D.client.insCOID) log.push('3ins='+await SVval('ddlb3INSCOID',D.client.insCOID));
  else { log.push('3ins=SKIP'); // user rule 2026-08-18: Claimant's Insurance Co NOT required when claimant has none — don't tick TPOWN, strip the chkrequired so create proceeds
    await page.evaluate(()=>{['ddlb3INSCOID','sleTPPOLNO','sleTRAILERREGNO','sleTRAILERTPREGNO'].forEach(n=>{var e=document.querySelector('[name='+n+']');if(e)e.removeAttribute('chkrequired');});}); }
  {const vc=D.insVehClass||'Private/Company'; const set=await page.evaluate((vc)=>{var sels=[...document.querySelectorAll('select')].filter(s=>{var tr=s.closest('tr');var l=tr?(tr.innerText||''):'';return (/insured vehicle class|vehicle class/i.test(l)||/VEHCLASS/i.test(s.name))&&!/_TMI/i.test(s.name);});for(const s of sels){var o=[...s.options].find(x=>new RegExp(vc.replace(/[\/]/g,'.'),'i').test(x.text));if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return s.name+'='+o.text.trim();}}return 'none';},vc); if(set!=='none') log.push('insVC='+set);}
  await SV('ddlbDAMTYPE','Collision');
  var lp=/rear/i.test(D.acc.impact)?'REAR':/^front$|front(?!.*side)/i.test(D.acc.impact)?'ON':'SIDE';
  await T('mleLossDesc','COLLISION- HEAD TO '+lp+' (INSURED HIT TP)');
  await SV('sleINITIALEST_DD','10,000 - 12,500'); await SV('ddlbPOLCOVER',D.polcover||'Comprehensive');
  await SV('ddlbMan','^'+D.veh.make+'$'); await page.waitForTimeout(2800);
  log.push('model='+await SVval('ddlbModel',D.veh.modelValue));
  if(D.client.insCOID){await page.evaluate(()=>{var c=document.querySelector('#TPOWN,input[name=TPOWN]');if(c&&!c.checked)c.click();});}
  await T('sleCURINSCOID',D.insCOID);
  const chk=await page.evaluate(()=>{function g(n){var e=document.querySelector('[name='+n+']');return e?e.value:'?';}return {repName:g('ddlbREPCOIDTEXT'),rep:g('ddlbREPCOID'),man:g('ddlbMan'),model:g('ddlbModel'),cur:g('sleCURINSCOID')};});
  if(!DO){ await page.close(); return PLATE+' FILL '+log.join(' ')+' '+JSON.stringify(chk); }
  let clicked=false;
  try{ await page.locator('input[value*="Next"],button:has-text("Next")').first().click({force:true,timeout:4000}); clicked=true; }catch(e){}
  if(!clicked) await page.evaluate(()=>{try{SubmitEntry();}catch(e){}});
  await page.waitForTimeout(4500);
  for(let i=0;i<6;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1500);}
  await page.waitForTimeout(2500);
  // DUPLICATE-WARNING confirmation page ("already an active claim within 1 day"): REAL-click the
  // "Next (Enter Details) >>" anchor (MAClk) to proceed, keeping CHKCONFIRM=CONFIRM. (user 2026-08-10 VPP4068)
  if(/act_clmreg|dsp_clmreg/.test(page.url())){
    const dup=await page.evaluate(()=>/already an active claim|CONFIRM that this is NOT/i.test(document.body.innerText||''));
    if(dup){log.push('DUPCONFIRM');
      await page.locator('a:has-text("Next (Enter Details)")').first().click({force:true,timeout:5000}).catch(async()=>{await page.evaluate(()=>{var a=[...document.querySelectorAll('a')].find(e=>/Next \(Enter Details\)/.test(e.innerText||''));if(a)a.click();});});
      await page.waitForTimeout(4000);
      for(let i=0;i<8;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1500);}
      await page.waitForTimeout(2500);
    }
  }
  let url=page.url(), cid='?';
  if(/adjclmref/.test(url)){
    await page.waitForTimeout(1200);
    await SV('ddlbMGRNAME',(process.env.MGR||'VINCENT KANG')); await SV('ddlbADJNAME',(process.env.ADJ||'Terrence Chia'));
    await page.evaluate(()=>{try{SaveReport(2);}catch(e){}});
    await page.waitForTimeout(4000);
    for(let i=0;i<4;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1500);}
    cid=await page.evaluate(()=>{var m=location.href.match(/caseid=(\d+)/i)||document.body.innerHTML.match(/caseid=(\d+)/i);return m?m[1]:'?';});
  }
  const res=PLATE+': '+log.join(' ')+' => '+((page.url().match(/fuseaction=([a-z_]+)/i)||[])[1])+' caseid='+cid+(dialogs.length?' D='+JSON.stringify(dialogs.slice(0,3)):'');
  await page.close(); return res;
 }catch(e){await page.close().catch(()=>{});return PLATE+': ERR '+e.message.slice(0,50);}
}
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx=b.contexts()[0];
const res=await Promise.all(PLATES.map(p=>createOne(ctx,p)));
res.forEach(r=>console.log(r));
await b.close();
