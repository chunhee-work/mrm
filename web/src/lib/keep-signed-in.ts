/**
 * Keeps a browser that is being used signed in.
 * The session lasts 7 days and is meant to be given 7 new days whenever it is used a day or more after the last renewal.
 * Pages read the session while they are drawn, and a page being drawn cannot send a cookie: the database row was renewed
 * there, the browser's cookie kept its old end date, and a daily user was signed out a week after logging in.
 * So pages only read (session.ts) and the browser asks the auth server itself, at most once a day; that answer can set the cookie.
 */
export const KEEP_EVERY_MS = 24 * 60 * 60 * 1000;
const KEY = "signed-in-kept-at";

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** True when the last ask was a day or more ago, never happened, or lies in the future (the clock was moved). */
export function keepDue(last: number, now: number): boolean {
  return !(last > 0) || last > now || now - last >= KEEP_EVERY_MS;
}

function browserStore(): Store | null {
  try { return window.localStorage; } catch { return null; }
}

let asking = false;
let askedAt = 0; // for a browser that keeps no storage: remembered until the page is loaded again

/**
 * Calls `ask` (a request for the session to the auth server; true = signed in) when one is due. Returns whether it asked and
 * was answered. A failed ask is not remembered, so the next check tries again.
 */
export async function keepSignedIn(ask: () => Promise<boolean>, store: Store | null = browserStore(), now = Date.now()): Promise<boolean> {
  if (asking) return false;
  let last = askedAt;
  try { last = Math.max(last, Number(store?.getItem(KEY)) || 0); } catch { /* storage blocked: the page's own memory is used */ }
  if (!keepDue(last, now)) return false;
  asking = true;
  try {
    if (!(await ask())) return false;
    askedAt = now;
    try { store?.setItem(KEY, String(now)); } catch { /* as above */ }
    return true;
  } catch {
    return false;
  } finally {
    asking = false;
  }
}
