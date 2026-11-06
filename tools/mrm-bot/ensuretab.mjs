// user 2026-10-30: before ANY Merimen login, a https://www.merimen.com.my page must already be open, else the login page logs out by itself.
// Checks the automation Chrome (9222) and the Mac's Chrome/Safari windows; if no Merimen page is open in 9222, opens https://www.merimen.com.my/ there.
import { chromium } from 'playwright-core'; import { execSync } from 'child_process';
const mac=[];for(const app of ['Google Chrome','Safari']){try{const o=execSync(`osascript -e 'if application "${app}" is running then tell application "${app}" to get URL of every tab of every window'`+(app==='Safari'?'':''),{encoding:'utf8',timeout:8000});o.split(/,\s*/).filter(u=>/merimen\.com\.my/.test(u)).forEach(u=>mac.push(app+': '+u.trim().slice(0,40)));}catch(e){}}
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));const ctx=b.contexts()[0];
const mer=ctx.pages().filter(p=>/merimen\.com\.my/.test(p.url()));
console.log('mac windows with merimen:',mac.length,'| 9222 merimen tabs:',mer.length);
if(!mer.length){const p=await ctx.newPage();await p.goto('https://www.merimen.com.my/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});console.log('opened https://www.merimen.com.my/ in the automation Chrome');}
await b.close();
