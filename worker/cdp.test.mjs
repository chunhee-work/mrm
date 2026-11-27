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

// ---- W-1 / W-3: the login command (offline: a fake page and a fake debugging port, nothing is opened) ----
import vm from "node:vm";
import { isMerimenOrigin, pickMerimenTab, LOGIN_PROBE, loginFillExpression, runLogin } from "./cdp.mjs";

function el(props) {
  const e = { offsetParent: {}, type: "text", value: "", innerText: "", events: 0, clicks: 0, ...props };
  e.dispatchEvent = () => { e.events += 1; };
  e.click = () => { e.clicks += 1; };
  return e;
}

// A page as the in-page script sees it: only what the script asks the DOM for.
function fakePage({ origin = "https://www.merimen.com.my", inputs = [], others = [] }) {
  const all = [...inputs, ...others];
  const document = {
    querySelector: (sel) => (sel === "input[type=password]" ? inputs.find((i) => i.type === "password") || null : null),
    querySelectorAll: (sel) => (sel === "input" ? inputs : all),
  };
  return { document, location: { origin, href: origin + "/claims/index.cfm" }, Event: class { constructor(t) { this.type = t; } } };
}

const typedOrClicked = (page) => [...page.document.querySelectorAll("input,button,a")].some((e) => e.value === "abuser" || e.value === "s3cret" || e.events || e.clicks);

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

test("a logged-in page (no password box) gets nothing typed and nothing clicked", () => {
  const page = fakePage({
    inputs: [el({ type: "text", name: "search" })],
    others: [el({ innerText: "Login history" }), el({ innerText: "Logout" })],
  });
  assert.equal(vm.runInNewContext(LOGIN_PROBE, page), "not_login_page");
  assert.equal(vm.runInNewContext(loginFillExpression("abuser", "s3cret"), page), "not_login_page");
  assert.equal(typedOrClicked(page), false);
});

test("a password box on another origin gets nothing typed", () => {
  const page = fakePage({
    origin: "https://www.merimen.com.my.evil.example",
    inputs: [el({ type: "text" }), el({ type: "password" })],
    others: [el({ innerText: "Login" })],
  });
  assert.equal(vm.runInNewContext(LOGIN_PROBE, page), "not_login_page");
  assert.equal(vm.runInNewContext(loginFillExpression("abuser", "s3cret"), page), "not_login_page");
  assert.equal(typedOrClicked(page), false);
});

test("a password box without a user box or a login button gets nothing typed", () => {
  const page = fakePage({ inputs: [el({ type: "password" })], others: [el({ innerText: "Help" })] });
  assert.equal(vm.runInNewContext(loginFillExpression("abuser", "s3cret"), page), "not_login_page");
  assert.equal(typedOrClicked(page), false);
});

test("the login page is filled once and the button clicked once; Logout is never the button", () => {
  const user = el({ type: "text" });
  const pass = el({ type: "password" });
  const logout = el({ innerText: "Logout" });
  const button = el({ type: "submit", value: "Login" });
  const page = fakePage({ inputs: [user, pass, button], others: [logout] });
  page.document.querySelectorAll = (sel) => (sel === "input" ? [user, pass, button] : [logout, user, pass, button]);
  assert.equal(vm.runInNewContext(LOGIN_PROBE, page), "login_page");
  assert.equal(vm.runInNewContext(loginFillExpression("abuser", "s3cret"), page), "sent");
  assert.equal(user.value, "abuser");
  assert.equal(pass.value, "s3cret");
  assert.equal(button.clicks, 1);
  assert.equal(logout.clicks, 0);
});

const TAB = { id: "t1", type: "page", url: "https://www.merimen.com.my/claims/index.cfm", webSocketDebuggerUrl: "ws://t1" };
const SIGNALS = JSON.stringify({ href: "https://www.merimen.com.my/claims/index.cfm", hasPassword: true, hasOtp: false, text: "Invalid User ID or password" });

