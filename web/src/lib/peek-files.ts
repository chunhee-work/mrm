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
