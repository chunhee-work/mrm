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
  return listProviders(Object.values(PROVIDERS));
}

// All providers are asked at the same time (the billing page waited for each one in turn: a cold server asked
// Lemon Squeezy, then toyyibPay, about 1.5 s). The order of the list stays the same.
export async function listProviders(list: PaymentProvider[]): Promise<ProviderView[]> {
  const views = await Promise.all(list.map(async (p): Promise<ProviderView | null> => {
    if (!p.hasConfig() || !(await p.isHealthy())) return null;
    const packs = await Promise.all(PACKS.map(async (k: Pack) => ({ id: k.id, available: packSellable(k) && (await p.packAvailable(k)) })));
    return packs.some((k) => k.available) ? { id: p.id, currency: p.currency, packs } : null;
  }));
  return views.filter((v): v is ProviderView => v !== null);
}

export async function canSell(provider: ProviderId, packId: string): Promise<{ provider: PaymentProvider; pack: Pack } | null> {
  const p = PROVIDERS[provider];
  const pack = getPack(packId);
  if (!p || !pack || !packSellable(pack) || !p.hasConfig() || !(await p.isHealthy()) || !(await p.packAvailable(pack))) return null;
  return { provider: p, pack };
}
