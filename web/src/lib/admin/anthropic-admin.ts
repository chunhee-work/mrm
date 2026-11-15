import { z } from "zod";

// Near-real-time spend for the whole Anthropic organization, from the Admin API (needs ANTHROPIC_ADMIN_KEY).
// Whole organization: anything else billed to the same Anthropic org is included. Best-effort cache per server
// instance (60 s fresh, up to 1 h stale when Anthropic is unreachable). Never throws.
export type OrgSpend =
  | { state: "not_connected" }
  | { state: "unavailable"; reason: string; staleAt: number | null; days?: Day[] }
  | { state: "ok"; fetchedAt: number; days: Day[]; truncated: boolean };
export type Day = { date: string; usd: number };

const Report = z.object({
  data: z.array(z.object({
    starting_at: z.string(),
    results: z.array(z.object({ amount: z.union([z.string(), z.number()]) }).passthrough()),
  }).passthrough()),
  has_more: z.boolean().optional(),
}).passthrough();

const FRESH_MS = 60_000;
const STALE_MS = 3600_000;
let last: { at: number; days: Day[]; truncated: boolean } | null = null;
export function _resetCache() { last = null; }

export async function orgSpend(opts: { key?: string; fetchImpl?: typeof fetch; now?: number } = {}): Promise<OrgSpend> {
  const key = opts.key ?? process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { state: "not_connected" };
  const now = opts.now ?? Date.now();
  if (last && now - last.at < FRESH_MS) return { state: "ok", fetchedAt: last.at, days: last.days, truncated: last.truncated };
  const fail = (reason: string): OrgSpend => {
    const ok = last && now - last.at < STALE_MS;
    return { state: "unavailable", reason, staleAt: ok ? last!.at : null, days: ok ? last!.days : undefined };
  };
  const start = new Date(now - 30 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(start.toISOString())}&bucket_width=1d&limit=31`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch {
    return fail("Anthropic did not answer in time");
  }
  if (res.status === 401 || res.status === 403) return fail("Admin key rejected");
  if (res.status === 429 || res.status >= 500) return fail("Anthropic unavailable, retry later");
  if (!res.ok) return fail(`Unexpected answer (${res.status})`);
  let body: unknown;
  try { body = await res.json(); } catch { return fail("Unexpected response"); }
  const parsed = Report.safeParse(body);
  if (!parsed.success) return fail("Unexpected response");
  // amounts are reported in cents as decimal strings
  const days = parsed.data.data.map((b) => ({
    date: b.starting_at.slice(0, 10),
    usd: b.results.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) / 100,
  }));
  last = { at: now, days, truncated: !!parsed.data.has_more };
  return { state: "ok", fetchedAt: now, days, truncated: !!parsed.data.has_more };
}
