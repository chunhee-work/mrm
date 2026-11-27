import { test } from "node:test";
import assert from "node:assert/strict";
import { checking, needsUser } from "./login-state";
import { systemBusy } from "../case-steps";
import { GATED } from "../next-path";

test("needs the user: a code, a wrong password, an unclear answer, a locked or blocked account; not ok and not checking", () => {
  for (const s of ["otp", "bad_credentials", "unknown", "locked"]) assert.equal(needsUser({ verifyState: s, blocked: false }), true, s);
  assert.equal(needsUser({ verifyState: "ok", blocked: true }), true);
  for (const s of ["ok", "queued", "checking", "otp_submitted", "none"]) assert.equal(needsUser({ verifyState: s, blocked: false }), false, s);
});

test("checking: queued, checking and a code sent are the only checking states", () => {
  for (const s of ["queued", "checking", "otp_submitted"]) assert.equal(checking({ verifyState: s, blocked: false }), true, s);
  for (const s of ["ok", "otp", "bad_credentials", "unknown", "locked"]) assert.equal(checking({ verifyState: s, blocked: false }), false, s);
});

test("system working: reading, in Merimen, checking; photos waiting on the user are not", () => {
  for (const s of ["uploaded", "reading", "phase_b", "checking"]) assert.equal(systemBusy({ status: s }), true, s);
  assert.equal(systemBusy({ status: "phase_a", photosDone: true }), true);
  assert.equal(systemBusy({ status: "phase_a", photosDone: false }), false);
  for (const s of ["failed", "pending_doc", "naming", "done"]) assert.equal(systemBusy({ status: s }), false, s);
});

test("/details is a signed-in page", () => {
  assert.ok(GATED.test("/details"));
});

test("side bar: details that cannot be read (or no key) are unknown, so no dot", async () => {
  const { credForSide } = await import("../side-facts");
  const c = { storageOk: true, keyOk: true, complete: false };
  assert.equal(credForSide(c), c);
  assert.equal(credForSide({ ...c, storageOk: false }), null);
  assert.equal(credForSide({ ...c, keyOk: false }), null);
});
