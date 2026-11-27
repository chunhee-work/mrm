import { currentStepOf } from "@/lib/case-steps";
type CaseFacts = { status: string; photosDone?: boolean };

/**
 * The home page's rows are the steps of the step bar: 1 Documents (waiting to be read, being read, or missing), 2 Name photos
 * (until the user presses Done), 3 Merimen (the worker has the case). `hold` is a case that failed; `closed` is finished.
 */
export const OPEN_BUCKETS = ["docs", "photos", "active", "hold"] as const;
export type Bucket = (typeof OPEN_BUCKETS)[number] | "closed";
export function bucketOf(r: CaseFacts): Bucket {
  if (r.status === "failed") return "hold"; // step 1 with a problem
  const step = currentStepOf(r);
  return step === "done" ? "closed" : step === "merimen" ? "active" : step;
}
/** The views of the case table: one bucket, every open case, or everything. */
export const VIEWS = [...OPEN_BUCKETS, "closed", "open", "all"] as const;
export type View = (typeof VIEWS)[number];
export const inView = (r: CaseFacts, v: View) => v === "all" || (v === "open" ? r.status !== "done" : bucketOf(r) === v);
