// Linux CDP helper for the worker Chrome. A person logs in themselves in that window, or (MERIMEN_LOGIN=on) the `login`
// command types the saved login ONCE into Merimen's own login page. The password is never written to stdout or a log.
import { pathToFileURL } from "node:url";

// The login page as Merimen serves it to a fresh tab: without skip_browsertest=1 a new tab gets a browser-test page and no login
// form (seen live 2026-11-28: two re-logins put back with nothing typed). Same address the mrm-bot harvest scripts use.
export const MERIMEN_START = "https://www.merimen.com.my/claims/index.cfm?skip_browsertest=1";

export function allowField(name) {
  return typeof name === "string" && /^[A-Za-z0-9_]{1,40}$/.test(name) && !/pass|pwd|token|cookie|secret|cfid|cftoken/i.test(name);
}

export function redact(url) {
  return String(url || "").split("?")[0].slice(0, 200);
}

export function isLoggedInUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.host === "www.merimen.com.my" && u.pathname.startsWith("/claims/") && !!u.searchParams.get("CFID") && !!u.searchParams.get("RID");
  } catch {
    return false;
  }
}

const PASSWORD_PROBE = `(() => !!document.querySelector("input[type=password]"))()`;
const CONTINUE = `(() => {
  const b = [...document.querySelectorAll("button,input[type=button],input[type=submit],a")]
    .find((e) => /^continue session$/i.test((e.innerText || e.value || "").replace(/\s+/g, " ").trim()) && e.offsetParent);
  if (!b) return "none";
  b.click();
  return "clicked";
})()`;

export function fillExpression(fields) {
  const safe = [];
  for (const f of fields || []) {
    if (!allowField(f.name)) return null;
    safe.push(f);
  }
  return `(() => {
    if (document.querySelector("input[type=password]")) return "password_page";
    const fields = ${JSON.stringify(safe.map((f) => ({ name: f.name, value: String(f.value ?? "") })))};
    for (const f of fields) {
      const e = document.querySelector('[name="' + f.name + '"]');
      if (!e || e.type === "password") return "password_page";
      e.value = f.value;
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return "filled";
  })()`;
}

export const MERIMEN_ORIGIN = "https://www.merimen.com.my";

// The whole origin must be Merimen's. A piece of the address is not enough: "https://evil.example/?x=merimen.com.my" is not Merimen.
export function isMerimenOrigin(raw) {
  try {
    return new URL(raw).origin === MERIMEN_ORIGIN;
  } catch {
    return false;
  }
}

export function pickMerimenTab(list) {
  return (list || []).find((t) => t && t.type === "page" && t.webSocketDebuggerUrl && isMerimenOrigin(t.url || "")) || null;
}

const STEP_MS = 8000; // every wait on Chrome ends by itself, so the script always reports where it stopped

function within(promise, ms) {
  let timer;
  const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("cdp timeout")), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function listTabs(port, ms = 5000) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(ms) });
  return r.json();
}

// One debugging socket to one tab. eval() gives the value back, or throws (socket error, page error, no answer in time).
async function attachTab(page, { openMs = 5000, evalMs = STEP_MS } = {}) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await within(new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("cdp")), { once: true });
  }), openMs);
  let n = 0;
  const pending = new Map();
  const fail = () => {
    for (const p of pending.values()) p.reject(new Error("cdp"));
    pending.clear();
  };
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m);
      pending.delete(m.id);
    }
  });
  ws.addEventListener("close", fail);
  ws.addEventListener("error", fail);
  return {
    async eval(expression) {
      const ran = await within(new Promise((resolve, reject) => {
        const id = ++n;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
      }), evalMs);
      if (ran.error || (ran.result && ran.result.exceptionDetails)) throw new Error("cdp eval");
      return ran.result && ran.result.result ? ran.result.result.value : null;
    },
    close() {
      try { ws.close(); } catch { /* already closed */ }
    },
  };
}

async function evalOn(port, expression) {
  const page = pickMerimenTab(await listTabs(port));
  if (!page) return { ok: false, error: "no_tab", loggedIn: false, hasPassword: false };
  const loggedIn = isLoggedInUrl(page.url || "");
  const tab = await attachTab(page);
  try {
    const value = await tab.eval(expression);
    return { ok: true, value, loggedIn, hasPassword: value === "password_page" || value === true };
  } finally {
    tab.close();
  }
}

