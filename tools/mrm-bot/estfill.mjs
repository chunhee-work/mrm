import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { paintStep } from './pwset.mjs';
const PLATE=process.argv[2];
const SESS=readFileSync(process.argv[3],'utf8').trim();
const D=JSON.parse(readFileSync(process.argv[4],'utf8'))[PLATE];
function cond(name){var n=(name||'').toLowerCase();
 if(/bumper.*retainer/.test(n))return'Bracket cracked';
 if(/bracket/.test(n))return'Bracket cracked';
 if(/weather sheeting|wheel hub|wheel bearing/.test(n))return'Necessary';
 if(/weatherstrip|weather strip/.test(n))return'Cut';
 if(/bumper.*sensor|sensor.*bumper/.test(n))return'Cut';
 if(/mirror/.test(n))return'Broken';
 if(/support strut|\bstrut\b/.test(n))return'Broken';
 if(/windscreen|windshield/.test(n))return'Broken';
 if(/centre guide|center guide/.test(n))return'Broken';
 if(/spare wheel well|wheel well/.test(n))return'Broken';
 if(/lock|striker|hinge/.test(n))return'Bent';
 if(/lamp panel/.test(n))return'Bent';
 if(/reinforcement/.test(n))return'Bent';
 if(/liner/.test(n))return'Damage';
 if(/reflector|fog lamp|lamp assembly|head ?lamp|signal lamp|tail ?lamp|\blamp\b/.test(n))return'Cracked';
 if(/glass|window/.test(n))return'Cracked';
 if(/sensor/.test(n))return'Necessary';
 if(/clip|retainer|\bguide\b|nozzle|grommet|washer/.test(n))return'Necessary';
 if(/trim|finisher|garnish|moulding|spoiler|skirt|extractor vent|\bvent\b|badge|emblem|grille|\bmask\b|valance|\bcover\b|cladding|\bflap\b|deflector/.test(n))return'Broken';
 if(/rim|tyre|wheel/.test(n))return'Bent';
 if(/absorber|control arm|tie rod|crossmember|drive ?shaft|stabilizer|\blink\b|knuckle/.test(n))return'Bent';
 if(/panel|tailgate|boot ?lid|bonnet|fender|quarter|\bdoor\b|floor|wheelhouse|member|pillar|roof|firewall|apron|\bdeck\b|body side|support/.test(n))return'Bent';
 if(/bumper/.test(n))return'Broken';
 return'Bent';}
function misc(name){var n=(name||'').toLowerCase();
 if(/paintwork material.*water|water.*paintwork/.test(n))return null;
 if(/paintwork material.*solvent/.test(n))return'500.00'; // user 2026-10-10 (PGU1010 screenshot): Solvent line = 500
 if(/paintwork/.test(n))return'500.00'; // generic Paintwork Materials row (popup Other/anything) = 500 — user 2026-10-11
 if(/car-o-liner|frame aligner|aligner bench|frame bench/.test(n))return'400.00';
 if(/electrical/.test(n))return'35.00';
 if(/underseal/.test(n))return'60.00';
 if(/road test/.test(n))return'30.00';
 if(/road wheel align|alignment/.test(n))return'45.00';
 if(/balancing/.test(n))return'35.00';
 if(/number plate/.test(n))return'25.00';
 if(/windscreen sealant|glass sealant/.test(n))return'120.00'; // user 2026-10-23 screenshot
 if(/floor ?board sealant/.test(n))return'60.00'; // user 2026-10-23
 if(/tail ?lamp sealant/.test(n))return'15.00'; // user 2026-10-23
 if(/sealant/.test(n))return'30.00';
 if(/other items/.test(n))return'35.00';
 if(/\btyre\b/.test(n))return'350.00';
 if(/air.?cond|r134/.test(n))return'150.00';
 if(/fogging/.test(n))return'45.00';
 if(/radiator coolant|coolant/.test(n))return'35.00'; // user 2026-10-10
 return null;}
