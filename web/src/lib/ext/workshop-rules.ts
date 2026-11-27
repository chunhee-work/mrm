// A case can change workshop until the worker fixes it: the worker locks the workshop (locked_at) the moment it makes the case in
// Merimen, and the update itself refuses a locked case. The case status is not used here: it can move backwards, and a status
// window left users with a case they could not move. Once the case has its Merimen number it is always final.
// The statuses below are used only to decide which cases still count as "using" a workshop when the user removes or renames one.
export const OPEN_STATUSES = ["uploaded", "reading", "naming", "pending_doc", "failed"];

export function canSwitchWorkshop(c: { status?: string; merimenCaseId: string | null }): boolean {
  return !c.merimenCaseId;
}
