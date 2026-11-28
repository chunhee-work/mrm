import { test } from "node:test";
import assert from "node:assert/strict";
import { eventTr, eventKind, isWorkerStop, docKey, failTr, userFixable, ZIP_WHY, badFileName, zipRefunded } from "./case-text";
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

// real worker sentences from production (2026-11-28), and what the case page shows for each
const W = {
  dry: "Phase A dry-run only. Merimen was not changed. Photos, dry run (Merimen not changed): would upload 78 · relabel 0 · reorder 0 Create form filled and checked, not saved (ddlbInsurer=Allianz General Insurance Company (Malaysia) Berhad; ddlbINSCOID=HQ; ddlbPOLCOVER=Comprehensive; ddlb3INSCOID=Zurich Ge",
  rejected: "Phase A not saved. check by hand: the manager and adjuster, and the claimant insurer and policy; Adjuster Report not saved: report_rejected empty required boxes: sleAPcode Merimen says:  | Please note the treads unit is in mm. | INFORMATION FOR CALCULATING ESTIMATES | Terms of Use & Contact Information. check by hand: PIAM IPD code (Browse); labour type 5 DR HATCH (from the model)",
  exists: "The case already exists in Merimen, nothing was made again. check by hand: the manager and adjuster, and the claimant insurer and policy; Adjuster Report saved: check by hand: PIAM IPD code (Browse); accident postcode 23000 (main postcode of Dungun); labour type 5 DR HATCH (from the model); Documents uploaded: 1 Photos: upload 0 · relabel 0 · reorder 0",
  bodyType: "Phase A not saved. check by hand: the manager and adjuster, and the claimant insurer and policy; Adjuster Report not filled: labour_type_unknown (the RC body type does not say hatchback, saloon or MPV: MOTOKAR)",
  missing: "Phase A not saved. check by hand: the claimant insurer and policy stored on the case, and the manager and adjuster; Adjuster Report not filled: missing_data (at-fault city)",
  mismatch: "Phase B stopped. Photos not touched: after the upload Merimen has 85 photos and 33 mismatches (plan 78)",
  login: "Merimen 拒绝了登录（用户名或密码不对）。请在「连接」页重新填写。 / Merimen rejected the login (wrong user name or password). Enter it again on the Connection page.",
};
const show = (m: string, l: "en" | "zh" | "ms" = "en") => {
  const tr = eventTr(m);
  const d = DICTS[l] as Record<string, string>;
  const fill = (k: string, v?: Record<string, string>) => (d[k] ?? "").replace(/\{(\w+)\?([^|}]*)\|([^}]*)\}/g, (_, n, a, b) => (v?.[n] === "1" ? a : b)).replace(/\{(\w+)\}/g, (_, n) => v?.[n] ?? "");
  return { head: tr.key ? fill(tr.key, tr.vars) : tr.raw ?? m, sub: (tr.sub ?? []).map((f) => fill(f.key, f.vars)).join(" · "), key: tr.key };
};

test("worker lines: a short title and at most three short grey facts, never field names or codes (owner 2026-11-28)", () => {
  assert.deepEqual(show(W.dry), { key: "ev.w.dryA", head: "Practice run done, nothing saved", sub: "Form checked · 78 photos ready" });
  assert.deepEqual(show(W.rejected), { key: "ev.w.notSaved", head: "Stopped, not saved in Merimen", sub: "Adjuster Report: a box is empty · Some fields to check" });
  assert.deepEqual(show(W.exists), { key: "ev.w.exists", head: "Case already in Merimen, not made again", sub: "Adjuster Report saved · 1 document uploaded · Some fields to check" });
  assert.deepEqual(show(W.bodyType), { key: "ev.w.notSaved", head: "Stopped, not saved in Merimen", sub: "Adjuster Report: body type not clear on the RC · Some fields to check" });
  assert.equal(show(W.missing).sub, "Adjuster Report: at-fault city missing · Some fields to check");
  assert.deepEqual(show(W.mismatch), { key: "ev.w.stopped", head: "Stopped, needs a look in Merimen", sub: "Photos: 33 of 85 in Merimen do not match" });
  assert.deepEqual(show(W.login), { key: "ev.w.bi", head: "Merimen rejected the login (wrong user name or password).", sub: "Enter it again on the Connection page." });
  assert.deepEqual(show(W.login, "zh"), { key: "ev.w.bi", head: "Merimen 拒绝了登录（用户名或密码不对）。", sub: "请在「连接」页重新填写。" });
  for (const m of Object.values(W)) for (const l of ["en", "zh", "ms"] as const) {
    const { head, sub } = show(m, l);
    assert.ok(head && head.length <= 70, `${l} title too long: ${head}`);
    assert.ok(sub.length <= 110, `${l} facts too long: ${sub}`);
    assert.ok(!/ddlb|sleAP|_unknown|report_rejected|missing_data|\{|\}/.test(head + sub), `${l} ${head} / ${sub}`);
  }
  // a waiting line gets the question mark, a finished one the tick
  assert.equal(eventKind(W.rejected), "wait");
  assert.ok(isWorkerStop(W.rejected) && !isWorkerStop(W.exists) && !isWorkerStop("Pending: x"));
  assert.equal(eventKind(W.exists), "ok");
  assert.equal(eventKind(W.dry), "ok");
});

