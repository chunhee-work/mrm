// A case can change workshop until the worker fixes it: the worker locks the workshop (locked_at) the moment it makes the case in
// Merimen, and the update itself refuses a locked case. The case status is not used here: it can move backwards, and a status
// window left users with a case they could not move. Once the case has its Merimen number it is always final.
// The statuses below are used only to decide which cases still count as "using" a workshop when the user removes or renames one.
export const OPEN_STATUSES = ["uploaded", "reading", "naming", "pending_doc", "failed"];

export function canSwitchWorkshop(c: { status?: string; merimenCaseId: string | null }): boolean {
  return !c.merimenCaseId;
}

/**
 * THE rule for a case's workshop (owner 2026-11-29: chosen once, then Confirm; after that it cannot change). The worker's claim
 * (worker/autopilot_worker/jobs.py WS_GATE) is the same rule in SQL: it starts Phase A only when `needsConfirm` is false.
 * `shown`: the block is on the page: from two workshops on, or when the case's own workshop was removed.
 * `locked`: no change any more (made in Merimen, fixed by the worker, or confirmed on a workshop that still exists).
 * `needsConfirm`: the Confirm button is shown and the case waits for it. A confirmed or unnamed worker lock on a workshop the user
 * removed since asks again: the case is moved to another one and confirmed. A finished case (maybe finished by hand) never asks.
 */
export function workshopState(
  cs: { slot: number; locked: boolean; fixed: boolean; confirmed: boolean },
  list: { slot: number }[],
  merimenCaseId: string | null,
  status?: string,
): { slot: number; shown: boolean; locked: boolean; confirmed: boolean; needsConfirm: boolean } {
  const exists = list.some((w) => w.slot === cs.slot);
  const shown = list.length >= 2 || (list.length > 0 && !exists);
  const locked = !canSwitchWorkshop({ merimenCaseId }) || (cs.locked && (cs.fixed || exists)) || (cs.confirmed && exists);
  return { slot: cs.slot, shown, locked, confirmed: cs.confirmed, needsConfirm: shown && !locked && status !== "done" };
}
