import { test } from "node:test";
import assert from "node:assert/strict";
import { eventTr, eventKind, docKey, failTr, userFixable, ZIP_WHY, badFileName, zipRefunded } from "./case-text";
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

test("zipRefunded: several cars or cars at different levels, only on a case never read before", () => {
  assert.equal(zipRefunded(`x.zip: ${ZIP_WHY.multi}`, false), true);
  assert.equal(zipRefunded(`x.zip: ${ZIP_WHY.layout}`, false), true);
  assert.equal(zipRefunded(`x.zip: ${ZIP_WHY.multi}`, true), false);
  assert.equal(zipRefunded(`x.zip: ${ZIP_WHY.corrupt}`, false), false);
  assert.equal(zipRefunded(null, false), false);
});

test("D14 the workshop line is translated like the other activity lines; a text nobody knows is shown as it is", () => {
  const tr = eventTr("Workshop 2: Kedai Ah Seng: Cheras");
  assert.equal(tr.key, "ev.workshop");
  assert.deepEqual(tr.vars, { n: "2", name: "Kedai Ah Seng: Cheras" });
  for (const l of ["en", "zh", "ms"] as const) {
    const text = (DICTS[l] as Record<string, string>)["ev.workshop"];
    assert.ok(text?.includes("{n}") && text.includes("{name}"), `${l} ev.workshop`);
  }
  assert.equal(eventKind("Workshop 2: Kedai Ah Seng"), "note"); // a note, as before: not a step that is done or failed
  // an event this file has no rule for (for example photos left out of a case) is never dropped: the log shows `raw`
  assert.deepEqual(eventTr("3 photos left out: too large"), { key: "", raw: "3 photos left out: too large" });
});

test("photos left out of a case are said in the page language, one line per reason", () => {
  assert.deepEqual(eventTr("Photos left out: 3 (HEIC)"), { key: "ev.photosHeic", vars: { n: "3" } });
  assert.deepEqual(eventTr("Photos left out: 2 (over 25 MB)"), { key: "ev.photosBig", vars: { n: "2", mb: "25" } });
  assert.deepEqual(eventTr("Photos left out: 1 (more than 300 photos)"), { key: "ev.photosLimit", vars: { n: "1", max: "300" } });
  assert.deepEqual(eventTr("Photos left out: 4 (cannot be opened)"), { key: "ev.photosBad", vars: { n: "4" } });
  assert.equal(eventKind("Photos left out: 3 (HEIC)"), "note"); // a note: the case itself went on
});

test("Phase A practice run: the long worker sentence with Merimen field names becomes one short plain line", () => {
  const long = "Phase A dry-run only. Merimen was not changed. Photos, dry run (Merimen not changed): would upload 78 · relabel 0 · reorder 0 Create form filled and checked, not saved (ddlbInsurer=Allianz General Insurance Company (Malaysia) Berhad; ddlbINSCOID=HQ; ddlbPOLCOVER=Comprehensive; ddlb3INSCOID=Zurich Ge";
  assert.deepEqual(eventTr(long), { key: "ev.dryAPhotos", vars: { n: "78" } });
  assert.deepEqual(eventTr("Phase A dry-run only. Merimen was not changed. Create form filled and checked, not saved (Allianz)"), { key: "ev.dryA" });
  // a documents line also says "would upload": only the photos count is used
  assert.deepEqual(eventTr("Phase A dry-run only. Merimen was not changed. Documents (dry run): would upload 5 Create form filled"), { key: "ev.dryA" });
  assert.deepEqual(eventTr("Phase B dry-run only. Merimen was not changed. Step 2 plan: 12 parts"), { key: "ev.dryB" });
  assert.deepEqual(eventTr("Phase A dry-run only. Merimen was not changed."), { key: "ev.dryA" });
  assert.equal(eventKind(long), "ok");
  for (const key of ["ev.dryAPhotos", "ev.dryA", "ev.dryB"]) for (const l of ["en", "zh", "ms"] as const) {
    const s = (DICTS[l] as Record<string, string>)[key];
    assert.ok(s && !/ddlb|=/.test(s), `${l} ${key}`);
  }
  // a dry run that failed keeps its own words (it says why)
  assert.equal(eventTr("Phase A dry-run failed. x").key, "");
});
