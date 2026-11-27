/** The longest account name that is stored. Sign-up makes a name of at most this length from the email; the server refuses or cuts anything longer (auth.ts). */
export const MAX_NAME = 60;

/** Sign-up no longer asks for a company: Better Auth's required name (and so the first org name) is made from the email. */
export function nameFromEmail(email: string): string {
  return email.split("@")[0].split("+")[0].trim().slice(0, MAX_NAME) || email.slice(0, MAX_NAME);
}

/**
 * Text the database can always store: control characters (a zero byte makes the database refuse the whole row) become spaces,
 * and half of a broken character pair becomes the usual "unknown character" mark.
 */
function storable(s: string): string {
  const plain = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  const fix = (plain as string & { toWellFormed?: () => string }).toWellFormed;
  return typeof fix === "function" ? fix.call(plain) : plain.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
}

/** A changed account name as it may be stored: trimmed, 1 to MAX_NAME characters. null for anything else (empty, too long, not text). */
export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = storable(name).trim();
  return n && Array.from(n).length <= MAX_NAME ? n : null;
}

/** The name a new account is stored with: the one sent, trimmed and cut to MAX_NAME; with nothing usable sent, the one made from the email. */
export function nameAtSignUp(name: unknown, email: string): string {
  // storable(): a name the database would refuse made sign-up answer differently for a new address than for one with an account
  const n = typeof name === "string" ? Array.from(storable(name).trim()).slice(0, MAX_NAME).join("").trim() : "";
  return n || nameFromEmail(email);
}

/** The org name to show as "Company": empty when it is only the name sign-up made from the email (any case). */
export function shownCompany(orgName: string | null | undefined, email: string): string {
  if (!orgName) return "";
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return same(orgName, nameFromEmail(email)) || same(orgName, email) ? "" : orgName;
}
