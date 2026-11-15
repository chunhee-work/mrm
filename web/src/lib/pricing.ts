// Prices for the Claude calls we make, USD per 1M tokens. Pure module (no server-only) so tests can import it.
// Add an entry here whenever CLAUDE_MODEL changes; a call whose model has no entry is stored as "unpriced"
// (cost_usd null) and flagged in /admin instead of being guessed. `lastVerified` is the date someone compared
// the numbers with Anthropic's price list; null means never verified, which /admin shows as a warning.
export type Price = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  effectiveFrom: string;
  lastVerified: string | null;
};

export const PRICES: Record<string, Price> = {
  // input/output/cacheRead are the numbers the app already used; cache-write rates are the standard
  // 1.25x / 2x of input. None of these has been checked against the Anthropic cost report yet.
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8, effectiveFrom: "2026-11-14", lastVerified: null },
};

export type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };

/** Reads the exact usage fields. Without the 5m/1h split, all cache-creation tokens count as 5m. */
export function tokensOf(u: UsageLike | null | undefined): Tokens {
  const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  const split = u?.cache_creation;
  const w5 = split ? n(split.ephemeral_5m_input_tokens) : n(u?.cache_creation_input_tokens);
  const w1 = split ? n(split.ephemeral_1h_input_tokens) : 0;
  return { input: n(u?.input_tokens), output: n(u?.output_tokens), cacheRead: n(u?.cache_read_input_tokens), cacheWrite5m: w5, cacheWrite1h: w1 };
}

/** Exact id first, then a dated variant such as "claude-opus-5-5-20261101". */
export function priceFor(model: string): Price | null {
  if (PRICES[model]) return PRICES[model];
  const base = Object.keys(PRICES).find((k) => model.startsWith(k + "-"));
  return base ? PRICES[base] : null;
}

/** USD for one call, or null when the model is unpriced. */
export function costOf(model: string, t: Tokens): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite5m * p.cacheWrite5m + t.cacheWrite1h * p.cacheWrite1h) / 1e6;
}

/** Oldest `lastVerified` among prices in use; null entries count as never verified. */
export function pricesStale(now = Date.now(), maxDays = 90): boolean {
  return Object.values(PRICES).some((p) => !p.lastVerified || now - Date.parse(p.lastVerified) > maxDays * 86400000);
}
