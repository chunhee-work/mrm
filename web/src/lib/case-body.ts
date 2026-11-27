import { z } from "zod";
import { kindOf } from "@/lib/file-kind";
import { UPLOAD_EXT, UPLOAD_TYPES, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, MAX_PDF_BYTES } from "@/lib/upload-rules";

export { UPLOAD_EXT, UPLOAD_TYPES, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, MAX_PDF_BYTES };

export const CaseBody = z.object({
  workshop: z.number().int().min(1).max(3).optional(), // which of the account's workshops (1..3); none = workshop 1
  plate: z.string().trim().max(20).transform((s) => s.toUpperCase().replace(/\s+/g, "")).optional(),
  files: z.array(z.object({
    kind: z.enum(["bundle_zip", "pdf", "photo"]),
    url: z.string().url().max(1000),
    name: z.string().trim().min(1).max(300),
    size: z.number().int().positive().max(MAX_FILE_BYTES), // an empty file is refused (B06)
  })).min(1).max(MAX_FILES),
});

export type CaseBodyT = z.infer<typeof CaseBody>;

/** Why a body cannot be accepted for this organisation, or null. Files must sit under the org's own storage prefix and match their kind. */
export function bodyProblem(b: CaseBodyT, orgId: string): "prefix" | "kind" | "total" | "no_docs" | "pdf_big" | null {
  let total = 0;
  for (const f of b.files) {
    total += f.size;
    let path = "";
    try { path = decodeURIComponent(new URL(f.url).pathname); } catch { return "prefix"; }
    if (!path.startsWith(`/${orgId}/`) || path.includes("..")) return "prefix";
    if (!UPLOAD_EXT.test(f.name) || kindOf(f) !== f.kind) return "kind";
    if (f.kind === "pdf" && f.size > MAX_PDF_BYTES) return "pdf_big";
  }
  if (total > MAX_TOTAL_BYTES) return "total";
  if (!b.files.some((f) => f.kind === "pdf" || f.kind === "bundle_zip")) return "no_docs";
  return null;
}
