// The size rule of the case-upload import route (pure, so it is unit-tested): a file with no recorded size, or over the cap, is refused with 413.
export const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
export const importSizeOk = (size: number | null | undefined) => typeof size === "number" && Number.isFinite(size) && size > 0 && size <= MAX_IMPORT_BYTES;
