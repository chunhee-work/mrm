import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readCaseDocs, BadFile } from "@/lib/read-docs";
import { expandBundles } from "@/lib/expand-bundles";
import { importCasePhotos } from "@/lib/photos/import-files";
import { userFixable, zipRefunded, eventTr } from "@/lib/case-text";
import { refundCase } from "@/lib/payments/case-credit";
import { notDeleted } from "@/lib/case-delete";
import { jevInsurerWarnings } from "@/lib/jev-checks";

export const STALE_MS = 6 * 60_000; // one read runs at most 5 minutes; a "reading" case with no news for 6 is dead
const MAX_ATTEMPTS = 3; // automatic recovery gives up after this many reads of the same case
const LEASE = "lease:";

export type ScanMode = "auto" | "retry" | "recover";

/** While a case is `reading`, `cases.error` holds the lease of the attempt that owns it: "lease:<ISO time>:<id>". */
export function leaseTime(error: string | null): number | null {
  if (!error?.startsWith(LEASE)) return null;
  const t = Date.parse(error.slice(LEASE.length).split("|")[0]);
  return Number.isNaN(t) ? null : t;
}

/**
 * Step 1 "System scans it": Claude reads the uploaded documents of one case.
 * Status flow: reading -> phase_a (nothing missing) | pending_doc (documents missing) | failed.
 *
 * One claim rule for every caller: a single conditional UPDATE that also writes a new lease into `error`, so two
 * triggers can never both read, and a dead attempt can never overwrite the result of the attempt that replaced it.
 *   auto    (after upload; page self-heal for a case still `uploaded`)   from uploaded
 *   retry   (the "Read again" button)                                    from uploaded | failed | pending_doc
 *   recover (case page self-heal)                                        from reading, only if `error` still equals the
 *                                                                        lease the caller saw (`seen`) and fewer than
 *                                                                        MAX_ATTEMPTS reads so far
 * A new attempt clears the old error and missing list; the old case_data stays until the new read succeeds.
 * Each attempt appends a "Reading documents" event; each successful read appends one usage row.
 */
