// Linux CDP helper for the worker Chrome. A person logs in themselves in that window, or (MERIMEN_LOGIN=on) the `login`
// command types the saved login ONCE into Merimen's own login page. The password is never written to stdout or a log.
import { pathToFileURL } from "node:url";

export const MERIMEN_START = "https://www.merimen.com.my/claims/index.cfm";

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

async function listTabs(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) });
  return r.json();
}

// One debugging socket to one tab. eval() gives the value back, or throws (socket error, page error, no answer in time).
async function attachTab(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await within(new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("cdp")), { once: true });
  }), 5000);
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
      }), STEP_MS);
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
// What must be true before a single key is typed: the page is Merimen's own origin, it has a password box, a visible user box
// and a login button. A logged-in page has no password box, so it is never typed into and never "verified" by accident.
const LOGIN_PARTS = `
  const onMerimen = location.origin === ${JSON.stringify(MERIMEN_ORIGIN)};
  const p = document.querySelector("input[type=password]");
  const txt = [...document.querySelectorAll("input")].find((i) => /text|email/i.test(i.type || "text") && i.offsetParent);
  const label = (e) => ((e.value || e.innerText || "") + "").trim();
  const b = [...document.querySelectorAll("input,button,a")].find((e) => e !== txt && e !== p && /login|log in|sign in/i.test(label(e)) && !/log\\s*out|sign\\s*out/i.test(label(e)));
  const ready = onMerimen && !!p && !!txt && !!b;
`;

// Read only. "login_page" or "not_login_page".
export const LOGIN_PROBE = `(() => {${LOGIN_PARTS}
  return ready ? "login_page" : "not_login_page";
})()`;

// Checks again inside the page (it may have changed since the probe), then types and clicks once. "sent" or "not_login_page".
export function loginFillExpression(user, pass) {
  return `(() => {${LOGIN_PARTS}
    if (!ready) return "not_login_page";
    const fire = (e) => { e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
    txt.value = ${JSON.stringify(String(user))}; fire(txt);
    p.value = ${JSON.stringify(String(pass))}; fire(p);
    b.click();
    return "sent";
  })()`;
}

const LOGIN_SIGNALS = `(() => JSON.stringify({
  href: location.href,
  hasPassword: !!document.querySelector("input[type=password]"),
  hasOtp: !!document.querySelector("input[autocomplete='one-time-code'], input[name*=otp i], input[name*=tac i]"),
  text: (((document.querySelector(".error, .err, #msg, .alert, .warning") || {}).innerText) || "").replace(/\\s+/g, " ").slice(0, 500)
}))()`;

// The one login try. Returns exactly one of:
//   { offline: true, submitted: false }             Chrome could not be asked; nothing was typed
//   { result: "not_login_page", submitted: false }  no Merimen login page is open; nothing was typed
//   { result: "unknown", submitted: true }          the form may have been sent and the answer could not be read: NEVER try again by itself
//   { submitted: true, url, text, has_password, has_otp }  the form was sent and the page was read
// emit({ submitted: true }) is written BEFORE the evaluate that types, so a caller that kills this script still knows.
export async function runLogin({ port, cred, tabs = listTabs, attach = attachTab, wait = (ms) => new Promise((r) => setTimeout(r, ms)), emit = () => {} }) {
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
  try {
    if ((await tab.eval(LOGIN_PROBE)) !== "login_page") return NOT_LOGIN;
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
  await wait(3000);
  let after;
  try {
    const again = (await tabs(port)).find((t) => t && t.id === page.id && t.webSocketDebuggerUrl && isMerimenOrigin(t.url || ""));
    if (!again) return UNKNOWN;
    after = await attach(again);
  } catch {
    return UNKNOWN;
  }
  try {
    const parsed = JSON.parse(await after.eval(LOGIN_SIGNALS));
    if (!parsed || typeof parsed.href !== "string") return UNKNOWN;
    return { submitted: true, url: parsed.href, text: String(parsed.text || ""), has_password: !!parsed.hasPassword, has_otp: !!parsed.hasOtp };
  } catch {
    return UNKNOWN;
  } finally {
    after.close();
  }
}

function refuseWrites() {
  if (process.env.MERIMEN_WRITES !== "on") {
    process.stdout.write(JSON.stringify({ ok: false, error: "writes_off" }) + "\n");
    process.exit(2);
  }
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
    const out = await runLogin({
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
