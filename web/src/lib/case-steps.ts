/** The four stops of a case, for the step bar on the case page and the photo desk (owner 2026-11-27). */
export const STEP_IDS = ["docs", "photos", "merimen", "done"] as const;
export type StepId = (typeof STEP_IDS)[number];
export type StepState = "complete" | "current" | "locked";

const DOCS_OPEN = ["uploaded", "reading", "failed", "pending_doc"];

/**
 * complete: finished, a click goes back to look. current: where the user is now. locked: not reachable until the one before is finished.
 * The photo desk is also open while a document is still missing (the server already allowed that), but it only counts as finished at 完成.
 */
export function stepsOf(c: { status: string; photos: number; photosDone: boolean }): { id: StepId; state: StepState; open: boolean }[] {
  const docsDone = !DOCS_OPEN.includes(c.status);
  const photosDone = c.photosDone || c.status === "done";
  const finished = c.status === "done";
  const current: StepId = !docsDone ? "docs" : !photosDone ? "photos" : !finished ? "merimen" : "done";
  const at = STEP_IDS.indexOf(current);
  const deskOpen = !["uploaded", "reading", "failed"].includes(c.status) && c.photos > 0;
  return STEP_IDS.map((id, i) => {
    const state: StepState = finished ? "complete" : i < at ? "complete" : i === at ? "current" : "locked";
    // locked steps cannot be opened; the desk stays reachable while only documents are missing
    const open = state !== "locked" || (id === "photos" && deskOpen);
    return { id, state: state === "locked" && open ? "current" : state, open };
  });
}
