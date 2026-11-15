// Run: node --import tsx --test tests/case-files.test.ts  (no database needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf } from "../src/lib/file-kind";
import { groupOf, PIPELINE, stepOf, TRACK } from "../src/components/app/status";

test("a case file's kind comes from its name", () => {
  assert.equal(kindOf({ name: "WXY1234.zip" }), "bundle_zip");
  assert.equal(kindOf({ name: "Police Report.PDF" }), "pdf");
  assert.equal(kindOf({ name: "IMG_0012.jpeg" }), "photo");
  assert.equal(kindOf({ name: "report.pdf.heic" }), "photo");
});

test("the progress track: seven steps and Done, a missing document stops at reading, a failed case has no place", () => {
  assert.equal(TRACK.length, PIPELINE.length + 1);
  assert.equal(stepOf("uploaded"), 0);
  assert.equal(stepOf("phase_b"), 5);
  assert.equal(stepOf("done"), 7);
  assert.equal(stepOf("pending_doc"), stepOf("reading"));
  assert.equal(stepOf("failed"), -1);
});

test("cases are layered by who has to act", () => {
  assert.deepEqual(["pending_doc", "failed", "waiting_user"].map(groupOf), ["needs", "needs", "needs"]);
  assert.deepEqual(["uploaded", "reading", "naming", "phase_a", "phase_b", "checking"].map(groupOf), ["active", "active", "active", "active", "active", "active"]);
  assert.equal(groupOf("done"), "done");
});