// ---- login: one try ----
// What a page is, decided inside the page. Read only.
//   login_page    Merimen's own origin, NOT a logged-in address, exactly ONE visible password box, and in the SAME form exactly one
//                 visible user-name text box and one visible login control. Only this page is ever typed into.
//   session_live  Merimen's own origin, a logged-in address (the same rule as isLoggedInUrl: /claims/ with CFID and RID) and no
//                 password box at all: a person is logged in here. Nothing is typed; the saved password is not tested.
//   not_login_page everything else: a change-password page, a page with several password boxes, a form without a login control...
// The login control is a visible <input type=submit|button|image>, <button> or <a> inside that form. A hidden input is never it
// (its value may well say "login"), and neither is anything that says logout, forgot or help.
const LOGIN_PARTS = `
  const ORIGIN = ${JSON.stringify(MERIMEN_ORIGIN)};
  const href = String(location.href);
  const query = href.split("#")[0].split("?")[1] || "";
  const has = (k) => new RegExp("(^|&)" + k + "=[^&]+").test(query);
  const onMerimen = location.origin === ORIGIN;
  const loggedIn = onMerimen && href.split("?")[0].startsWith(ORIGIN + "/claims/") && has("CFID") && has("RID");
  const kind = (e) => String(e.tagName || "").toUpperCase();
  const type = (e) => String(e.type || "").toLowerCase();
  const shown = (e) => !!e && !!e.offsetParent && type(e) !== "hidden";
  const passAll = [...document.querySelectorAll("input[type=password]")];
  const passShown = passAll.filter(shown);
  const p = passShown.length === 1 ? passShown[0] : null;
  const form = p ? (p.form || null) : null;
  const inForm = (e) => !!form && (e.form === form || (typeof e.closest === "function" && e.closest("form") === form));
  const users = form ? [...document.querySelectorAll("input")].filter((i) => i !== p && inForm(i) && shown(i) && /^(text|email)$/.test(type(i) || "text")) : [];
  const txt = users.length === 1 ? users[0] : null;
  const label = (e) => String(e.value || e.innerText || e.alt || e.title || "").replace(/\\s+/g, " ").trim();
  const controls = form ? [...document.querySelectorAll("input,button,a")].filter((e) => e !== p && e !== txt && inForm(e) && shown(e) && (
    (kind(e) === "INPUT" && /^(submit|button|image)$/.test(type(e))) || (kind(e) === "BUTTON" && type(e) !== "reset") || kind(e) === "A")) : [];
  const loginWord = (t) => t.length <= 24 && /^(log ?in|sign ?in|log ?masuk|masuk|submit)\\b/i.test(t) && !/out|keluar|forgot|lupa|help|history|[?]/i.test(t);
  const named = controls.filter((e) => loginWord(label(e)));
  const real = controls.filter((e) => (kind(e) === "INPUT" && /^(submit|image)$/.test(type(e))) || (kind(e) === "BUTTON" && /^(submit)?$/.test(type(e))));
  const b = named.length === 1 ? named[0] : (named.length === 0 && real.length === 1 ? real[0] : null);
  const state = onMerimen && !loggedIn && !!p && !!txt && !!b ? "login_page" : (loggedIn && passAll.length === 0 ? "session_live" : "not_login_page");
`;

// Read only. JSON: { state: "login_page" | "session_live" | "not_login_page", href }.
export const LOGIN_PROBE = `(() => {${LOGIN_PARTS}
  return JSON.stringify({ state, href });
})()`;

// Checks again inside the page (it may have changed since the probe), then types and clicks once. "sent" or "not_login_page".
export function loginFillExpression(user, pass) {
  return `(() => {${LOGIN_PARTS}
    if (state !== "login_page") return "not_login_page";
    const fire = (e) => { e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
    txt.value = ${JSON.stringify(String(user))}; fire(txt);
    p.value = ${JSON.stringify(String(pass))}; fire(p);
    b.click();
    return "sent";
  })()`;
}

