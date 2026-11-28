import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { allowField, isLoggedInUrl, redact } from "./cdp.mjs";

test("login is refused unless MERIMEN_LOGIN=on, and the refusal is not a page", () => {
  const r = spawnSync(process.execPath, ["cdp.mjs", "login"], { encoding: "utf8", cwd: new URL(".", import.meta.url).pathname });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /login_off/);
  assert.doesNotMatch(r.stdout, /password/);
});

test("a query string is not kept", () => {
  assert.equal(redact("https://www.merimen.com.my/claims/index.cfm?CFID=1&CFTOKEN=2"), "https://www.merimen.com.my/claims/index.cfm");
  assert.equal(isLoggedInUrl("https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2"), true);
  assert.equal(allowField("sleREGNO"), true);
  assert.equal(allowField("password"), false);
});

// ---- the login command (offline: a fake page and a fake debugging port on 127.0.0.1; no browser, no site) ----
import vm from "node:vm";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { isMerimenOrigin, pickMerimenTab, LOGIN_PROBE, LOGIN_SIGNALS, loginFillExpression, runLogin, runRelogin, closeIfNotLast, loginRunner, AFTER_SUBMIT_MS, MERIMEN_START } from "./cdp.mjs";

const LOGIN_URL = "https://www.merimen.com.my/claims/index.cfm";
const LIVE_URL = "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRroot&fuseaction=dsp_home&CFID=11&CFTOKEN=22&USID=33&RID=44";

// One element as the in-page script sees it. `form` is the form object it belongs to (any object; identity is what counts).
function el(tag, props = {}) {
  const e = { tagName: tag.toUpperCase(), offsetParent: {}, type: tag === "input" ? "text" : tag === "button" ? "submit" : "", value: "", innerText: "", form: null, events: 0, clicks: 0, ...props };
  e.dispatchEvent = () => { e.events += 1; };
  e.click = () => { e.clicks += 1; };
  e.closest = (sel) => (sel === "form" ? e.form : null);
  return e;
}

// A page: just enough DOM for the selectors the script uses.
function fakePage({ href = LOGIN_URL, elements = [], errorText = "", readyState = "complete" } = {}) {
  const pick = (sel) => elements.filter((e) => sel.split(",").some((one) => {
    const m = /^\s*([a-z]+)(\[type=([a-z]+)\])?\s*$/.exec(one);
    return !!m && e.tagName === m[1].toUpperCase() && (!m[3] || String(e.type).toLowerCase() === m[3]);
  }));
  const document = {
    readyState,
    querySelectorAll: (sel) => pick(sel),
    querySelector: (sel) => (sel.startsWith(".error") ? (errorText ? { innerText: errorText } : null) : sel.includes("one-time-code") ? null : pick(sel)[0] || null),
  };
  const u = new URL(href);
  return { document, location: { origin: u.origin, href }, Event: class { constructor(t) { this.type = t; } }, elements };
}

function loginForm({ form = { name: "login" }, extra = [] } = {}) {
  const user = el("input", { type: "text", form });
  const pass = el("input", { type: "password", form });
  const button = el("input", { type: "submit", value: "Login", form });
  return { form, user, pass, button, elements: [user, pass, button, ...extra] };
}

const probe = (page) => JSON.parse(vm.runInNewContext(LOGIN_PROBE, page)).state;
const fill = (page) => vm.runInNewContext(loginFillExpression("abuser", "s3cret"), page);
const touched = (page) => page.elements.some((e) => e.value === "abuser" || e.value === "s3cret" || e.events || e.clicks);

function leftAlone(page, state = "not_login_page") {
  assert.equal(probe(page), state);
  assert.equal(fill(page), "not_login_page");
  assert.equal(touched(page), false);
}

