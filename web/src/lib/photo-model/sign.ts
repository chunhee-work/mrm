import { createHash, createHmac } from "node:crypto";

// Must stay identical to inference/photo-model/core.py (shared golden vectors in sign.test.ts).
export const sha256Hex = (data: Buffer | Uint8Array | string): string => createHash("sha256").update(data).digest("hex");

export function canonicalPost(ts: string, caseId: string, jobId: string, orderHash: string, vehicle: string, photoHashes: string[]): string {
  return ["POST", "/jobs", ts, caseId, jobId, orderHash, sha256Hex(Buffer.from(vehicle, "utf8")), photoHashes.join(",")].join("\n");
}
export const canonicalGet = (ts: string, jobId: string): string => ["GET", "/jobs/" + jobId, ts, jobId].join("\n");
export const sign = (secret: string, canonical: string): string => createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
