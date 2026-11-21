import test from "node:test";
import assert from "node:assert/strict";
import { namingOwner, photoWorkerOn } from "./worker";

test("the on-site model owns naming while it is up", () => {
  assert.equal(photoWorkerOn({}), false);
  assert.equal(photoWorkerOn({ PHOTO_WORKER: "on" }), true);
  assert.equal(namingOwner({ photoWorker: false, workerOnline: true, pending: 3, workerFailed: 0, fallback: true }), "claude");
  assert.equal(namingOwner({ photoWorker: true, workerOnline: true, pending: 3, workerFailed: 0, fallback: true }), "worker");
  assert.equal(namingOwner({ photoWorker: true, workerOnline: false, pending: 3, workerFailed: 0, fallback: true }), "claude");
  assert.equal(namingOwner({ photoWorker: true, workerOnline: true, pending: 0, workerFailed: 2, fallback: true }), "claude");
  assert.equal(namingOwner({ photoWorker: true, workerOnline: false, pending: 1, workerFailed: 0, fallback: false }), "worker");
});
