import { head, BlobNotFoundError } from "@vercel/blob";
import { runPool } from "@/lib/pool";

// S-U4: the size of an uploaded file as the file store has it. The browser sends a size with each file of a case, and a
// hand-made request can say 1 KB for a file of 500 MB, so every size limit is checked against what is really stored.

const AT_ONCE = 24; // files asked about at the same time (a case holds 300 at most)
const ASK_MS = 20_000; // one question to the store, with its own retries

/** The stored size of one file in bytes, or null when the store has no such file. Throws when the store cannot be asked. */
export type SizeOf = (url: string) => Promise<number | null>;
const storedSize: SizeOf = async (url) => {
  // Our own stop, not AbortSignal.timeout(): that one ends with a "TimeoutError", which the store's client takes for a
  // network slip and tries again ten times (many minutes). An abort it gives up on at once.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ASK_MS);
  try { return (await head(url, { abortSignal: stop.signal })).size; }
  catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
  finally { clearTimeout(timer); }
};

/**
 * The same files, each with the size the store holds for it in place of the one the browser sent. null when a file is not
 * in the store or is empty (an empty file is no case file). Call it only with URLs already checked to be our own store
 * (blob-url.ts). One question per file, several at once; `sizeOf` is replaced in tests only.
 */
export async function withStoredSizes<T extends { url: string; size: number }>(files: T[], sizeOf: SizeOf = storedSize): Promise<T[] | null> {
  const asked = new Map<string, Promise<number | null>>(); // the same URL twice is asked once
  const out = new Array<T>(files.length);
  let gone = false;
  await runPool(files.length, AT_ONCE, async (i) => {
    const f = files[i];
    if (!asked.has(f.url)) asked.set(f.url, sizeOf(f.url));
    const size = await asked.get(f.url)!;
    if (size == null || !Number.isFinite(size) || size <= 0) { gone = true; return; }
    out[i] = { ...f, size };
  });
  return gone ? null : out;
}

/**
 * The whole stream in one buffer, or null as soon as it holds more than `max` bytes: the download stops there, so a file
 * larger than its limit is never pulled into memory, whatever size was written down for it.
 */
export async function readUpTo(stream: ReadableStream<Uint8Array>, max: number): Promise<Buffer | null> {
  const rd = stream.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > max) { await rd.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts, n);
}
