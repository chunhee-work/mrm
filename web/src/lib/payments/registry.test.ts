import { test } from "node:test";
import assert from "node:assert/strict";
import { listProviders } from "./registry";
import type { PaymentProvider } from "./types";

// Hard test 2026-11-22: the billing page asked the payment providers one after another (about 1.5 s on a cold server).
const slow = (id: PaymentProvider["id"], ms: number, healthy = true): PaymentProvider => ({
  id, currency: "MYR", hasConfig: () => true,
  isHealthy: () => new Promise((r) => setTimeout(() => r(healthy), ms)),
  packAvailable: () => new Promise((r) => setTimeout(() => r(true), ms)),
  createCheckout: async () => ({ url: "", checkoutRef: "" }),
});

test("billing asks every payment provider at the same time and keeps their order", async () => {
  const t0 = Date.now();
  const out = await listProviders([slow("lemonsqueezy", 300), slow("toyyibpay", 300), slow("mock", 300, false)]);
  const ms = Date.now() - t0;
  assert.deepEqual(out.map((p) => p.id), ["lemonsqueezy", "toyyibpay"]);
  assert.ok(ms < 900, `took ${ms} ms (one after another would be about 1500 ms)`);
});
