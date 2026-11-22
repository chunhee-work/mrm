/** The automatic pipeline, in order. `done` follows the last step. */
export const PIPELINE = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking"] as const;
const NEEDS = new Set(["waiting_user", "pending_doc", "failed"]);

export type Group = "needs" | "active" | "done";
export function groupOf(status: string): Group {
  if (status === "done") return "done";
  return NEEDS.has(status) ? "needs" : "active";
}

/**
 * R2-B05: does this case need the user? Beyond the status list: a case whose photos still need names waits for the user,
 * whatever step it is on (it used to show as "In progress" with a spinner and no button).
 */
export function needsUser(r: { status: string; deskConfirm?: number }): boolean {
  if (groupOf(r.status) === "needs") return true;
  return !!r.deskConfirm && r.deskConfirm > 0 && ["naming", "phase_a"].includes(r.status);
}

/** The home page's rows: what an open case is waiting for (or that it is closed). */
export const OPEN_BUCKETS = ["docs", "photos", "hold", "active"] as const;
export type Bucket = (typeof OPEN_BUCKETS)[number] | "closed";
export function bucketOf(r: { status: string; deskConfirm?: number }): Bucket {
  if (r.status === "done") return "closed";
  if (r.status === "failed") return "hold";
  if (r.status === "pending_doc") return "docs";
  return needsUser(r) ? "photos" : "active";
}
/** The views of the case table: one bucket, every open case, or everything. */
export const VIEWS = [...OPEN_BUCKETS, "closed", "open", "all"] as const;
export type View = (typeof VIEWS)[number];
export const inView = (r: { status: string; deskConfirm?: number }, v: View) => v === "all" || (v === "open" ? r.status !== "done" : bucketOf(r) === v);

/** The pipeline with its end. The case list no longer shows the steps (owner 2026-11-15: done or not, that is all); the order is kept for the tests. */
export const TRACK = [...PIPELINE, "done"] as const;
/** Which stop a case is at (0 to 7). A case missing a document stopped while reading; a failed case has no place (-1). */
export function stepOf(status: string): number {
  return (TRACK as readonly string[]).indexOf(status === "pending_doc" ? "reading" : status);
}
