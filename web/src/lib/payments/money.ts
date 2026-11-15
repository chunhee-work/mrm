// Money is always integer minor units (US cents, MYR sen). No floats anywhere in the payment path.

/** "12.50" -> 1250. Exactly two decimals at most; anything else is rejected (returns null). */
export function decimalToMinor(v: string | number): number | null {
  const s = String(v).trim();
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(frac);
}

export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const a = Math.abs(minor);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export function formatMoney(minor: number, currency: string, locale = "en-MY"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: currency === "MYR" ? "narrowSymbol" : "symbol" }).format(minor / 100);
}
