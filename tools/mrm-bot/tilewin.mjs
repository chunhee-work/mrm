// 「排窗口」(user 2026-11-06): put the 4 account windows back where the user arranged them.
//   node tilewin.mjs save   -> remember the current position/size of each account window (state/winlayout.json)
//   node tilewin.mjs        -> restore the saved layout (falls back to 4 quadrants of 1920x1080)
// Ports: 9222 437/TC0607 · 9223 ark.tg/NVISSAC · 9224 20010/YUSTRI · 9225 无登录/CHONGAIAI
import { chromium } from 'playwright-core'; import fs from 'fs';
const F=new URL('./state/winlayout.json',import.meta.url).pathname, SAVE=process.argv[2]==='save';
const w=960,h=527,T=25, DEF={9222:{left:0,top:T,width:w,height:h},9223:{left:w,top:T,width:w,height:h},9224:{left:0,top:T+h,width:w,height:h},9225:{left:w,top:T+h,width:w,height:h}};
const L=SAVE?{}:(fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):DEF);
for(const port of [9222,9223,9224,9225]){
  try{const b=await chromium.connectOverCDP('http://127.0.0.1:'+port);const s=await b.newBrowserCDPSession();
   const {targetInfos}=await s.send('Target.getTargets');const ws=[];
   for(const t of targetInfos.filter(t=>t.type==='page')){const {windowId,bounds}=await s.send('Browser.getWindowForTarget',{targetId:t.targetId});if(!ws.find(x=>x.windowId===windowId))ws.push({windowId,bounds});}
   if(SAVE){const big=ws.sort((a,b)=>b.bounds.width*b.bounds.height-a.bounds.width*a.bounds.height)[0];L[port]={left:big.bounds.left,top:big.bounds.top,width:big.bounds.width,height:big.bounds.height};console.log(port,'saved',JSON.stringify(L[port]));}
   else if(L[port]){for(const x of ws){await s.send('Browser.setWindowBounds',{windowId:x.windowId,bounds:{windowState:'normal'}});await s.send('Browser.setWindowBounds',{windowId:x.windowId,bounds:L[port]});}console.log(port,'->',JSON.stringify(L[port]));}
   await b.close();}catch(e){console.log(port,'not open')}
}
if(SAVE){fs.mkdirSync(new URL('./state/',import.meta.url).pathname,{recursive:true});fs.writeFileSync(F,JSON.stringify(L,null,1));}
