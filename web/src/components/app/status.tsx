import { Tick, Working } from "./marks";

/** The automatic pipeline, in order. `done` follows the last step. */
export const PIPELINE = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking"] as const;
const NEEDS = new Set(["waiting_user", "pending_doc", "failed"]);

export type Group = "needs" | "active" | "done";
export function groupOf(status: string): Group {
  if (status === "done") return "done";
  return NEEDS.has(status) ? "needs" : "active";
}

/** The pipeline with its end. The case list no longer shows the steps (owner 2026-11-15: done or not, that is all); the order is kept for the tests. */
export const TRACK = [...PIPELINE, "done"] as const;
/** Which stop a case is at (0 to 7). A case missing a document stopped while reading; a failed case has no place (-1). */
export function stepOf(status: string): number {
  return (TRACK as readonly string[]).indexOf(status === "pending_doc" ? "reading" : status);
}

/**
 * The one thing a row of the list says: being worked on (a turning arc) or done (a green tick).
 * The mark comes last, so down a list the marks stand in one column on the right edge.
 */
export function StateMark({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap text-[14px] leading-none ${done ? "text-mute" : "font-medium text-fg"}`}>
      {label}
      {done ? <Tick className="h-4 w-4 shrink-0 text-go" /> : <Working className="shrink-0 text-scan" />}
    </span>
  );
}
