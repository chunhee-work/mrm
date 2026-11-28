import { test } from "node:test";
import assert from "node:assert/strict";
import { loginNotice } from "./login-notice";
import { DICTS } from "../i18n";

const ok = { saved: true, verifyState: "ok", blocked: false };
const waiting = (detail: string | null) => ({ status: "waiting_login", wanted: "start", detail });

test("no saved login, or a working one: no line", () => {
  assert.equal(loginNotice(null, null), null);
  assert.equal(loginNotice({ ...ok, saved: false }, waiting("not_logged_in")), null);
  assert.equal(loginNotice(ok, { status: "connected", wanted: "start", detail: null }), null);
  assert.equal(loginNotice(ok, null), null);
  assert.equal(loginNotice(ok, { status: "waiting_login", wanted: "none", detail: "not_logged_in" }), null);
});

test("a refused login is red and asks the user to save again", () => {
  for (const [state, key] of [["bad_credentials", "ln.bad"], ["locked", "ln.locked"], ["otp", "ln.otp"], ["unknown", "ln.unknown"]]) {
    assert.deepEqual(loginNotice({ ...ok, verifyState: state }, waiting("not_logged_in")), { key, tone: "red", fix: true, credProblem: true });
  }
  assert.equal(loginNotice({ ...ok, blocked: true }, null)?.key, "ln.blocked");
});

test("each re-login pause has its own line; a plain drop says it is logging in again", () => {
  assert.deepEqual(loginNotice(ok, waiting("relogin_failed")), { key: "ln.paused", tone: "red", fix: false, credProblem: false });
  assert.equal(loginNotice(ok, waiting("relogin_stopped"))?.key, "ln.stopped");
  assert.equal(loginNotice(ok, waiting("relogin_unclear"))?.key, "ln.unclear");
  assert.equal(loginNotice(ok, waiting("relogin_capped"))?.key, "ln.capped");
  assert.deepEqual(loginNotice(ok, waiting("not_logged_in")), { key: "ln.relogging", tone: "amber", fix: false, credProblem: false });
  assert.equal(loginNotice({ ...ok, verifyState: "checking" }, waiting("not_logged_in")), null); // the save-time check is running
});

test("every line and button has a text in all three languages", () => {
  const keys = ["ln.bad", "ln.locked", "ln.otp", "ln.unknown", "ln.blocked", "ln.paused", "ln.stopped", "ln.unclear", "ln.capped", "ln.relogging", "ln.title", "ln.fix"];
  for (const d of Object.values(DICTS)) for (const k of keys) assert.ok((d as Record<string, string>)[k], k);
});
