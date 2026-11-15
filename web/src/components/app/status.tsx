import { Tick } from "./marks";

/** The automatic pipeline, in order. `done` follows the last step. */
export const PIPELINE = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking"] as const;
const NEEDS = new Set(["waiting_user", "pending_doc", "failed"]);

export type Group = "needs" | "active" | "done";
export function groupOf(status: string): Group {
  if (status === "done") return "done";
  return NEEDS.has(status) ? "needs" : "active";
}

// The list no longer draws the steps (owner 2026-11-15: a user needs to know done or not, and what is missing).
// The order below stays as the one written record of the pipeline; tests/case-files.test.ts checks it.
/** The pipeline with its end: the eight stops a case goes through. */
export const TRACK = [...PIPELINE, "done"] as const;
/** Which stop a case is at (0 to 7). A case missing a document stopped while reading; a failed case has no place (-1). */
export function stepOf(status: string): number {
  return (TRACK as readonly string[]).indexOf(status === "pending_doc" ? "reading" : status);
}

/**
 * What a row tells its owner, in the only words they need: finished, being worked on (whichever step),
 * or the reason it is waiting for them (a document is missing, it stopped, it wants their confirmation).
 */
export type Shown = "done" | "working" | "missing" | "stopped" | "confirm";
export function shownOf(status: string): Shown {
  if (status === "done") return "done";
  if (status === "pending_doc") return "missing";
  if (status === "failed") return "stopped";
  if (status === "waiting_user") return "confirm";
  return "working";
}

/**
 * The drawn mark in front of a row's status. Done: green tick. Being worked on: a blue light that pulses.
 * Waiting for the user: amber dot. All three sit in the same 16px slot, so the marks and the texts line up down the list.
 */
export function StatusMark({ shown }: { shown: Shown }) {
  return (
    <span aria-hidden="true" className="flex h-[22px] w-4 shrink-0 items-center justify-center">
      {shown === "done" ? <Tick className="h-4 w-4 text-go" /> : shown === "working" ? <span className="case-live" /> : <span className="h-[9px] w-[9px] rounded-full bg-amber" />}
    </span>
  );
}