test("a tab is Merimen only by its exact origin, never by a piece of the address", () => {
  assert.equal(isMerimenOrigin("https://www.merimen.com.my/claims/index.cfm?CFID=1"), true);
  for (const bad of [
    "https://evil.example/?next=merimen.com.my",
    "https://www.merimen.com.my.evil.example/claims/",
    "https://merimen.com.my.evil.example/",
    "http://www.merimen.com.my/claims/",
    "https://www.merimen.com.my:8443/claims/",
    "https://xmerimen.com.my/",
    "about:blank",
    "",
  ]) assert.equal(isMerimenOrigin(bad), false, bad);
  const tabs = [
    { id: "a", type: "page", url: "https://evil.example/?x=www.merimen.com.my", webSocketDebuggerUrl: "ws://a" },
    { id: "b", type: "iframe", url: "https://www.merimen.com.my/claims/", webSocketDebuggerUrl: "ws://b" },
    { id: "c", type: "page", url: "https://www.merimen.com.my/claims/index.cfm", webSocketDebuggerUrl: "ws://c" },
  ];
  assert.equal(pickMerimenTab(tabs).id, "c");
  assert.equal(pickMerimenTab(tabs.slice(0, 2)), null);
});

test("the login page is filled once and its own button clicked once", () => {
  const f = loginForm({ extra: [el("a", { innerText: "Logout" }), el("a", { innerText: "Forgot your login ID?" })] });
  f.elements[4].form = f.form; // the "forgot" link sits inside the form and still is not the button
  const page = fakePage({ elements: f.elements });
  assert.equal(probe(page), "login_page");
  assert.equal(fill(page), "sent");
  assert.equal(f.user.value, "abuser");
  assert.equal(f.pass.value, "s3cret");
  assert.equal(f.button.clicks, 1);
  assert.equal(f.elements[3].clicks + f.elements[4].clicks, 0);
});

test("a button without a login word is used only when it is the form's one real submit control", () => {
  const form = {};
  const user = el("input", { form });
  const pass = el("input", { type: "password", form });
  const image = el("input", { type: "image", alt: "", form });
  const page = fakePage({ elements: [user, pass, image] });
  assert.equal(probe(page), "login_page");
  assert.equal(fill(page), "sent");
  assert.equal(image.clicks, 1);
  const two = fakePage({ elements: [el("input", { form }), el("input", { type: "password", form }), el("input", { type: "submit", value: "Go", form }), el("input", { type: "submit", value: "Reset all", form })] });
  leftAlone(two);
});

test("a logged-in page is session_live and gets nothing typed and nothing clicked", () => {
  const page = fakePage({ href: LIVE_URL, elements: [el("input", { name: "search" }), el("a", { innerText: "Login history" }), el("a", { innerText: "Logout" })] });
  leftAlone(page, "session_live");
});

test("the page's logged-in test is the same rule as isLoggedInUrl", () => {
  for (const href of [
    LIVE_URL,
    "https://www.merimen.com.my/claims/index.cfm?RID=2&CFID=1#top",
    "https://www.merimen.com.my/claims/index.cfm?CFID=1",
    "https://www.merimen.com.my/claims/index.cfm?CFID=&RID=2",
    "https://www.merimen.com.my/claims/index.cfm?xCFID=1&RID=2",
    "https://www.merimen.com.my/other/index.cfm?CFID=1&RID=2",
    "https://www.merimen.com.my/claims/index.cfm#?CFID=1&RID=2",
    "https://www.merimen.com.my.evil.example/claims/index.cfm?CFID=1&RID=2",
    "http://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2",
  ]) {
    assert.equal(probe(fakePage({ href, elements: [] })) === "session_live", isLoggedInUrl(href), href);
  }
});

test("a logged-in page that has a password box (change password) is never typed into and is not a live session either", () => {
  const form = { name: "chgpwd" };
  const one = fakePage({ href: LIVE_URL, elements: [el("input", { form }), el("input", { type: "password", form }), el("input", { type: "submit", value: "Login", form })] });
  leftAlone(one);
  const three = fakePage({ href: LIVE_URL, elements: [el("input", { type: "password", form }), el("input", { type: "password", form }), el("input", { type: "password", form }), el("input", { type: "submit", value: "Submit", form })] });
  leftAlone(three);
  const hiddenBox = fakePage({ href: LIVE_URL, elements: [el("input", { type: "password", offsetParent: null })] });
  leftAlone(hiddenBox);
});

