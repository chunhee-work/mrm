// read-only price harvest from the RAW estimate page (no JS run): both prices per row.
// SESSF=<file> PAR=8 node pricegrab2.mjs <ids.txt> <out.json>
// row = [desc, partno, list price (Merimen catalogue, shown first), case price (what this case used)]
import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync, existsSync } from 'fs';
const [,,IDS,OUT]=process.argv;const SESS=readFileSync(process.env.SESSF||'session_base.txt','utf8').trim();
const C=readFileSync(IDS,'utf8').trim().split('\n').map(l=>l.trim().split(/\s+/)).filter(x=>x.length===3);
const res=existsSync(OUT)?JSON.parse(readFileSync(OUT,'utf8')):{};
const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const rq=b.contexts()[0].request;
const parseArgs=s=>{const o=[];let i=0;while(i<s.length){while(s[i]===','||s[i]===' ')i++;if(s[i]==='"'){let j=i+1,v='';while(j<s.length&&s[j]!=='"'){if(s[j]==='\\'){v+=s[j+1];j+=2;continue}v+=s[j++];}o.push(v);i=j+1;}else{let j=i;while(j<s.length&&s[j]!==',')j++;o.push(s.slice(i,j).trim());i=j;}}return o;};
async function one([pl,cid,ext]){try{
 const r=await rq.get(`https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=${cid}&extid=${ext}&tpins=0&${SESS}`,{timeout:60000});
 const h=await r.text();if(/Session Timeout|Not Logged On|Session not matched/.test(h)){console.error('LOGGEDOUT');process.exit(3);}
 const model=((h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').match(/Vehicle Model:\s*([^\n\r]+?)\s{2,}/)||['',''])[1]).trim();
 const rows=[];for(const m of h.matchAll(/\bPG\(([^;]*?)\);/g)){const a=parseArgs(m[1]);if(a.length<14)continue;rows.push([a[4],a[7],a[12],a[13]]);}
 res[pl]={cid,model,rows};}catch(e){res[pl]={cid,err:String(e.message).slice(0,80)};}}
const todo=C.filter(([pl])=>!res[pl]||res[pl].err);const PAR=+(process.env.PAR||6);
for(let i=0;i<todo.length;i+=PAR){await Promise.all(todo.slice(i,i+PAR).map(one));if((i/PAR)%10===0)writeFileSync(OUT,JSON.stringify(res));process.stdout.write('.');}
writeFileSync(OUT,JSON.stringify(res));const v=Object.values(res);console.log('\ndone',v.length,'errors',v.filter(x=>x.err).length,'rows',v.reduce((a,x)=>a+(x.rows||[]).length,0));await b.close();
