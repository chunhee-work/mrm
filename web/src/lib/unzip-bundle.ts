import { unzipSync } from "fflate";
import { ZIP_WHY } from "@/lib/case-text";
import { vehicleFolders, vehiclePrefixes } from "@/lib/peek-files"; // the same words userFixable looks for

/** Limits for opening a customer's zip. A zip is untrusted input: count, size and ratio are all capped (zip-bomb guard). */
export const ZIP_LIMITS = {
  maxEntries: 300,
  maxEntryBytes: 60 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxRatio: 200, // uncompressed / compressed, whole archive
};

export type BundleEntry = { name: string; kind: "pdf" | "photo"; bytes: Uint8Array; type: string };
export class ZipRejected extends Error {
  constructor(public code: "corrupt" | "multi" | "too_many" | "too_big" | "bomb" | "empty", message: string) { super(message); this.name = "ZipRejected"; }
}

const PHOTO = /\.(jpe?g|png|webp|heic)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** Reads the PDFs and photos inside a zip. Folders, hidden files (__MACOSX, .DS_Store), empty files and other types are skipped. Throws ZipRejected. */
export function unzipBundle(buf: Uint8Array, limits = ZIP_LIMITS): BundleEntry[] {
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    // first look at the names only (nothing is inflated): a zip of several vehicles is one case per vehicle, not one case
    const names: string[] = [];
    unzipSync(buf, { filter: (f) => { names.push(f.name); return false; } });
    if (vehicleFolders(names).length > 1) throw new ZipRejected("multi", ZIP_WHY.multi);
    files = unzipSync(buf, {
      filter: (f) => {
        const leaf = f.name.split("/").pop() ?? "";
        if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || leaf.startsWith(".") || leaf.startsWith("._")) return false;
        if (!/\.pdf$/i.test(leaf) && !PHOTO.test(leaf)) return false;
        if (++count > limits.maxEntries) throw new ZipRejected("too_many", ZIP_WHY.too_many);
        if (f.originalSize > limits.maxEntryBytes) throw new ZipRejected("too_big", ZIP_WHY.entry_big);
        total += f.originalSize;
        if (total > limits.maxTotalBytes) throw new ZipRejected("too_big", ZIP_WHY.too_big);
        if (buf.length > 0 && total / buf.length > limits.maxRatio) throw new ZipRejected("bomb", ZIP_WHY.bomb);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ZipRejected) throw e;
    throw new ZipRejected("corrupt", ZIP_WHY.corrupt);
  }
  const out: BundleEntry[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (!bytes.length) continue;
    const leaf = name.split("/").pop() as string;
    if (/\.pdf$/i.test(leaf)) out.push({ name: leaf, kind: "pdf", bytes, type: "application/pdf" });
    else out.push({ name: leaf, kind: "photo", bytes, type: TYPES[leaf.split(".").pop()!.toLowerCase()] ?? "image/jpeg" });
  }
  if (!out.length) throw new ZipRejected("empty", ZIP_WHY.empty);
  return out;
}

/** Limits for a zip of several vehicles: each vehicle is held to the single-zip entry limit, the whole archive gets more room. */
export const SPLIT_LIMITS = { ...ZIP_LIMITS, maxTotalBytes: 600 * 1024 * 1024 };
export const MAX_VEHICLES = 30;

/**
 * A zip of several vehicles (one folder each, each with its own PDF): the PDFs and photos of every folder, keyed by the folder name
 * (the plate). Same rules as unzipBundle for hidden files, sizes and the zip-bomb ratio; the entry limit applies per vehicle.
 * Throws ZipRejected; "empty" when it is not a multi-vehicle zip.
 */
export function unzipVehicles(buf: Uint8Array, limits = SPLIT_LIMITS): Map<string, BundleEntry[]> {
  let prefixes: string[];
  const counts = new Map<string, number>();
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    const names: string[] = [];
    unzipSync(buf, { filter: (f) => { names.push(f.name); return false; } });
    prefixes = vehiclePrefixes(names);
    if (prefixes.length < 2) throw new ZipRejected("empty", ZIP_WHY.empty);
    if (prefixes.length > MAX_VEHICLES) throw new ZipRejected("too_many", ZIP_WHY.too_many);
    files = unzipSync(buf, {
      filter: (f) => {
        const leaf = f.name.split("/").pop() ?? "";
        const pre = prefixes.find((p) => f.name.startsWith(p));
        if (!pre || f.name.endsWith("/") || leaf.startsWith(".") || (!/\.pdf$/i.test(leaf) && !PHOTO.test(leaf))) return false;
        const n = (counts.get(pre) ?? 0) + 1; counts.set(pre, n);
        if (n > limits.maxEntries) throw new ZipRejected("too_many", ZIP_WHY.too_many);
        if (f.originalSize > limits.maxEntryBytes) throw new ZipRejected("too_big", ZIP_WHY.entry_big);
        total += f.originalSize;
        if (total > limits.maxTotalBytes) throw new ZipRejected("too_big", ZIP_WHY.too_big);
        if (buf.length > 0 && total / buf.length > limits.maxRatio) throw new ZipRejected("bomb", ZIP_WHY.bomb);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ZipRejected) throw e;
    throw new ZipRejected("corrupt", ZIP_WHY.corrupt);
  }
  const out = new Map<string, BundleEntry[]>();
  for (const [name, bytes] of Object.entries(files)) {
    if (!bytes.length) continue;
    const pre = prefixes.find((p) => name.startsWith(p)) as string;
    const plate = pre.slice(0, -1).split("/").pop() as string;
    const leaf = name.split("/").pop() as string;
    const list = out.get(plate) ?? [];
    list.push(/\.pdf$/i.test(leaf) ? { name: leaf, kind: "pdf", bytes, type: "application/pdf" } : { name: leaf, kind: "photo", bytes, type: TYPES[leaf.split(".").pop()!.toLowerCase()] ?? "image/jpeg" });
    out.set(plate, list);
  }
  for (const [k, v] of out) if (!v.some((e) => e.kind === "pdf")) out.delete(k);
  if (out.size < 2) throw new ZipRejected("empty", ZIP_WHY.empty);
  return out;
}