test("a hidden input whose value says login is never the button", () => {
  const form = {};
  const user = el("input", { form });
  const pass = el("input", { type: "password", form });
  const hidden = el("input", { type: "hidden", value: "login", name: "fuseaction", form, offsetParent: null });
  const hiddenLooksShown = el("input", { type: "hidden", value: "Login", form });
  const invisible = el("input", { type: "submit", value: "Login", form, offsetParent: null });
  const page = fakePage({ elements: [user, pass, hidden, hiddenLooksShown, invisible] });
  leftAlone(page);
  const real = el("button", { innerText: "Sign in", form });
  const withButton = fakePage({ elements: [user, pass, hidden, hiddenLooksShown, invisible, real] });
  assert.equal(fill(withButton), "sent");
  assert.equal(real.clicks, 1);
  assert.equal(hidden.clicks + hiddenLooksShown.clicks + invisible.clicks, 0);
});

test("the user box and the button must be in the same form as the password box", () => {
  const a = {};
  const b = {};
  leftAlone(fakePage({ elements: [el("input", { form: b }), el("input", { type: "password", form: a }), el("input", { type: "submit", value: "Login", form: a })] }));
  leftAlone(fakePage({ elements: [el("input", { form: a }), el("input", { type: "password", form: a }), el("input", { type: "submit", value: "Login", form: b })] }));
  leftAlone(fakePage({ elements: [el("input"), el("input", { type: "password" }), el("input", { type: "submit", value: "Login" })] })); // no form at all
});

test("anything that is not exactly one visible password box, one visible user box and one login control is left alone", () => {
  const form = {};
  const ok = () => [el("input", { form }), el("input", { type: "password", form }), el("input", { type: "submit", value: "Login", form })];
  leftAlone(fakePage({ elements: [...ok(), el("input", { type: "password", form })] })); // two visible password boxes
  leftAlone(fakePage({ elements: [...ok(), el("input", { form })] })); // two user boxes: which one is the user name?
  leftAlone(fakePage({ elements: [el("input", { form, offsetParent: null }), ...ok().slice(1)] })); // the user box is hidden
  leftAlone(fakePage({ elements: [...ok(), el("button", { innerText: "Login", form })] })); // two login buttons
  leftAlone(fakePage({ elements: ok().slice(0, 2).concat(el("a", { innerText: "Logout", form })) })); // only a logout link
  leftAlone(fakePage({ href: "https://www.merimen.com.my.evil.example/claims/index.cfm", elements: ok() })); // another origin
  const hiddenExtra = fakePage({ elements: [...ok(), el("input", { type: "password", form, offsetParent: null })] }); // a second, hidden password box does not count
  assert.equal(probe(hiddenExtra), "login_page");
});

const TAB = { id: "t1", type: "page", url: LOGIN_URL, webSocketDebuggerUrl: "ws://t1" };
const PROBE_LOGIN = JSON.stringify({ state: "login_page", href: LOGIN_URL });
const PROBE_LIVE = JSON.stringify({ state: "session_live", href: LIVE_URL });
const PROBE_NOT = JSON.stringify({ state: "not_login_page", href: LOGIN_URL });
const seen = (o) => JSON.stringify({ href: LOGIN_URL, ready: "complete", hasPassword: true, hasOtp: false, text: "", ...o });
const SAME = seen({});
const BAD = seen({ text: "Invalid User ID or password" });

// answers: one entry per evaluate, in order (the last one repeats). An Error is thrown. Time only moves when the script waits.
function harness({ tabs = [TAB], answers = [] } = {}) {
  const log = { evals: [], lines: [], attached: 0, waited: 0 };
  let n = 0;
  let clock = 0;
  return {
    log,
    deps: {
      port: 9222,
      cred: { username: "abuser", password: "s3cret" },
      tabs: async () => { if (tabs instanceof Error) throw tabs; return typeof tabs === "function" ? tabs() : tabs; },
      attach: async () => {
        log.attached += 1;
        return {
          eval: async (expression) => {
            log.evals.push(expression);
            const a = answers[Math.min(n++, answers.length - 1)];
            if (a instanceof Error) throw a;
            return a;
          },
          close: () => {},
        };
      },
      wait: async (ms) => { clock += ms; log.waited += ms; },
      now: () => clock,
      emit: (o) => log.lines.push(o),
    },
  };
}

const typing = (log) => log.evals.filter((e) => e.includes("s3cret")).length;

test("no debugging port: offline, nothing submitted", async () => {
  const h = harness({ tabs: new Error("refused") });
  assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
  assert.equal(h.log.attached, 0);
});

