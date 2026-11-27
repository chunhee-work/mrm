// The monthly API credit that comes with the owner's Anthropic plan: $200, handed out on the 20th of each month
// (Console > Billing shows "API credit (Ultra) $200" on 20 Oct and 20 Nov). Not a secret, so plain env overrides are allowed.
export type Credit = { total: number; used: number; left: number; since: string; renews: string };

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
export const creditConfig = () => ({
  total: num(process.env.ANTHROPIC_MONTHLY_CREDIT_USD, 200),
  resetDay: Math.min(28, Math.max(1, Math.round(num(process.env.ANTHROPIC_CREDIT_RESET_DAY, 20)))),
});

const ymd = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

/** The credit period that contains `now` (UTC): from the last reset day up to the next one. */
export function creditPeriod(now: Date, resetDay: number) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const startsThisMonth = now.getUTCDate() >= resetDay;
  return { since: startsThisMonth ? ymd(y, m, resetDay) : ymd(y, m - 1, resetDay), renews: startsThisMonth ? ymd(y, m + 1, resetDay) : ymd(y, m, resetDay) };
}

/** Whole-account daily spend (UTC days, USD) -> how much of this period's credit is left. Never below 0. */
export function creditLeft(days: { date: string; usd: number }[], now = new Date(), cfg = creditConfig()): Credit {
  const { since, renews } = creditPeriod(now, cfg.resetDay);
  const used = days.filter((d) => d.date >= since && d.date < renews).reduce((a, d) => a + d.usd, 0);
  return { total: cfg.total, used, left: Math.max(0, cfg.total - used), since, renews };
}
