// Merimen login for the AUTOMATION Chrome (port 9222) -> writes ~/mrm-bot/session_base.txt for every other script.
// THE USER RUNS THIS in their own Terminal. Agents never run it and never handle the password.
//
// No password in this file. It reads it from a macOS Keychain item that the user creates once
// (macOS prompts for the password; nothing is echoed or saved in shell history):
//   security add-generic-password -s merimen -a <USER_ID> -w
// Install:  cp relogin.example.mjs ~/mrm-bot/relogin.mjs
// Run:      cd ~/mrm-bot && node relogin.mjs <USER_ID>        (or set MERIMEN_USER)
// Which USER_ID: see playbook/00-start-and-rules.md (the account depends on the workshop).
// session_base.txt holds live session tokens: keep it private, never print it, never commit it.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const USER = process.argv[2] || process.env.MERIMEN_USER;
if (!USER) { console.log('usage: node relogin.mjs <USER_ID>'); process.exit(1); }
let PASS;
try { PASS = execFileSync('security', ['find-generic-password', '-s', 'merimen', '-a', USER, '-w'], { encoding: 'utf8' }).trim(); }
catch { console.log('no Keychain item for ' + USER + ': run  security add-generic-password -s merimen -a ' + USER + ' -w'); process.exit(1); }

const b = await chromium.connectOverCDP('http://127.0.0.1:9222'); const ctx = b.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('merimen')) || await ctx.newPage();
page.on('dialog', async d => { await d.accept().catch(() => {}); });
await page.goto('https://www.merimen.com.my', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
await page.evaluate(([u, pw]) => {
  const fire = e => { e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  const txt = [...document.querySelectorAll('input')].find(i => /text/i.test(i.type) && i.offsetParent !== null);
  const p = document.querySelector('input[type=password]');
  if (txt) { txt.value = u; fire(txt); }
  if (p) { p.value = pw; fire(p); }
}, [USER, PASS]);
await page.evaluate(() => { const b = [...document.querySelectorAll('input,button,a')].find(e => /login|log in|sign in/i.test((e.value || e.innerText || '').trim())); if (b) b.click(); });
await page.waitForTimeout(5000);
for (let i = 0; i < 3; i++) {  // "Continue Session" if Merimen asks
  const ok = await page.evaluate(() => { const t = [...document.querySelectorAll('input,button,a')].find(e => /continue session/i.test((e.value || e.innerText || '').trim()) && e.offsetParent !== null); if (t) { t.click(); return true; } return false; });
  if (ok) await page.waitForTimeout(2000); else break;
}
const q = new URLSearchParams(page.url().split('?')[1] || '');
if (q.get('CFID') && q.get('RID')) {
  writeFileSync('session_base.txt', 'CFID=' + q.get('CFID') + '&CFTOKEN=' + q.get('CFTOKEN') + '&USID=' + q.get('USID') + '&RID=' + q.get('RID'));
  console.log('session saved');
} else console.log('login failed: check the 9222 Chrome window');
await b.close();