test("no Merimen tab, or a page that is not the login page: not_login_page, the password never leaves this process", async () => {
  const none = harness({ tabs: [{ ...TAB, url: "https://evil.example/?merimen.com.my" }] });
  assert.deepEqual(await runLogin(none.deps), { result: "not_login_page", submitted: false });
  assert.equal(none.log.attached, 0);

  const other = harness({ answers: [PROBE_NOT] });
  assert.deepEqual(await runLogin(other.deps), { result: "not_login_page", submitted: false });
  assert.equal(other.log.evals.length, 1);
  assert.equal(typing(other.log), 0);
  assert.deepEqual(other.log.lines, []);
});

test("a tab where a person is logged in: session_live, nothing typed, no submitted mark", async () => {
  const h = harness({ tabs: [{ ...TAB, url: LIVE_URL }], answers: [PROBE_LIVE] });
  assert.deepEqual(await runLogin(h.deps), { result: "session_live", submitted: false });
  assert.equal(h.log.evals.length, 1);
  assert.equal(typing(h.log), 0);
  assert.deepEqual(h.log.lines, []);
  // the page says logged in but Chrome lists another address for the tab: not trusted
  const split = harness({ answers: [PROBE_LIVE] });
  assert.deepEqual(await runLogin(split.deps), { result: "not_login_page", submitted: false });
});

test("a probe that fails or answers nonsense is offline: nothing was typed yet", async () => {
  for (const answer of [new Error("cdp timeout"), "not json", null]) {
    const h = harness({ answers: [answer] });
    assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
    assert.deepEqual(h.log.lines, []);
  }
});

test("the submitted mark is written before the one evaluate that types", async () => {
  const order = [];
  const h = harness({ answers: [PROBE_LOGIN, "sent", BAD] });
  const attach = h.deps.attach;
  h.deps.attach = async (t) => {
    const tab = await attach(t);
    return { ...tab, eval: async (x) => { order.push(x.includes("s3cret") ? "fill" : "read"); return tab.eval(x); } };
  };
  h.deps.emit = (o) => order.push(o.submitted === true ? "mark" : "other");
  const out = await runLogin(h.deps);
  assert.deepEqual(order.slice(0, 3), ["read", "mark", "fill"]);
  assert.equal(order.filter((x) => x === "fill").length, 1);
  assert.deepEqual(out, { submitted: true, url: LOGIN_URL, text: "Invalid User ID or password", has_password: true, has_otp: false });
  assert.equal(JSON.stringify(out).includes("s3cret"), false);
});

