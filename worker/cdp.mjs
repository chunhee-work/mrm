// Linux CDP helper for the worker Chrome. A person logs in themselves in that window.
// This file never types a password and never prints a query string (CFID / CFTOKEN live there).
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

async function evalOn(port, expression) {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = (list || []).find((t) => t.type === "page" && /merimen\.com\.my/.test(t.url || ""));
  if (!page || !page.webSocketDebuggerUrl) return { ok: false, error: "no_tab", loggedIn: false, hasPassword: false };
  const loggedIn = isLoggedInUrl(page.url || "");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("cdp")), { once: true });
  });
  let n = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  });
  const send = (method, params) => new Promise((resolve) => {
    const id = ++n;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    const ran = await send("Runtime.evaluate", { expression, returnByValue: true });
    const value = ran.result && ran.result.result ? ran.result.result.value : null;
    return { ok: true, value, loggedIn, hasPassword: value === "password_page" || value === true };
  } finally {
    ws.close();
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
    const { readFileSync } = await import("node:fs");
    let cred = {};
    try { cred = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { cred = {}; }
    const user = String(cred.username || "");
    const pass = String(cred.password || "");
    const port = Number(process.env.CDP_PORT || "9222");
    const fill = `(() => {
      const fire = (e) => { e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
      const txt = [...document.querySelectorAll("input")].find((i) => /text|email/i.test(i.type || "text") && i.offsetParent);
      const p = document.querySelector("input[type=password]");
      if (txt) { txt.value = ${JSON.stringify(user)}; fire(txt); }
      if (p) { p.value = ${JSON.stringify(pass)}; fire(p); }
      const b = [...document.querySelectorAll("input,button,a")].find((e) => /login|log in|sign in/i.test(((e.value || e.innerText || "") + "").trim()));
      if (b) b.click();
      return "sent";
    })()`;
    const signals = `(() => JSON.stringify({
      href: location.href,
      hasPassword: !!document.querySelector("input[type=password]"),
      hasOtp: !!document.querySelector("input[autocomplete='one-time-code'], input[name*=otp i], input[name*=tac i]"),
      text: (((document.querySelector(".error, .err, #msg, .alert, .warning") || {}).innerText) || "").replace(/\\s+/g, " ").slice(0, 500)
    }))()`;
    try {
      await evalOn(port, fill);
      await new Promise((r) => setTimeout(r, 3000));
      const read = await evalOn(port, signals);
      const parsed = JSON.parse(read.value || "{}");
      process.stdout.write(JSON.stringify({ url: parsed.href || "", text: parsed.text || "", has_password: !!parsed.hasPassword, has_otp: !!parsed.hasOtp }) + "\n");
    } catch {
      process.stdout.write(JSON.stringify({ offline: true }) + "\n");
      process.exit(1);
    }
    return;
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
