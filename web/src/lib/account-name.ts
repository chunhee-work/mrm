/** Sign-up no longer asks for a company: Better Auth's required name (and so the first org name) is made from the email. */
export function nameFromEmail(email: string): string {
  return email.split("@")[0].split("+")[0].trim().slice(0, 60) || email.slice(0, 60);
}

/** The org name to show as "Company": empty when it is only the name sign-up made from the email (any case). */
export function shownCompany(orgName: string | null | undefined, email: string): string {
  if (!orgName) return "";
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return same(orgName, nameFromEmail(email)) || same(orgName, email) ? "" : orgName;
}