test("after the submit the page is watched read-only until it changes, and nothing is typed or clicked again", async () => {
  // three looks at the unchanged login page, then the logged-in address while it still loads, then loaded
  const loading = seen({ href: LIVE_URL, ready: "loading", hasPassword: false });
  const done = seen({ href: LIVE_URL, hasPassword: false });
  const h = harness({ answers: [PROBE_LOGIN, "sent", SAME, SAME, SAME, loading, done, done] });
  const out = await runLogin(h.deps);
  assert.deepEqual(out, { submitted: true, url: LIVE_URL, text: "", has_password: false, has_otp: false });
  assert.equal(h.log.waited, 6000); // five looks one second apart, one more second to settle
  assert.equal(typing(h.log), 1);
  for (const e of h.log.evals.slice(2)) {
    assert.equal(e, LOGIN_SIGNALS);
    assert.doesNotMatch(e, /click\(|\.value\s*=|dispatchEvent|continue session/i);
  }
});

test("a page that never changes is handed back as it is after about 15 seconds (Python calls that unknown)", async () => {
  const h = harness({ answers: [PROBE_LOGIN, "sent", SAME] });
  const out = await runLogin(h.deps);
  assert.deepEqual(out, { submitted: true, url: LOGIN_URL, text: "", has_password: true, has_otp: false });
  assert.equal(h.log.waited, AFTER_SUBMIT_MS);
  assert.equal(typing(h.log), 1);
});

test("after the submit every failure is unknown, never offline, and never a second submit", async () => {
  const fillDied = harness({ answers: [PROBE_LOGIN, new Error("socket closed")] });
  assert.deepEqual(await runLogin(fillDied.deps), { result: "unknown", submitted: true });

  const neverReadable = harness({ answers: [PROBE_LOGIN, "sent", new Error("socket closed")] });
  assert.deepEqual(await runLogin(neverReadable.deps), { result: "unknown", submitted: true });
  assert.equal(neverReadable.log.waited, AFTER_SUBMIT_MS);
  assert.equal(typing(neverReadable.log), 1);

  const garbage = harness({ answers: [PROBE_LOGIN, "sent", "not json"] });
  assert.deepEqual(await runLogin(garbage.deps), { result: "unknown", submitted: true });

  let calls = 0;
  const tabGone = harness({ tabs: () => (calls++ === 0 ? [TAB] : []), answers: [PROBE_LOGIN, "sent"] });
  assert.deepEqual(await runLogin(tabGone.deps), { result: "unknown", submitted: true });

  const odd = harness({ answers: [PROBE_LOGIN, "something else"] });
  assert.deepEqual(await runLogin(odd.deps), { result: "unknown", submitted: true });
});

test("a read that fails while the page loads is tried again, and the later page is the one reported", async () => {
  const h = harness({ answers: [PROBE_LOGIN, "sent", new Error("context destroyed"), new Error("context destroyed"), BAD, BAD] });
  const out = await runLogin(h.deps);
  assert.equal(out.submitted, true);
  assert.match(out.text, /Invalid User ID/);
});

test("the page changed between the probe and the fill: nothing was typed, so it is not a try", async () => {
  const h = harness({ answers: [PROBE_LOGIN, "not_login_page"] });
  assert.deepEqual(await runLogin(h.deps), { result: "not_login_page", submitted: false });
});

test("an empty user name or password is never sent", async () => {
  const h = harness({ answers: [PROBE_LOGIN, "sent", BAD] });
  h.deps.cred = { username: "abuser", password: "" };
  assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
  assert.equal(h.log.attached, 0);
});

test("the login command with no Chrome on the port prints offline, not submitted, and no password", async () => {
  const { createServer } = await import("node:net");
  const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
  const r = spawnSync(process.execPath, ["cdp.mjs", "login"], {
    encoding: "utf8", cwd: new URL(".", import.meta.url).pathname, input: JSON.stringify({ username: "abuser", password: "s3cret" }),
    env: { PATH: process.env.PATH, MERIMEN_LOGIN: "on", CDP_PORT: String(port) },
  });
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout.trim().split("\n").pop()), { offline: true, submitted: false });
  assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
});