// answers: one entry per evaluate, in order. A function is called; an Error is thrown.
function harness({ tabs = [TAB], answers = [] } = {}) {
  const seen = { evals: [], lines: [], attached: 0 };
  let n = 0;
  return {
    seen,
    deps: {
      port: 9222,
      cred: { username: "abuser", password: "s3cret" },
      tabs: async () => { if (tabs instanceof Error) throw tabs; return tabs; },
      attach: async () => {
        seen.attached += 1;
        return {
          eval: async (expression) => {
            seen.evals.push(expression);
            const a = answers[n++];
            if (a instanceof Error) throw a;
            return a;
          },
          close: () => {},
        };
      },
      wait: async () => {},
      emit: (o) => seen.lines.push(o),
    },
  };
}

test("no debugging port: offline, nothing submitted", async () => {
  const h = harness({ tabs: new Error("refused") });
  assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
  assert.equal(h.seen.attached, 0);
});

test("no Merimen tab, or a tab without a password box: not_login_page, the password never leaves this process", async () => {
  const none = harness({ tabs: [{ ...TAB, url: "https://evil.example/?merimen.com.my" }] });
  assert.deepEqual(await runLogin(none.deps), { result: "not_login_page", submitted: false });
  assert.equal(none.seen.attached, 0);

  const loggedIn = harness({ answers: ["not_login_page"] });
  assert.deepEqual(await runLogin(loggedIn.deps), { result: "not_login_page", submitted: false });
  assert.equal(loggedIn.seen.evals.length, 1);
  assert.equal(loggedIn.seen.evals.some((e) => e.includes("s3cret")), false);
  assert.deepEqual(loggedIn.seen.lines, []);
});

test("a probe that fails is offline: nothing was typed yet", async () => {
  const h = harness({ answers: [new Error("cdp timeout")] });
  assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
  assert.deepEqual(h.seen.lines, []);
});

test("the submitted mark is written before the one evaluate that types", async () => {
  const order = [];
  const h = harness({ answers: ["login_page", "sent", SIGNALS] });
  const attach = h.deps.attach;
  h.deps.attach = async (t) => {
    const tab = await attach(t);
    return { ...tab, eval: async (x) => { order.push(x.includes("s3cret") ? "fill" : "read"); return tab.eval(x); } };
  };
  h.deps.emit = (o) => order.push(o.submitted === true ? "mark" : "other");
  const out = await runLogin(h.deps);
  assert.deepEqual(order, ["read", "mark", "fill", "read"]);
  assert.equal(out.submitted, true);
  assert.equal(out.has_password, true);
  assert.match(out.text, /Invalid User ID/);
  assert.equal(JSON.stringify(out).includes("s3cret"), false);
});

test("after the submit every failure is unknown, never offline", async () => {
  const fillDied = harness({ answers: ["login_page", new Error("socket closed")] });
  assert.deepEqual(await runLogin(fillDied.deps), { result: "unknown", submitted: true });

  const readDied = harness({ answers: ["login_page", "sent", new Error("socket closed")] });
  assert.deepEqual(await runLogin(readDied.deps), { result: "unknown", submitted: true });

  const garbage = harness({ answers: ["login_page", "sent", "not json"] });
  assert.deepEqual(await runLogin(garbage.deps), { result: "unknown", submitted: true });

  let calls = 0;
  const tabGone = harness({ answers: ["login_page", "sent"] });
  tabGone.deps.tabs = async () => (calls++ === 0 ? [TAB] : []);
  assert.deepEqual(await runLogin(tabGone.deps), { result: "unknown", submitted: true });
});

test("the page changed between the probe and the fill: nothing was typed, so it is not a try", async () => {
  const h = harness({ answers: ["login_page", "not_login_page"] });
  assert.deepEqual(await runLogin(h.deps), { result: "not_login_page", submitted: false });
});

test("the form is submitted at most once in a run", async () => {
  const h = harness({ answers: ["login_page", "sent", SIGNALS] });
  await runLogin(h.deps);
  assert.equal(h.seen.evals.filter((e) => e.includes("s3cret")).length, 1);
});

test("an empty user name or password is never sent", async () => {
  const h = harness({ answers: ["login_page", "sent", SIGNALS] });
  h.deps.cred = { username: "abuser", password: "" };
  assert.deepEqual(await runLogin(h.deps), { offline: true, submitted: false });
  assert.equal(h.seen.attached, 0);
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
