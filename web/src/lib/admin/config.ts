// Parsing of the comma-separated env lists that shape /admin numbers (access itself is the secret key, see key.ts). Pure: tests can import it.
export type EmailList = { emails: string[]; valid: boolean };

/** Trim, lowercase, drop empties, dedupe. `valid` is false when any entry is not a plain address. */
export function parseEmailList(raw: string | undefined | null): EmailList {
  const emails = [...new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const valid = emails.every((e) => /^[^\s@,]+@[^\s@,]+$/.test(e));
  return { emails, valid };
}

export const SMOKE_EMAIL = "smoke-tester@autoclaim.invalid";

/** Accounts left out of every admin number unless ?internal=1: the smoke account, ADMIN_EMAILS, ADMIN_EXCLUDE_EMAILS. */
export function internalEmails(adminRaw = process.env.ADMIN_EMAILS, excludeRaw = process.env.ADMIN_EXCLUDE_EMAILS): string[] {
  const a = parseEmailList(adminRaw);
  const x = parseEmailList(excludeRaw);
  return [...new Set([SMOKE_EMAIL, ...(a.valid ? a.emails : []), ...(x.valid ? x.emails : [])])];
}

/** The only env names /admin Health may mention. Presence only, never values. */
export const REQUIRED_CONFIG = [
  "DATABASE_URL", "BETTER_AUTH_SECRET", "ANTHROPIC_API_KEY_APP", "ANTHROPIC_ADMIN_KEY",
  "RESEND_API_KEY", "EMAIL_FROM", "BLOB_READ_WRITE_TOKEN", "ADMIN_SECRET_KEY",
] as const;
export function missingConfig(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED_CONFIG.filter((k) => !env[k]);
}
