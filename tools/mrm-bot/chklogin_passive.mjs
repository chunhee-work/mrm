// PASSIVE login check (user 2026-11-06: "you kicked my login out, all the time"). Never opens a page, never navigates,
// never uses a saved session file: it uses the session of the window's OWN Merimen tab (from that tab's URL) and asks the
// worklist with fetch() inside that tab. Prints OK / LOGGEDOUT / NOTAB.   CDP=<window>
import { chromium } from 'playwright-core';
const b=await chromium.connectOverCDP(process.env.CDP||'http://127.0.0.1:9222');
const t=b.contexts()[0].pages().find(p=>/merimen\.com\.my/.test(p.url())&&/CFID=/.test(p.url()));
if(!t){console.log('NOTAB');await b.close();process.exit(0);}
const q=new URL(t.url()).searchParams;const s=['CFID','CFTOKEN','USID','RID'].filter(k=>q.get(k)).map(k=>k+'='+q.get(k)).join('&');
const h=await t.evaluate(async u=>{try{const r=await fetch(u,{credentials:'include'});return await r.text()}catch(e){return ''}},'/claims/index.cfm?fusebox=MTRadjuster&fuseaction=dsp_maindtl&personal=1&stat=2&totalcase=5&setpage=0&'+s);
console.log(/caseid=\d+|Pending for Survey Report|Personal In-Tray/i.test(h)&&!/type=["']?password/i.test(h)?'OK':'LOGGEDOUT');await b.close();
