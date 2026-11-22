// Secret-key login for /admin. Edge-safe (Web Crypto only) so the middleware can use it; the node-only parts live in key-node.ts.
// The key is the env var ADMIN_SECRET_KEY. It is never logged, never stored, never put in the cookie: the cookie holds only an
// expiry time and an HMAC of it made with the key, so changing the key signs everybody out at once.

export const ADMIN_KEY_ENV = "ADMIN_SECRET_KEY";
export const ADMIN_KEY_MIN_LENGTH = 24;
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 3600 * 1000;

const secure = process.env.NODE_ENV === "production";
/** `__Host-` pins the cookie to this exact host over https (no Domain, Path=/). Plain name on http localhost, where Secure cookies are not stored. */
export const ADMIN_COOKIE = secure ? "__Host-admin_session" : "admin_session";
export const ADMIN_COOKIE_SECURE = secure;

let warned = false;
/** Fail closed: a missing or too short key means /admin is closed to everyone (a plain 404). */
export function adminKey(raw: string | undefined = process.env[ADMIN_KEY_ENV]): string | null {
  const k = raw ?? "";
  if (k.length >= ADMIN_KEY_MIN_LENGTH) return k;
  if (!warned) { warned = true; console.error(`${ADMIN_KEY_ENV} is missing or shorter than ${ADMIN_KEY_MIN_LENGTH} characters; /admin is closed`); }
  return null;
}

const enc = new TextEncoder();
async function hmac(key: string, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** `v1.<expiry ms>.<hex hmac>` */
export async function signSession(key: string, now = Date.now()): Promise<string> {
  const exp = now + ADMIN_SESSION_MAX_AGE_MS;
  return `v1.${exp}.${toHex(await hmac(key, `admin-session.v1.${exp}`))}`;
}

export async function verifySession(token: string | undefined | null, key: string | null, now = Date.now()): Promise<boolean> {
  if (!token || !key) return false;
  const m = /^v1\.(\d{1,15})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now) || exp - now > ADMIN_SESSION_MAX_AGE_MS) return false;
  const want = toHex(await hmac(key, `admin-session.v1.${exp}`));
  // Both strings are 64 hex characters; compare without stopping at the first difference.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0;
}
