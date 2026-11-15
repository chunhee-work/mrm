import "server-only";
import { photoModelConfig as cfg } from "./config";
import { canonicalGet, canonicalPost, sha256Hex, sign } from "./sign";
import type { ModelResult } from "./rules";

// The only code that talks to the Hugging Face Space. Photo bytes and vehicle text never reach a log or an error message.
const base = () => (process.env.PHOTO_MODEL_URL ?? "").replace(/\/+$/, "");
// A private Hugging Face Space also wants a bearer token; a self-hosted service (Oracle VM) does not.
const bearer = (): Record<string, string> => (process.env.HF_SPACE_TOKEN ? { Authorization: `Bearer ${process.env.HF_SPACE_TOKEN}` } : {});
const headers = (canonical: string, ts: string) => ({
  ...bearer(),
  "X-Photo-Ts": ts,
  "X-Photo-Sig": sign(process.env.PHOTO_MODEL_SECRET ?? "", canonical),
});
const now = () => String(Math.floor(Date.now() / 1000));

export async function health(): Promise<{ ok: boolean; waiting: number } | null> {
  try {
    const r = await fetch(`${base()}/health`, { headers: bearer(), signal: AbortSignal.timeout(cfg.healthTimeoutMs), cache: "no-store" });
    if (!r.ok) return null;
    const b = (await r.json()) as { ok?: boolean; waiting?: number };
    return b.ok ? { ok: true, waiting: Number(b.waiting ?? 0) } : null;
  } catch { return null; }
}

export type SubmitResult = "accepted" | "busy" | "unreachable" | "rejected";
export async function submit(a: { caseId: string; jobId: string; orderHash: string; vehicle: string; photos: { bytes: Buffer; type: string }[] }): Promise<SubmitResult> {
  const ts = now();
  const canon = canonicalPost(ts, a.caseId, a.jobId, a.orderHash, a.vehicle, a.photos.map((p) => sha256Hex(p.bytes)));
  const form = new FormData();
  form.set("meta", JSON.stringify({ case_id: a.caseId, job_id: a.jobId, order_hash: a.orderHash, vehicle: a.vehicle }));
  a.photos.forEach((p, i) => form.append("photos", new Blob([new Uint8Array(p.bytes)], { type: p.type }), `${String(i).padStart(3, "0")}`));
  try {
    const r = await fetch(`${base()}/jobs`, { method: "POST", headers: headers(canon, ts), body: form, signal: AbortSignal.timeout(cfg.submitTimeoutMs), cache: "no-store" });
    if (r.status === 202 || r.status === 200) return "accepted";
    if (r.status === 429) return "busy";
    if (r.status >= 500) return "unreachable";
    return "rejected";
  } catch { return "unreachable"; }
}

export type Status =
  | { kind: "queued" | "running" }
  | { kind: "done"; results: ModelResult[] }
  | { kind: "failed"; error: string }
  | { kind: "unknown" } // the Space does not know the job (it restarted)
  | { kind: "unreachable" };
export async function status(jobId: string): Promise<Status> {
  const ts = now();
  try {
    const r = await fetch(`${base()}/jobs/${jobId}`, { headers: headers(canonicalGet(ts, jobId), ts), signal: AbortSignal.timeout(cfg.statusTimeoutMs), cache: "no-store" });
    if (r.status === 404) return { kind: "unknown" };
    if (!r.ok) return { kind: "unreachable" };
    const b = (await r.json()) as { status?: string; error?: string; results?: ModelResult[] };
    if (b.status === "done" && Array.isArray(b.results)) return { kind: "done", results: b.results };
    if (b.status === "failed") return { kind: "failed", error: String(b.error ?? "failed").slice(0, 200) };
    return { kind: b.status === "queued" ? "queued" : "running" };
  } catch { return { kind: "unreachable" }; }
}
