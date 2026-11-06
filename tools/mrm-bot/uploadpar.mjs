import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const PLATES=process.argv[2].split(',');
const SESS=readFileSync(process.argv[3],'utf8').trim();
const U=JSON.parse(readFileSync(process.argv[4],'utf8'));
async function uploadOne(ctx,PLATE){
  const D=U[PLATE]; let done=0;
  for(const file of D.files){
    const page=await ctx.newPage();
    let pop=null; page.on('popup',p=>{pop=p;});
    try{
      await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${D.cid}&extid=${D.ext}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(2500);
      await page.getByRole('button',{name:/Upload Documents/i}).first().click({force:true,timeout:6000}).catch(()=>{});
      for(let i=0;i<24 && !pop;i++) await page.waitForTimeout(300);
      if(!pop){ await page.close(); continue; }
      pop.on('dialog',async d=>{await d.accept().catch(()=>{});});
      await pop.waitForTimeout(2000);
      await pop.locator('input[type=file]').first().setInputFiles(file.path);
      await pop.waitForTimeout(2500);
      await pop.evaluate((fdesc)=>{var ft=document.querySelector('select[name=FTYPE]');if(ft)for(var i=0;i<ft.options.length;i++){if(/^Other$/i.test(ft.options[i].text.trim())){ft.value=ft.options[i].value;ft.dispatchEvent(new Event('change',{bubbles:true}));break;}}var fd=document.querySelector('[name=FDESC]');if(fd){fd.value=fdesc;fd.dispatchEvent(new Event('change',{bubbles:true}));}},file.fdesc);
      let st=false;
      try{ await pop.getByRole('button',{name:/Start upload/i}).first().click({force:true,timeout:3000}); st=true;}catch(e){}
      if(!st) await pop.evaluate(()=>{var b=[...document.querySelectorAll('button,a,input')].find(e=>/Start upload/i.test((e.innerText||e.value||'')));if(b)b.click();});
      await pop.waitForTimeout(6000); done++;
    }catch(e){}
    await page.close().catch(()=>{});
  }
  const page2=await ctx.newPage();
  await page2.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${D.cid}&extid=${D.ext}&corole=4&${SESS}`,{waitUntil:'domcontentloaded'}).catch(()=>{});
  await page2.waitForTimeout(2500);
  const n=await page2.evaluate(()=>document.querySelectorAll('a[href*=SVCDOCAttView]').length).catch(()=>'?');
  await page2.close().catch(()=>{});
  return PLATE+': uploaded '+done+'/'+D.files.length+' docsInList='+n;
}
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));
const ctx=b.contexts()[0];
const r=await Promise.all(PLATES.map(p=>uploadOne(ctx,p)));
r.forEach(x=>console.log(x));
await b.close();
