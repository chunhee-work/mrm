import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Hard test 2026-11-22 (speed): layout, page title and page each asked the database for the session. One answer per request now.
test("requireUser and getUserOrNull share one cached session lookup per request", () => {
  const src = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  assert.match(src, /const signedIn = cache\(async \(\) =>/);
  assert.equal((src.match(/auth\.api\.getSession/g) ?? []).length, 1, "only the cached function asks for the session");
  assert.match(src, /export async function requireUser\(\) \{\n  const me = await signedIn\(\);/);
  assert.match(src, /const me = await signedIn\(\);\n  return me\?\.orgId/);
});
