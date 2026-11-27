import { createHash } from "node:crypto";

/**
 * A password-reset token is live when its row exists and has not expired. better-auth names the row `reset-password:<token>`
 * and stores that name hashed (auth.ts, `verification.storeIdentifier`): SHA-256, base64url without padding.
 */
export const resetIdentifier = (token: string) => `reset-password:${token}`;
/** The names a live token's row can have: the hashed one, and the plain one of a link sent before hashing was turned on. */
export const storedResetIdentifiers = (token: string) => [createHash("sha256").update(resetIdentifier(token)).digest("base64url"), resetIdentifier(token)];
export const tokenLooksRight = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(t);
export const isLive = (row: { expiresAt: Date } | undefined | null, now = new Date()) => !!row && row.expiresAt.getTime() > now.getTime();