test("worker lines: the other sentences the worker writes get a short title too", () => {
  const cases: [string, string][] = [
    ["Case created in Merimen. Adjuster Report saved; Documents uploaded: 3. Photos: upload 78 · relabel 0 · reorder 0", "ev.w.created"],
    ["Phase A saved. Photos: upload 2 · relabel 1 · reorder 0", "ev.w.saved"],
    ["Phase B: Parts and labour: 12 parts · 1 manual · labour N 3 R 2. Estimate details set: conditions on 12 part rows, misc 2.", "ev.w.saved"],
    ["Checking. Parts and labour: 9 parts · 0 manual · labour N 2 R 1", "ev.w.checking"],
    ["Phase B stopped. Parts and labour could not be ticked (Timeout). Check the Select Parts page in Merimen.", "ev.w.stopped"],
    ["Phase A dry-run failed. no case data", "ev.w.dryFailed"],
    ["Phase A blocked: insurer, plate", "ev.w.blocked"],
    ["Phase B checked. Merimen was not changed.", "ev.w.checked"],
    ["Merimen logged out during Phase A. Logging in again, then it goes on from where it stopped. (Phase A stopped)", "ev.w.relogin"],
    ["Merimen logged out 3 times in 30 minutes: Phase A is not tried again by itself. Phase A not saved", "ev.w.logoutStop"],
    ["Phase B saved, but the names changed meanwhile. A new Phase B runs once 完成 is pressed on the new names", "ev.w.namesChanged"],
  ];
  for (const [m, key] of cases) {
    assert.equal(eventTr(m).key, key, m);
    for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)[key], `${l} ${key}`);
    for (const f of eventTr(m).sub ?? []) for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)[f.key], `${l} ${f.key}`);
  }
  assert.equal(show(cases[0][0]).sub, "Adjuster Report saved · 3 documents uploaded · 78 photos uploaded");
  assert.equal(show(cases[2][0]).sub, "12 parts ticked · Estimate details set");
  assert.equal(show(cases[4][0]).sub, "Parts and labour not ticked · Some fields to check");
  // a failed practice run, a short worker line and the web's own lines are as before
  assert.equal(eventTr("Worker error").key, "ev.w.error");
  assert.equal(eventTr("Reading documents").key, "ev.reading");
});

test("any other long line shows its first sentence only", () => {
  const long = "Something new happened in Merimen today. " + "x".repeat(200);
  assert.deepEqual(eventTr(long), { key: "", raw: "Something new happened in Merimen today." });
  const noStop = "y".repeat(300);
  assert.equal((eventTr(noStop).raw ?? "").length, 100);
});

test("worker lines: review findings (a stop is never shown as done, a practice run never as ticked)", () => {
  const toFix = "Phase B: Estimate details saved. Not submitted, 1 to fix: total RM4,500.00 is below RM6,000";
  assert.deepEqual(show(toFix), { key: "ev.w.toFix", head: "Saved, not submitted: some items to fix", sub: "1 to fix before submit" });
  assert.equal(eventKind(toFix), "wait");
  const dryB = "Phase B dry-run only. Merimen was not changed. Parts and labour, dry run (Merimen not changed): would 12 parts · 0 manual · labour N 2 R 1 Estimate details would set: conditions on 12 part rows, misc 1.";
  assert.deepEqual(show(dryB), { key: "ev.w.dryB", head: "Practice run done, nothing saved", sub: "12 parts planned" });
  const relabel = "Phase B checked. Merimen was not saved (photos were relabelled).";
  assert.deepEqual(show(relabel), { key: "ev.w.checkedPhotos", head: "Checked, photos renamed in Merimen", sub: "" });
  const gaveUp = "Stopped after 3 tries (it waited 30 s, 2 min and 10 min in between). It will not be tried again by itself.";
  assert.deepEqual(show(gaveUp), { key: "ev.w.gaveUp", head: "Stopped after a few tries, needs you", sub: "Tried 3 times" });
  assert.equal(eventKind("Phase A blocked: insurer"), "fail");
  const locked = "Merimen 已锁定此账号。请先等 Merimen 解锁（或请 Merimen 解锁），确认能登录后再到「连接」页更新登录信息；我们不会再自动尝试。 / Merimen locked this account. Wait until Merimen unlocks it (or ask Merimen to), check that the login works, then update it on the Connection page. We will not try again automatically.";
  for (const l of ["en", "zh", "ms"] as const) assert.ok(show(locked, l).sub.length <= 100, show(locked, l).sub);
});
