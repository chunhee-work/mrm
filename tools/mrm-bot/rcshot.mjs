// Open each case's DOC PDF in the Merimen viewer (no download) and screenshot pages 1-3 -> state/rcshot/<PLATE>_p<n>.png
import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs'; import { readFileSync, existsSync } from 'fs';
const SESS=readFileSync(process.env.SESSF||'/Users/chunhee/mrm-bot/session_base.txt','utf8').trim();
const [,,IDS]=process.argv;const PAR=+(process.env.PAR||3);const D='/Users/chunhee/mrm-bot/state/rcshot/';
const C=readFileSync(IDS,'utf8').trim().split('\n').map(l=>l.trim().split(/\s+/)).filter(x=>x.length===3);
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ctx=b.contexts()[0];
async function one([pl,cid,ext]){if(existsSync(D+pl+'_p1.png')||existsSync(D+pl+'.none'))return;
 const page=await ctx.newPage();page.on('dialog',async d=>{await d.accept().catch(()=>{})});let np=null;
 try{await page.goto(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRdoc&fuseaction=dsp_docview&domainid=1&objid=${cid}&extid=${ext}&corole=4&`+SESS,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2500);
  const h=await page.content();if(/Session Timeout|Not Logged On|Session not matched/.test(h)){console.log('LOGGEDOUT');process.exit(3);}
  const link=page.locator("a[href*='SVCDOCAttView'][href*='PDF']").first();
  if(!(await link.count())){console.log(pl,'NO PDF');(await import('fs')).writeFileSync(D+pl+'.none','');await page.close();return;}
  const pp=page.waitForEvent('popup',{timeout:20000}).catch(()=>null);await link.click();np=await pp;if(!np){console.log(pl,'no viewer');await page.close();return;}
  await np.setViewportSize({width:1100,height:4200}).catch(()=>{});await np.waitForTimeout(5000);const u=np.url();
  await np.waitForTimeout(2000);await np.screenshot({path:D+pl+'_p1.png',timeout:30000});
  console.log(pl,'ok');}catch(e){console.log(pl,'ERR',e.message.slice(0,60));}
 if(np)await np.close().catch(()=>{});await page.close().catch(()=>{});}
for(let i=0;i<C.length;i+=PAR)await Promise.all(C.slice(i,i+PAR).map(one));
console.log('done');await b.close();
