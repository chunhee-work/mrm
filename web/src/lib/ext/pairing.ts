import { createHash, randomInt } from "node:crypto";

// No 0/O/1/I/L so a code read from the screen is not mistyped.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS_PER_CODE = 5;
export const MAX_CODES_PER_HOUR = 5;
export const CONSENT_WORDING_VERSION = "1";

export function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
export const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

/** A code can still be tried: not used, not expired, fewer than 5 wrong tries. */
export function codeUsable(c: { usedAt: Date | null; expiresAt: Date; attempts: number }, now = new Date()) {
  return !c.usedAt && c.expiresAt.getTime() > now.getTime() && c.attempts < MAX_ATTEMPTS_PER_CODE;
}

/** Firm label: optional, at most 80 characters, no control characters. */
export function cleanFirmLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || null;
}

/** The rate-limit window: clock hours, so the count and the slot number can be made unique in the database. */
export const hourBucket = (now = Date.now()) => Math.floor(now / 3600_000);

/** Postgres unique violation, however the driver wraps it (node-postgres, neon http). */
export function isUniqueViolation(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code === "23505" || x?.cause?.code === "23505";
}
