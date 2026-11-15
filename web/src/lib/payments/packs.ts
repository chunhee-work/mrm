// Credit packs. 1000 credits = 1 case (owner, 2026-11-15).
//
// PRICES BELOW ARE PLACEHOLDERS (approved: false). The owner prices after the test run has measured
// the real cost per case (plan chunhee-work/mrm#12). While `approved` is false a pack can only be bought
// when PAYMENTS_MODE is "test"; in live mode it is refused. Changing a price or title: bump `version`.
export type Currency = "MYR" | "USD";

export type Pack = {
  id: string;
  title: string;
  version: number;
  credits: number;
  /** minor units: sen for MYR, cents for USD */
  price: Record<Currency, number>;
  approved: boolean;
};

export const PACKS: readonly Pack[] = [
  { id: "pack_1", title: "1 case", version: 1, credits: 1000, price: { MYR: 2000, USD: 500 }, approved: false },
  { id: "pack_5", title: "5 cases", version: 1, credits: 5000, price: { MYR: 8000, USD: 2000 }, approved: false },
  { id: "pack_10", title: "10 cases", version: 1, credits: 10000, price: { MYR: 14000, USD: 3500 }, approved: false },
];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

export type PaymentsMode = "test" | "live";
export function paymentsMode(): PaymentsMode {
  return process.env.PAYMENTS_MODE === "live" ? "live" : "test";
}
/** In live mode only approved packs can be sold. */
export function packSellable(p: Pack, mode: PaymentsMode = paymentsMode()): boolean {
  return mode === "test" || p.approved;
}
