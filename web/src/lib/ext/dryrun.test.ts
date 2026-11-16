import test from "node:test";
import assert from "node:assert/strict";
import { planCase } from "./dryrun";

const full = {
  plate: "WXY1234",
  client_vehicle: { chassis_no: "C1", model: "MYVI", jpj_log_book_no: "", owner: { name: "", id_no: "" }, engine_no: "", cc: "", status_asal: "", assembly_type: null, kelas_kegunaan: "", body_type: "", year_body: "", registration_date: "" },
  client_policy: null,
  police: { report_no: "TRAFIK/1/26", report_datetime: "", place: "KL", accident_datetime: "2026-11-01 10:00", blamed_plate: "", client_report_no: "" },
  client_driver: null,
  at_fault: { plate: "ABC1", policy: { insurer: "X", policy_no: "P1", cover_note_no: "", effective: "", expiry: "", cover_type: "" }, owner: null, driver: null },
  total_loss: false, missing: [], notes: "",
};

test("a complete case is ready at every step and nothing would be written by planning", () => {
  const p = planCase({ caseData: full, files: 2, photos: 8, photosDone: true });
  assert.equal(p.writes, false);
  assert.equal(p.allReady, true);
  assert.deepEqual(p.steps.map((s) => s.code), ["create_case", "adjuster_report", "upload_docs", "upload_photos", "parts_labour", "estimate_details"]);
});
test("missing data is named, and later steps wait on earlier ones", () => {
  const p = planCase({ caseData: { ...full, police: { ...full.police, report_no: "" } }, files: 0, photos: 0, photosDone: false });
  const by = Object.fromEntries(p.steps.map((s) => [s.code, s]));
  assert.deepEqual(by.create_case.missing, ["police_report_no"]);
  assert.ok(by.adjuster_report.missing.includes("police_report_no"));
  assert.deepEqual(by.upload_docs.missing, ["documents"]);
  assert.deepEqual(by.upload_photos.missing, ["photos"]);
  assert.deepEqual(by.parts_labour.missing, ["photo_naming", "earlier_step"]);
  assert.deepEqual(by.estimate_details.missing, ["earlier_step"]);
  assert.equal(p.allReady, false);
});
test("a case that has not been read yet is not ready, and does not crash", () => {
  const p = planCase({ caseData: null, files: 1, photos: 1, photosDone: true });
  assert.equal(p.allReady, false);
  assert.ok(p.steps[0].missing.includes("plate"));
});
test("the claimant's own policy does not satisfy the at-fault policy requirement", () => {
  const p = planCase({ caseData: { ...full, at_fault: { ...full.at_fault, policy: null }, client_policy: full.at_fault.policy }, files: 1, photos: 1, photosDone: true });
  assert.deepEqual(p.steps[0].missing, ["policy"]);
  assert.equal(p.allReady, false);
});
