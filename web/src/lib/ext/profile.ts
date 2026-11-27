// The details every account types once on the front page: Merimen login + workshop, manager, adjuster.
// Pure helpers, shared by the server (what is complete, what is clean) and the page (what to show).

export type Profile = { workshop: string; manager: string; adjuster: string };
export const PROFILE_MAX = 120;

/** One free-text field: control characters removed, trimmed, 1..120 characters. */
export function cleanText(v: unknown, max = PROFILE_MAX): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

export function cleanProfile(b: { workshop?: unknown; manager?: unknown; adjuster?: unknown } | null | undefined): Profile | null {
  const workshop = cleanText(b?.workshop), manager = cleanText(b?.manager), adjuster = cleanText(b?.adjuster);
  return workshop && manager && adjuster ? { workshop, manager, adjuster } : null;
}

type View = { saved: boolean; workshop?: string | null; manager?: string | null; adjuster?: string | null };

/** A case may be started only when the login is saved and all three names are filled. */
export function profileComplete(v: View): boolean {
  return v.saved && !!v.workshop?.trim() && !!v.manager?.trim() && !!v.adjuster?.trim();
}
