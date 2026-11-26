import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { badFileNames } from "@/lib/case-text";

/**
 * R2-B02: "Replace files" must replace. Takes out of the case the file(s) the last read could not open (the stored blob stays),
 * so the next read starts from the good files plus what was just sent. Only a failed case with a `bad_file:` reason is touched.
 * Returns how many case-file rows were removed.
 */
export async function dropBadFiles(caseId: string, status: string, error: string | null): Promise<number> {
  const bad = status === "failed" ? badFileNames(error) : [];
  // Only one named file is a known bad file. Several names (old rows) were a guess over every PDF of the case: removing them
  // would take the good files out too, so nothing is removed.
  if (bad.length !== 1) return 0;
  const gone = await db.delete(schema.caseFiles).where(and(eq(schema.caseFiles.caseId, caseId), inArray(schema.caseFiles.originalName, bad))).returning({ id: schema.caseFiles.id });
  return gone.length;
}
