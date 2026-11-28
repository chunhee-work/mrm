/**
 * The one line at the top of every signed-in page while the Merimen login has a problem (owner 2026-11-28): why, and what to do.
 * Plain data, safe on the server and in the browser. It reads the saved login (merimen_credentials) and what the worker last wrote
 * for this account (worker_sessions.status + detail). The e-mails keep going out as before; this only adds the same news on the site.
 */
import { needsUser } from "./login-state";

export type NoticeTone = "red" | "amber";
/** fix = the user can fix it by saving the login again (the details page); wait = nothing to do, it fixes itself */
export type Notice = { key: string; tone: NoticeTone; fix: boolean; credProblem: boolean };

type Cred = { saved: boolean; verifyState: string; blocked: boolean };
type Session = { status: string; wanted: string; detail: string | null } | null;

/** What the worker wrote in worker_sessions.detail while re-login is refused (worker/autopilot_worker/relogin.py detail_for). */
const RELOGIN: Record<string, Omit<Notice, "credProblem">> = {
  relogin_failed: { key: "ln.paused", tone: "red", fix: false }, // 6 put-backs in 6 h: Chrome on the worker computer
  relogin_stopped: { key: "ln.stopped", tone: "red", fix: true }, // a try without an answer, or the key changed: save again
  relogin_unclear: { key: "ln.unclear", tone: "amber", fix: true }, // no clear answer: 24 h wait
  relogin_capped: { key: "ln.capped", tone: "amber", fix: true }, // 12 typed tries in 24 h
};

const CRED_KEY: Record<string, string> = { otp: "ln.otp", locked: "ln.locked", unknown: "ln.unknown", bad_credentials: "ln.bad" };

export function loginNotice(cred: Cred | null, session: Session): Notice | null {
  if (!cred || !cred.saved) return null; // nothing saved yet: the details page and the side bar dot already ask for it
  if (needsUser(cred)) {
    // the saved login itself was refused (wrong password, locked, a code, unclear twice): only the user can fix it
    return { key: CRED_KEY[cred.verifyState] ?? "ln.blocked", tone: "red", fix: true, credProblem: true };
  }
  if (cred.verifyState !== "ok" || !session || session.wanted !== "start" || session.status !== "waiting_login") return null;
  const r = session.detail ? RELOGIN[session.detail] : undefined;
  if (r) return { ...r, credProblem: false };
  // the session dropped and the worker is logging in again by itself: nothing to do, but say so
  return { key: "ln.relogging", tone: "amber", fix: false, credProblem: false };
}
