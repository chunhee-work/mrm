import { test } from "node:test";
import assert from "node:assert/strict";
import { eventTr, docKey, failTr, userFixable } from "./case-text";
import { DICTS } from "./i18n";

test("B09 events: every stored sentence maps to a key that exists in EN, 中文 and BM", () => {
  const msgs = ["Received 62 file(s)", "Received 2 more file(s)", "Queued again", "Reading documents", "Documents read", "Scan failed", "Opened a.zip: 3 file(s)", "Pending: x; y"];
  for (const m of msgs) {
    const { key } = eventTr(m);
    assert.ok(key, m);
    for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)[key], `${l} ${key}`);
  }
  assert.deepEqual(eventTr("Received 62 file(s)").vars, { n: "62" });
  assert.equal(eventTr("something new").key, "");
});

test("B09 missing docs: long AI sentences collapse to the fixed list", () => {
  assert.equal(docKey("police investigation result (Keputusan Penyiasatan Kes) naming the disalahkan plate"), "police_result");
  assert.equal(docKey("at-fault party police report"), "atfault_report");
  assert.equal(docKey("at-fault I-SEARCH page"), "isearch");
  assert.equal(docKey("client insurance schedule (policy no., period, cover type)"), "insurance");
  assert.equal(docKey("full JPJ RC (Sijil Pemilikan Kenderaan) with chassis/engine, registration date, owner NRIC and address"), "jpj_rc");
  assert.equal(docKey("something odd"), "other");
  for (const l of ["en", "zh", "ms"] as const) for (const k of ["police_result", "atfault_report", "isearch", "insurance", "jpj_rc", "client_report", "other"]) assert.ok((DICTS[l] as Record<string, string>)[`doc.${k}`], `${l} doc.${k}`);
});

test("B06/U6 failures: bad files and zip problems are fixable by the user; our own timeouts are not", () => {
  assert.equal(failTr("bad_file:rc.pdf|empty").key, "case.err.empty");
  assert.equal(failTr("bad_file:rc.pdf|empty").vars?.name, "rc.pdf");
  assert.equal(failTr("no PDF in this case").key, "case.err.noPdf");
  assert.equal(failTr("a.zip: the zip cannot be opened").key, "case.err.zip");
  assert.equal(failTr("Reading timed out").key, "case.err.timeout");
  assert.ok(userFixable("bad_file:x.pdf|corrupt") && userFixable("no PDF in this case"));
  assert.ok(!userFixable("Reading timed out") && !userFixable("Connection error"));
  for (const l of ["en", "zh", "ms"] as const) for (const k of ["empty", "corrupt", "too_big", "noPdf", "zip", "timeout", "other"]) assert.ok((DICTS[l] as Record<string, string>)[`case.err.${k}`], `${l} ${k}`);
});
