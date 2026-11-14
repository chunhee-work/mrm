import test from "node:test";
import assert from "node:assert/strict";
import { PRICES, costOf, priceFor, tokensOf } from "./pricing";
import { MODEL } from "./claude";

test("default model has a price entry", () => assert.ok(priceFor(MODEL), `no PRICES entry for ${MODEL}`));

const p = PRICES["claude-opus-5-5"];
test("cost covers input, output, cache read and both cache-write tiers", () => {
  const c = costOf("claude-opus-5-5", { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6 });
  assert.equal(c, p.input + p.output + p.cacheRead + p.cacheWrite5m + p.cacheWrite1h);
});
test("dated model id uses the base price; unknown model is unpriced (null)", () => {
  assert.equal(costOf("claude-opus-5-5-20261101", { input: 1e6, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }), p.input);
  assert.equal(costOf("some-new-model", { input: 1, output: 1, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }), null);
});
test("tokensOf reads the 5m/1h split, else counts all cache creation as 5m", () => {
  assert.deepEqual(tokensOf({ input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation: { ephemeral_5m_input_tokens: 4, ephemeral_1h_input_tokens: 5 } }),
    { input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5 });
  assert.deepEqual(tokensOf({ input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 7 }), { input: 1, output: 2, cacheRead: 0, cacheWrite5m: 7, cacheWrite1h: 0 });
  assert.deepEqual(tokensOf(null), { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
});
