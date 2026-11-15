/** What an uploaded case file is, told from its name: the zip bundle, a PDF document, or a photo. */
export type FileKind = "bundle_zip" | "pdf" | "photo";
export function kindOf(f: { name: string }): FileKind {
  if (/\.zip$/i.test(f.name)) return "bundle_zip";
  if (/\.pdf$/i.test(f.name)) return "pdf";
  return "photo";
}
