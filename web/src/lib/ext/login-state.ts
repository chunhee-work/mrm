/**
 * What Merimen said about the saved login, in one place for the side bar dot, the first page and the details card
 * (they used to each spell the states out and could drift apart). Plain data: safe on the server and in the browser.
 */
export const CHECKING = ["queued", "checking", "otp_submitted"];
export const BAD = ["bad_credentials", "unknown", "locked"];
type Login = { verifyState: string; blocked: boolean };
/** The login waits on the user: a code from the phone, a wrong or locked login, or blocked. */
export const needsUser = (c: Login) => c.blocked || c.verifyState === "otp" || BAD.includes(c.verifyState);
/** The worker is still trying the login (the user waits; nothing to do yet). */
export const checking = (c: Login) => CHECKING.includes(c.verifyState);
