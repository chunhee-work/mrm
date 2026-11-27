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
    for (let p = 0; p + 46 <= buf.byteLength && u32(v, p) === 0x02014b50 && names.length < 20000;) {
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

/** Most cars one zip may be split into (the browser refuses more before uploading; the server checks again). */
export const MAX_VEHICLES = 30;

// Words people number or date folders with ("Doc1", "Car 2", "IMG 001", "Nov 3", "Mac 2026"): followed by digits only, not a plate.
// A real plate starting with one of these words (rare) is then not a car folder, and the zip stays one case.
const NUMBERED_WORD = new Set(["DOC", "PDF", "CAR", "SET", "IMG", "PIC", "PIX", "NO", "VOL", "DAY", "PG", "PT", "PHO", "VID", "REF", "INV", "FIG", "TAB", "RPT", "SCN", "ID"]);
const MONTH = new Set(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", // English
  "MAC", "MEI", "OGO", "OKT", "DIS"]); // Malay (the others are the same as in English)

/** A folder name that is a car plate: PLATE_LIKE, but not a numbering or date word followed by a short number or a year ("Doc1", "Nov 2026"). */
export function isPlate(name: string): boolean {
  const m = name.match(/^([A-Z]{1,3})[\s-]?(\d{1,4})[\s-]?([A-Z]{0,2})$/i);
  if (!m) return false;
  const [, letters, digits, tail] = m;
  const w = letters.toUpperCase();
  if (tail) return true;
  // "Doc1", "IMG 001", "Nov 3", "Mac 26", "Nov 2026" are numbering or dates; "JAN 1234" or "CAR 5678" (real Johor or other
  // plates) are not: only 1-2 digits, a leading zero, or (after a month) a year count as numbering
  const numbering = digits.length <= 2 || digits.startsWith("0") || (MONTH.has(w) && /^(19|20)\d\d$/.test(digits));
  if (numbering && (NUMBERED_WORD.has(w) || MONTH.has(w))) return false;
  return true;
}

/**
 * The layout of a zip of cars: `cars` are the top-level folders named like a car plate that each hold their own PDF
 * ("DCD4004/…pdf"); `extras` is everything else at that level that a case would take: other folders with PDFs or photos
 * ("Policy/", "Photos/", a plate folder with photos only) and loose PDFs or photos. Cars one level down, inside a wrapping
 * folder, count too; then whatever sits beside that folder is extra. Folders named by what they hold are never cars, so a one-car zip sorted into such folders stays one case.
 * A split never drops anything: a zip with two or more cars and any extra is refused, so the user moves those files first.
 * Names only: a car whose PDFs are all empty files is found later, by planVehicles, which sees the sizes.
 */
export function vehicleLayout(names: string[]): { cars: string[]; extras: string[] } {
  // only what a case takes counts: a readme.txt or a hidden folder (".x/") changes nothing
  const usable = names.filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/") && !n.split("/").some((p) => p.startsWith(".")) && /\.(pdf|jpe?g|png|webp|heic)$/i.test(n));
  const at = (depth: number) => {
    const g = new Map<string, boolean>();
    for (const n of usable) { const parts = n.split("/"); if (parts.length > depth + 1) { const k = parts.slice(0, depth + 1).join("/") + "/"; g.set(k, (g.get(k) ?? false) || /\.pdf$/i.test(n)); } }
    const cars = [...g].filter(([k, hasPdf]) => hasPdf && isPlate(k.slice(0, -1).split("/").pop() ?? "")).map(([k]) => k);
    // everything else a case would take, named by its folder at the car level (or the file itself when it is loose)
    const extras = new Set<string>();
    for (const n of usable) {
      if (cars.some((c) => n.startsWith(c))) continue;
      const parts = n.split("/");
      extras.add(parts.length > depth + 1 ? parts.slice(0, depth + 1).join("/") + "/" : n);
    }
    return { cars, extras: [...extras] };
  };
  // cars sit at the top, or one level down inside a wrapping folder (with anything else beside it counted as extra).
  // A level counts by its different plates: folders that all name one plate ("Policy/WA1234B/" and "Claim/WA1234B/", or "WA1234B"
  // and "WA 1234B") are one car sorted into folders and the zip stays one case. With two or more different plates the zip is
  // several cars even when one plate repeats; planVehicles then refuses it ("dup_plate"), it is never read as one case.
  const ok = (r: { cars: string[] }) => new Set(r.cars.map((c) => normPlate(c.slice(0, -1).split("/").pop() ?? ""))).size >= 2;
  // wrapping folders that hold everything ("SINAR/SINAR/…", common after re-zipping) are looked through first
  let base = 0;
  for (;;) {
    const seg = usable.map((n) => n.split("/")).filter((p) => p.length > base + 1).map((p) => p[base]);
    if (!usable.length || seg.length !== usable.length || new Set(seg).size !== 1 || isPlate(seg[0])) break;
    base++;
  }
  const top = at(base);
  if (ok(top)) return top;
  const inner = at(base + 1);
  return ok(inner) ? inner : { cars: top.cars.length >= 2 ? [] : top.cars, extras: top.extras };
}

/**
 * How many different plates name a folder that holds a PDF, at any depth. Two or more while vehicleLayout finds fewer than two
 * cars means car folders at different levels ("DCD4004/" beside "More/NCH5773/"): never one case, refused as "layout".
 */
export function platesAnywhere(names: string[]): number {
  const plates = new Set<string>();
  for (const n of names) {
    if (n.endsWith("/") || n.startsWith("__MACOSX/") || !/\.pdf$/i.test(n)) continue;
    const parts = n.split("/").slice(0, -1);
    if (parts.some((p) => p.startsWith("."))) continue;
    for (const p of parts) if (isPlate(p)) plates.add(normPlate(p));
  }
  return plates.size;
}

/** The plate a car folder's name stands for, as stored on its case: upper case, no spaces or hyphens ("TBD 8129" -> "TBD8129"). */
export const normPlate = (folder: string) => folder.toUpperCase().replace(/[\s-]+/g, "").slice(0, 20);

/** Path prefixes of the car folders ("DCD4004/" or "SINAR/DCD4004/"). */
export const vehiclePrefixes = (names: string[]): string[] => vehicleLayout(names).cars;

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