// ---- the whole command against a fake debugging port: a tiny WebSocket server whose "page" is the fake DOM above ----
// onSent(page) is called when the script clicked: the test changes the page the way Merimen would.
// relogin: true = the tab list starts with only someone else's tab (O1); PUT /json/new opens T1 (the fake page), /json/close/<id>
// is recorded and removes it. opened / closed say what the script did.
function fakeChrome(page, { onSent = () => {}, dropAfterFill = false, relogin = false } = {}) {
  const evals = [];
  const opened = [];
  const closed = [];
  const other = { id: "O1", type: "page", url: "https://www.merimen.com.my/claims/index.cfm?CFID=9&RID=9&x=other", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/O1" };
  let open = !relogin;
  const server = http.createServer((req, res) => {
    const port = server.address().port;
    res.setHeader("content-type", "application/json");
    const t1 = { id: "T1", type: "page", url: page.location.href, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/T1` };
    if (req.url.startsWith("/json/new")) {
      opened.push({ method: req.method, url: req.url });
      open = true;
      res.end(JSON.stringify(t1));
      return;
    }
    if (req.url.startsWith("/json/close/")) {
      closed.push(decodeURIComponent(req.url.slice("/json/close/".length)));
      if (closed.at(-1) === "T1") open = false;
      res.end("{}");
      return;
    }
    if (relogin) {
      res.end(JSON.stringify(open ? [other, t1] : [other]));
      return;
    }
    res.end(JSON.stringify([t1]));
  });
  server.on("upgrade", (req, socket) => {
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buf = Buffer.alloc(0);
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 0x7f;
        let at = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
        if (buf.length < at + 4 + len) return;
        const mask = buf.subarray(at, at + 4);
        const body = Buffer.from(buf.subarray(at + 4, at + 4 + len));
        const opcode = buf[0] & 0x0f;
        buf = buf.subarray(at + 4 + len);
        if (opcode !== 1) continue; // close / ping: nothing to answer here
        for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
        const msg = JSON.parse(body.toString("utf8"));
        const expression = msg.params.expression;
        evals.push(expression);
        const value = vm.runInNewContext(expression, page);
        if (value === "sent") {
          onSent(page);
          if (dropAfterFill) { socket.destroy(); server.close(); return; }
        }
        const out = Buffer.from(JSON.stringify({ id: msg.id, result: { result: { type: "string", value } } }));
        const head = out.length < 126 ? Buffer.from([0x81, out.length]) : Buffer.from([0x81, 126, out.length >> 8, out.length & 0xff]);
        socket.write(Buffer.concat([head, out]));
      }
    });
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({ server, evals, opened, closed, port: server.address().port })));
}

function runLoginCommand(port, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["cdp.mjs", "login", ...extra], {
      cwd: new URL(".", import.meta.url).pathname,
      env: { PATH: process.env.PATH, MERIMEN_LOGIN: "on", CDP_PORT: String(port) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => resolve({ status, stdout, stderr, lines: stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) }));
    child.stdin.end(JSON.stringify({ username: "abuser", password: "s3cret" }));
  });
}

test("end to end: a tab where a person is logged in is left alone and the command says session_live", async () => {
  const page = fakePage({ href: LIVE_URL, elements: [el("input", { name: "search" }), el("a", { innerText: "Login history" }), el("a", { innerText: "Logout" })] });
  const chrome = await fakeChrome(page);
  try {
    const r = await runLoginCommand(chrome.port);
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, [{ result: "session_live", submitted: false }]);
    assert.equal(chrome.evals.length, 1); // the read-only probe; the script that types was never sent
    assert.equal(touched(page), false);
    assert.doesNotMatch(r.stdout + r.stderr, /s3cret|CFID|CFTOKEN/);
  } finally {
    chrome.server.close();
  }
});

test("end to end: a Merimen page that is neither a login page nor logged in: not_login_page", async () => {
  const page = fakePage({ href: "https://www.merimen.com.my/claims/help.cfm", elements: [el("a", { innerText: "Login" })] });
  const chrome = await fakeChrome(page);
  try {
    const r = await runLoginCommand(chrome.port);
    assert.deepEqual(r.lines, [{ result: "not_login_page", submitted: false }]);
    assert.equal(touched(page), false);
  } finally {
    chrome.server.close();
  }
});

test("end to end: the login page is filled once; the mark comes first; the page Merimen answers with is the one reported", async () => {
  const f = loginForm();
  const page = fakePage({ elements: f.elements });
  const chrome = await fakeChrome(page, {
    onSent: (pg) => setTimeout(() => { pg.document.querySelector = (sel) => (sel.startsWith(".error") ? { innerText: "Invalid User ID or password" } : sel === "input[type=password]" ? f.pass : null); }, 1500),
  });
  try {
    const r = await runLoginCommand(chrome.port);
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines[0], { submitted: true });
    assert.equal(r.lines.length, 2);
    assert.deepEqual(r.lines[1], { submitted: true, url: LOGIN_URL, text: "Invalid User ID or password", has_password: true, has_otp: false });
    assert.equal(f.user.value, "abuser");
    assert.equal(f.pass.value, "s3cret");
    assert.equal(f.button.clicks, 1);
    assert.equal(chrome.evals.filter((e) => e.includes("s3cret")).length, 1);
    assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
  } finally {
    chrome.server.close();
  }
});

test("end to end: Chrome goes away right after the click: unknown and submitted, never offline", async () => {
  const f = loginForm();
  const page = fakePage({ elements: f.elements });
  const chrome = await fakeChrome(page, { dropAfterFill: true });
  try {
    const r = await runLoginCommand(chrome.port);
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines, [{ submitted: true }, { result: "unknown", submitted: true }]);
    assert.equal(f.button.clicks, 1); // sent exactly once, and nothing asks for a second go
  } finally {
    chrome.server.close();
  }
});


// ---- re-login (plan #133): own fresh tab only ----
function reloginDeps({ answers = [], openFails = false, tabsAfterOpen = null } = {}) {
  const h = harness({ answers });
  const log = { ...h.log, opened: 0, closed: [] };
  let isOpen = false;
  const own = { id: "N1", type: "page", url: LOGIN_URL, webSocketDebuggerUrl: "ws://n1" };
  const someone = { id: "P1", type: "page", url: LOGIN_URL, webSocketDebuggerUrl: "ws://p1" };
  const deps = {
    ...h.deps,
    open: async () => { if (openFails) throw new Error("no"); log.opened += 1; isOpen = true; return own; },
    close: async (_port, id) => { log.closed.push(id); isOpen = false; },
    tabs: async () => (tabsAfterOpen || (isOpen ? [someone, own] : [someone])),
  };
  return { deps, log, hlog: h.log };
}

test("relogin: no tab can be opened: offline, nothing typed, nothing closed", async () => {
  const r = reloginDeps({ openFails: true });
  assert.deepEqual(await runRelogin(r.deps), { offline: true, submitted: false });
  assert.deepEqual(r.log.closed, []);
});

test("relogin: the target id comes first, a not-login page is not typed into and only its own tab is closed", async () => {
  const r = reloginDeps({ answers: ["complete", PROBE_NOT] });
  assert.deepEqual(await runRelogin(r.deps), { result: "not_login_page", submitted: false });
  assert.deepEqual(r.hlog.lines[0], { relogin_target: "N1" });
  assert.deepEqual(r.log.closed, ["N1"]);
  assert.equal(typing(r.hlog), 0);
});

test("relogin: a rejected password closes the own tab; a login that went through keeps it open", async () => {
  const bad = reloginDeps({ answers: ["complete", PROBE_LOGIN, "sent", BAD] });
  const out = await runRelogin(bad.deps);
  assert.equal(out.submitted, true);
  assert.deepEqual(bad.log.closed, ["N1"]);
  assert.equal(typing(bad.hlog), 1);
  const ok = reloginDeps({ answers: ["complete", PROBE_LOGIN, "sent", seen({ href: LIVE_URL, hasPassword: false })] });
  const done = await runRelogin(ok.deps);
  assert.equal(done.url, LIVE_URL);
  assert.deepEqual(ok.log.closed, []);
});

test("relogin: the own deadline ends it, closes the own tab and says unknown once the form may have gone", async () => {
  const r = reloginDeps({ answers: ["complete", PROBE_LOGIN, "sent", SAME] });
  r.deps.wait = () => new Promise((res) => setTimeout(res, 5)); // real time, so the deadline fires while the page is watched
  r.deps.now = () => 0; // the 15 s watch never ends by itself
  r.deps.deadlineMs = 50;
  assert.deepEqual(await runRelogin(r.deps), { result: "unknown", submitted: true });
  assert.deepEqual(r.log.closed, ["N1"]);
});

test("the save-time login never opens or closes a tab (no --relogin)", async () => {
  const h = harness({ answers: [PROBE_NOT] });
  let opened = 0;
  h.deps.open = async () => { opened += 1; };
  await runLogin(h.deps);
  assert.equal(opened, 0);
  // the real guard: without --relogin the command runs runLogin, which has no tab-opening step
  assert.equal(loginRunner(["node", "cdp.mjs", "login"]), runLogin);
  assert.equal(loginRunner(["node", "cdp.mjs", "login", "--relogin"]), runRelogin);
});

test("end to end --relogin: own tab opened at Merimen's start page, typed once, closed after a rejection; the other tab is never touched", async () => {
  const f = loginForm();
  const page = fakePage({ elements: f.elements });
  const chrome = await fakeChrome(page, {
    relogin: true,
    onSent: (pg) => setTimeout(() => {
      pg.location.href = LOGIN_URL + "?msg=bad&token=QUERYTOKEN123";
      pg.document.querySelector = (sel) => (sel.startsWith(".error") ? { innerText: "Invalid User ID or password" } : sel === "input[type=password]" ? f.pass : null);
    }, 1500),
  });
  try {
    const r = await runLoginCommand(chrome.port, ["--relogin"]);
    assert.equal(r.status, 0);
    assert.deepEqual(r.lines[0], { relogin_target: "T1" });
    assert.equal(chrome.opened.length, 1);
    assert.equal(chrome.opened[0].method, "PUT");
    assert.ok(chrome.opened[0].url.endsWith("?" + MERIMEN_START) && MERIMEN_START.endsWith("?skip_browsertest=1"));
    assert.deepEqual(chrome.closed, ["T1"]);
    assert.equal(f.button.clicks, 1);
    assert.doesNotMatch(r.stdout + r.stderr, /s3cret/);
    assert.doesNotMatch(r.stderr, /QUERYTOKEN123|CFID/); // nothing about the address is logged
  } finally {
    chrome.server.close();
  }
});

test("relogin: an unread answer is checked once on the OWN tab; a logged-in own tab comes back as a read page and stays open", async () => {
  const r = reloginDeps({ answers: ["complete", PROBE_LOGIN, "sent", new Error("gone"), seen({ href: LIVE_URL, hasPassword: false })] });
  let calls = 0;
  r.deps.tabs = async () => { calls += 1; return calls > 2 ? [{ id: "N1", type: "page", url: LIVE_URL, webSocketDebuggerUrl: "ws://n1" }] : [{ id: "N1", type: "page", url: LOGIN_URL, webSocketDebuggerUrl: "ws://n1" }]; };
  r.deps.now = (() => { let t = 0; return () => (t += 20000); })(); // the 15 s watch ends at once
  const out = await runRelogin(r.deps);
  assert.equal(out.url, LIVE_URL);
  assert.deepEqual(r.log.closed, []);
});

test("relogin: a tab made although the open answer was lost is closed; tabs that were there are not", async () => {
  const log = { closed: [] };
  let made = false;
  const deps = {
    port: 9222, cred: { username: "abuser", password: "s3cret" },
    tabs: async () => [{ id: "OLD", type: "page", url: LOGIN_URL }, ...(made ? [{ id: "NEW", type: "page", url: MERIMEN_START }] : [])],
    open: async () => { made = true; throw new Error("slow answer"); },
    close: async (_p, id) => { log.closed.push(id); },
    attach: async () => { throw new Error("never"); },
    wait: async () => {}, now: () => 0, emit: () => {},
  };
  assert.deepEqual(await runRelogin(deps), { offline: true, submitted: false });
  assert.deepEqual(log.closed, ["NEW"]);
});

test("relogin: a lost open answer never closes a new tab that is not exactly the start page (a person's logged-in tab)", async () => {
  const log = { closed: [] };
  let made = false;
  const deps = {
    port: 9222, cred: { username: "abuser", password: "s3cret" },
    tabs: async () => (made ? [{ id: "PERSON", type: "page", url: LIVE_URL }, { id: "Q", type: "page", url: LOGIN_URL + "?fusebox=x" }] : []),
    open: async () => { made = true; throw new Error("slow answer"); },
    close: async (_p, id) => { log.closed.push(id); },
    attach: async () => { throw new Error("never"); },
    wait: async () => {}, now: () => 0, emit: () => {},
  };
  assert.deepEqual(await runRelogin(deps), { offline: true, submitted: false });
  assert.deepEqual(log.closed, []);
});

test("relogin: the last page tab is never closed (that would close the Chrome window)", async () => {
  const closed = [];
  const one = async () => [{ id: "OWN", type: "page", url: LOGIN_URL }];
  assert.equal(await closeIfNotLast(9222, "OWN", { tabs: one, close: async (_p, id) => closed.push(id) }), false);
  const two = async () => [{ id: "OWN", type: "page", url: LOGIN_URL }, { id: "X", type: "page", url: LIVE_URL }];
  assert.equal(await closeIfNotLast(9222, "OWN", { tabs: two, close: async (_p, id) => closed.push(id) }), true);
  const bg = async () => [{ id: "OWN", type: "page", url: LOGIN_URL }, { id: "SW", type: "service_worker", url: "x" }];
  assert.equal(await closeIfNotLast(9222, "OWN", { tabs: bg, close: async (_p, id) => closed.push(id) }), false);
  assert.deepEqual(closed, ["OWN"]);
});

test("relogin: once the deadline fired nothing is typed any more", async () => {
  const r = reloginDeps({ answers: ["complete", PROBE_LOGIN, "sent", SAME] });
  r.deps.wait = () => new Promise((res) => setTimeout(res, 30)); // the load wait outlives the deadline
  r.deps.deadlineMs = 10;
  assert.deepEqual(await runRelogin(r.deps), { offline: true, submitted: false });
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(typing(r.hlog), 0);
  assert.deepEqual(r.log.closed, ["N1"]);
});
