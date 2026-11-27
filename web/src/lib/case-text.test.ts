import { test } from "node:test";
import assert from "node:assert/strict";
import { eventTr, eventKind, docKey, failTr, userFixable, ZIP_WHY, badFileName } from "./case-text";
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

test("each zip refusal gets its own plain reason (not the generic 'could not be opened'), in every language", () => {
  assert.equal(failTr("SINAR.zip: the zip holds more than one vehicle").key, "case.err.zipMulti");
  assert.equal(failTr("big.zip: too many files in the zip").key, "case.err.zip_too_many");
  assert.equal(failTr("x.zip: the zip cannot be opened").key, "case.err.zip");
  for (const why of Object.values(ZIP_WHY)) for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)[failTr(`a.zip: ${why}`).key], `${l} ${why}`);
  assert.equal(userFixable("SINAR.zip: the zip holds more than one vehicle"), true);
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

import { badFileNames } from "./case-text";
test("R2-B02 badFileNames reads one or several names out of a bad_file error", () => {
  assert.deepEqual(badFileNames("bad_file:fake.pdf|corrupt"), ["fake.pdf"]);
  assert.deepEqual(badFileNames("bad_file:a.pdf; b.pdf|corrupt"), ["a.pdf", "b.pdf"]);
  assert.deepEqual(badFileNames("Reading timed out"), []);
  assert.deepEqual(badFileNames(null), []);
});

test("R2-B12 an old failed case with a size error now says the file is too large, and the user can replace it", () => {
  assert.equal(failTr("request_too_large: Request exceeds the maximum size").key, "case.err.tooBigAny");
  assert.equal(userFixable("request_too_large: Request exceeds the maximum size"), true);
  assert.equal(failTr("Something odd").key, "case.err.other");
  assert.equal(userFixable("Reading timed out"), false);
});

test("only the zip's own refusals are the customer's; our download or storage errors about a zip are ours (refunded)", () => {
  for (const why of Object.values(ZIP_WHY)) {
    assert.equal(userFixable(`b.zip: ${why}`), true, why);
    assert.match(failTr(`b.zip: ${why}`).key, /^case\.err\.zip/, why);
  }
  for (const ours of ["cannot download claim.zip", "blob not found: https://x.blob.vercel-storage.com/o/c/unzipped-5/a.pdf", "fetch failed for bundle.zip"]) {
    assert.equal(userFixable(ours), false, ours);
    assert.doesNotMatch(failTr(ours).key, /^case\.err\.zip/, ours);
  }
});

test("a PDF the model refused among several: the customer's to fix, no file named, the message exists in every language", () => {
  assert.equal(userFixable("bad_file:|corrupt"), true);
  assert.equal(failTr("bad_file:|corrupt").key, "case.err.corruptSome");
  assert.deepEqual(badFileNames("bad_file:|corrupt"), []);
  for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)["case.err.corruptSome"], l);
  // a PDF that cannot be named because two files share its name
  assert.equal(failTr("bad_file:|empty").key, "case.err.corruptSome");
  // a file name is never read as the reason ("timed out" is ours, but here it is only the name)
  assert.equal(userFixable("bad_file:scan timed out.pdf|corrupt"), true);
  // too many pages: the customer's to fix in the same case (Replace files takes the PDFs out), with its own message
  assert.equal(userFixable("bad_file:|too_long"), true);
  assert.equal(failTr("bad_file:|too_long").key, "case.err.tooManyPages");
  for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)["case.err.tooManyPages"], l);
  // an escaped name is shown as the user wrote it
  assert.equal(failTr(`bad_file:${badFileName("a|b;c.pdf")}|empty`).vars?.name, "a|b;c.pdf");
});

test("activity status: every line gets one of five marks, and each mark has its word in EN, 中文 and BM", () => {
  assert.equal(eventKind("Received 3 file(s)"), "ok");
  assert.equal(eventKind("Opened a.zip: 3 file(s)"), "ok");
  assert.equal(eventKind("Documents read"), "ok");
  assert.equal(eventKind("Reading documents"), "ok"); // an older line: that step is over
  assert.equal(eventKind("Reading documents", true), "work"); // the newest line of a case still being read
  assert.equal(eventKind("Queued again", true), "work");
  assert.equal(eventKind("Pending: JPJ RC"), "wait");
  assert.equal(eventKind("Scan failed"), "fail");
  assert.equal(eventKind("Scan failed", true), "fail");
  assert.equal(eventKind("something new"), "note");
  for (const l of ["en", "zh", "ms"] as const) for (const k of ["ok", "work", "wait", "fail", "note"]) assert.ok((DICTS[l] as Record<string, string>)[`ev.s.${k}`], `${l} ev.s.${k}`);
});
