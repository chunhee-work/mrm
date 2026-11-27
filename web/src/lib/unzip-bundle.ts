import { unzipSync } from "fflate";
import { ZIP_WHY } from "@/lib/case-text"; // the same words userFixable looks for
import { MAX_VEHICLES, normPlate, platesAnywhere, vehicleFolders, vehicleLayout } from "@/lib/peek-files";
import { MAX_PDF_BYTES } from "@/lib/upload-rules";

/** Limits for opening a customer's zip. A zip is untrusted input: count, size and ratio are all capped (zip-bomb guard). */
export const ZIP_LIMITS = {
  maxEntries: 300,
  maxEntryBytes: 60 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxRatio: 200, // uncompressed / compressed, whole archive
};

export type BundleEntry = { name: string; kind: "pdf" | "photo"; bytes: Uint8Array; type: string };
export class ZipRejected extends Error {
  constructor(public code: "corrupt" | "multi" | "too_many" | "too_many_files" | "too_many_cars" | "car_big" | "dup_plate" | "layout" | "mixed" | "car_no_pdf" | "too_big" | "pdf_big" | "bomb" | "empty", message: string) { super(message); this.name = "ZipRejected"; }
}

const PHOTO = /\.(jpe?g|png|webp|heic)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** Reads the PDFs and photos inside a zip. Folders, hidden files and folders (__MACOSX, .DS_Store, .thumbnails/), empty files and other types are skipped. Throws ZipRejected. */
export function unzipBundle(buf: Uint8Array, limits = ZIP_LIMITS): BundleEntry[] {
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    // first look at the names only (nothing is inflated): a zip of several vehicles is one case per vehicle, not one case
    const names: string[] = [];
    unzipSync(buf, { filter: (f) => { names.push(f.name); return false; } });
    if (vehicleFolders(names).length > 1) throw new ZipRejected("multi", ZIP_WHY.multi);
    if (platesAnywhere(names) > 1) throw new ZipRejected("layout", ZIP_WHY.layout); // cars at different levels: never one case
    files = unzipSync(buf, {
      filter: (f) => {
        const leaf = f.name.split("/").pop() ?? "";
        if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || f.name.split("/").some((p) => p.startsWith("."))) return false;
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

/**
 * Limits for a zip of several vehicles: each vehicle is held to the single-zip entry limit, the whole archive gets more room, and a
 * PDF must fit what the reader takes in one call (a bigger one would only fail later, as the customer's fault, after the charge).
 * One car opened is at most what a single-car zip may hold (250 MB): the split holds the zip and one opened car in memory at once.
 * At most 2000 files in all (SINAR.zip has 1227): every file is stored one by one within the call's 300 seconds.
 */
export const SPLIT_LIMITS = { ...ZIP_LIMITS, maxTotalBytes: 600 * 1024 * 1024, maxPdfBytes: MAX_PDF_BYTES, maxCarBytes: ZIP_LIMITS.maxTotalBytes, maxFiles: 2000 };
export { MAX_VEHICLES };

export type VehiclePlan = { prefix: string; plate: string; files: number };
const usableIn = (name: string) => {
  const leaf = name.split("/").pop() ?? "";
  return !name.endsWith("/") && !name.startsWith("__MACOSX/") && !name.split("/").some((p) => p.startsWith(".")) && (/\.pdf$/i.test(leaf) || PHOTO.test(leaf)); // hidden folders too
};

/**
 * The vehicles of a zip of several cars (plate-named folders, each with its own PDF), read from the file list only: nothing is
 * inflated. All limits are checked here from the sizes the zip declares, so the split can refuse before it stores anything.
 * Counts and sizes are over the usable, non-empty files inside car folders. Nothing is left out: any other folder or loose file a
 * case would take ("mixed"), refuses the zip; so does a car folder whose PDFs are all empty ("car_no_pdf").
 * Throws ZipRejected; "empty" when it is not a multi-vehicle zip.
 */
export function planVehicles(buf: Uint8Array, limits: typeof ZIP_LIMITS & { maxPdfBytes?: number; maxCarBytes?: number; maxFiles?: number } = SPLIT_LIMITS): VehiclePlan[] {
  const all: { name: string; size: number; stored: number; method: number }[] = [];
  try { unzipSync(buf, { filter: (f) => { all.push({ name: f.name, size: f.originalSize, stored: f.size, method: f.compression }); return false; } }); }
  catch { throw new ZipRejected("corrupt", ZIP_WHY.corrupt); }
  if (anyEncrypted(buf)) throw new ZipRejected("corrupt", ZIP_WHY.corrupt); // a password zip never opens here: refused before anything is made
  // the same names-only layout the browser saw; an empty loose file is not an extra, a car whose PDFs are all empty is refused below
  const { cars: prefixes, extras: named } = vehicleLayout(all.map((f) => f.name));
  const nonEmpty = new Set(all.filter((f) => f.size > 0).map((f) => f.name));
  const extras = named.filter((x) => !x.endsWith("/") ? nonEmpty.has(x) : all.some((f) => f.size > 0 && f.name.startsWith(x) && usableIn(f.name)));
  if (prefixes.length < 2) {
    if (platesAnywhere(all.map((f) => f.name)) > 1) throw new ZipRejected("layout", ZIP_WHY.layout);
    throw new ZipRejected("empty", ZIP_WHY.empty);
  }
  if (prefixes.length > MAX_VEHICLES) throw new ZipRejected("too_many_cars", ZIP_WHY.too_many_cars);
  if (extras.length) throw new ZipRejected("mixed", ZIP_WHY.mixed); // a split would leave these files out of every case
  if (new Set(prefixes.map((p) => normPlate(p.slice(0, -1).split("/").pop() ?? ""))).size < prefixes.length) throw new ZipRejected("dup_plate", ZIP_WHY.dup_plate); // the user puts that car into one folder
  const counts = new Map<string, number>();
  const carBytes = new Map<string, number>();
  let total = 0;
  let files = 0;
  for (const f of all) {
    const pre = prefixes.find((p) => f.name.startsWith(p));
    if (!pre || !usableIn(f.name)) continue;
    // a stored entry opens as its stored bytes, whatever size it declares: the sizes must agree, or every limit below means nothing
    if (f.method === 0 && f.stored !== f.size) throw new ZipRejected("corrupt", ZIP_WHY.corrupt);
    if (f.size === 0) continue;
    // only stored (0) and deflate (8) entries open here: refuse others now, before a car is made, not halfway through the split
    if (f.method !== 0 && f.method !== 8) throw new ZipRejected("corrupt", ZIP_WHY.corrupt);
    const n = (counts.get(pre) ?? 0) + 1; counts.set(pre, n);
    if (limits.maxFiles && ++files > limits.maxFiles) throw new ZipRejected("too_many_files", ZIP_WHY.too_many_files);
    const pdf = /\.pdf$/i.test(f.name);
    if (n > limits.maxEntries) throw new ZipRejected("too_many", ZIP_WHY.too_many);
    if (f.size > limits.maxEntryBytes) throw new ZipRejected("too_big", ZIP_WHY.entry_big);
    if (pdf && limits.maxPdfBytes && f.size > limits.maxPdfBytes) throw new ZipRejected("pdf_big", ZIP_WHY.pdf_big);
    total += f.size;
    const car = (carBytes.get(pre) ?? 0) + f.size; carBytes.set(pre, car);
    if (total > limits.maxTotalBytes) throw new ZipRejected("too_big", ZIP_WHY.too_big);
    if (limits.maxCarBytes && car > limits.maxCarBytes) throw new ZipRejected("car_big", ZIP_WHY.car_big);
    if (buf.length > 0 && total / buf.length > limits.maxRatio) throw new ZipRejected("bomb", ZIP_WHY.bomb);
  }
  for (const p of prefixes) if (!all.some((f) => f.size > 0 && f.name.startsWith(p) && /\.pdf$/i.test(f.name) && usableIn(f.name))) throw new ZipRejected("car_no_pdf", ZIP_WHY.car_no_pdf);
  return prefixes.map((prefix) => ({ prefix, plate: prefix.slice(0, -1).split("/").pop() as string, files: counts.get(prefix) ?? 0 }));
}

/** Does any entry of the zip's central directory carry the "encrypted" flag (bit 0)? fflate does not check it. */
function anyEncrypted(buf: Uint8Array): boolean {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return false; // unzipSync already read this zip; a zip64 end record is not looked into (accepted)
  const off = v.getUint32(e + 16, true);
  if (off === 0xffffffff) return false;
  for (let p = off; p + 46 <= buf.length && v.getUint32(p, true) === 0x02014b50;) {
    if (v.getUint16(p + 8, true) & 1) return true;
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return false;
}

/** The PDFs and photos of ONE vehicle folder of a planned zip (only that folder is inflated, so memory follows one car). */
export function unzipVehicle(buf: Uint8Array, prefix: string): BundleEntry[] {
  let files: Record<string, Uint8Array>;
  // only what planVehicles counted: non-empty entries, stored ones with matching sizes (deflate output is capped at the declared size)
  try { files = unzipSync(buf, { filter: (f) => f.name.startsWith(prefix) && usableIn(f.name) && f.originalSize > 0 && (f.compression !== 0 || f.size === f.originalSize) }); }
  catch { throw new ZipRejected("corrupt", ZIP_WHY.corrupt); }
  const out: BundleEntry[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (!bytes.length) continue;
    const leaf = name.split("/").pop() as string;
    out.push(/\.pdf$/i.test(leaf) ? { name: leaf, kind: "pdf", bytes, type: "application/pdf" } : { name: leaf, kind: "photo", bytes, type: TYPES[leaf.split(".").pop()!.toLowerCase()] ?? "image/jpeg" });
  }
  return out;
}
