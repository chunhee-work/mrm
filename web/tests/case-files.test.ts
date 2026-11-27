// Run: node --import tsx --test tests/case-files.test.ts  (no database needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf } from "../src/lib/file-kind";

test("a case file's kind comes from its name", () => {
  assert.equal(kindOf({ name: "WXY1234.zip" }), "bundle_zip");
  assert.equal(kindOf({ name: "Police Report.PDF" }), "pdf");
  assert.equal(kindOf({ name: "IMG_0012.jpeg" }), "photo");
  assert.equal(kindOf({ name: "report.pdf.heic" }), "photo");
});
