// "Read again" for one case that failed: the press, and what became of it. Used by the case page and by the open line on the
// first page, so both say the same thing.

export const START_MS = 20_000; // the server takes a press within a second or two: after this long with no answer it is asked what the case is doing
export const LOOK_MS = 5_000; // how often to ask again when that question itself got no answer

/**
 * ok: the answer came (read done, read failed again, or someone had already started it). no_credits: nothing left to read with.
 * taken: the server is reading the case, the answer is still out or was lost. fail: the read never started.
 */
export type ReadAgain = "ok" | "no_credits" | "taken" | "fail";

/** What the server has for the case right now (a small read), or null when it could not be asked. */
export const caseStatusNow = (id: string): Promise<string | null> =>
  fetch(`/api/cases/${id}/brief?status=1`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((j: { status?: unknown } | null) => (typeof j?.status === "string" ? j.status : null), () => null);

/**
 * Sends the press. The server answers only when the whole read is over, which can take minutes, so the answer is not the
 * only thing looked at: after START_MS without one, the server is asked what the case is doing. Still failed: the press
 * never got there, the request is given up (`fail`). Anything else: the server took it (`taken`), the request is left alone
 * and `onLate` runs when its answer comes in the end. What the page happened to see meanwhile plays no part (a hidden tab
 * sees nothing). A request that failed by itself is checked the same way before it is called a failure: the read may have
 * started all the same. Never throws.
 */
export async function readAgain(id: string, opt: { onLate?: () => void; startMs?: number; lookMs?: number } = {}): Promise<ReadAgain> {
  const { onLate, startMs = START_MS, lookMs = LOOK_MS } = opt;
  const stop = new AbortController();
  let over = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const post: Promise<ReadAgain> = fetch(`/api/cases/${id}/scan`, { method: "POST", signal: stop.signal })
    .then((r): ReadAgain => (r.status === 402 ? "no_credits" : r.ok || r.status === 409 ? "ok" : "fail"), (): ReadAgain => "fail"); // 409 = someone already started it
  const watch = new Promise<ReadAgain>((done) => {
    const ask = async () => {
      if (over) return;
      const st = await caseStatusNow(id);
      if (over) return;
      if (st === "failed") { stop.abort(); done("fail"); }
      else if (st) done("taken");
      else timer = setTimeout(ask, lookMs); // could not ask (no connection): ask again, the request is still out
    };
    timer = setTimeout(ask, startMs);
  });
  const first = await Promise.race([post.then((out) => ({ out, asked: false })), watch.then((out) => ({ out, asked: true }))]);
  over = true;
  clearTimeout(timer);
  let out = first.out;
  if (out === "fail" && !first.asked) { const st = await caseStatusNow(id); if (st && st !== "failed") out = "taken"; }
  if (out === "taken" && first.asked && onLate) void post.then(onLate); // the real answer, minutes later: the page reads the case again
  return out;
}
