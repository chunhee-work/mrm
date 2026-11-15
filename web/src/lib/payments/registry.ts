import { lemonsqueezy } from "./providers/lemonsqueezy";
import { toyyibpay } from "./providers/toyyibpay";
import { mock } from "./providers/mock";
import { getPack, packSellable, PACKS, type Pack } from "./packs";
import type { PaymentProvider, ProviderId } from "./types";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = { lemonsqueezy, toyyibpay, mock };

export type ProviderView = { id: ProviderId; currency: "MYR" | "USD"; packs: { id: string; available: boolean }[] };

/**
 * A provider is listed only if it is configured AND healthy AND has at least one sellable pack.
 * Presence of env vars alone never switches a provider on (plan #12, DPR-12-4 D3).
 */
export async function availableProviders(): Promise<ProviderView[]> {
  const out: ProviderView[] = [];
  for (const p of Object.values(PROVIDERS)) {
    if (!p.hasConfig() || !(await p.isHealthy())) continue;
    const packs = await Promise.all(PACKS.map(async (k: Pack) => ({ id: k.id, available: packSellable(k) && (await p.packAvailable(k)) })));
    if (packs.some((k) => k.available)) out.push({ id: p.id, currency: p.currency, packs });
  }
  return out;
}

export async function canSell(provider: ProviderId, packId: string): Promise<{ provider: PaymentProvider; pack: Pack } | null> {
  const p = PROVIDERS[provider];
  const pack = getPack(packId);
  if (!p || !pack || !packSellable(pack) || !p.hasConfig() || !(await p.isHealthy()) || !(await p.packAvailable(pack))) return null;
  return { provider: p, pack };
}
