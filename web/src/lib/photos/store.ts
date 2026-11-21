import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put, del, head, BlobNotFoundError } from "@vercel/blob";

// Photos live in the private Vercel Blob store under `<org>/<case>/photos/…`. Only pathnames are kept in the database.
// Outside production, PHOTO_STORE_DIR swaps the store for a local folder (tests and local screenshots only).
const localDir = () => (process.env.NODE_ENV !== "production" && process.env.PHOTO_STORE_DIR) || null;
const localFile = (dir: string, p: string) => path.join(dir, p.replace(/[\\/]/g, "__"));

export type Opened = { body: ReadableStream<Uint8Array> | Uint8Array; contentType: string };

export async function openPhoto(p: string): Promise<Opened | null> {
  const dir = localDir();
  if (dir) {
    try { return { body: new Uint8Array(await fs.readFile(localFile(dir, p))), contentType: "image/jpeg" }; } catch { return null; }
  }
  const r = await get(p, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return { body: r.stream, contentType: r.blob.contentType || "image/jpeg" };
}

export async function photoBase64(p: string): Promise<string> {
  const o = await openPhoto(p);
  if (!o) throw new Error("photo not found");
  const buf = o.body instanceof Uint8Array ? Buffer.from(o.body) : Buffer.from(await new Response(o.body).arrayBuffer());
  return buf.toString("base64");
}

export async function photoExists(p: string): Promise<boolean> {
  const dir = localDir();
  if (dir) return fs.access(localFile(dir, p)).then(() => true, () => false);
  try { await head(p); return true; } catch (e) { if (e instanceof BlobNotFoundError) return false; throw e; }
}

/** Deleting a photo that is already gone is a success. */
export async function deletePhoto(p: string): Promise<void> {
  const dir = localDir();
  if (dir) { await fs.rm(localFile(dir, p), { force: true }); return; }
  try { await del(p); } catch (e) { if (!(e instanceof BlobNotFoundError)) throw e; }
}

/** Server-side write into the same store the desk reads (a local folder outside production when PHOTO_STORE_DIR is set). */
export async function savePhoto(p: string, bytes: Buffer, contentType: string): Promise<void> {
  const dir = localDir();
  if (dir) { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(localFile(dir, p), bytes); return; }
  await put(p, bytes, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}
