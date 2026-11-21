import { createHash } from "node:crypto";

// The version the adjuster pressed 完成 on. Server side only (node:crypto); the worker computes the same string in photo_sync.py.
/**
 * A fingerprint of everything the Merimen work depends on: the photos in order with the name each one carries, and the parts with no photo.
 * Phase B refuses to start when the stored fingerprint no longer matches (worker/autopilot_worker/photo_sync.py computes the same string).
 */
export function snapshotOf(photos: { id: number; name: string | null }[], extras: string[]): string {
  const lines = photos.map((p) => `${p.id}\t${p.name ?? ""}`).join("\n");
  const ex = extras.map((e) => e.toLowerCase()).sort().join("\n");
  return createHash("sha256").update(`${lines}\n--\n${ex}`).digest("hex");
}
