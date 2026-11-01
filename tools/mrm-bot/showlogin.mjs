// Before asking the user to log in: put the Merimen login page in front in the automation Chrome (user 2026-11-01).
import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs'; import { execSync } from 'child_process';
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const ctx=b.contexts()[0];
let pg=ctx.pages().find(p=>/merimen\.com\.my/.test(p.url()));
if(!pg){pg=await ctx.newPage();}
const txt=async()=>(await pg.evaluate(()=>document.body?document.body.innerText:'').catch(()=>''));
if(!/User ID[\s\S]*Password/.test(await txt())){await pg.goto('https://www.merimen.com.my/',{waitUntil:'domcontentloaded'}).catch(()=>{});await pg.waitForTimeout(2500);}
await pg.bringToFront();
const s=await b.newBrowserCDPSession();const {windowId}=await s.send('Browser.getWindowForTarget',{targetId:(await (await ctx.newCDPSession(pg)).send('Target.getTargetInfo')).targetInfo.targetId});
await s.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}}).catch(()=>{});
try{const pid=execSync("pgrep -f 'remote-debugging-port=9222' | head -1").toString().trim();if(pid)execSync(`osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true'`);}catch(e){}
console.log(/User ID[\s\S]*Password/.test(await txt())?'login page shown':'shown: '+pg.url().split('?')[0]);
await b.close();