export async function scanCase(id: string, mode: ScanMode = "retry", seen: string | null = null): Promise<{ ok: boolean; missing: string[]; claimed: boolean }> {
  const cid = schema.cases.id;
  const lease = `${LEASE}${new Date().toISOString()}|${crypto.randomUUID()}`;
  const tries = sql`(select count(*) from ${schema.caseEvents} e where e.case_id = ${cid} and e.step = 'read_docs' and e.message = 'Reading documents') < ${sql.raw(String(MAX_ATTEMPTS))}`;
  const sameLease = sql`${schema.cases.error} is not distinct from ${seen}`;
  const where =
    mode === "auto" ? and(eq(cid, id), eq(schema.cases.status, "uploaded")) :
    mode === "retry" ? and(eq(cid, id), inArray(schema.cases.status, ["uploaded", "failed", "pending_doc"])) :
    and(eq(cid, id), eq(schema.cases.status, "reading"), sameLease, tries);
  const claimed = await db.update(schema.cases).set({ status: "reading", error: lease, pendingDoc: null }).where(and(where, notDeleted)).returning({ id: cid, orgId: schema.cases.orgId, createdBy: schema.cases.createdBy, plate: schema.cases.plate, readBefore: sql<boolean>`${schema.cases.caseData} is not null` });
  if (!claimed.length) {
    if (mode === "recover") { // out of attempts: stop waiting, show Failed + the retry button
      const gaveUp = await db.update(schema.cases).set({ status: "failed", error: "Reading timed out" })
        .where(and(eq(cid, id), eq(schema.cases.status, "reading"), sameLease, sql`not ${tries}`)).returning({ orgId: schema.cases.orgId });
      if (gaveUp.length) await refundCase(gaveUp[0].orgId, id).catch(() => {}); // a timeout is our failure: the credit goes back
    }
    return { ok: false, missing: [], claimed: false };
  }
  // Only the attempt that still holds the lease may write the outcome.
  const mine = and(eq(cid, id), eq(schema.cases.status, "reading"), eq(schema.cases.error, lease));
  await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Reading documents" });
  let photos: Promise<unknown> = Promise.resolve();
  try {
    await expandBundles(id, claimed[0].orgId); // zip bundles: their PDFs and photos become case files first
    // photos go to the naming desk in the background while the documents are read (R2-B14); a problem here must not stop the read
    photos = importCasePhotos(id, claimed[0].orgId).catch(() => {});
    const files = await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
    const { data, usage, costUsd } = await readCaseDocs(files, { userId: claimed[0].createdBy, orgId: claimed[0].orgId, caseId: id });
    const done = await db.update(schema.cases).set({
      status: data.missing.length ? "pending_doc" : "phase_a",
      error: null,
      pendingDoc: data.missing.join("; ") || null,
      caseData: data,
      // a case uploaded without a typed plate gets the one read from its documents
      ...(claimed[0].plate ? {} : { plate: (data.plate ?? "").toUpperCase().replace(/\s+/g, "").slice(0, 20) }),
      insurer: data.client_policy?.insurer || null,
      carModel: data.client_vehicle.model || null,
    }).where(mine).returning({ id: cid });
    // The Claude call was paid for either way, so the usage row is written even if a newer attempt took over.
    await db.insert(schema.usage).values({
      caseId: id, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      cacheTokens: usage.cache_read_input_tokens ?? 0, costUsd: costUsd.toFixed(4),
    });
    if (done.length) await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: data.missing.length ? `Pending: ${data.missing.join("; ")}` : "Documents read" });
    await photos; // the result is shown first; the case page and the desk pick the photos up when they are in
    await closeIntakeJobs(id); // the read above IS the intake: the queued job must not make the worker do it again (B15)
    // Jev second vote on the insurers and the Liberty branch (playbook 02). It runs last, after the result is saved and shown, so the result never
    // waits for it (a "Read again" button reply can wait at most a few seconds). It only adds a line to the case's activity (the same line is never added twice on a re-read); the case never changes status
    // because of it, and a failing or slow Jev adds nothing.
    if (done.length) {
      try {
        // the same finding is one (kind, source text) pair, however the line is worded
        const keyOf = (m: string) => { const t = eventTr(m); return `${t.key}|${t.vars?.text ?? t.vars?.place ?? m}`; };
        const seen = new Set((await db.select({ m: schema.caseEvents.message }).from(schema.caseEvents).where(and(eq(schema.caseEvents.caseId, id), eq(schema.caseEvents.step, "jev_check")))).map((r) => keyOf(r.m)));
        for (const message of await jevInsurerWarnings(data, { userId: claimed[0].createdBy ?? undefined, caseId: id })) if (!seen.has(keyOf(message))) await db.insert(schema.caseEvents).values({ caseId: id, step: "jev_check", message });
      } catch { /* a Jev problem never fails the read */ }
    }
    return { ok: done.length > 0, missing: data.missing, claimed: true };
  } catch (e) {
    await photos; // never leave the import running behind a failed read
    const failed = await db.update(schema.cases).set({ status: "failed", error: (e as Error).message.slice(0, e instanceof BadFile ? 4000 : 500) } /* a bad file's full name is how "Replace files" finds it */).where(mine).returning({ id: cid });
    if (failed.length) {
      await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
      // a zip of several cars that reached the one-case path (the browser could not look inside it) is not the customer's fault:
      // the credit goes back (unless the case was read before), and the message tells them to upload it again so it is split
      const multi = zipRefunded((e as Error).message, !!claimed[0].readBefore);
      if (!(e instanceof BadFile) && (multi || !userFixable((e as Error).message))) await refundCase(claimed[0].orgId, id).catch(() => {}); // our failure: the credit goes back. A bad file is the customer's to replace
    }
    await closeIntakeJobs(id);
    return { ok: false, missing: [], claimed: true };
  }
}

/** The web read is the case's intake. Any `intake` job still queued for the case is closed, so a worker never reads it a second time. */
export async function closeIntakeJobs(caseId: string) {
  await db.update(schema.jobs).set({ state: "done" }).where(and(eq(schema.jobs.caseId, caseId), eq(schema.jobs.step, "intake"), eq(schema.jobs.state, "queued"))).catch(() => {});
}
