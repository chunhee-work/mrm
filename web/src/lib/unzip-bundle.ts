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

// S-U10: the most entries of any kind (folders and files we skip count too) a zip's file list may hold. A split takes 2000
// usable files and a Mac adds a hidden twin for each, plus the folders; this leaves room well above that.
export const MAX_LISTED = 20_000;

export type BundleEntry = { name: string; kind: "pdf" | "photo"; bytes: Uint8Array; type: string };
export class ZipRejected extends Error {
  constructor(public code: "corrupt" | "multi" | "too_many" | "too_many_files" | "too_many_cars" | "car_big" | "dup_plate" | "layout" | "mixed" | "car_no_pdf" | "name_long" | "too_big" | "pdf_big" | "bomb" | "empty", message: string) { super(message); this.name = "ZipRejected"; }
}

const PHOTO = /\.(jpe?g|png|webp|heic)$/i;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/**
 * S-U10: how many entries the zip's file list says it holds, and whether that many can be there at all. The unzipper trusts
 * that number and walks the list that many times, so a zip of 200 bytes that claims millions of entries (the zip64 count
 * takes any number) kept the server busy for the whole call and, in a split, used up its memory. Read the same way the
 * unzipper reads it; a zip it cannot find the list of is left for it to refuse.
 */
export function checkListed(buf: Uint8Array, tooMany: "too_many" | "too_many_files" = "too_many"): void {
  const u16 = (i: number) => (i >= 0 && i + 2 <= buf.length ? buf[i] | (buf[i + 1] << 8) : 0);
  const u32 = (i: number) => (i >= 0 && i + 4 <= buf.length ? (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0 : 0);
  let e = buf.length - 22;
  for (; e >= 0 && u32(e) !== 0x06054b50; e--) if (buf.length - e > 65558) return; // no end record: not a zip
  if (e < 0) return;
  let count = u16(e + 8);
  let at = u32(e + 16);
  if (u32(e - 20) === 0x07064b50) { // zip64: the real numbers are in their own record
    const z = u32(e - 12);
    if (u32(z) === 0x06064b50) { count = u32(z + 32); at = u32(z + 48); }
  }
  if (count > MAX_LISTED) throw new ZipRejected(tooMany, ZIP_WHY[tooMany]);
  if (at + count * 46 > buf.length) throw new ZipRejected("corrupt", ZIP_WHY.corrupt); // one list entry is at least 46 bytes
}

/** Reads the PDFs and photos inside a zip. Folders, hidden files and folders (__MACOSX, .DS_Store, .thumbnails/), empty files and other types are skipped. Throws ZipRejected. */
export function unzipBundle(buf: Uint8Array, limits = ZIP_LIMITS): BundleEntry[] {
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  checkListed(buf);
  try {
    // first look at the names only (nothing is inflated): a zip of several vehicles is one case per vehicle, not one case
    const names: string[] = [];
    // empty entries are skipped below anyway; a stored entry that holds bytes counts whatever size it declares (as in planVehicles)
    unzipSync(buf, { filter: (f) => { if (f.originalSize > 0 || (f.compression === 0 && f.size > 0)) names.push(f.name); return false; } });
    if (vehicleFolders(names).length > 1) throw new ZipRejected("multi", ZIP_WHY.multi);
    if (platesAnywhere(names) > 1) throw new ZipRejected("layout", ZIP_WHY.layout); // cars at different levels: never one case
    files = unzipSync(buf, {
      filter: (f) => {
        const leaf = f.name.split("/").pop() ?? "";
        if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || f.name.split("/").some((p) => p.startsWith("."))) return false;
        if (!/\.pdf$/i.test(leaf) && !PHOTO.test(leaf)) return false;
        if (f.originalSize === 0 && !(f.compression === 0 && f.size > 0)) return false; // an empty file is no case file and does not count
        if (++count > limits.maxEntries) throw new ZipRejected("too_many", ZIP_WHY.too_many);
        // a stored entry opens as its stored bytes, whatever size it declares: the larger of the two counts toward the limits
        const sz = f.compression === 0 ? Math.max(f.size, f.originalSize) : f.originalSize;
        if (sz > limits.maxEntryBytes) throw new ZipRejected("too_big", ZIP_WHY.entry_big);
        total += sz;
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
  checkListed(buf, "too_many_files");
  const all: { name: string; size: number; stored: number; method: number; locked?: boolean }[] = [];
  try { unzipSync(buf, { filter: (f) => { all.push({ name: f.name, size: f.originalSize, stored: f.size, method: f.compression }); return false; } }); }
  catch { throw new ZipRejected("corrupt", ZIP_WHY.corrupt); }
  // a password-protected car file never opens here: refused below, before anything is made. Matched by position (the filter sees
  // the entries in central-directory order), not by name: fflate decodes a name as latin1 unless its UTF-8 flag is set
  const flags = encryptedFlags(buf);
  if (flags.length === all.length) all.forEach((f, i) => { f.locked = flags[i]; });
  // the same layout the browser saw: names of non-empty entries only (an empty file is never a case file, so it makes no car,
  // no extra and no plate folder); a car whose PDFs cannot be used is refused below
  // (a stored entry that holds bytes counts whatever size it declares: the size check below refuses it)
  const filled = all.filter((f) => f.size > 0 || (f.method === 0 && f.stored > 0)).map((f) => f.name);
  const { cars: prefixes, extras: named } = vehicleLayout(filled);
  // every extra is a non-empty usable file or a folder holding one (the layout saw only those), so none is ever silently left out
  const extras = named;
  if (prefixes.length < 2) {
    if (platesAnywhere(filled) > 1) throw new ZipRejected("layout", ZIP_WHY.layout);
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
    if (f.locked) throw new ZipRejected("corrupt", ZIP_WHY.corrupt);
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

/** Per central-directory entry, in order: does it carry the "encrypted" flag (bit 0)? fflate does not check it. */
function encryptedFlags(buf: Uint8Array): boolean[] {
  const out: boolean[] = [];
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return out; // unzipSync already read this zip; a zip64 end record is not looked into (accepted)
  const off = v.getUint32(e + 16, true);
  if (off === 0xffffffff) return out;
  for (let p = off; p + 46 <= buf.length && v.getUint32(p, true) === 0x02014b50;) {
    out.push((v.getUint16(p + 8, true) & 1) === 1);
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

/** The PDFs and photos of ONE vehicle folder of a planned zip (only that folder is inflated, so memory follows one car). */
export function unzipVehicle(buf: Uint8Array, prefix: string): BundleEntry[] {
  let files: Record<string, Uint8Array>;
  checkListed(buf, "too_many_files");
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

/** The names a car's files are stored under: a name seen before in the same car gets -2, -3 ... before its extension. */
export function storeNames(entries: Pick<BundleEntry, "name">[]): string[] {
  const seen = new Set<string>();
  return entries.map((e) => { let n = e.name; for (let k = 2; seen.has(n); k++) n = e.name.replace(/(\.[^.]+)?$/, `-${k}$1`); seen.add(n); return n; });
}
/** The blob store refuses a path longer than this; a split stores each file at `<org>/<case uuid>/<name>`. */
export const MAX_BLOB_PATH = 950;