const url=`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${D.cid}&extid=${D.extid}&tpins=0&${SESS}`;
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
const page=await b.contexts()[0].newPage();
page.on('dialog',async d=>{await d.accept().catch(()=>{});});
await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
const paintRes=await paintStep(page);
await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(4000);
const plan=await page.evaluate(({condSrc,miscSrc})=>{
  var cond=eval('('+condSrc+')'); var misc=eval('('+miscSrc+')');
  function rowName(el){var tr=el.closest('tr');if(!tr)return'';var tds=tr.querySelectorAll('td');for(var j=0;j<tds.length;j++){var t=(tds[j].innerText||'').trim();if(t&&!/^[<>=*]$/.test(t))return t;}return'';}
  var pn=+(document.querySelector('[name=PROWCNT]')||{}).value||0; var pc=0,plist=[];
  for(var i=1;i<=pn;i++){var e=document.querySelector('[name=PDC'+i+']');if(!e||e.readOnly)continue;var nm=rowName(document.querySelector('[name=PPT'+i+']')||e);if(!nm)continue;var c=cond(nm);e.value=c;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));pc++;if(plist.length<8)plist.push(nm+'->'+c);}
  var mn=+(document.querySelector('[name=MROWCNT]')||{}).value||0; var mc=0,mlist=[];
  var hasSolvent=false;for(var k0=1;k0<=mn;k0++){var m0=document.querySelector('[name=MMI'+k0+']');if(m0&&/paintwork material.*solvent/i.test(rowName(m0)))hasSolvent=true;}
  for(var k=1;k<=mn;k++){var m=document.querySelector('[name=MMI'+k+']');if(!m)continue;var nm2=rowName(m);var isPW=/paintwork/i.test(nm2);if(m.readOnly&&!isPW)continue;if(isPW&&!/solvent|water/i.test(nm2)&&hasSolvent)continue;var p=misc(nm2);if(p==null)continue;if(isPW)m.readOnly=false;m.value=p;m.dispatchEvent(new Event('input',{bubbles:true}));m.dispatchEvent(new Event('change',{bubbles:true}));mc++;mlist.push(nm2.slice(0,28)+'='+p);}
  var paint='popup';
  return {pc,mc,plist,mlist,paint};
},{condSrc:cond.toString(),miscSrc:misc.toString()});
console.log(PLATE+' set PDC='+plan.pc+' MISC='+plan.mc+' PAINTSTEP['+paintRes+']');
if(process.argv[5]==='v'){console.log('  cond:',JSON.stringify(plan.plist));console.log('  misc:',JSON.stringify(plan.mlist));}
await page.evaluate(()=>{document.querySelectorAll('img').forEach(im=>im.style.pointerEvents='none');});
await page.getByText('Save',{exact:true}).first().click({force:true}).catch(()=>{});
await page.waitForTimeout(5000);
for(let i=0;i<3;i++){const ok=await page.evaluate(()=>{const t=[...document.querySelectorAll('input,button')].find(e=>((e.value||e.innerText||'').trim()==='OK')&&e.offsetParent!==null);if(t){t.click();return true;}return false;});if(!ok)break;await page.waitForTimeout(1200);}
await page.goto(url,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(3500);
const vr=await page.evaluate(()=>{var pn=+(document.querySelector('[name=PROWCNT]')||{}).value||0;var filled=0,empty=0;for(var i=1;i<=pn;i++){var e=document.querySelector('[name=PDC'+i+']');if(!e)continue;var ppt=document.querySelector('[name=PPT'+i+']');if(!ppt)continue;var tr=ppt.closest('tr');var hasName=tr&&[...tr.querySelectorAll('td')].some(td=>{var t=(td.innerText||'').trim();return t&&!/^[<>=*]$/.test(t);});if(!hasName)continue;if((e.value||'').trim())filled++;else empty++;}var g=(window.gPWM||{})[0]||{};var pwv=[];var mn2=+(document.querySelector('[name=MROWCNT]')||{}).value||0;for(var k=1;k<=mn2;k++){var m=document.querySelector('[name=MMI'+k+']');if(!m)continue;var tr=m.closest('tr');var t=(tr?tr.textContent:'').replace(/\s+/g,' ');if(/Paintwork/i.test(t))pwv.push(t.trim().slice(0,28)+'='+m.value);}return 'PDC filled='+filled+' empty='+empty+' | PW['+pwv.join('; ')+'] | PaintMan='+((document.getElementById('pwm_man0')||{}).innerText||'?')+' custom='+(g.manCustom||'')+' consum='+(g.csmb||0);});
console.log(PLATE+' VERIFY '+vr);
await b.close();
