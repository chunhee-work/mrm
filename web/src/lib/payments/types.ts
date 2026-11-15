import type { Currency, Pack } from "./packs";

export type ProviderId = "lemonsqueezy" | "toyyibpay" | "mock";

export type OrderRow = {
  id: string;
  orgId: string;
  userId: string | null;
  provider: ProviderId;
  checkoutRef: string | null;
  providerRef: string | null;
  packId: string;
  packTitle: string;
  packVersion: number;
  credits: number;
  amountMinor: number;
  currency: Currency;
  status: "pending" | "paid" | "failed" | "refunded";
  testMode: boolean;
  createdAt: Date;
  paidAt: Date | null;
};

export type CheckoutInput = {
  order: OrderRow;
  email: string;
  /** absolute URL the customer returns to */
  returnUrl: string;
  /** absolute URL the provider calls server-to-server */
  callbackUrl: string;
};

export interface PaymentProvider {
  id: ProviderId;
  /** the currency this provider charges in */
  currency: Currency;
  /** local completeness (env vars). Cheap, no network. */
  hasConfig(): boolean;
  /** hasConfig() plus a cached remote health check. */
  isHealthy(): Promise<boolean>;
  /** can this provider sell this pack right now (variant configured, price matches...) */
  packAvailable(pack: Pack): Promise<boolean>;
  /** creates the provider-hosted checkout; returns its URL and the reference we store */
  createCheckout(input: CheckoutInput): Promise<{ url: string; checkoutRef: string }>;
}

export class PaymentError extends Error {
  constructor(public code: "rate_limited" | "unavailable" | "bad_request" | "provider_error", message: string) {
    super(message);
  }
}
