/** Looks inside chosen files in the browser before anything is uploaded (R2-B10). No imports: safe in the browser and in node tests. */

type Sliceable = { size: number; slice(a: number, b?: number): { arrayBuffer(): Promise<ArrayBuffer> } };

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

/**
 * The entry names of a zip, read from its central directory at the end of the file (a few KB, never the whole zip).
 * null when it cannot be told (not a zip, zip64, damaged): the server still checks it after the upload.
 */
export async function zipNames(file: Sliceable): Promise<string[] | null> {
  try {
    if (file.size < 22) return null;
    const tailLen = Math.min(file.size, 65557);
    const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
    if (e < 0) return null;
    const cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
    if (cdSize === 0xffffffff || cdOff === 0xffffffff || cdOff + cdSize > file.size || cdSize > 8 * 1024 * 1024) return null;
    const buf = await file.slice(cdOff, cdOff + cdSize).arrayBuffer();
    const v = new DataView(buf);
    const names: string[] = [];
    for (let p = 0; p + 46 <= buf.byteLength && u32(v, p) === 0x02014b50 && names.length < 5000;) {
      const n = u16(v, p + 28), x = u16(v, p + 30), c = u16(v, p + 32);
      names.push(new TextDecoder().decode(new Uint8Array(buf, p + 46, Math.min(n, buf.byteLength - p - 46))));
      p += 46 + n + x + c;
    }
    return names;
  } catch { return null; }
}

/** Does a zip hold at least one PDF? null = cannot tell. Photos-only zips are refused at once instead of creating a failed case. */
export async function zipHasPdf(file: Sliceable): Promise<boolean | null> {
  const names = await zipNames(file);
  if (!names) return null;
  return names.some((n) => /\.pdf$/i.test(n) && !/(^|\/)(__MACOSX\/|\._)/.test(n) && !n.endsWith("/"));
}

/** A Malaysian car plate as people name folders: "DCD4004", "QAT110", "TBD 8129", "WA1234B". Words like "Policy" or dates are not. */
export const PLATE_LIKE = /^[A-Z]{1,3}[\s-]?\d{1,4}[\s-]?[A-Z]{0,2}$/i;

<<<<<<< HEAD
/** Most cars one zip may be split into (the browser refuses more before uploading; the server checks again). */
export const MAX_VEHICLES = 30;

// Short words people number folders with ("Doc1", "Car 2", "Set 3", "Day 1"): with 1-2 digits and no letters after, not a plate.
const NUMBERED_WORD = new Set(["DOC", "PDF", "CAR", "SET", "IMG", "PIC", "PIX", "NO", "VOL", "DAY", "PG", "PT", "PHO", "VID", "REF", "INV", "FIG", "TAB", "RPT", "SCN", "ID"]);
const MONTH = new Set(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]);

/** A folder name that is a car plate: PLATE_LIKE, but not a numbered word ("Doc1", "Car 2") or a month and year ("Nov 2026"). */
export function isPlate(name: string): boolean {
  const m = name.match(/^([A-Z]{1,3})[\s-]?(\d{1,4})[\s-]?([A-Z]{0,2})$/i);
  if (!m) return false;
  const [, letters, digits, tail] = m;
  const w = letters.toUpperCase();
  if (NUMBERED_WORD.has(w) && digits.length <= 2 && !tail) return false;
  if (MONTH.has(w) && /^(19|20)\d\d$/.test(digits) && !tail) return false;
  return true;
}

/**
 * The vehicle folders of a zip: top-level folders named like a car plate that each hold their own PDF ("DCD4004/…pdf").
 * One folder wrapping everything is looked through. Folders named by what they hold ("Docs/", "Policy/", "Photos/") are
 * never vehicles, so a one-car zip sorted into such folders stays one case. Names only: a car whose PDFs are all empty files is
 * dropped later, by planVehicles, which sees the sizes.
=======
/**
 * The vehicle folders of a zip: top-level folders named like a car plate that each hold their own PDF ("DCD4004/…pdf").
 * One folder wrapping everything is looked through. Folders named by what they hold ("Docs/", "Policy/", "Photos/") are
 * never vehicles, so a one-car zip sorted into such folders stays one case.
>>>>>>> 08fd1e8daf96924340efb92064998943b3c66bd9
 */
export function vehiclePrefixes(names: string[]): string[] {
  const usable = names.filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/") && !(n.split("/").pop() ?? "").startsWith("."));
  const split = (depth: number) => {
    const g = new Map<string, boolean>();
    for (const n of usable) { const parts = n.split("/"); if (parts.length <= depth + 1) continue; const k = parts.slice(0, depth + 1).join("/") + "/"; g.set(k, (g.get(k) ?? false) || /\.pdf$/i.test(n)); }
    return g;
  };
  let g = split(0);
  if (g.size === 1) g = split(1); // everything sits in one wrapping folder
<<<<<<< HEAD
  return [...g].filter(([k, hasPdf]) => hasPdf && isPlate(k.slice(0, -1).split("/").pop() ?? "")).map(([k]) => k);
=======
  return [...g].filter(([k, hasPdf]) => hasPdf && PLATE_LIKE.test(k.slice(0, -1).split("/").pop() ?? "")).map(([k]) => k);
>>>>>>> 08fd1e8daf96924340efb92064998943b3c66bd9
}

/** Just the folder names (the plates) of vehiclePrefixes. */
export const vehicleFolders = (names: string[]): string[] => vehiclePrefixes(names).map((p) => p.slice(0, -1).split("/").pop() as string);

/** The first bytes of a file look like a picture we can take (jpeg, png, webp, heic)? A text file renamed .jpg does not. */
export function looksLikePhoto(head: Uint8Array): boolean {
  const is = (...b: number[]) => b.every((x, i) => head[i] === x);
  if (is(0xff, 0xd8, 0xff)) return true; // jpeg
  if (is(0x89, 0x50, 0x4e, 0x47)) return true; // png
  if (is(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return true; // webp
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return true; // heic/heif: "ftyp"
  return false;
}

export async function headOf(file: Sliceable, n = 16): Promise<Uint8Array> {
  try { return new Uint8Array(await file.slice(0, n).arrayBuffer()); } catch { return new Uint8Array(0); }
}
