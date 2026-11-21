"use client";
import { unzip } from "fflate";
import { uploadPhotos, type UploadReport } from "./upload";

// Photos of the case upload (plan: owner 2026-11-22, QC B01/B02). The case upload keeps loose photos and zip bundles as case files;
// the desk takes the photos out of them once, in the browser (the store is private, so the file comes through a checked route),
// and registers them through the normal photo upload, so thumbnails, duplicate check and limits are the same as for photos added by hand.

export type ImportFile = { id: number; name: string; kind: string; size: number };
const IMAGE = /\.(jpe?g|png|webp)$/i;
const HEIC = /\.(heic|heif)$/i;
const TYPE: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const typeOf = (name: string) => TYPE[(name.split(".").pop() ?? "").toLowerCase()] ?? "image/jpeg";
const base = (path: string) => path.split("/").pop() || path;

/** Image entries of a zip, in the order the folder lists them (natural order: IMG_2 before IMG_10). Folders, hidden and macOS resource files are skipped. */
export function unzipImages(buf: Uint8Array): Promise<{ files: File[]; heic: number }> {
  return new Promise((resolve, reject) => {
    let heic = 0;
    unzip(buf, {
      filter: (f) => {
        if (/(^|\/)(__MACOSX|\.)/.test(f.name) || f.name.endsWith("/")) return false;
        if (HEIC.test(f.name)) { heic++; return false; }
        return IMAGE.test(f.name);
      },
    }, (err, out) => {
      if (err) return reject(err);
      const names = Object.keys(out).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      resolve({ files: names.map((n) => new File([out[n] as BlobPart], base(n), { type: typeOf(n) })), heic });
    });
  });
}

async function bytesOf(caseId: string, f: ImportFile): Promise<Uint8Array> {
  const r = await fetch(`/api/cases/${caseId}/photos/import/${f.id}`, { cache: "no-store" });
  if (!r.ok) throw new Error("download");
  return new Uint8Array(await r.arrayBuffer());
}

export type ImportReport = UploadReport & { heic: number; filesDone: number; filesFailed: number };

/** One file at a time. A file is marked imported only when none of its photos failed, so a half-finished import is tried again next time. */
export async function importCaseFiles(
  caseId: string, orgId: string, list: ImportFile[], onProgress: (done: number, total: number) => void,
): Promise<ImportReport> {
  const rep: ImportReport = { added: [], duplicates: [], failed: [], unchecked: 0, heic: 0, filesDone: 0, filesFailed: 0 };
  for (const f of list) {
    try {
      let files: File[];
      if (f.kind === "bundle_zip") {
        const z = await unzipImages(await bytesOf(caseId, f));
        files = z.files; rep.heic += z.heic;
      } else if (HEIC.test(f.name)) { rep.heic++; files = []; }
      else files = [new File([await bytesOf(caseId, f) as BlobPart], f.name, { type: typeOf(f.name) })];
      if (files.length) {
        const r = await uploadPhotos(caseId, orgId, files, onProgress);
        rep.added.push(...r.added); rep.duplicates.push(...r.duplicates); rep.failed.push(...r.failed); rep.unchecked += r.unchecked;
        if (r.failed.length) { rep.filesFailed++; continue; }
      }
      const done = await fetch(`/api/cases/${caseId}/photos/import/${f.id}`, { method: "POST" });
      if (done.ok) rep.filesDone++; else rep.filesFailed++;
    } catch {
      rep.filesFailed++;
    }
  }
  return rep;
}
