/** The longest account name that is stored. Sign-up makes a name of at most this length from the email; the server refuses or cuts anything longer (auth.ts). */
export const MAX_NAME = 60;

/** Sign-up no longer asks for a company: Better Auth's required name (and so the first org name) is made from the email. */
export function nameFromEmail(email: string): string {
  return email.split("@")[0].split("+")[0].trim().slice(0, MAX_NAME) || email.slice(0, MAX_NAME);
}

/** A changed account name as it may be stored: trimmed, 1 to MAX_NAME characters. null for anything else (empty, too long, not text). */
export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim();
  return n && Array.from(n).length <= MAX_NAME ? n : null;
}

/** The name a new account is stored with: the one sent, trimmed and cut to MAX_NAME; with nothing usable sent, the one made from the email. */
export function nameAtSignUp(name: unknown, email: string): string {
  const n = typeof name === "string" ? Array.from(name.trim()).slice(0, MAX_NAME).join("").trim() : "";
  return n || nameFromEmail(email);
}

/** The org name to show as "Company": empty when it is only the name sign-up made from the email (any case). */
export function shownCompany(orgName: string | null | undefined, email: string): string {
  if (!orgName) return "";
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return same(orgName, nameFromEmail(email)) || same(orgName, email) ? "" : orgName;
}
