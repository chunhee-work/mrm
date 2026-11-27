// The details every account types once on the front page: Merimen login + workshop, manager, adjuster.
// Pure helpers, shared by the server (what is complete, what is clean) and the page (what to show).

export type Workshop = { slot: number; name: string };
export type Profile = { workshops: Workshop[]; workshop: string; manager: string; adjuster: string };
export const PROFILE_MAX = 120;
export const MAX_WORKSHOPS = 3;

/** One free-text field: control characters removed, trimmed, 1..120 characters. */
export function cleanText(v: unknown, max = PROFILE_MAX): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
}

/**
 * The workshops of a save: the complete list, as `workshops: [{slot, name}]` (or the older single `workshop` = workshop 1).
 * Workshop 1 is required; 2 and 3 are optional (an empty name means "none"); a slot may appear once; names must differ.
 * Returns null when anything is wrong, so a half-understood list is never saved.
 */
export function cleanWorkshops(b: { workshops?: unknown; workshop?: unknown } | null | undefined): Workshop[] | null {
  const raw: unknown[] = Array.isArray(b?.workshops) ? b!.workshops as unknown[] : b?.workshop !== undefined ? [{ slot: 1, name: b.workshop }] : [];
  if (raw.length > MAX_WORKSHOPS) return null;
  const out: Workshop[] = [];
  for (const w of raw) {
    const slot = Number((w as { slot?: unknown })?.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_WORKSHOPS || out.some((x) => x.slot === slot)) return null;
    const name = cleanText((w as { name?: unknown })?.name);
    if (!name) { if (slot === 1) return null; if (typeof (w as { name?: unknown })?.name === "string" && ((w as { name: string }).name.trim() !== "")) return null; continue; }
    out.push({ slot, name });
  }
  if (!out.some((w) => w.slot === 1)) return null;
  if (new Set(out.map((w) => w.name.toLowerCase())).size !== out.length) return null;
  return out.sort((x, y) => x.slot - y.slot);
}

export function cleanProfile(b: { workshops?: unknown; workshop?: unknown; manager?: unknown; adjuster?: unknown } | null | undefined): Profile | null {
  const workshops = cleanWorkshops(b), manager = cleanText(b?.manager), adjuster = cleanText(b?.adjuster);
  return workshops && manager && adjuster ? { workshops, workshop: workshops[0].name, manager, adjuster } : null;
}

type View = { saved: boolean; workshop?: string | null; workshops?: Workshop[]; manager?: string | null; adjuster?: string | null };

/** A case may be started only when the login is saved, workshop 1 and the two names are filled. */
export function profileComplete(v: View): boolean {
  const w1 = v.workshops ? v.workshops.some((w) => w.slot === 1 && !!w.name.trim()) : !!v.workshop?.trim();
  return v.saved && w1 && !!v.manager?.trim() && !!v.adjuster?.trim();
}
