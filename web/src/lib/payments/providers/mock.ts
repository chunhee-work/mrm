import type { CheckoutInput, PaymentProvider } from "../types";

// Local-only provider for development and screenshots: no network, no money.
// Enabled only when PAYMENTS_MOCK=1 and NODE_ENV is not production. The "checkout" is our own page
// /billing/mock-pay, whose server action credits through the same creditOrder() as the real providers.
export const mockEnabled = () => process.env.PAYMENTS_MOCK === "1" && process.env.NODE_ENV !== "production";

export const mock: PaymentProvider = {
  id: "mock",
  currency: "MYR",
  hasConfig: () => mockEnabled(),
  isHealthy: async () => mockEnabled(),
  packAvailable: async () => mockEnabled(),
  async createCheckout({ order }: CheckoutInput) {
    return { url: `/billing/mock-pay?order=${order.id}`, checkoutRef: `mock-${order.id}` };
  },
};
