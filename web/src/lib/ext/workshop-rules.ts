// A case can change workshop until the worker fixes it: the worker locks the workshop (locked_at) the moment it makes the case in
// Merimen, and the update itself refuses a locked case. The case status is not used here: it can move backwards, and a status
// window left users with a case they could not move. Once the case has its Merimen number it is always final.
// The statuses below are used only to decide which cases still count as "using" a workshop when the user removes or renames one.
export const OPEN_STATUSES = ["uploaded", "reading", "naming", "pending_doc", "failed"];

export function canSwitchWorkshop(c: { status?: string; merimenCaseId: string | null }): boolean {
  return !c.merimenCaseId;
}

/**
 * What the page shows for a case's workshop (owner 2026-11-29: chosen once, then Confirm; after that it cannot change).
 * `locked`: no change any more (made in Merimen, fixed by the worker, or confirmed). A confirmed or worker-locked workshop that the
 * user has since removed is the one way back: the case can then be moved and confirmed again (the worker stopped it anyway).
 * `needsConfirm`: the Confirm button is shown; the worker does not start the case in Merimen before it is pressed.
 */
export function workshopState(
  cs: { slot: number; locked: boolean; fixed: boolean; confirmed: boolean },
  list: { slot: number }[],
  merimenCaseId: string | null,
): { slot: number; locked: boolean; confirmed: boolean; needsConfirm: boolean } {
  const exists = list.some((w) => w.slot === cs.slot);
  const locked = !canSwitchWorkshop({ merimenCaseId }) || (cs.locked && (cs.fixed || exists)) || (cs.confirmed && exists);
  return { slot: cs.slot, locked, confirmed: cs.confirmed, needsConfirm: !locked && !cs.confirmed };
}
