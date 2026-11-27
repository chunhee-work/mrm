import "server-only";
import { trackedJev, type JevCtx } from "./jev-ledger";

// TypeSafe "jev": text judgments only (condition, model variant, misc line, narrative).
// Owner's rule: jev never reads car damage images. This client refuses anything that looks like an image or an asset,
// and it never sends the header that would allow images. Key: env TYPESAFE_API_KEY (value never logged).
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

export class TypeSafeImageError extends Error {
  constructor() { super("typesafe: images and assets are not allowed"); this.name = "TypeSafeImageError"; }
}

const IMAGE_KEYS = /^(assets?|images?|image_url|imageurl|files?|attachments?|media|photos?)$/i;
const IMAGE_TEXT = /data:image\/|^\s*(\/9j\/|iVBORw0KGgo|UklGR|R0lGOD)|\.(jpe?g|png|webp|heic|gif|bmp|tiff?)(\?|#|$)/i;

/** Throws when any part of the request could carry an image: a key named like one, a data URL, base64 image bytes, an image file name or URL. */
export function assertTextOnly(v: unknown, depth = 0): void {
  if (depth > 12) throw new TypeSafeImageError();
  if (typeof v === "string") { if (IMAGE_TEXT.test(v) || v.length > 20_000) throw new TypeSafeImageError(); return; }
  if (v == null || typeof v === "number" || typeof v === "boolean") return;
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) throw new TypeSafeImageError();
  if (Array.isArray(v)) { for (const x of v) assertTextOnly(x, depth + 1); return; }
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (IMAGE_KEYS.test(k)) throw new TypeSafeImageError();
      assertTextOnly(x, depth + 1);
    }
    return;
  }
  throw new TypeSafeImageError();
}

// The live API wants questions as an object keyed by question id ({ ins: { type, instructions, criteria } }); an array gets HTTP 422.
export type JevRequest = { state: unknown; questions: Record<string, unknown> };

/** The exact request that would be sent. Exported so a test can prove it never carries an image or the image header. */
export function buildJevRequest(input: JevRequest, key: string): { url: string; init: RequestInit } {
  const extra = Object.keys(input as Record<string, unknown>).filter((k) => k !== "state" && k !== "questions");
  if (extra.length) throw new TypeSafeImageError();
  assertTextOnly(input.state);
  assertTextOnly(input.questions);
  return {
    url: ENDPOINT,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state: input.state, model: MODEL, questions: input.questions }),
    },
  };
}

/** Pass ctx ({ purpose, userId?, caseId? }) to log the call in the llm_calls ledger (shown on the Cost page). */
export async function askJev(input: JevRequest, ctx?: JevCtx): Promise<unknown> {
  return ctx ? trackedJev(ctx, () => callJev(input)) : callJev(input);
}

async function callJev(input: JevRequest): Promise<unknown> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");
  const { url, init } = buildJevRequest(input, key);
  let last = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok) return r.json();
    last = r?.status ?? 0;
    if (r && ![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
  throw new Error(`typesafe: request failed (${last || "network"})`);
}
