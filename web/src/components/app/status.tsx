/** The automatic pipeline, in order. `done` follows the last step. */
export const PIPELINE = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking"] as const;
const NEEDS = new Set(["waiting_user", "pending_doc", "failed"]);

export type Group = "needs" | "active" | "done";
export function groupOf(status: string): Group {
  if (status === "done") return "done";
  return NEEDS.has(status) ? "needs" : "active";
}

type CaseFacts = { status: string; photosDone?: boolean };

/**
 * Does this case need the user? Same steps as the step bar (owner 2026-11-27): documents missing, or the photo names not pressed Done.
 * (It used to count only photos still to confirm, so a case showed "In progress" the moment it was named.)
 */
export function needsUser(r: CaseFacts): boolean {
  const b = bucketOf(r);
  return b === "docs" && r.status === "pending_doc" || b === "photos" || b === "hold";
}

/**
 * The home page's rows are the steps of the step bar: 1 Documents (waiting to be read, being read, or missing), 2 Name photos
 * (until the user presses Done), 3 Merimen (the worker has the case). `hold` is a case that failed; `closed` is finished.
 */
export const OPEN_BUCKETS = ["docs", "photos", "active", "hold"] as const;
export type Bucket = (typeof OPEN_BUCKETS)[number] | "closed";
export function bucketOf(r: CaseFacts): Bucket {
  if (r.status === "done") return "closed";
  if (r.status === "failed") return "hold";
  if (["uploaded", "reading", "pending_doc"].includes(r.status)) return "docs";
  return r.photosDone ? "active" : "photos";
}
/** The views of the case table: one bucket, every open case, or everything. */
export const VIEWS = [...OPEN_BUCKETS, "closed", "open", "all"] as const;
export type View = (typeof VIEWS)[number];
export const inView = (r: CaseFacts, v: View) => v === "all" || (v === "open" ? r.status !== "done" : bucketOf(r) === v);

/** The pipeline with its end. The case list no longer shows the steps (owner 2026-11-15: done or not, that is all); the order is kept for the tests. */
export const TRACK = [...PIPELINE, "done"] as const;
/** Which stop a case is at (0 to 7). A case missing a document stopped while reading; a failed case has no place (-1). */
export function stepOf(status: string): number {
  return (TRACK as readonly string[]).indexOf(status === "pending_doc" ? "reading" : status);
}
