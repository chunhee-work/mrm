import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const PLATES=process.argv[2].split(',');
const SESS=readFileSync(process.argv[3],'utf8').trim();
const ALL=JSON.parse(readFileSync(process.argv[4],'utf8'));
const DO=process.argv[5]==='save';
const TODAY=new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Kuala_Lumpur'});
const DEFPHONE='0123456789'; // user rule 2026-08-17: never NOPHONE — use a valid MY mobile placeholder
function fmtIC(s){s=(''+(s||'')).replace(/[^0-9]/g,'');return s.length==12?s.slice(0,6)+'-'+s.slice(6,8)+'-'+s.slice(8):(s||'-');}
function ph(p){p=(''+(p||'')).replace(/[^0-9]/g,'');if(!p)return['',''];return[p.slice(0,3),p.slice(3)];}
async function reportOne(ctx,PLATE){
 const D=ALL[PLATE]; const page=await ctx.newPage();
 const dialogs=[]; page.on('dialog',async d=>{dialogs.push(d.message().slice(0,90));await d.accept().catch(()=>{});});
 const T=(n,v)=>page.evaluate(({n,v})=>{var e=document.querySelector('[name='+n+']');if(!e)return 0;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 1;},{n,v});
 const SV=(n,rx)=>page.evaluate(({n,rx})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;var o=[...s.options].find(x=>new RegExp(rx,'i').test(x.text.trim()));if(!o)return 0;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,rx});
 const SVexact=(n,val)=>page.evaluate(({n,val})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;var o=[...s.options].find(x=>x.text.trim().toLowerCase()===val.toLowerCase());if(!o)return 0;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,val});
 const SVhour=(n,hh)=>page.evaluate(({n,hh})=>{var s=document.querySelector('select[name='+n+']');if(!s){var t=document.querySelector('input[name='+n+']');if(!t)return 0;t.value=(hh.length>2?hh:hh+':00');t.dispatchEvent(new Event('change',{bubbles:true}));if(t.onblur)t.onblur();return 'txt';}var o=[...s.options].find(x=>new RegExp('^'+hh+':').test(x.text.trim()));if(!o)return 0;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;},{n,hh});
 const SVany=(n)=>page.evaluate((n)=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;var o=[...s.options].find(x=>x.value&&x.value!=='');if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();return 1;}return 0;},n);
 const radio=(n,val)=>page.evaluate(({n,val})=>{var rs=[...document.querySelectorAll('input[name='+n+']')];function ta(x){var t='',s=x.nextSibling;while(s&&t.trim().length<4){t+=(s.textContent||s.nodeValue||'');s=s.nextSibling;}return(t||x.parentElement.innerText||'').trim();}var w=val.toLowerCase();var r=rs.find(x=>ta(x).toLowerCase().indexOf(w)===0)||rs.find(x=>ta(x).toLowerCase().indexOf(w)>=0)||rs.find(x=>x.value.toLowerCase()===(w==='no'?'0':'1'));if(r){r.checked=true;r.click();r.dispatchEvent(new Event('change',{bubbles:true}));if(r.onclick)r.onclick();return 1;}return 0;},{n,val});
 const setPref=(n,pp)=>page.evaluate(({n,pp})=>{var s=document.querySelector('select[name='+n+']');if(!s)return 0;var bare=pp.replace(/^0/,'');var alt='60'+bare;var o=[...s.options].find(x=>{var t=(x.text||'').trim().replace(/-$/,'');return t===pp||t===alt;});if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return 1;}return 0;},{n,pp});
 // passport ID SELECT setter (value 3 = Passport No/FIN)
 const passID=(fld)=>page.evaluate((fld)=>{var s=document.querySelector('select[name='+fld+'sel]');if(s){s.value='3';s.dispatchEvent(new Event('change',{bubbles:true}));}},fld);
 const FM={sleIDOB:D.insured.dob,sleDDOB:D.insDriver.dob,sleCLMDOB:D.claimant.dob,sleCMDDOB:D.clmDriver.dob,
   sleIPostCode:D.insured.postcode,sleDPostCode:D.insDriver.postcode||D.insured.postcode,sleCLMPostCode:D.claimant.postcode,sleAPcode:D.lossPostcode,sleCMDPostCode:D.claimant.postcode,
   sleITIN:'NA',sleCLMTIN:'NA',sleISSTRegNo:'NA',sleCLMSSTRegNo:'NA',sleIEMAIL:'NOEMAIL@GMAIL.COM',sleDEMAIL:'NOEMAIL@GMAIL.COM',sleCLMEMAIL:'NOEMAIL@GMAIL.COM',sleCMDEMAIL:'NOEMAIL@GMAIL.COM',
   sleIAddr1:D.insured.addr,sleDAddr1:D.insDriver.addr,sleCLMAddr1:D.claimant.addr,sleCMDAddr1:D.claimant.addr,
   sleODO:D.veh.odo,sleVehCC:D.veh.cc,sleVHMANYEAR:D.veh.manYear,sleENGNO:D.veh.eng,sleJPJNO:D.veh.jpjLogbook,sleJPJREG:D.veh.jpjReg,LIABLEPC:'100.00',
   sleCDDRVEXP:D.insDriver.exp,sleCMDDRVEXP:D.clmDriver.exp,sleNUM_REPDAYS:'25'};
 const fillRedBoxes=()=>page.evaluate((FM)=>{var filled=[],unknown=[];function isRed(e){var bg=getComputedStyle(e).backgroundColor||'';var m=bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);if(!m)return false;var r=+m[1],g=+m[2],b=+m[3];return r>200&&(r-g>15||r-b>15)&&g<235;}
   document.querySelectorAll('input[type=text],input:not([type]),textarea,select').forEach(function(e){if(e.offsetParent===null)return;var v=(e.value||'').trim();if(v)return;if(!isRed(e))return;if(e.tagName==='SELECT'){var o=[...e.options].find(x=>x.value&&x.value!=='');if(o){e.value=o.value;e.dispatchEvent(new Event('change',{bubbles:true}));if(e.onchange)e.onchange();filled.push(e.name+'=sel');}return;}if(FM[e.name]!=null&&FM[e.name]!==''){e.value=FM[e.name];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));filled.push(e.name);}else{unknown.push(e.name);}});return {filled,unknown};},FM);
 try{
  await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain&caseid=${D.cid}&extid=${D.extid}&${SESS}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(4500);
  await T('sleFILENO',D.adjFile);await T('sleASGMT',TODAY);await T('sleINSPECT',TODAY);await T('sleNUM_REPDAYS','25');await T('mleINSPECTAT',D.inspectAt);await T('sleRESERVE',D.reserve);
  await SV('ddlbMGRNAME',(process.env.MGR||'VINCENT KANG'));await SV('ddlbADJNAME',(process.env.ADJ||'Terrence Chia'));
  await T('slePoliceRef',D.police);await T('slePOLICERPTDT',D.policeDate);await SVhour('slePOLICERPTTM',D.policeTimeBand);
  await T('vaCDPOLICESTATION',D.policeStation);await SVany('slePOLICEDCODE');
  await SV('ddlbFault','Third Party');await SV('ddlbDAMTYPE',D.damType||'Collision');await page.waitForTimeout(1200);await SV('ddlbCollType',D.collType||'Private');await page.waitForTimeout(800);await SV('ddlbLossDesc',D.lossDescCat);
  await page.evaluate(()=>{var e=document.querySelector('[name=mleLossDesc]');if(e)e.value='';var a=document.querySelector('[name=AddLD]');if(a)a.click();});await page.waitForTimeout(600);
  const ld=await page.evaluate(()=>(document.querySelector('[name=mleLossDesc]')||{}).value);if(!ld){var lp=/rear/i.test(D.impact||D.lossDescCat)?'REAR':/front|(^|[^a-z])on([^a-z]|$)/i.test(D.impact||D.lossDescCat)?'ON':'SIDE';await T('mleLossDesc','COLLISION- HEAD TO '+lp+' (INSURED HIT TP)');}
  // Takaful template: mleLossDesc is a SELECT of cause phrases ("our vehicle/driver" = at-fault) — pick D.lossSelect
  if(D.lossSelect)await page.evaluate((v)=>{var s=document.querySelector('[name=mleLossDesc]');if(s&&s.tagName==='SELECT'){var o=[...s.options].find(x=>new RegExp(v,'i').test(x.text));if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();}}},D.lossSelect);
  await T('sleAccPlace',D.accPlace);await SV('ddlbLocClaim','City Road');
  // INSURED
  if(D.isCompanyInsured){/* company insured: keep Company + Co Reg No carried from create */}else{await T('sleInm',D.insured.name);}if(D.isCompanyInsured){}else if(D.insured.idType==='Passport'){await T('sleIID1',D.insured.nric);await passID('sleIID1');}else{await T('sleIID1',fmtIC(D.insured.nric));}
  if(D.insured.dob)await T('sleIDOB',D.insured.dob);if(D.insured.gender)await SVexact('sleIGender',D.insured.gender);
  await T('sleIAddr1',D.insured.addr);await SV('ddlbIMARITAL','Unknown');await T('sleIOCC','OTHERS');await SV('ddlbIOCC','Others|Unemployed');
  await T('sleITIN','NA');await T('sleISSTRegNo','NA');await radio('sleISSTRegOpt','No');await T('sleIEMAIL','NOEMAIL@GMAIL.COM');
  var ip=D.insured.phone;if(!ip||ip==='-'||ip==='NOPHONE')ip=DEFPHONE;{var iph=ph(ip);if(iph[1]){await setPref('sleIPhone1pref',iph[0]);await T('sleIPhone1',iph[1]);}}
  // INSURED DRIVER
  await T('sleDnm',D.insDriver.name);if(D.insDriver.idType==='Passport'){await T('sleDID1',D.insDriver.nric);await passID('sleDID1');}else{await T('sleDID1',fmtIC(D.insDriver.nric));}
  if(D.insDriver.dob)await T('sleDDOB',D.insDriver.dob);if(D.insDriver.gender)await SVexact('sleDGender',D.insDriver.gender);
  await T('sleDAddr1',D.insDriver.addr);await SV('ddlbDMARITAL','Unknown');await T('sleDOCC','OTHERS');await SV('ddlbDOCC','Others|Unemployed');
  await T('sleCDDRVEXP',D.insDriver.exp);await SV('ddlbDProvisional','No');await SV('sleDRelation','Others');await T('sleDEMAIL','NOEMAIL@GMAIL.COM');
  var dp=D.insDriver.phone;if(!dp||dp==='-'||dp==='NOPHONE')dp=DEFPHONE;{var dph=ph(dp);if(dph[1]){await setPref('sleDPhone1pref',dph[0]);await T('sleDPhone1',dph[1]);}}
  // CLAIMANT
  if(!D.claimant.isCompany){await T('sleCLMnm',D.claimant.name);await T('sleCLMID1',fmtIC(D.claimant.nric));}
  else{
    // 1) switch claimant name-type radio to Company (value 1) -> re-renders ID options to include Co Reg No
    await page.evaluate(function(){var r=document.querySelector('input[name=sleCLMnmsel][value="1"]');if(r){r.checked=true;if(r.click)r.click();r.dispatchEvent(new Event('change',{bubbles:true}));}});
    await page.waitForTimeout(1200);
    // 2) name + ID-type = Co Reg No (value 1) + raw company reg
    await T('sleCLMnm',D.claimant.name);
    await page.evaluate(function(){var s=document.querySelector('select[name=sleCLMID1sel]');if(s){var co=[...s.options].find(function(o){return o.value==='1'||/co\.?\s*reg|company|business|roc|ssm/i.test(o.text)});if(co){s.value=co.value;s.dispatchEvent(new Event('change',{bubbles:true}));if(s.onchange)s.onchange();}}});
    await T('sleCLMID1',D.claimant.nric);
  }
  if(D.claimant.dob)await T('sleCLMDOB',D.claimant.dob);if(D.claimant.gender)await SVexact('sleCLMGender',D.claimant.gender);
  await T('sleCLMAddr1',D.claimant.addr);await SV('ddlbCLMMARITAL','Unknown');await T('sleCLMOCC','OTHERS');await SV('ddlbCLMOCC','Others|Unemployed');
  await T('sleCLMTIN','NA');await T('sleCLMSSTRegNo','NA');await radio('sleCLMSSTRegOpt','No');await T('sleCLMEMAIL','NOEMAIL@GMAIL.COM');
  var cph=ph(D.claimant.phone&&D.claimant.phone!=='NOPHONE'?D.claimant.phone:DEFPHONE);if(cph[1]){await setPref('sleCLMPhone1pref',cph[0]);await T('sleCLMPhone1',cph[1]);}
  // CLAIMANT DRIVER
  await T('sleCMDnm',D.clmDriver.name);if(D.clmDriver.idType==='Passport'){await T('sleCMDID1',D.clmDriver.nric);await page.evaluate(()=>{var s=document.querySelector('select[name=sleCMDID1sel]');if(s){s.value='3';s.dispatchEvent(new Event('change',{bubbles:true}));}});}else{await T('sleCMDID1',fmtIC(D.clmDriver.nric));}if(D.clmDriver.dob)await T('sleCMDDOB',D.clmDriver.dob);if(D.clmDriver.gender)await SVexact('sleCMDGender',D.clmDriver.gender);await SV('ddlbCMDMARITAL','Unknown');await T('sleCMDDRVEXP',D.clmDriver.exp);await T('sleCMDEMAIL','NOEMAIL@GMAIL.COM');await T('sleCMDAddr1',D.claimant.addr);await T('sleCMDOCC','OTHERS');await SV('ddlbCMDOCC','Others|Unemployed');
  var mph=ph(D.claimant.phone&&D.claimant.phone!=='NOPHONE'?D.claimant.phone:DEFPHONE);if(mph[1]){await setPref('sleCMDPhone1pref',mph[0]);await T('sleCMDPhone1',mph[1]);}
  // VEHICLE
  await T('sleENGNO',D.veh.eng);await T('sleJPJNO',D.veh.jpjLogbook);await T('sleJPJREG',D.veh.jpjReg);await T('sleVHMANYEAR',D.veh.manYear);await T('sleVehCC',D.veh.cc);
  await SV('ddlbAssemType','Locally Assembled');await SV('ddlbVehClass','Private');await SV('sleFUELTYPE','Petrol');
  await SV('ddlbCOLORID','^'+D.veh.colour+'$');await T('sleODO',D.veh.odo);await SV('ddlbODOUNITS','km|Kilo');
  // CONDITION
  await SV('ddlbGENCON','Good');await SV('ddlbDRIVEABLE','Yes');await SV('ddlbConDamage','Moderate');await SV('ddlbPREDAMAGE','^No');
  for(const f of ['sleSTEERCON','sleFOOTCON','sleHANDCON','sleFSUSP','sleRSUSP'])await T(f,'Serviceable');await T('slePAINTCON','Good');
  for(const f of ['ddlbFLTTYPEID','ddlbFRTTYPEID','ddlbRLTTYPEID','ddlbRRTTYPEID'])await SV(f,'Michelin');
  await T('sleFTYRESIZE','175/65 R17');await T('sleRTYRESIZE','175/65 R17');for(const f of ['sleFLTREAD','sleFRTREAD','sleRLTREAD','sleRRTREAD'])await T(f,'6.00');await T('sleSPTREAD','8.00');
  await SV('cbxTL',(D.TL==='Yes'||D.TL===true)?'^Yes':'^No');await SV('ddlbLABTYPE',D.veh.body.replace(/[()]/g,'.'));await SV('ddlbPATYPEID','Solid');await T('LIABLEPC','100.00');
  await SV('ddlbIState',D.insured.state);await page.waitForTimeout(500);await SV('ddlbICity',D.insured.city);await page.waitForTimeout(400);
  await SV('ddlbDState',D.insDriver.state||D.insured.state);await page.waitForTimeout(500);await SV('ddlbDCity',D.insDriver.city||D.insured.city);await page.waitForTimeout(400);
  await SV('ddlbCLMState',D.claimant.state);await page.waitForTimeout(500);await SV('ddlbCLMCity',D.claimant.city);await page.waitForTimeout(400);await SV('ddlbCMDState',D.claimant.state);await page.waitForTimeout(500);await SV('ddlbCMDCity',D.claimant.city);await page.waitForTimeout(400);
  await SV('ddlbLossState',D.lossState);await page.waitForTimeout(600);await SV('ddlbLOSSCITY',D.lossCity);await page.waitForTimeout(500);
  await T('sleIPostCode',D.insured.postcode);await T('sleDPostCode',D.insDriver.postcode||D.insured.postcode);await T('sleCLMPostCode',D.claimant.postcode);await T('sleCMDPostCode',D.claimant.postcode);await T('sleAPcode',D.lossPostcode);
  // Some templates (e.g. Takaful Malaysia) require Driver License No + Address 2 for all parties — fill "-" (user 2026-08-17)
  for(const f of ['sleILicenseNo','sleDLicenseNo','sleCLMLicenseNo','sleCMDLicenseNo'])await T(f,'-');
  for(const f of ['sleIAddr2','sleDAddr2','sleCLMAddr2','sleCMDAddr2'])await T(f,'-');
  if(!DO){await page.close();return PLATE+': filled (dry)';}
  let fa='',rounds=[];
  // GST Registered? = No for both Insured and TP/Claimant (user rule 2026-08-10)
  await radio('rdInsuredGstReg','No');await radio('rdTPGstReg','No');
  // minimal claimant-driver form (no phone field, e.g. chain-collision cases): tick COPYCLAIMANT so CMD inherits claimant contact
  await page.evaluate(()=>{if(!document.querySelector('[name=sleCMDPhone1]')){var c=document.querySelector('[name=COPYCLAIMANT],#COPYCLAIMANT');if(c&&!c.checked){c.checked=true;if(c.click)c.click();c.dispatchEvent(new Event('change',{bubbles:true}));}}});await page.waitForTimeout(500);
  // Takaful-Malaysia (72) template: mobile number inputs have inline onchange that populates a hidden hidsleXPhone1 field; dispatchEvent doesn't fire the inline handler → set the hidden field directly (no-op on templates without it)
  await page.evaluate(()=>{['sleIPhone1','sleDPhone1','sleCLMPhone1','sleCMDPhone1'].forEach(function(n){var e=document.querySelector('[name='+n+']');if(e&&(e.value||'').trim()){var h=document.getElementById('hid'+n)||document.querySelector('[name=hid'+n+']');if(h){h.value=e.value;h.dispatchEvent(new Event('change',{bubbles:true}));}try{if(typeof e.onchange==='function')e.onchange();}catch(x){}}});});await page.waitForTimeout(400);
  // user rule 2026-09-16: any missing/empty RED required text box -> fill "-" (e.g. company-claimant sleCLMLicenseNo, SALPERC that engine's explicit list didn't cover)
  await page.evaluate(()=>{document.querySelectorAll('input[type=text][chkrequired],textarea[chkrequired]').forEach(function(e){if(e.offsetParent!==null&&!((e.value||'').trim())){e.value='-';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}});});await page.waitForTimeout(300);
  for(let attempt=0;attempt<7;attempt++){
    await page.waitForTimeout(500);
    await page.evaluate(()=>{try{SaveReport(1);}catch(e){}});
    await page.waitForTimeout(3200);
    fa=(page.url().match(/fuseaction=([a-z_]+)/i)||[])[1];
    if(fa==='dsp_selection'||fa==='dsp_details')break;
    const msg=await page.evaluate(()=>{var ok=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(ok){var box=ok.closest('div,table,form')||ok.parentElement;return (box.innerText||'').replace(/\s+/g,' ').trim().slice(0,140);}return '';});
    await page.evaluate(()=>{var t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t)t.click();});
    await page.waitForTimeout(1200);
    const rb=await fillRedBoxes();
    rounds.push('['+attempt+'] '+(msg||'?')+' -> '+JSON.stringify(rb.filled)+(rb.unknown.length?' UNK:'+JSON.stringify(rb.unknown):''));
    if(!rb.filled.length&&!rb.unknown.length)break;
  }
  if(fa!=='dsp_selection'&&fa!=='dsp_details'){await page.screenshot({path:process.env.HOME+'/mrm-bot/rep_'+PLATE+'.png',fullPage:true}).catch(()=>{});var vis=await page.evaluate(()=>{var o=[];[...document.querySelectorAll('*')].forEach(e=>{var t=(e.childNodes[0]&&e.childNodes[0].nodeValue||'').trim();if(t&&/should|required|must|invalid|specified|cannot|please|format/i.test(t)&&e.offsetParent!==null&&t.length<130)o.push(t);});return [...new Set(o)].slice(0,8);});var phd=await page.evaluate(()=>{var o={};[...document.querySelectorAll("input,select")].forEach(e=>{if(/Phone/i.test(e.name||"")&&e.offsetParent!==null){o[e.name]=(e.value||"(EMPTY)");}});return o;});rounds.push('PHONES:'+JSON.stringify(phd));rounds.push('VIS:'+JSON.stringify(vis));}
  if(fa==='dsp_selection'||fa==='dsp_details')await page.close();
  return PLATE+': '+fa+(fa==='dsp_selection'||fa==='dsp_details'?' ✅':' ⛔')+(rounds.length?'\n   '+rounds.join('\n   '):'')+(dialogs.length?'\n   DIALOGS:'+JSON.stringify(dialogs.slice(0,4)):'');
 }catch(e){await page.close().catch(()=>{});return PLATE+': ERR '+e.message.slice(0,60);}
}
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx=b.contexts()[0];
const res=await Promise.all(PLATES.map(p=>reportOne(ctx,p)));
res.forEach(r=>console.log(r));
await b.close();