// Read only: what the page looks like after the submit. Never clicks anything (also not on a "Continue Session" page).
export const LOGIN_SIGNALS = `(() => JSON.stringify({
  href: location.href,
  ready: document.readyState,
  hasPassword: !!document.querySelector("input[type=password]"),
  hasOtp: !!document.querySelector("input[autocomplete='one-time-code'], input[name*=otp i], input[name*=tac i]"),
  text: (((document.querySelector(".error, .err, #msg, .alert, .warning") || {}).innerText) || "").replace(/\\s+/g, " ").slice(0, 500)
}))()`;

export const AFTER_SUBMIT_MS = 15000; // how long the page is watched after the one submit
export const AFTER_SUBMIT_EVERY_MS = 1000;

// The one login try. Returns exactly one of:
//   { offline: true, submitted: false }             Chrome could not be asked; nothing was typed
//   { result: "not_login_page", submitted: false }  no Merimen login page is open; nothing was typed
//   { result: "session_live", submitted: false }    a person is logged in on this tab; nothing was typed, the password was not tested
//   { result: "unknown", submitted: true }          the form may have been sent and the answer could not be read: NEVER try again by itself
//   { submitted: true, url, text, has_password, has_otp }  the form was sent and the page was read
// emit({ submitted: true }) is written BEFORE the evaluate that types, so a caller that kills this script still knows.
export async function runLogin({ port, cred, tabs = listTabs, attach = attachTab, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, emit = () => {} }) {
  const OFFLINE = { offline: true, submitted: false };
  const NOT_LOGIN = { result: "not_login_page", submitted: false };
  const UNKNOWN = { result: "unknown", submitted: true };
  if (!cred || !cred.username || !cred.password) return OFFLINE; // an empty form is never sent
  let page;
  try {
    page = pickMerimenTab(await tabs(port));
  } catch {
    return OFFLINE;
  }
  if (!page) return NOT_LOGIN;
  let tab;
  try {
    tab = await attach(page);
  } catch {
    return OFFLINE;
  }
  let submitted = false;
  let before = "";
  try {
    let probe;
    try { probe = JSON.parse(await tab.eval(LOGIN_PROBE)); } catch { return OFFLINE; }
    if (!probe || typeof probe !== "object") return OFFLINE;
    // both must agree: the page's own test and the address Chrome lists for the tab
    if (probe.state === "session_live") return isLoggedInUrl(page.url || "") ? { result: "session_live", submitted: false } : NOT_LOGIN;
    if (probe.state !== "login_page") return NOT_LOGIN;
    before = String(probe.href || "");
    emit({ submitted: true });
    submitted = true;
    const sent = await tab.eval(loginFillExpression(cred.username, cred.password));
    if (sent === "not_login_page") return NOT_LOGIN; // the page itself says nothing was typed
    if (sent !== "sent") return UNKNOWN;
  } catch {
    return submitted ? UNKNOWN : OFFLINE;
  } finally {
    tab.close();
  }
  // Watch the same tab, read only, until the address or the page changes (or the time is up). A read that fails while the page
  // is loading is just tried again. Nothing is clicked and nothing is typed from here on.
  const read = async () => {
    let after;
    try {
      const again = (await tabs(port, 2000)).find((t) => t && t.id === page.id && t.webSocketDebuggerUrl && isMerimenOrigin(t.url || ""));
      if (!again) return null;
      after = await attach(again, { openMs: 2000, evalMs: 3000 });
      const seen = JSON.parse(await after.eval(LOGIN_SIGNALS));
      return seen && typeof seen.href === "string" ? seen : null;
    } catch {
      return null;
    } finally {
      if (after) after.close();
    }
  };
  const end = now() + AFTER_SUBMIT_MS;
  let last = null;
  for (;;) {
    await wait(AFTER_SUBMIT_EVERY_MS);
    const seen = await read();
    if (seen) {
      last = seen;
      const changed = seen.href !== before || !seen.hasPassword || !!seen.hasOtp || !!seen.text;
      if (changed && seen.ready === "complete") {
        await wait(AFTER_SUBMIT_EVERY_MS); // let the new page settle, then take the picture that is classified
        last = (await read()) || last;
        break;
      }
    }
    if (now() >= end) break;
  }
  if (!last) return UNKNOWN;
  return { submitted: true, url: last.href, text: String(last.text || ""), has_password: !!last.hasPassword, has_otp: !!last.hasOtp };
}

