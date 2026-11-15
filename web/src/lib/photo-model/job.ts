import "server-only";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { openPhoto } from "@/lib/photos/store";
import { claimSlice, failPending, pendingCount, writeFailed, writeName, type CaseRow, type Claimed } from "@/lib/photos/server";
import { photoModelConfig as cfg } from "./config";
import * as client from "./client";
import { isTerminal, JobSchema, nextStep, orderHash, toNamed, type PhotoModelJob } from "./rules";

// Durable state of one naming job lives in cases.photo_model_job. Every call of advance() does at most ONE network
// attempt, so a Vercel function never waits on the Space for long; the desk page keeps calling while photos wait.

export type Outcome = { claimed: number; named: number; failed: number; remaining: number; capped: boolean };
const rowsOf = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? []) as T[];
const nowS = () => Math.floor(Date.now() / 1000);

async function readJob(caseId: string): Promise<PhotoModelJob | null> {
  const [r] = await db.select({ j: schema.cases.photoModelJob }).from(schema.cases).where(eq(schema.cases.id, caseId)).limit(1);
  const p = JobSchema.safeParse(r?.j);
  return p.success ? p.data : null;
}
/** Compare-and-set on the job id and status, so two polls never both move the same job. */
async function writeJob(caseId: string, from: { job_id: string; status: string } | null, next: PhotoModelJob): Promise<boolean> {
  const json = JSON.stringify(next);
  const r = from
    ? await db.execute(sql`UPDATE cases SET photo_model_job = ${json}::jsonb WHERE id = ${caseId} AND photo_model_job->>'job_id' = ${from.job_id} AND photo_model_job->>'status' = ${from.status} RETURNING id`)
    : await db.execute(sql`UPDATE cases SET photo_model_job = ${json}::jsonb WHERE id = ${caseId} AND (photo_model_job IS NULL OR photo_model_job->>'status' IN ('done','failed')) RETURNING id`);
  return rowsOf(r).length > 0;
}

async function photoRows(caseId: string) {
  return db.select({ id: schema.casePhotos.id, origN: schema.casePhotos.origN, thumbPath: schema.casePhotos.thumbPath })
    .from(schema.casePhotos).where(eq(schema.casePhotos.caseId, caseId)).orderBy(asc(schema.casePhotos.position), asc(schema.casePhotos.id));
}
const vehicleOf = (c: CaseRow) => ((c.carModel || (c.caseData as { client_vehicle?: { model?: string | null } } | null)?.client_vehicle?.model || "") as string).slice(0, 120);
const toClaimed = (j: PhotoModelJob): Claimed[] => j.claims.map((x) => ({ id: x.id, claimedAt: x.at }));

async function failJob(c: CaseRow, j: PhotoModelJob, why: string): Promise<void> {
  const next: PhotoModelJob = { ...j, status: "failed", error: why.slice(0, 200), lease_until: null };
  if (await writeJob(c.id, j, next)) await writeFailed(toClaimed(j), why);
}

async function start(c: CaseRow): Promise<Outcome | null> {
  const claimed = await claimSlice(c.id, 1000);
  if (!claimed.length) return null;
  if (claimed.length > cfg.maxPhotos) {
    await writeFailed(claimed, "too many photos: name by hand");
    return { claimed: 0, named: 0, failed: claimed.length, remaining: await pendingCount(c.id), capped: false };
  }
  const ids = new Set(claimed.map((x) => x.id));
  const rows = (await photoRows(c.id)).filter((r) => ids.has(r.id));
  const t = nowS();
  const job: PhotoModelJob = {
    job_id: randomUUID(), status: "claimed", order_hash: orderHash(rows),
    claims: rows.map((r) => ({ id: r.id, at: claimed.find((x) => x.id === r.id)!.claimedAt })),
    claimed_at: t, submit_deadline: t + cfg.submitWindowS, run_deadline: null, lease_until: null, attempts: 0, resubmitted: false, error: null,
  };
  if (!(await writeJob(c.id, null, job))) { await writeFailed(claimed, "another job is running"); return null; }
  return { claimed: claimed.length, named: 0, failed: 0, remaining: await pendingCount(c.id), capped: false };
}

