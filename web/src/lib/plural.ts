/**
 * Fills {name} in a copy string, and picks the singular or plural words where the string says so: `{n?photo|photos}` is "photo" when n is 1
 * and "photos" otherwise (R4-B01: "1 photos"). Languages without plural forms (中文, BM) simply do not use the form.
 */
export function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s.replace(/\{(\w+)\?([^|{}]*)\|([^{}]*)\}/g, (_m, k: string, one: string, many: string) => (String(vars[k]) === "1" ? one : many));
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