// ---- re-login (MERIMEN_RELOGIN, plan #133): the worker's own fresh tab, never anyone else's ----
// Opens ONE new tab at Merimen's start page, waits for it to load, and runs the same one try as `login` on that tab only. It prints
// {"relogin_target": id} first, so a caller that has to kill this script can still close that tab. The tab is closed again unless
// the try ended logged in. Other tabs are never navigated, typed into or closed. No address is printed except the read-back the
// worker classifies (never logged by it).
export const RELOGIN_DEADLINE_MS = 70000; // the whole run; the worker kills the script at 90 s, so this ends it (and closes the tab) first
export const RELOGIN_LOAD_MS = 15000;

async function openTab(port, url, ms = 5000) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: "PUT", signal: AbortSignal.timeout(ms) });
  return r.json();
}

async function closeTab(port, id, ms = 5000) {
  await fetch(`http://127.0.0.1:${port}/json/close/${encodeURIComponent(String(id))}`, { signal: AbortSignal.timeout(ms) });
}

// Close a tab only while another page tab stays open: closing the last tab would close the Chrome window (never allowed).
export async function closeIfNotLast(port, id, { close = closeTab, tabs = listTabs } = {}) {
  let list;
  try { list = (await tabs(port, 3000)) || []; } catch { return false; }
  const others = list.filter((t) => t && t.type === "page" && String(t.id) !== String(id));
  if (!others.length) return false;
  await close(port, id);
  return true;
}

function endedLoggedIn(out) {
  return !!out && (out.result === "session_live" || (out.submitted === true && !out.result && !out.has_password && isLoggedInUrl(out.url || "")));
}

export async function runRelogin({ port, cred, open = openTab, close = closeTab, tabs = listTabs, attach = attachTab, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, emit = () => {}, deadlineMs = RELOGIN_DEADLINE_MS }) {
  const OFFLINE = { offline: true, submitted: false };
  if (!cred || !cred.username || !cred.password) return OFFLINE;
  let marked = false;
  let stopped = false; // set when the deadline fired: the try underneath stops at its next wait and never types after it
  let id = null;
  const mark = (o) => {
    if (stopped) throw new Error("stopped"); // the deadline already fired: never write the mark, never type
    if (o && o.submitted === true) marked = true;
    emit(o);
  };
  const pause = async (ms) => {
    if (stopped) throw new Error("stopped");
    await wait(ms);
    if (stopped) throw new Error("stopped");
  };
  const own = async (p, ms) => ((await tabs(p, ms)) || []).filter((t) => t && id !== null && String(t.id) === id);
  const whole = async () => { // ONE deadline over everything: open, load, the try and the look at the own tab (G5, D5)
    let before = null;
    try { before = new Set(((await tabs(port, 3000)) || []).map((t) => t && String(t.id))); } catch { before = null; }
    let target;
    try {
      target = await open(port, MERIMEN_START);
    } catch {
      // the tab may have been made although the answer was lost: close only a NEW tab at the start page, never one that was there
      if (before) {
        try {
          for (const t of (await tabs(port, 3000)) || []) {
            if (t && !before.has(String(t.id)) && String(t.url || "") === MERIMEN_START) await closeIfNotLast(port, String(t.id), { close, tabs });
          }
        } catch { /* nothing more to do: nothing was typed */ }
      }
      return OFFLINE;
    }
    if (!target || !target.id) return OFFLINE;
    id = String(target.id);
    emit({ relogin_target: id });
    const t0 = now();
    for (;;) { // read only: wait until the new tab shows Merimen's login form (or is already logged in)
      // A fresh tab first reports about:blank as "complete" before Merimen's page arrives (seen live 2026-11-28: four re-logins
      // probed about:blank and were put back), so "loaded" means the login probe itself sees the page, on Merimen's own address.
      await pause(500);
      let state = null;
      try {
        const t = (await own(port, 2000))[0];
        if (t && t.webSocketDebuggerUrl && isMerimenOrigin(t.url || "")) {
          const a = await attach(t, { openMs: 2000, evalMs: 3000 });
          try { state = (JSON.parse(await a.eval(LOGIN_PROBE)) || {}).state; } finally { a.close(); }
        }
      } catch { state = null; }
      if (state === "login_page" || state === "session_live" || now() - t0 >= RELOGIN_LOAD_MS) break;
    }
    let out = await runLogin({ port, cred, tabs: own, attach, wait: pause, now, emit: mark });
    if (out && out.result === "unknown" && out.submitted === true) {
      // one read-only look at THIS tab only: the read-back may have missed a login that went through (never another tab)
      try {
        const t = (await own(port, 2000))[0];
        if (t && isLoggedInUrl(t.url || "") && t.webSocketDebuggerUrl) {
          const a = await attach(t, { openMs: 2000, evalMs: 3000 });
          try {
            const seen = JSON.parse(await a.eval(LOGIN_SIGNALS));
            if (seen && typeof seen.href === "string" && isLoggedInUrl(seen.href) && !seen.hasPassword) {
              out = { submitted: true, url: seen.href, text: String(seen.text || ""), has_password: false, has_otp: !!seen.hasOtp };
            }
          } finally { a.close(); }
        }
      } catch { /* stays unknown */ }
    }
    return out;
  };
  let out;
  try {
    out = await within(whole(), deadlineMs);
  } catch {
    stopped = true;
    out = marked ? { result: "unknown", submitted: true } : OFFLINE;
  }
  if (id !== null && !endedLoggedIn(out)) {
    try { await closeIfNotLast(port, id, { close, tabs }); } catch { /* the worker closes it by id if it is still there */ }
  }
  return out;
}

