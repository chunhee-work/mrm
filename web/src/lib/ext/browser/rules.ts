// Plan #40. Pure rules for the in-app Merimen browser: where it may go, when it counts as logged in, when it must close.

export const MERIMEN_ORIGIN = "https://www.merimen.com.my";
export const MERIMEN_START_URL = `${MERIMEN_ORIGIN}/claims/index.cfm`; // the login page the window opens on
export const IDLE_MS = 15 * 60 * 1000; // nobody looking at the page
export const HARD_MS = 60 * 60 * 1000; // one session never lives longer than this

/** Only Merimen's own claims pages are allowed in the remote browser. */
export function isMerimenUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.origin === MERIMEN_ORIGIN && u.pathname.startsWith("/claims/");
  } catch { return false; }
}

/**
 * Logged in = a /claims/ page whose address carries Merimen's session marks (CFID and RID, as the owner's own scripts rely on).
 * Decided from the address only: no page text, no form field, no cookie is read. The address itself is a secret: never log it.
 */
export function isLoggedInUrl(raw: string): boolean {
  if (!isMerimenUrl(raw)) return false;
  const q = new URL(raw).searchParams;
  return !!q.get("CFID") && !!q.get("RID");
}

export type Verdict = "keep" | "idle" | "hard";
export function sessionVerdict(i: { openedAt: Date; lastSeenAt: Date | null; now?: Date }): Verdict {
  const now = (i.now ?? new Date()).getTime();
  if (now - i.openedAt.getTime() >= HARD_MS) return "hard";
  if (now - (i.lastSeenAt ?? i.openedAt).getTime() >= IDLE_MS) return "idle";
  return "keep";
}

export type BrowserStatus = "none" | "waiting_login" | "connected" | "expired";
/** After a check: what the connection row should say. `expired` = it was connected and Merimen now shows the login again. */
export function nextStatus(prev: BrowserStatus, loggedIn: boolean): BrowserStatus {
  if (loggedIn) return "connected";
  return prev === "connected" ? "expired" : "waiting_login";
}
