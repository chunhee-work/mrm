import { createHash, timingSafeEqual } from "node:crypto";
import { counterId, forget, giveBack, hitOrAllow, isMarked, mark } from "@/lib/rate-limit";
import { verifySession } from "./key";

/** Constant-time check of a typed key: both sides are hashed to 32 bytes first, so length is not leaked either. */
export function keyMatches(input: string, key: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

// Brute-force brake. Counted in the database (rate-limit.ts), so it holds across every server instance: wrong keys from one
// client address, and wrong keys from everyone together (many addresses guessing at once). While either is over its cap the
// form refuses every key, the right one too, until the 15 minutes from the first wrong key are over.
export const ADMIN_WRONG_KEYS_PER_ADDRESS = 5;
export const ADMIN_WRONG_KEYS_ALL = 100;
export const ADMIN_WRONG_KEYS_WINDOW_MS = 15 * 60_000;

const perAddress = (who: string) => counterId("admin-key", who);
const everyone = counterId("admin-key", "*everyone*");

/** The client address as the platform wrote it (Vercel replaces anything the client sends in this header). */
export const clientAddress = (headers: Headers) => (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

/**
 * Counts one try at the key before the key is looked at (one statement per counter, so tries sent at the same moment cannot
 * all get in under the cap). False: locked, do not look at the key. A database that does not answer lets the try through.
 */
export async function countKeyTry(who: string): Promise<boolean> {
  const [mine, all] = await Promise.all([
    hitOrAllow(perAddress(who), ADMIN_WRONG_KEYS_PER_ADDRESS, ADMIN_WRONG_KEYS_WINDOW_MS),
    hitOrAllow(everyone, ADMIN_WRONG_KEYS_ALL, ADMIN_WRONG_KEYS_WINDOW_MS),
  ]);
  return mine.allowed && all.allowed;
}
/** The key was right: that try was not a wrong one. */
export async function keyTryWasRight(who: string): Promise<void> {
  await Promise.all([forget(perAddress(who)), giveBack(everyone, ADMIN_WRONG_KEYS_ALL)]);
}

// Log out. The cookie is only a signed expiry time, so deleting it in the browser would leave a copy of it working for up to
// 12 hours. A logged-out cookie is remembered (by its hash, never the cookie itself) until it would have expired anyway.
const ended = (token: string) => counterId("admin-out", token);

/** Ends this admin session for every copy of its cookie. Only a cookie that is still good is remembered. */
export async function endAdminSession(token: string | undefined | null, key: string | null): Promise<void> {
  if (!token || !(await verifySession(token, key))) return;
  await mark(ended(token), new Date(Number(token.split(".")[1])));
}
export const adminSessionEnded = (token: string) => isMarked(ended(token));