function refuseWrites() {
  if (process.env.MERIMEN_WRITES !== "on") {
    process.stdout.write(JSON.stringify({ ok: false, error: "writes_off" }) + "\n");
    process.exit(2);
  }
}

// Which login path a command line runs. Only --relogin opens a tab; the save-time path never does.
export function loginRunner(argv) {
  return argv.includes("--relogin") ? runRelogin : runLogin;
}

async function main() {
  const cmd = process.argv[2] || "inspect";
  if (cmd === "login") {
    // One attempt. The password arrives on stdin and is never written back out.
    if (process.env.MERIMEN_LOGIN !== "on") {
      process.stdout.write(JSON.stringify({ ok: false, error: "login_off" }) + "\n");
      process.exit(2);
    }
    const { readFileSync, writeSync } = await import("node:fs");
    let cred = {};
    try { cred = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { cred = {}; }
    const line = (o) => writeSync(1, JSON.stringify(o) + "\n"); // written at once: the caller reads the mark even if it stops this script
    const run = loginRunner(process.argv); // --relogin: own fresh tab (plan #133); without it nothing navigates
    const out = await run({
      port: Number(process.env.CDP_PORT || "9222"),
      cred: { username: String(cred.username || ""), password: String(cred.password || "") },
      emit: line,
    });
    line(out);
    process.exit(out.offline ? 1 : 0);
  }
  if (cmd === "commit" || cmd === "fill") {
    refuseWrites();
    process.stdout.write(JSON.stringify({ ok: false, error: "step_not_ported" }) + "\n");
    process.exit(3);
  }
  const port = Number(process.env.CDP_PORT || "9222");
  if (cmd === "self-check") {
    process.stdout.write(JSON.stringify({ ok: true }) + "\n");
    return;
  }
  try {
    if (cmd === "continue") {
      const r = await evalOn(port, CONTINUE);
      process.stdout.write(JSON.stringify({ ok: !!r.ok, clicked: r.value === "clicked" }) + "\n");
      return;
    }
    const probe = await evalOn(port, PASSWORD_PROBE);
    process.stdout.write(JSON.stringify({ ok: !!probe.ok, loggedIn: !!probe.loggedIn && probe.value !== true, hasPassword: probe.value === true }) + "\n");
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: "cdp" }) + "\n");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
