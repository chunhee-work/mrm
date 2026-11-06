// After the user logs in by hand in the 9222 Chrome: save that tab's session to session_<name>.txt (never prints it)
import { chromium } from '/Users/chunhee/mrm-bot/node_modules/playwright-core/index.mjs'; import { writeFileSync } from 'fs';
const name=process.argv[2]||'aman';
const b=await chromium.connectOverCDP((process.env.CDP||'http://127.0.0.1:9222'));
const pg=b.contexts()[0].pages().find(p=>/merimen\.com\.my/.test(p.url())&&/CFID=/.test(p.url()));
if(!pg){console.log('no logged-in Merimen tab');process.exit(1);}
const p=new URL(pg.url()).searchParams;
writeFileSync(`/Users/chunhee/mrm-bot/session_${name}.txt`,'CFID='+p.get('CFID')+'&CFTOKEN='+p.get('CFTOKEN')+'&USID='+p.get('USID')+'&RID='+p.get('RID'));
console.log('saved session_'+name+'.txt');
console.log((await pg.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').match(/Logout (.{0,60})/)?.[1]||'');
await b.close();
