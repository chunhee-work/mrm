import { test } from "node:test";
import assert from "node:assert/strict";
import { CaseBody, bodyProblem } from "./case-body";

const ok = (over = {}) => ({ files: [{ kind: "pdf", url: "https://x.blob.vercel-storage.com/org1/b1/a.pdf", name: "a.pdf", size: 10, ...over }] });

test("B05/B06 body: a normal pdf passes; empty or negative size, huge size and bad kind fail the schema", () => {
  assert.ok(CaseBody.safeParse(ok()).success);
  assert.ok(!CaseBody.safeParse(ok({ size: 0 })).success);
  assert.ok(!CaseBody.safeParse(ok({ size: 600 * 1024 * 1024 })).success);
  assert.ok(!CaseBody.safeParse(ok({ kind: "exe" })).success);
  assert.ok(!CaseBody.safeParse({ files: [] }).success);
});

test("B05 body: urls outside the organisation's prefix are refused (no pointing a case at another org's file)", () => {
  const b = CaseBody.parse(ok({ url: "https://x.blob.vercel-storage.com/org2/b1/a.pdf" }));
  assert.equal(bodyProblem(b, "org1"), "prefix");
  assert.equal(bodyProblem(CaseBody.parse(ok()), "org1"), null);
});

test("B05 body: file type must match its kind and the allow-list", () => {
  assert.equal(bodyProblem(CaseBody.parse(ok({ name: "a.exe" })), "org1"), "kind");
  assert.equal(bodyProblem(CaseBody.parse(ok({ kind: "photo", name: "a.pdf" })), "org1"), "kind");
});

test("B06 body: photos only (no PDF and no zip) is refused before a case is made", () => {
  assert.equal(bodyProblem(CaseBody.parse(ok({ kind: "photo", name: "a.jpg", url: "https://x/org1/b/a.jpg" })), "org1"), "no_docs");
});
