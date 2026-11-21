/** Runs `n` jobs (indexes 0..n-1) with at most `limit` at once. Stops starting new ones after the first failure and rejects with it. */
export async function runPool(n: number, limit: number, job: (i: number) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: unknown;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      const i = next++;
      if (i >= n) return;
      try { await job(i); } catch (e) { if (!failed) { failed = true; failure = e; } return; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, n) }, worker));
  if (failed) throw failure;
}
