import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { badFileNames, zipRejectedName } from "@/lib/case-text";

/**
 * R2-B02: "Replace files" must replace. Takes out of the case the file(s) the last read could not open (the stored blob stays),
 * so the next read starts from the good files plus what was just sent. Only a failed case with a `bad_file:` reason or a refused zip is touched.
 * Returns how many case-file rows were removed.
 */
export async function dropBadFiles(caseId: string, status: string, error: string | null): Promise<number> {
  if (status !== "failed") return 0;
  const bad = badFileNames(error);
  const rows = await db.select({ id: schema.caseFiles.id, kind: schema.caseFiles.kind, name: schema.caseFiles.originalName, url: schema.caseFiles.blobUrl })
    .from(schema.caseFiles).where(eq(schema.caseFiles.caseId, caseId));
  // One named file: that file. "bad_file:|…" = one of several PDFs and we could not tell which: the customer was asked to send
  // all the PDFs again, so every PDF goes. Several names (old rows) were a guess over every PDF: nothing is removed.
  // A refused zip (cannot be opened, too big, …) goes too, or the next read would open it again and fail the same way. A refused
  // zip never has opened files in the case, so a zip of the same name that does (an earlier, good "Archive.zip") stays.
  const unknown = /^bad_file:\|/.test(error ?? "");
  const zip = zipRejectedName(error);
  const unopened = (z: { id: number }) => !rows.some((r) => r.url.includes(`/unzipped-${z.id}/`));
  const zips = rows.filter((r) => r.kind === "bundle_zip" && r.name === zip && unopened(r));
  const out = unknown ? rows.filter((r) => r.kind === "pdf") : bad.length === 1 ? rows.filter((r) => r.name === bad[0]) : zips;
  if (!out.length) return 0;
  await db.delete(schema.caseFiles).where(and(eq(schema.caseFiles.caseId, caseId), inArray(schema.caseFiles.id, out.map((r) => r.id))));
  // A zip is opened again when none of its files is left in the case. One whose files were all taken out here must go too,
  // or the next read would unpack the same bad PDF again.
  const gone = new Set(out.map((r) => r.id));
  const left = rows.filter((r) => !gone.has(r.id));
  const emptied = rows.filter((z) => z.kind === "bundle_zip" && out.some((r) => r.url.includes(`/unzipped-${z.id}/`)) && !left.some((r) => r.url.includes(`/unzipped-${z.id}/`)));
  if (emptied.length) await db.delete(schema.caseFiles).where(inArray(schema.caseFiles.id, emptied.map((z) => z.id)));
  return out.length + emptied.length;
}
