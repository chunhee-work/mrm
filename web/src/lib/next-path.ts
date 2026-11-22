// Where to go after logging in. A signed-out visit to a page that needs an account goes to /login?next=<that page>,
// so a link to one case (a bookmark, a shared link, an expired session) comes back to that case and not to the case list.
// Only our own signed-in pages are allowed: never another site ("//evil.example", "https://…"), never /login itself.
export const GATED = /^\/(dashboard|cases|billing|settings|connection)(\/|$)/;

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let u: URL;
  try { u = new URL(raw, "https://x.invalid"); } catch { return null; }
  if (u.origin !== "https://x.invalid" || !GATED.test(u.pathname)) return null;
  return u.pathname + u.search;
}

export function loginUrl(pathname: string, search = ""): string {
  const next = safeNext(pathname + search);
  return next && next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
