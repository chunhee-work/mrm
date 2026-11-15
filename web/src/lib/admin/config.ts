// Parsing of the comma-separated env lists that control /admin. Pure: tests can import it.
export type EmailList = { emails: string[]; valid: boolean };

/** Trim, lowercase, drop empties, dedupe. `valid` is false when any entry is not a plain address. */
export function parseEmailList(raw: string | undefined | null): EmailList {
  const emails = [...new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const valid = emails.every((e) => /^[^\s@,]+@[^\s@,]+$/.test(e));
  return { emails, valid };
}

let warned = false;
/** Fail closed: a missing, empty or malformed ADMIN_EMAILS means nobody is an admin. */
export function adminEmails(raw = process.env.ADMIN_EMAILS): string[] {
  const { emails, valid } = parseEmailList(raw);
  if (!emails.length || !valid) {
    if (!warned) { warned = true; console.error("ADMIN_EMAILS is missing, empty or malformed; /admin is closed"); }
    return [];
  }
  return emails;
}

export const SMOKE_EMAIL = "smoke-tester@autoclaim.invalid";

/** Accounts left out of every admin number unless ?internal=1: the smoke account, ADMIN_EMAILS, ADMIN_EXCLUDE_EMAILS. */
export function internalEmails(adminRaw = process.env.ADMIN_EMAILS, excludeRaw = process.env.ADMIN_EXCLUDE_EMAILS): string[] {
  const a = parseEmailList(adminRaw);
  const x = parseEmailList(excludeRaw);
  return [...new Set([SMOKE_EMAIL, ...(a.valid ? a.emails : []), ...(x.valid ? x.emails : [])])];
}

export const ADMIN_SESSION_MAX_AGE_MS = 12 * 3600 * 1000;

export function isAdmin(opts: { email: string; emailVerified: boolean; sessionCreatedAt: Date | string | number; now?: number; adminRaw?: string }): boolean {
  const list = adminEmails(opts.adminRaw ?? process.env.ADMIN_EMAILS);
  if (!opts.emailVerified || !list.includes(opts.email.trim().toLowerCase())) return false;
  const created = new Date(opts.sessionCreatedAt).getTime();
  return Number.isFinite(created) && (opts.now ?? Date.now()) - created <= ADMIN_SESSION_MAX_AGE_MS;
}

/** The only env names /admin Health may mention. Presence only, never values. */
export const REQUIRED_CONFIG = [
  "DATABASE_URL", "BETTER_AUTH_SECRET", "ANTHROPIC_API_KEY_APP", "ANTHROPIC_ADMIN_KEY",
  "RESEND_API_KEY", "EMAIL_FROM", "BLOB_READ_WRITE_TOKEN", "ADMIN_EMAILS",
] as const;
export function missingConfig(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED_CONFIG.filter((k) => !env[k]);
}
