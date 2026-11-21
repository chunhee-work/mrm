// Same phrases as worker/autopilot_worker/login_page.py. A lock is decided before a wrong password,
// because Merimen's lock page (locktime=15) also talks about the password. One attempt only.

export type LoginResult = "success" | "bad_credentials" | "locked" | "otp" | "unknown";

const LOCKED = ["account has been locked", "account is locked", "account locked", "too many failed", "too many attempts", "locktime", "akaun telah dikunci", "akaun dikunci", "账号已锁定", "账户已锁定", "帐号已锁定"];
const OTP = ["one-time password", "one time password", "verification code", "enter the code", "security code", "kod pengesahan", "验证码", "otp", "tac"];
const BAD = ["invalid user", "invalid password", "wrong password", "incorrect password", "user id or password", "userid or password", "username or password", "login failed", "authentication failed", "tidak sah", "用户名或密码", "密码错误"];

function has(blob: string, phrases: string[]): boolean {
  return phrases.some((p) => (p === "otp" || p === "tac" ? new RegExp(`\\b${p}\\b`).test(blob) : blob.includes(p)));
}

export function classifyLogin(page: { url?: string; text?: string; hasPassword?: boolean; hasOtp?: boolean }): LoginResult {
  const blob = (page.text || "").toLowerCase();
  if (has(blob, LOCKED)) return "locked";
  if (page.hasOtp || has(blob, OTP)) return "otp";
  if (has(blob, BAD)) return "bad_credentials";
  try {
    const u = new URL(page.url || "");
    if (u.protocol === "https:" && u.host === "www.merimen.com.my" && u.pathname.startsWith("/claims/") && u.searchParams.get("CFID") && u.searchParams.get("RID") && !page.hasPassword) return "success";
  } catch { /* not a logged-in address */ }
  return "unknown";
}

/** The one check a save is allowed to queue. A second automatic try would feed Merimen's lockout. */
export function canQueueVerify(state: string, attempts: number): boolean {
  return state === "queued" && attempts === 0;
}
