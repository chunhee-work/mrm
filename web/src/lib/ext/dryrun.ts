// Plan #40, dry-run mode. Works out what we WOULD enter in Merimen for a case, step by step, and what is still missing.
// It never opens a page, never touches the remote browser and never writes anything. Real entry stays off until Merimen's written consent.
import { normalizeCaseData } from "@/lib/read-docs";

export type StepCode = "create_case" | "adjuster_report" | "upload_docs" | "upload_photos" | "parts_labour" | "estimate_details";
export type FieldCode = "plate" | "chassis_no" | "vehicle_model" | "police_report_no" | "police_place" | "accident_datetime" | "policy" | "documents" | "photos" | "photo_naming" | "earlier_step";
export type Step = { code: StepCode; ok: boolean; missing: FieldCode[] };
export type Plan = { writes: false; steps: Step[]; allReady: boolean };

export function planCase(i: { caseData: unknown; files: number; photos: number; photosDone: boolean }): Plan {
  const d = normalizeCaseData(i.caseData);
  const miss = (pairs: [FieldCode, unknown][]) => pairs.filter(([, v]) => !v).map(([k]) => k);
  const create = miss([
    ["plate", d?.plate], ["chassis_no", d?.client_vehicle.chassis_no], ["vehicle_model", d?.client_vehicle.model],
    ["police_report_no", d?.police.report_no], ["accident_datetime", d?.police.accident_datetime],
    ["policy", d?.at_fault.policy?.policy_no], // the at-fault insurer's policy; the claimant's own cover is optional and does not count
  ]);
  const report = miss([["police_report_no", d?.police.report_no], ["police_place", d?.police.place], ["accident_datetime", d?.police.accident_datetime]]);
  const docs = miss([["documents", i.files > 0]]);
  const photos = miss([["photos", i.photos > 0]]);
  const parts: FieldCode[] = [...miss([["photo_naming", i.photosDone]]), ...(create.length ? (["earlier_step"] as FieldCode[]) : [])];
  const est: FieldCode[] = parts.length ? ["earlier_step"] : [];
  const steps: Step[] = ([
    ["create_case", create], ["adjuster_report", report], ["upload_docs", docs], ["upload_photos", photos], ["parts_labour", parts], ["estimate_details", est],
  ] as [StepCode, FieldCode[]][]).map(([code, missing]) => ({ code, ok: missing.length === 0, missing }));
  return { writes: false, steps, allReady: steps.every((s) => s.ok) };
}
