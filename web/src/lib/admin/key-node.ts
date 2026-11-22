import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time check of a typed key: both sides are hashed to 32 bytes first, so length is not leaked either. */
export function keyMatches(input: string, key: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

// Brute-force brake. Held in memory, so it is per server instance (best effort on serverless); the length rule on the key
// (24+ characters) is what really makes guessing hopeless.
const MAX_FAILS = 5, WINDOW_MS = 15 * 60_000;
const fails = new Map<string, { n: number; first: number }>();

export function throttled(who: string, now = Date.now()): boolean {
  const f = fails.get(who);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) { fails.delete(who); return false; }
  return f.n >= MAX_FAILS;
}
export function recordFail(who: string, now = Date.now()): void {
  const f = fails.get(who);
  if (!f || now - f.first > WINDOW_MS) {
    if (fails.size > 5000) fails.clear();
    fails.set(who, { n: 1, first: now });
  } else f.n++;
}
export function clearFails(who: string): void { fails.delete(who); }
export const resetThrottleForTests = () => fails.clear();
