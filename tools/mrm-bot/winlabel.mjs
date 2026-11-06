// Put a coloured name tab FIRST in an account's Chrome window, so the user can tell the windows apart (user 2026-11-06).
// node winlabel.mjs <port> <name> <account> <colour>     (read-only for Merimen: only opens a local data: page)
import { chromium } from 'playwright-core';
const [,,PORT,NAME,ACC,COL]=process.argv;
const html=`<title>${NAME} · ${ACC}</title><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:${COL};color:#fff;font:700 64px system-ui"><div style="text-align:center">${NAME}<div style="font-size:28px;opacity:.85">${ACC}</div></div></body>`;
const b=await chromium.connectOverCDP('http://127.0.0.1:'+PORT);const ctx=b.contexts()[0];
const have=ctx.pages().find(p=>p.url().startsWith('data:text/html')&&p.url().includes(encodeURIComponent(NAME+' · ')));
if(!have){const p=await ctx.newPage();await p.goto('data:text/html;charset=utf-8,'+encodeURIComponent(html));}
console.log('label',NAME,ACC,'on',PORT);await b.close();
