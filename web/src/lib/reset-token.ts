/** A password-reset token is live when its row exists and has not expired (better-auth stores it as identifier `reset-password:<token>`). */
export const resetIdentifier = (token: string) => `reset-password:${token}`;
export const tokenLooksRight = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(t);
export const isLive = (row: { expiresAt: Date } | undefined | null, now = new Date()) => !!row && row.expiresAt.getTime() > now.getTime();
