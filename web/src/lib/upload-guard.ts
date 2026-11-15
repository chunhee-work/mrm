import { upload } from "@vercel/blob/client";

/** How long an upload may sit without moving before it is given up (the storage client would otherwise retry in silence for minutes). */
export const STALL_MS = 45_000;

export class UploadStalled extends Error {
  constructor() { super("upload stalled"); this.name = "UploadStalled"; }
}

/** Arms a timer that fires `onStall` unless `touch()` is called again within `ms`. Kept apart from the upload so it can be tested. */
export function stallTimer(ms: number, onStall: () => void) {
  let id: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(id); id = setTimeout(onStall, ms); };
  const stop = () => clearTimeout(id);
  touch();
  return { touch, stop };
}

/**
 * One file to private storage, with a watchdog: if no new bytes go up for STALL_MS the upload is cancelled and
 * UploadStalled is thrown, so the page can say so instead of showing "Uploading 0%" forever.
 */
export async function uploadGuarded(path: string, file: File, onPct: (pct: number) => void) {
  const ac = new AbortController();
  let last = -1;
  let giveUp!: (e: Error) => void;
  // raced against the upload, so the wait ends even if the storage client does not answer the abort
  const stall = new Promise<never>((_, reject) => { giveUp = reject; });
  const timer = stallTimer(STALL_MS, () => { ac.abort(); giveUp(new UploadStalled()); });
  const sending = upload(path, file, {
    access: "private", handleUploadUrl: "/api/upload", multipart: file.size > 20e6, abortSignal: ac.signal,
    onUploadProgress: (p) => {
      if (p.percentage > last) { last = p.percentage; timer.touch(); } // only real progress resets the clock
      onPct(p.percentage);
    },
  });
  sending.catch(() => {}); // a cancelled upload rejects later; the race below has already answered
  try {
    return await Promise.race([sending, stall]);
  } finally {
    timer.stop();
  }
}
