import { z } from "zod";

// Near-real-time spend of the Anthropic organization, from the Admin API (needs ANTHROPIC_ADMIN_KEY).
// Primary source: Usage and Cost Analytics (/analytics/cost), split per API key so the app's own key can be shown on its own.
// Fallback: the older daily cost_report (whole organization, no key split) when the new endpoint is not offered.
// Anthropic's numbers lag: data usually lands within 4 hours (up to 24), so `refreshedAt` says where complete data ends.
// Best-effort cache per server instance (60 s fresh, up to 1 h stale when Anthropic is unreachable). Never throws.
export type Day = { date: string; usd: number };
export type KeySpend = { id: string | null; name: string | null; hint: string | null; usd: number; today: number; isApp: boolean };
export type OrgData = { days: Day[]; keys: KeySpend[]; refreshedAt: string | null; truncated: boolean; split: boolean };
export type OrgSpend =
  | { state: "not_connected" }
  | ({ state: "unavailable"; reason: string; staleAt: number | null } & Partial<OrgData>)
  | ({ state: "ok"; fetchedAt: number } & OrgData);

const Row = z.object({
  starting_at: z.string(),
  group: z.object({ api_key_id: z.string().nullable().optional() }).passthrough().optional(),
  cost: z.object({ amount: z.union([z.string(), z.number()]) }).passthrough(),
}).passthrough();
const Analytics = z.object({ data: z.array(Row), has_more: z.boolean().optional(), next_page: z.string().nullable().optional(), data_refreshed_at: z.string().nullable().optional() }).passthrough();
const Legacy = z.object({
  data: z.array(z.object({ starting_at: z.string(), results: z.array(z.object({ amount: z.union([z.string(), z.number()]) }).passthrough()) }).passthrough()),
  has_more: z.boolean().optional(),
}).passthrough();
const KeyList = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().nullish(), partial_key_hint: z.string().nullish() }).passthrough()) }).passthrough();

const FRESH_MS = 60_000;
const STALE_MS = 3600_000;
const MAX_PAGES = 6;
let last: { at: number; data: OrgData } | null = null;
export function _resetCache() { last = null; }

/** Does this key list entry belong to the app's own key? Compares only the visible hint (first and last characters), never the secret. */
export function hintMatches(hint: string | null | undefined, appKey: string | undefined): boolean {
  if (!hint || !appKey || appKey.length < 12) return false;
  const [head, tail] = hint.split(/\.{2,}|…/);
  if (!head || !tail) return false;
  return appKey.startsWith(head) && appKey.endsWith(tail);
}

export async function orgSpend(opts: { key?: string; appKey?: string; fetchImpl?: typeof fetch; now?: number } = {}): Promise<OrgSpend> {
  const key = opts.key ?? process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { state: "not_connected" };
  const now = opts.now ?? Date.now();
  if (last && now - last.at < FRESH_MS) return { state: "ok", fetchedAt: last.at, ...last.data };
  const f = opts.fetchImpl ?? fetch;
  const fail = (reason: string): OrgSpend => {
    const ok = last && now - last.at < STALE_MS;
    return { state: "unavailable", reason, staleAt: ok ? last!.at : null, ...(ok ? last!.data : {}) };
  };
  const get = (path: string, beta: boolean) => f(`https://api.anthropic.com${path}`, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", ...(beta ? { "anthropic-beta": "analytics-usage-cost-2026-08-24" } : {}) },
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  const start = new Date(now - 30 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const startQ = encodeURIComponent(start.toISOString());
  const todayKey = new Date(now).toISOString().slice(0, 10);

  try {
    // 1) per-key analytics
    const rows: z.infer<typeof Row>[] = [];
    let refreshedAt: string | null = null, more = false, page: string | null = null, status = 200, bad = false;
    for (let i = 0; i < MAX_PAGES; i++) {
      const end = encodeURIComponent(new Date(now).toISOString());
      const res = await get(`/v1/organizations/analytics/cost?starting_at=${startQ}&ending_at=${end}&time_bucket_width=1d&group_by%5B%5D=api_key_id&limit=1000${page ? `&page=${encodeURIComponent(page)}` : ""}`, true);
      status = res.status;
      if (!res.ok) break;
      const p = Analytics.safeParse(await res.json().catch(() => null));
      if (!p.success) { bad = true; break; }
      rows.push(...p.data.data);
      refreshedAt = p.data.data_refreshed_at ?? refreshedAt;
      more = !!p.data.has_more && !!p.data.next_page;
      page = p.data.next_page ?? null;
      if (!more) break;
    }
    if (status === 401 || status === 403) return fail("Admin key rejected");
    if (status === 429 || status >= 500) return fail("Anthropic unavailable, retry later");
    if (bad) return fail("Unexpected response");
    if (status === 200) {
      const perDay = new Map<string, number>();
      const perKey = new Map<string, { usd: number; today: number }>();
      for (const r of rows) {
        const usd = (Number(r.cost.amount) || 0) / 100; // amounts are cents, decimal strings
        const d = r.starting_at.slice(0, 10);
        perDay.set(d, (perDay.get(d) ?? 0) + usd);
        const k = r.group?.api_key_id ?? "";
        const e = perKey.get(k) ?? { usd: 0, today: 0 };
        e.usd += usd; if (d === todayKey) e.today += usd;
        perKey.set(k, e);
      }
      // names for the keys (best effort: a failure only means keys show by id)
      const names = new Map<string, { name: string | null; hint: string | null }>();
      try {
        const kr = await get("/v1/organizations/api_keys?limit=100", false);
        if (kr.ok) {
          const kp = KeyList.safeParse(await kr.json());
          if (kp.success) for (const k of kp.data.data) names.set(k.id, { name: k.name ?? null, hint: k.partial_key_hint ?? null });
        }
      } catch { /* ids only */ }
      const appKey = opts.appKey ?? process.env.ANTHROPIC_API_KEY_APP;
      const keys: KeySpend[] = [...perKey.entries()].map(([id, v]) => {
        const n = id ? names.get(id) : undefined;
        return { id: id || null, name: n?.name ?? null, hint: n?.hint ?? null, usd: v.usd, today: v.today, isApp: !!id && hintMatches(n?.hint, appKey) };
      }).sort((a, b) => b.usd - a.usd);
      const days = [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, usd]) => ({ date, usd }));
      const data: OrgData = { days, keys, refreshedAt, truncated: more, split: true };
      last = { at: now, data };
      return { state: "ok", fetchedAt: now, ...data };
    }

    // 2) fallback: daily whole-organization report (no key split)
    const res = await get(`/v1/organizations/cost_report?starting_at=${startQ}&bucket_width=1d&limit=31`, false);
    if (res.status === 401 || res.status === 403) return fail("Admin key rejected");
    if (res.status === 429 || res.status >= 500) return fail("Anthropic unavailable, retry later");
    if (!res.ok) return fail(`Unexpected answer (${res.status})`);
    const p = Legacy.safeParse(await res.json().catch(() => null));
    if (!p.success) return fail("Unexpected response");
    const days = p.data.data.map((b) => ({ date: b.starting_at.slice(0, 10), usd: b.results.reduce((s, r) => s + (Number(r.amount) || 0), 0) / 100 }));
    const data: OrgData = { days, keys: [], refreshedAt: null, truncated: !!p.data.has_more, split: false };
    last = { at: now, data };
    return { state: "ok", fetchedAt: now, ...data };
  } catch {
    return fail("Anthropic did not answer in time");
  }
}
