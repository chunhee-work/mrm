/** One allow-list for what a case upload may contain, shared by the browser drop zone and both upload routes (B05). No imports: safe in the browser. */
export const UPLOAD_EXT = /\.(zip|pdf|jpe?g|png|webp|heic)$/i;
export const UPLOAD_TYPES = ["application/zip", "application/x-zip-compressed", "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024; // what the reader can take in one call (the model request limit is 32 MB for all PDFs together)
export const MAX_FILES = 300;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