async function trySubmit(c: CaseRow, j: PhotoModelJob): Promise<void> {
  // take the lease first: one submit attempt at a time
  const leased: PhotoModelJob = { ...j, lease_until: nowS() + cfg.leaseS, attempts: j.attempts + 1 };
  const got = rowsOf(await db.execute(sql`UPDATE cases SET photo_model_job = ${JSON.stringify(leased)}::jsonb
    WHERE id = ${c.id} AND photo_model_job->>'job_id' = ${j.job_id} AND photo_model_job->>'status' = ${j.status}
      AND (photo_model_job->>'lease_until' IS NULL OR (photo_model_job->>'lease_until')::bigint <= ${nowS()}) RETURNING id`));
  if (!got.length) return;
  const release = (status: PhotoModelJob["status"], extra: Partial<PhotoModelJob> = {}) => writeJob(c.id, { job_id: j.job_id, status: j.status }, { ...leased, status, lease_until: null, ...extra });
  if (leased.attempts > cfg.maxSubmitAttempts) return void (await release("claimed"), await failJob(c, { ...leased, lease_until: null }, "service unavailable"));

  if (!(await client.health())) { await release("waking"); return; } // the Space may be asleep: wake it, try again on the next poll
  // the photos must still be the ones the job was made for
  const rows = (await photoRows(c.id)).filter((r) => j.claims.some((x) => x.id === r.id));
  if (orderHash(rows) !== j.order_hash) return void (await failJob(c, leased, "photos changed"));
  const photos: { bytes: Buffer; type: string }[] = [];
  for (const r of rows) {
    const o = await openPhoto(r.thumbPath);
    if (!o) return void (await failJob(c, leased, "photo missing"));
    const bytes = o.body instanceof Uint8Array ? Buffer.from(o.body) : Buffer.from(await new Response(o.body).arrayBuffer());
    photos.push({ bytes, type: "image/jpeg" });
  }
  const res = await client.submit({ caseId: c.id, jobId: j.job_id, orderHash: j.order_hash, vehicle: vehicleOf(c), photos });
  if (res === "accepted") await release("running", { run_deadline: nowS() + cfg.runWindowS });
  else if (res === "rejected") await failJob(c, leased, "service refused the job");
  else await release("waking"); // busy or unreachable: retry within the submit window
}

async function poll(c: CaseRow, j: PhotoModelJob): Promise<number> {
  const s = await client.status(j.job_id);
  if (s.kind === "done") {
    const rows = (await photoRows(c.id)).filter((r) => j.claims.some((x) => x.id === r.id));
    if (orderHash(rows) !== j.order_hash || s.results.length !== j.claims.length) { await failJob(c, j, "result does not match photos"); return 0; }
    // Names are written while the job is still "running", so no other poll can start a new job and re-claim these photos.
    // writeName only touches rows still claimed by this job, so two polls doing this at once cannot clash.
    const vehicle = vehicleOf(c);
    let named = 0;
    for (let i = 0; i < j.claims.length; i++) {
      const row = rows.find((r) => r.id === j.claims[i].id)!;
      if (await writeName({ id: j.claims[i].id, claimedAt: j.claims[i].at }, toNamed(s.results[i], vehicle, row.origN))) named++;
    }
    await writeJob(c.id, j, { ...j, status: "done", lease_until: null });
    return named;
  }
  if (s.kind === "failed") await failJob(c, j, s.error);
  else if (s.kind === "unknown") {
    if (j.resubmitted) await failJob(c, j, "service lost the job");
    else await writeJob(c.id, j, { ...j, status: "claimed", resubmitted: true, lease_until: null, run_deadline: null, submit_deadline: nowS() + cfg.submitWindowS });
  }
  return 0;
}

/** One step of the naming job for this case. Used instead of the Claude slice when the photo model is ON. */
export async function advance(c: CaseRow, opts: { retryFailed?: boolean } = {}): Promise<Outcome> {
  if (opts.retryFailed) await db.update(schema.casePhotos).set({ nameState: "pending", nameError: null, claimedAt: null }).where(sql`${schema.casePhotos.caseId} = ${c.id} AND ${schema.casePhotos.nameState} = 'failed'`);
  let job = await readJob(c.id);
  const step = nextStep(job, nowS());
  const same = async (): Promise<Outcome> => ({ claimed: 0, named: 0, failed: 0, remaining: await pendingCount(c.id), capped: false });
  if (step === "idle") {
    const started = await start(c);
    return started ?? (await same());
  }
  job = job as PhotoModelJob;
  let named = 0;
  if (step === "submit") await trySubmit(c, job);
  else if (step === "poll") named = await poll(c, job);
  else if (step === "fail_submit_deadline") await failJob(c, job, "service did not respond in time");
  else if (step === "fail_run_deadline") await failJob(c, job, "service took too long");
  const o = await same();
  return { ...o, named };
}
export { failPending, isTerminal };
