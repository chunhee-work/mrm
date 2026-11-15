// What the photo routes are allowed to log (plan #9, AH): ids, an error name and a status. Never a body, a path or an SDK error object.
export type LogIds = { caseId?: string; photoId?: number | string };

function errorName(e: unknown): string {
  const n = e && typeof e === "object" && typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : "Error";
  return /^[A-Za-z0-9_]{1,60}$/.test(n) ? n : "Error";
}
function errorStatus(e: unknown): number | null {
  const s = e && typeof e === "object" ? (e as { status?: unknown }).status : null;
  return typeof s === "number" && s >= 100 && s < 600 ? s : null;
}

/** One log line with ids, error name and status only. */
export function logLine(route: string, ids: LogIds, e: unknown): string {
  return JSON.stringify({ route, caseId: ids.caseId ?? null, photoId: ids.photoId ?? null, errorName: errorName(e), status: errorStatus(e) });
}

/** Replaces any thrown value by a short error that carries no request or response content. */
export function safeError(prefix: string, e: unknown): Error {
  const out = new Error(`${prefix}: ${errorStatus(e) ?? errorName(e)}`);
  out.name = "PhotoError";
  return out;
}
