/** The four stops of a case, for the step bar on the case page and the photo desk (owner 2026-11-27). */
export const STEP_IDS = ["docs", "photos", "merimen", "done"] as const;
export type StepId = (typeof STEP_IDS)[number];
export type StepState = "complete" | "current" | "locked";

const DOCS_OPEN = ["uploaded", "reading", "failed", "pending_doc"];
/** Documents being read, or a read that failed: the photo desk waits (case page, photo desk and the open line on the first page). */
export const DESK_WAITS = ["uploaded", "reading", "failed"];

/** The system is working on the case (reading, in Merimen, checking): the first page refreshes and shows a moving dot. */
export const systemBusy = (c: { status: string; photosDone?: boolean | null }) =>
  ["uploaded", "reading", "phase_b", "checking"].includes(c.status) || (c.status === "phase_a" && !!c.photosDone);

/** THE rule: which step a case is on. The step bar, the home groups and the case table all start from this one function. */
export function currentStepOf(c: { status: string; photosDone?: boolean }): StepId {
  if (DOCS_OPEN.includes(c.status)) return "docs";
  if (c.status === "done") return "done";
  // `checking` is past the point where 完成 can be pressed (the server refuses it), so it is step 3 whatever photos_done_at says
  return c.photosDone || c.status === "checking" ? "merimen" : "photos";
}

/**
 * complete: finished, a click goes back to look. current: where the user is now. locked: not reachable until the one before is finished.
 * The photo desk is also open while a document is still missing (the server already allowed that), but it only counts as finished at 完成.
 */
export function stepsOf(c: { status: string; photos: number; photosDone: boolean }): { id: StepId; state: StepState; open: boolean }[] {
  const finished = c.status === "done";
  const current = currentStepOf(c);
  const at = STEP_IDS.indexOf(current);
  const deskOpen = !DESK_WAITS.includes(c.status) && c.photos > 0;
  return STEP_IDS.map((id, i) => {
    const state: StepState = finished || i < at || (id === "photos" && c.photosDone && c.status === "pending_doc") ? "complete" : i === at ? "current" : "locked"; // Done was pressed while a document is still missing: step 2 is complete, step 1 stays current
    // locked steps cannot be opened; the desk stays reachable while only documents are missing
    const open = state !== "locked" || (id === "photos" && deskOpen);
    return { id, state, open }; // open + locked = reachable but not the step you are on (the desk while a document is missing)
  });
}
