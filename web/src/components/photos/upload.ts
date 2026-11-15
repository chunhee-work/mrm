"use client";
import { upload } from "@vercel/blob/client";
import { fileIdentity, fileProblem, type Photo } from "@/lib/photos/desk-rules";
import { MAX_BYTES, MAX_REGISTER, photoPath } from "@/lib/photos/rules";

// Photo intake in the browser (plan #9, M / AO): per file a ~900 px JPEG copy, then the original, straight to the private
// store; 3 files at a time; each upload retried twice; one registration per 40 files.

export type UploadReport = { added: Photo[]; duplicates: string[]; failed: { name: string; reason: string }[]; unchecked: number };
type Ready = { blobPath: string; thumbPath: string; name: string; size: number; hash: string | null };

async function thumbOf(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    if (!g) throw new Error("canvas");
    g.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.82));
  } finally { bmp.close(); }
}

class Refused extends Error { constructor(public reason: string) { super(reason); } }

async function put(caseId: string, path: string, body: Blob, type: string, hash: string | null): Promise<void> {
  let last: unknown = null;
  for (const wait of [0, 1000, 3000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      await upload(path, body, {
        access: "private", contentType: type, multipart: body.size > 20e6,
        handleUploadUrl: `/api/cases/${caseId}/photos/token`, clientPayload: JSON.stringify({ hash }),
        abortSignal: AbortSignal.timeout(120_000),
      });
      return;
    } catch (e) {
      last = e;
      const m = e instanceof Error ? e.message : "";
      if (/duplicate/.test(m)) throw new Refused("duplicate");
      if (/limit/.test(m)) throw new Refused("limit");
    }
  }
  throw last instanceof Error ? last : new Error("upload");
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function uploadPhotos(
  caseId: string, orgId: string, files: File[], onProgress: (done: number, total: number) => void,
): Promise<UploadReport> {
  const report: UploadReport = { added: [], duplicates: [], failed: [], unchecked: 0 };
  const ready: (Ready | null)[] = new Array(files.length).fill(null);
  let done = 0, next = 0;
  const digest = globalThis.crypto?.subtle ? (a: string, d: ArrayBuffer) => globalThis.crypto.subtle.digest(a, d) : null;
  const strays: string[] = [];

  async function one(i: number) {
    const f = files[i];
    const bad = fileProblem(f, MAX_BYTES);
    if (bad) { report.failed.push({ name: f.name, reason: bad }); return; }
    const ident = await fileIdentity(() => f.arrayBuffer(), digest, () => Math.random().toString(36).slice(2) + Date.now().toString(36));
    if (!ident.hash) report.unchecked++;
    const thumbPath = photoPath(orgId, caseId, ident.id, "s", f.name.replace(/\.[^.]+$/, "") + ".jpg");
    const blobPath = photoPath(orgId, caseId, ident.id, "f", f.name);
    let thumbUp = false;
    try {
      const thumb = await thumbOf(f);
      await put(caseId, thumbPath, thumb, "image/jpeg", ident.hash);
      thumbUp = true;
      await put(caseId, blobPath, f, f.type, ident.hash);
      ready[i] = { blobPath, thumbPath, name: f.name, size: f.size, hash: ident.hash };
    } catch (e) {
      if (e instanceof Refused && e.reason === "duplicate") report.duplicates.push(f.name);
      else report.failed.push({ name: f.name, reason: e instanceof Refused ? e.reason : "upload" });
      if (thumbUp) strays.push(thumbPath); // a file with one failed upload is not registered
    }
  }
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= files.length) return;
      await one(i);
      onProgress(++done, files.length);
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const list = ready.filter((r): r is Ready => r != null); // file order is kept
  for (let i = 0; i < list.length; i += MAX_REGISTER) {
    const chunk = list.slice(i, i + MAX_REGISTER);
    let r: Response | null = null;
    for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) r = await post(`/api/cases/${caseId}/photos`, { photos: chunk }).catch(() => null);
    if (r?.ok) {
      const b = (await r.json()) as { added: Photo[]; duplicates: string[]; rejected: string[] };
      report.added.push(...b.added);
      report.duplicates.push(...b.duplicates);
      for (const name of b.rejected) report.failed.push({ name, reason: "upload" });
    } else {
      const limit = r?.status === 400 && ((await r.json().catch(() => ({}))) as { error?: string }).error === "limit";
      for (const c of chunk) { report.failed.push({ name: c.name, reason: limit ? "limit" : "register" }); strays.push(c.blobPath, c.thumbPath); }
    }
  }
  for (let i = 0; i < strays.length; i += 80) await post(`/api/cases/${caseId}/photos/discard`, { paths: strays.slice(i, i + 80) }).catch(() => null);
  return report;
}
