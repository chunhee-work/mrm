import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalGet, canonicalPost, sign } from "./sign";
import { photoModelOn } from "./config";
import { mapConfidence, nextStep, orderHash, toNamed, type PhotoModelJob } from "./rules";

// Golden vectors produced by inference/photo-model/core.py: both sides must sign the same bytes.
test("signing matches the Python service", () => {
  const c = canonicalPost("1700000000", "case1", "job-1", "oh", "Perodua Myvi 1.3", ["aa", "bb"]);
  assert.equal(c, "POST\n/jobs\n1700000000\ncase1\njob-1\noh\n83f2fd4791c73e59e71d830f232d9033915d88516e3ee832b76da7a1f660392e\naa,bb");
  assert.equal(sign("s3cret", c), "5dcb50f7235403dccb46d7b3fa3e3f99d2c5445063b05f88fdbb5ac10a6cd589");
  assert.equal(sign("s3cret", canonicalGet("1700000000", "job-1")), "96e1f553d7b7fe305f35da7eb6362e8259bb6f78490ec4a76e7da02eec8086b8");
});

test("flag: OFF unless exactly 1, measured, and fully configured", () => {
  const cfg = { measuredFor: "abc" } as never;
  const env = { PHOTO_MODEL_ENABLED: "1", PHOTO_MODEL_URL: "https://x", PHOTO_MODEL_SECRET: "s", HF_SPACE_TOKEN: "t" } as unknown as NodeJS.ProcessEnv;
  assert.equal(photoModelOn(env, cfg), true);
  assert.equal(photoModelOn({ ...env, PHOTO_MODEL_ENABLED: "true" }, cfg), false);
  assert.equal(photoModelOn({ ...env, PHOTO_MODEL_ENABLED: undefined }, cfg), false);
  assert.equal(photoModelOn(env, { measuredFor: null } as never), false);
  assert.equal(photoModelOn({ ...env, HF_SPACE_TOKEN: "" }, cfg), true); // the token is only for a private HF Space
  assert.equal(photoModelOn({ ...env, PHOTO_MODEL_SECRET: "" }, cfg), false);
});

const job = (o: Partial<PhotoModelJob>): PhotoModelJob => ({
  job_id: "00000000-0000-4000-8000-000000000000", status: "claimed", order_hash: "h", claims: [], claimed_at: 0,
  submit_deadline: 1000, run_deadline: null, lease_until: null, attempts: 0, resubmitted: false, ...o,
});
test("state machine", () => {
  assert.equal(nextStep(null, 1), "idle");
  assert.equal(nextStep(job({ status: "done" }), 1), "idle");
  assert.equal(nextStep(job({}), 5), "submit");
  assert.equal(nextStep(job({ lease_until: 50 }), 5), "wait");
  assert.equal(nextStep(job({ lease_until: 4 }), 5), "submit");
  assert.equal(nextStep(job({}), 1001), "fail_submit_deadline");
  assert.equal(nextStep(job({ status: "running", run_deadline: 100 }), 50), "poll");
  assert.equal(nextStep(job({ status: "running", run_deadline: 100 }), 101), "poll"); // still asks the Space once: results may be waiting
});

test("order hash changes when photos or files change", () => {
  const a = orderHash([{ id: 1, thumbPath: "a" }, { id: 2, thumbPath: "b" }]);
  assert.notEqual(a, orderHash([{ id: 2, thumbPath: "b" }, { id: 1, thumbPath: "a" }]));
  assert.notEqual(a, orderHash([{ id: 1, thumbPath: "a" }, { id: 2, thumbPath: "c" }]));
});

test("confidence mapping keeps 0.9 as the 'to confirm' line", () => {
  assert.ok(mapConfidence(0.6, true) >= 0.9);
  assert.ok(mapConfidence(1, true) <= 1);
  assert.ok(mapConfidence(0.95, false) < 0.9);
  assert.ok(mapConfidence(0.59, true) >= 0.9); // sure stays sure
  assert.ok(mapConfidence(0.3, false) < 0.9);
});

test("a name outside the desk list becomes 'name by hand'", () => {
  const n = toNamed({ top: [["Not A Real Part", 0.9]], conf: 0.9, sure: true, area: null }, "", 20);
  assert.equal(n.modelName, null);
});
