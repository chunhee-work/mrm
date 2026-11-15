import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CaseData } from "./read-docs";

// Anthropic refuses an output schema with more than 16 nullable / union fields (it failed every real case with 24).
test("the case-data schema stays under Anthropic's limit of 16 union fields", () => {
  const schema = z.toJSONSchema(CaseData);
  let unions = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf) || Array.isArray(o.type)) unions++;
    Object.values(o).forEach(walk);
  };
  walk(schema);
  assert.ok(unions <= 16, `${unions} union fields (limit 16)`);
});
