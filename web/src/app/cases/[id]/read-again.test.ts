import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readAgain } from "./read-again";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fast = { startMs: 20, lookMs: 10 };

/** `scan`: what the POST does (given its abort signal). `status`: what the server says the case is doing, one answer per question. */
function server(scan: (signal: AbortSignal) => Promise<Response>, status: (string | null)[] = []) {
  const seen = { asked: 0, aborted: false };
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/scan")) {
      init?.signal?.addEventListener("abort", () => { seen.aborted = true; });
      return scan(init!.signal!);
    }
    const st = status[Math.min(seen.asked++, status.length - 1)];
    return st == null ? Promise.reject(new Error("offline")) : Promise.resolve(json(200, { status: st }));
  }) as typeof fetch;
  return seen;
}
const hangs = (signal: AbortSignal) => new Promise<Response>((_ok, no) => signal.addEventListener("abort", () => no(new Error("aborted"))));

test("Read again: the answer came in time", async () => {
  server(async () => json(200, { ok: true }));
  assert.equal(await readAgain("c1", fast), "ok");
  server(async () => json(200, { ok: false, failed: true })); // the read ran and failed: the case says why, not this press
  assert.equal(await readAgain("c1", fast), "ok");
  server(async () => json(409));
  assert.equal(await readAgain("c1", fast), "ok");
  server(async () => json(402));
  assert.equal(await readAgain("c1", fast), "no_credits");
});

test("Read again: no answer after the wait, and the server is reading: taken, the request is NOT given up, the late answer is passed on", async () => {
  let answer!: (r: Response) => void;
  const seen = server(() => new Promise<Response>((ok) => { answer = ok; }), ["reading"]);
  let late = 0;
  assert.equal(await readAgain("c1", { ...fast, onLate: () => { late++; } }), "taken");
  assert.equal(seen.aborted, false);
  assert.equal(late, 0);
  answer(json(200, { ok: true }));
  await wait(5);
  assert.equal(late, 1);
});

test("Read again: no answer after the wait, and the case is still failed: the press never got there, given up", async () => {
  const seen = server(hangs, ["failed"]);
  assert.equal(await readAgain("c1", fast), "fail");
  assert.equal(seen.aborted, true);
  assert.equal(seen.asked, 1);
});

test("Read again: the server could not be asked: it is asked again, the request stays out meanwhile", async () => {
  const seen = server(hangs, [null, null, "reading"]);
  assert.equal(await readAgain("c1", fast), "taken");
  assert.equal(seen.asked, 3);
  assert.equal(seen.aborted, false);
});

test("Read again: the request failed by itself, but the read did start: taken, not 'could not start'", async () => {
  server(async () => { throw new Error("connection lost"); }, ["reading"]);
  assert.equal(await readAgain("c1", fast), "taken");
  server(async () => json(500), ["reading"]);
  assert.equal(await readAgain("c1", fast), "taken");
});

test("Read again: the request failed and the case is still failed (or cannot be asked): fail", async () => {
  server(async () => json(500), ["failed"]);
  assert.equal(await readAgain("c1", fast), "fail");
  server(async () => { throw new Error("offline"); }, [null]);
  assert.equal(await readAgain("c1", fast), "fail");
});
