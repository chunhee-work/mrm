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
