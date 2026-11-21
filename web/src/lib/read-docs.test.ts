import { test } from "node:test";
import assert from "node:assert/strict";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CaseData, normalizeCaseData } from "./read-docs";
import { DICTS } from "./i18n";

// Anthropic refuses an output schema with more than 16 nullable / union fields (it failed every real case: it counted 24).
test("the schema sent to Claude stays under the limit of 16 union fields (6 today)", () => {
  const sent = JSON.parse(JSON.stringify(zodOutputFormat(CaseData))); // the exact payload readCaseDocs sends
  let unions = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf) || Array.isArray(o.type)) unions++;
    Object.values(o).forEach(walk);
  };
  walk(sent);
  assert.ok(unions <= 16, `${unions} union fields (limit 16)`);
  assert.ok(unions >= 1 && unions <= 12, `count drifted: ${unions} (was 6 on the object schema)`);
});

test("old rows (null text) and new rows ('') read the same; placeholders become empty; policy_no kept", () => {
  const old = { plate: null, client_vehicle: { model: null, owner: { name: "Tan", nric: null } }, client_policy: { insurer: " N/A ", policy_no: "N/A" }, police: { report_no: "-", place: " KL " }, at_fault: { plate: null, policy: null, owner: null }, missing: null, total_loss: false };
  const n = normalizeCaseData(old)!;
  assert.equal(n.plate, ""); assert.equal(n.client_vehicle.model, ""); assert.equal(n.client_vehicle.owner.nric, "");
  assert.equal(n.client_policy?.insurer, ""); assert.equal(n.client_policy?.policy_no, "N/A");
  assert.equal(n.police.report_no, ""); assert.equal(n.police.place, "KL");
  assert.equal(n.at_fault.policy, null); assert.equal(n.at_fault.owner, null); assert.deepEqual(n.missing, []); assert.equal(n.total_loss, false);
  assert.equal(normalizeCaseData(null), null); assert.equal(normalizeCaseData("x"), null);
});

test("the new case-page texts exist in all three languages with the same placeholders", () => {
  const keys = Object.keys(DICTS.en).filter((k) => k.startsWith("case."));
  assert.ok(keys.length > 20);
  for (const lang of ["zh", "ms"] as const) for (const k of keys) {
    const d = DICTS[lang] as Record<string, string>; const e = DICTS.en as Record<string, string>;
    assert.ok(d[k], `${lang} is missing ${k}`);
    assert.deepEqual(d[k].match(/\{\w+\}/g) ?? [], e[k].match(/\{\w+\}/g) ?? [], `${lang} ${k} placeholders differ`);
  }
});

import { checkPdf, BadFile } from "./read-docs";
test("B06/B07 checkPdf: empty, corrupt and oversize PDFs are refused with the file name; a real header passes", () => {
  const why = (f: () => void) => { try { f(); } catch (e) { return e instanceof BadFile ? e.message : "other"; } return "ok"; };
  assert.equal(why(() => checkPdf("a.pdf", new Uint8Array(0))), "bad_file:a.pdf|empty");
  assert.equal(why(() => checkPdf("b.pdf", Buffer.from("not a pdf"))), "bad_file:b.pdf|corrupt");
  assert.equal(why(() => checkPdf("c.pdf", new Uint8Array(26 * 1024 * 1024).fill(37))), "bad_file:c.pdf|too_big");
  assert.equal(why(() => checkPdf("d.pdf", Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\nstartxref\n0\n%%EOF"))), "ok");
  // R2-B03: a valid header followed by garbage is the customer's file too
  assert.equal(why(() => checkPdf("e.pdf", Buffer.from("%PDF-1.7\n\u0000\u0001garbage garbage"))), "bad_file:e.pdf|corrupt");
});

import { asBadFile } from "./read-docs";
test("R2-B03 a 400 from the model about the PDF is the customer's file; other errors stay ours", () => {
  const e400 = Object.assign(new Error("400 invalid_request_error: Could not process PDF"), { status: 400 });
  assert.equal(asBadFile(e400, ["a.pdf", "b.pdf"])?.message, "bad_file:a.pdf; b.pdf|corrupt");
  assert.equal(asBadFile(Object.assign(new Error("overloaded"), { status: 529 }), ["a.pdf"]), null);
  assert.equal(asBadFile(Object.assign(new Error("400 max_tokens too large"), { status: 400 }), ["a.pdf"]), null);
  assert.equal(asBadFile(new Error("network"), ["a.pdf"]), null);
});
