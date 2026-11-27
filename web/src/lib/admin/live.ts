import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { idOk, type Scope } from "./queries";

// "Right now" view of the app's own AI spend, counted as each call finishes (so it is current to the second).
type Db = typeof defaultDb;
export type LiveCost = {
  lastHour: { usd: number; calls: number; failed: number };
  last5min: { usd: number; calls: number };
  lastCallAt: string | null;
  recent: { at: string; purpose: string; model: string; usd: number | null; ok: boolean; caseId: string | null }[];
};
const n = (v: unknown) => Number(v ?? 0);

export async function liveCost(scope: Scope, db: Db = defaultDb): Promise<LiveCost> {
  const ok = idOk(scope, "c.user_id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (q: any): Promise<any[]> => { const r = await db.execute(q); return ((r as any).rows ?? r) as any[]; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [agg, recent] = await Promise.all([
    run(sql`SELECT coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '1 hour'), 0) usd_h, count(*) FILTER (WHERE at > now() - interval '1 hour') calls_h,
      count(*) FILTER (WHERE at > now() - interval '1 hour' AND NOT ok) failed_h,
      coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '5 minutes'), 0) usd_5, count(*) FILTER (WHERE at > now() - interval '5 minutes') calls_5,
      max(at) last_at FROM llm_calls c WHERE at > now() - interval '1 hour' AND ${ok}`),
    run(sql`SELECT at, purpose, model, cost_usd, ok, case_id FROM llm_calls c WHERE ${ok} ORDER BY at DESC LIMIT 8`),
  ]);
  const a = agg[0] ?? {};
  const iso = (v: unknown) => new Date(v as string).toISOString();
  return {
    lastHour: { usd: n(a.usd_h), calls: n(a.calls_h), failed: n(a.failed_h) },
    last5min: { usd: n(a.usd_5), calls: n(a.calls_5) },
    lastCallAt: a.last_at ? iso(a.last_at) : recent[0] ? iso(recent[0].at) : null,
    recent: recent.map((r) => ({ at: iso(r.at), purpose: String(r.purpose), model: String(r.model), usd: r.cost_usd === null ? null : n(r.cost_usd), ok: !!r.ok, caseId: r.case_id ? String(r.case_id) : null })),
  };
}
