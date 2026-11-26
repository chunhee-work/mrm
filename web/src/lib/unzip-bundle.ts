import { unzipSync } from "fflate";
import { ZIP_WHY } from "@/lib/case-text"; // the same words userFixable looks for

/** Limits for opening a customer's zip. A zip is untrusted input: count, size and ratio are all capped (zip-bomb guard). */
export const ZIP_LIMITS = {
  maxEntries: 300,
  maxEntryBytes: 60 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxRatio: 200, // uncompressed / compressed, whole archive
};

export type BundleEntry = { name: string; kind: "pdf" | "photo"; bytes: Uint8Array; type: string };
export class ZipRejected extends Error {
  constructor(public code: "corrupt" | "too_many" | "too_big" | "bomb" | "empty", message: string) { super(message); this.name = "ZipRejected"; }
}

const PHOTO = /\.(jpe?g|png|webp|heic)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** Reads the PDFs and photos inside a zip. Folders, hidden files (__MACOSX, .DS_Store), empty files and other types are skipped. Throws ZipRejected. */
export function unzipBundle(buf: Uint8Array, limits = ZIP_LIMITS): BundleEntry[] {
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
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
