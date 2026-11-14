import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The key lives ONLY in the server environment (Vercel env var ANTHROPIC_API_KEY_APP).
// Never import this file from a client component.
let _client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY_APP || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY_APP is not set");
    _client = new Anthropic({ apiKey, maxRetries: 3 });
  }
  return _client;
}

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// USD per 1M tokens (claude-opus-5-5). Only used for the per-case usage ledger.
const PRICE = { input: 4, output: 20, cacheRead: 0.2 };
export function costUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }) {
  return (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6;
}
