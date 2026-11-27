// A case can change workshop only while it has not been made in Merimen yet: before the worker starts, or while the documents are
// still being read and the photos named. After that the worker has already used the workshop, so the choice is shown but locked.
export const OPEN_STATUSES = ["uploaded", "reading", "naming", "pending_doc", "failed"];

export function canSwitchWorkshop(c: { status: string; merimenCaseId: string | null }): boolean {
  return !c.merimenCaseId && OPEN_STATUSES.includes(c.status);
}
