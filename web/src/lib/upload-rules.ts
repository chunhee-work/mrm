/** One allow-list for what a case upload may contain, shared by the browser drop zone and both upload routes (B05). No imports: safe in the browser. */
export const UPLOAD_EXT = /\.(zip|pdf|jpe?g|png|webp|heic)$/i;
export const UPLOAD_TYPES = ["application/zip", "application/x-zip-compressed", "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
// The one limit for a single PDF: the browser's file check, both case routes, the zip split and the reader all use it.
// A PDF travels to the model as base64 (4 bytes for every 3) and one request may weigh 32 MB, so 23 MB is the most that
// still fits with the instructions around it. At 25 MB a PDF of 24 MB was taken at upload and then could never be read.
export const MAX_PDF_BYTES = 23 * 1024 * 1024;
export const MAX_FILES = 300;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

