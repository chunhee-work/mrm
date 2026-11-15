import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizePick, type Named } from "@/lib/photos/rules";

// Pure rules of the photo-model integration: no database, no network.

export type JobStatus = "claimed" | "waking" | "submitted" | "running" | "done" | "failed";
export const JobSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["claimed", "waking", "submitted", "running", "done", "failed"]),
  order_hash: z.string(),
  claims: z.array(z.object({ id: z.number(), at: z.string() })), // photo ids in shooting order + the claim stamp of each row
  claimed_at: z.number(),
  submit_deadline: z.number(),
  run_deadline: z.number().nullable(),
  lease_until: z.number().nullable(),
  attempts: z.number(),
  resubmitted: z.boolean(),
  error: z.string().nullable().optional(),
});
export type PhotoModelJob = z.infer<typeof JobSchema>;
export const isTerminal = (j: PhotoModelJob | null) => !j || j.status === "done" || j.status === "failed";

/** The job is for exactly these photos in exactly this order and these image files. Computed from the database, never the client. */
export function orderHash(rows: { id: number; thumbPath: string }[]): string {
  return createHash("sha256").update(rows.map((r) => `${r.id}:${r.thumbPath}`).join("\n")).digest("hex");
}

export type Step = "start" | "submit" | "poll" | "fail_submit_deadline" | "fail_run_deadline" | "wait" | "idle";
/** What one poll should do next. At most one network attempt per poll. */
export function nextStep(job: PhotoModelJob | null, now: number): Step {
  if (isTerminal(job)) return "idle";
  const j = job as PhotoModelJob;
  if (j.status === "claimed" || j.status === "waking") {
    if (now > j.submit_deadline) return "fail_submit_deadline";
    return j.lease_until && j.lease_until > now ? "wait" : "submit";
  }
  if (j.run_deadline && now > j.run_deadline) return "fail_run_deadline";
  return "poll";
}

/** Model confidence → the desk's scale where 0.9 means "to confirm". [0.6,1] → [0.9,1]; [0,0.6) → [0,0.9). Never above 0.89 when unsure. */
export function mapConfidence(conf: number, sure: boolean): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(conf) ? conf : 0));
  const m = c >= 0.6 ? 0.9 + ((c - 0.6) / 0.4) * 0.1 : (c / 0.6) * 0.89;
  return sure ? Math.max(0.9, m) : Math.min(0.89, m);
}

export type ModelResult = { top: [string, number][]; conf: number; sure: boolean; area: string | null };
/** Runtime rename the model's labels need for saloons is already done by predict_case.py; names outside the desk list become null (name by hand). */
export function toNamed(r: ModelResult, vehicle: string, origN: number): Named {
  const pick = { n: 0, name: r.top[0]?.[0] ?? "", confidence: mapConfidence(r.conf, r.sure), alts: r.top.slice(1).map((t) => t[0]) };
  return normalizePick(pick, vehicle, origN);
}
