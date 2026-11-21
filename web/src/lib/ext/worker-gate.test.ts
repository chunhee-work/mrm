import test from "node:test";
import assert from "node:assert/strict";
import { decideWorkerGate, workerUiOn, missingRelation } from "./worker-gate";

const on = { enabled: true, consentReference: "MERIMEN-2026-001" };

test("worker UI is on only for the exact value", () => {
  assert.equal(workerUiOn({}), false);
  assert.equal(workerUiOn({ WORKER_UI: "ON" }), false);
  assert.equal(workerUiOn({ WORKER_UI: "on" }), true);
});

test("credentials need the env switch, the org reference, and the customer's acknowledgement", () => {
  assert.equal(decideWorkerGate({ envOn: false, setting: on, consented: true }), "off");
  assert.equal(decideWorkerGate({ envOn: true, setting: null, consented: true }), "off");
  assert.equal(decideWorkerGate({ envOn: true, setting: { enabled: true, consentReference: "  " }, consented: true }), "off");
  assert.equal(decideWorkerGate({ envOn: true, setting: on, consented: false }), "needs_consent");
  assert.equal(decideWorkerGate({ envOn: true, setting: on, consented: true }), "ready");
});

test("a missing table is recognised", () => {
  assert.equal(missingRelation({ code: "42P01" }), true);
  assert.equal(missingRelation({ cause: { message: "relation merimen_credentials does not exist" } }), true);
  assert.equal(missingRelation({ message: "other" }), false);
});
