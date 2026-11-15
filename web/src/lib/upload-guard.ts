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
 * Runs `run` under the stall watchdog. `run` gets the abort signal and a `touch()` to call on real progress.
 * When nothing has moved for `ms` the signal is aborted AND the returned promise rejects with UploadStalled on its own,
 * so the wait ends even if `run` ignores the abort (the storage client does not pass it to its token request).
 */
export async function guarded<T>(run: (signal: AbortSignal, touch: () => void) => Promise<T>, ms = STALL_MS): Promise<T> {
  const ac = new AbortController();
  let giveUp!: (e: Error) => void;
  const stall = new Promise<never>((_, reject) => { giveUp = reject; });
  const timer = stallTimer(ms, () => { ac.abort(); giveUp(new UploadStalled()); });
  const work = run(ac.signal, timer.touch);
  work.catch(() => {}); // a cancelled run may reject later; the race has already answered
  try {
    return await Promise.race([work, stall]);
  } finally {
    timer.stop();
  }
}

/** One file to private storage; UploadStalled if no new bytes go up for STALL_MS (instead of "Uploading 0%" forever). */
export function uploadGuarded(path: string, file: File, onPct: (pct: number) => void) {
  let last = -1;
  return guarded((signal, touch) => upload(path, file, {
    access: "private", handleUploadUrl: "/api/upload", multipart: file.size > 20e6, abortSignal: signal,
    onUploadProgress: (p) => {
      if (p.percentage > last) { last = p.percentage; touch(); } // only real progress resets the clock
      onPct(p.percentage);
    },
  }));
}
