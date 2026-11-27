import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readCaseDocs, BadFile } from "@/lib/read-docs";
import { expandBundles } from "@/lib/expand-bundles";
import { importCasePhotos, type PhotoImport } from "@/lib/photos/import-files";
import { MAX_BYTES, MAX_PHOTOS } from "@/lib/photos/rules";
import { userFixable, zipRefunded, zipRejectedName, eventTr } from "@/lib/case-text";
import { enforcing, exempt, refundCase } from "@/lib/payments/case-credit";
import { notDeleted } from "@/lib/case-delete";
import { jevInsurerWarnings } from "@/lib/jev-checks";
import { UNDER_READ_CAPS } from "@/lib/read-cap";

export const STALE_MS = 6 * 60_000; // one read runs at most 5 minutes; a "reading" case with no news for 6 is dead
const MAX_ATTEMPTS = 3; // automatic recovery gives up after this many reads of the same case
const LEASE = "lease:";
// U10: the model call must be over this long after the read began. Every caller runs inside a 300 s function, and the outcome
// still has to be written after it; without a limit a hung call left the case on "Reading documents" until the platform killed it.
const READ_BUDGET_MS = 250_000;
const OUTCOME_BY_MS = 270_000; // a failed read's state is written by then, even if the photo import is still going
/** Waits for `p` (settled either way), but at most `ms`. */
const waitUpTo = (p: Promise<unknown>, ms: number) => new Promise<void>((done) => {
  const t = setTimeout(done, Math.max(0, ms));
  const end = () => { clearTimeout(t); done(); };
  p.then(end, end);
});
const TIMED_OUT = "Reading timed out"; // shown as "Reading took too long. Press Read again."
const READ_FAILED = "Reading failed"; // shown as "We could not read this case. Press Read again. …"
// A case nobody paid for, found by a read that starts by itself. Shown like READ_FAILED; "Read again" takes the credit and reads.
export const NOT_PAID = "Reading failed (no credit taken)";

/**
 * U11: what a failed read stores in `cases.error`. That text travels to the browser with the case, so it is only ever one of
 * the fixed texts the case page knows: a `bad_file:` code, a refused zip (`<zip name>: <fixed reason>`), "no PDF", "timed out",
 * or the plain READ_FAILED. The exception's own words (database, storage, model errors) go to the server log, never into the case.
 */
export function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (e instanceof BadFile) return msg.slice(0, 4000); // a bad file's full name is how "Replace files" finds it
  if (zipRejectedName(msg) !== null) return msg.slice(0, 500);
  if (msg === "no PDF in this case" || msg === TIMED_OUT) return msg;
  return READ_FAILED;
}

/**
 * U2: the activity lines for photos of the upload that did not reach the naming desk, one per reason, so the user who sent
 * 40 photos and sees 31 learns why. case-text.ts turns each line into the user's language.
 */
export function leftOutLines(r: Pick<PhotoImport, "leftOut"> | null | void): string[] {
  const n = r?.leftOut;
  if (!n) return [];
  const why: [number, string][] = [[n.heic, "HEIC"], [n.big, `over ${MAX_BYTES / 1048576} MB`], [n.limit, `more than ${MAX_PHOTOS} photos`], [n.unreadable, "cannot be opened"]];
  return why.filter(([count]) => count > 0).map(([count, reason]) => `Photos left out: ${count} (${reason})`);
}
/** Adds those lines to the case. A read that runs again says the same thing once (the same line is never added twice). */
async function notePhotosLeftOut(caseId: string, r: PhotoImport | void) {
  try {
    const lines = leftOutLines(r);
    if (!lines.length) return;
    const said = new Set((await db.select({ m: schema.caseEvents.message }).from(schema.caseEvents).where(and(eq(schema.caseEvents.caseId, caseId), eq(schema.caseEvents.step, "photos")))).map((x) => x.m));
    for (const message of lines) if (!said.has(message)) await db.insert(schema.caseEvents).values({ caseId, step: "photos", message });
  } catch (e) { console.error("scan: photo note failed", caseId, (e as Error)?.name); } // a note that cannot be written never fails the read
}

export type ScanMode = "auto" | "retry" | "recover";
/**
 * For "Read again": the case as the caller saw it, and how its credit is taken. The read is only claimed while the case is
 * still exactly so, and `pay` runs once the claim is won ("charged" / "free" = still paid for / false = no credit left).
 */
export type RetryPay = { was: { status: string; error: string | null; pendingDoc: string | null }; pay: () => Promise<"charged" | "free" | false> };

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
 *   auto    (after upload; page self-heal for a case still `uploaded`)   from uploaded, and only a case that is paid for
 *   retry   (the "Read again" button)                                    from uploaded | failed | pending_doc
 *   recover (case page self-heal)                                        from reading, only if `error` still equals the
 *                                                                        lease the caller saw (`seen`) and fewer than
 *                                                                        MAX_ATTEMPTS reads so far
 * S-U1b: "Read again" takes its credit AFTER the claim is won (`retry.pay`), never before. Taken before, two presses at the same
 * moment gave a free read: the first was charged, the second found the case paid for and won the claim, and the first, left
 * without the claim, took its credit back. Now only the one request that holds the case touches the ledger for that press,
 * so there is nothing for another request to give back. No credit left: the case is put back as it was (`noCredits`).
 * Every mode is also held to the hourly limits of read-cap.ts (per case and per organisation): over them nothing is claimed
 * and the case stays as it is, so a read that starts by itself is simply tried again later.
 * A new attempt clears the old error and missing list; the old case_data stays until the new read succeeds.
 * Each attempt appends a "Reading documents" event; each successful read appends one usage row.
 */
export async function scanCase(id: string, mode: ScanMode = "retry", seen: string | null = null, retry?: RetryPay): Promise<{ ok: boolean; missing: string[]; claimed: boolean; noCredits?: true }> {
  const cid = schema.cases.id;
  const started = Date.now();
  const lease = `${LEASE}${new Date().toISOString()}|${crypto.randomUUID()}`;
  const tries = sql`(select count(*) from ${schema.caseEvents} e where e.case_id = ${cid} and e.step = 'read_docs' and e.message = 'Reading documents') < ${sql.raw(String(MAX_ATTEMPTS))}`;
  const sameLease = sql`${schema.cases.error} is not distinct from ${seen}`;
  const where =
    mode === "auto" ? and(eq(cid, id), eq(schema.cases.status, "uploaded")) :
    mode === "retry" ? and(eq(cid, id), inArray(schema.cases.status, ["uploaded", "failed", "pending_doc"]),
      // with a credit to take: only while the case is as the caller saw it, so "as it was" below is exact
      ...(retry ? [eq(schema.cases.status, retry.was.status), sql`${schema.cases.error} is not distinct from ${retry.was.error}`, sql`${schema.cases.pendingDoc} is not distinct from ${retry.was.pendingDoc}`] : [])) :
    and(eq(cid, id), eq(schema.cases.status, "reading"), sameLease, tries);
  const claimed = await db.update(schema.cases).set({ status: "reading", error: lease, pendingDoc: null }).where(and(where, notDeleted, UNDER_READ_CAPS)).returning({
    id: cid, orgId: schema.cases.orgId, createdBy: schema.cases.createdBy, plate: schema.cases.plate, readBefore: sql<boolean>`${schema.cases.caseData} is not null`,
    // the case's credit, counted as the ledger's own refund rule counts it (case-credit.ts): paid for while debits > refunds
    debits: sql<number>`(select count(*)::int from credits_ledger l where l.case_id = ${id} and l.delta < 0 and (l.reason = ${"case:" + id} or l.reason like 'case-retry:%'))`,
    refunds: sql<number>`(select count(*)::int from credits_ledger l where l.case_id = ${id} and l.reason like 'case-refund:%')`,
    triedBefore: sql<boolean>`exists (select 1 from case_events e where e.case_id = ${id} and e.step = 'read_docs' and e.message = 'Reading documents')`, // the id as a value: a column here is written without its table
  });
  if (!claimed.length) {
    if (mode === "recover") { // out of attempts: stop waiting, show Failed + the retry button
      const gaveUp = await db.update(schema.cases).set({ status: "failed", error: TIMED_OUT })
        .where(and(eq(cid, id), eq(schema.cases.status, "reading"), sameLease, sql`not ${tries}`)).returning({ orgId: schema.cases.orgId });
      if (gaveUp.length) await refundCase(gaveUp[0].orgId, id).catch(() => {}); // a timeout is our failure: the credit goes back
    }
    return { ok: false, missing: [], claimed: false };
  }
  // Only the attempt that still holds the lease may write the outcome.
  const mine = and(eq(cid, id), eq(schema.cases.status, "reading"), eq(schema.cases.error, lease));
  // A read that starts by itself (after upload, or the pages' self-heal) is only for a case that is paid for. A new case whose
  // credit could not be taken, or went back, and which then could not be removed stays `uploaded`: without this check the
  // self-heal read it with a paid model call and no credit. It is not read; it shows as failed, and "Read again" takes the
  // credit and reads it. Never failed this way: a case with no ledger row at all that was read before (it was made while
  // charging was off, and reads free as it always did when it comes back with new files).
  const c = claimed[0];
  const paid = Number(c.debits) > Number(c.refunds) || (Number(c.debits) === 0 && c.triedBefore);
  // "recover" too: a read that died right after it was claimed (before this check could mark it) comes back that way.
  if (mode !== "retry" && enforcing() && !exempt(c.orgId) && !paid) {
    const failed = await db.update(schema.cases).set({ status: "failed", error: NOT_PAID }).where(mine).returning({ id: cid });
    if (failed.length) await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
    await closeIntakeJobs(id); // the worker must not read it either
    return { ok: false, missing: [], claimed: false };
  }
  if (mode === "retry" && retry) {
    // The claim is won, so this is the only request reading the case: now its credit is taken. Without one, or when taking it
    // fails, nothing is read and the case goes back to what it was (a credit that was taken although the call failed stays
    // with the case: the next "Read again" finds it paid for).
    const asItWas = () => db.update(schema.cases).set(retry.was).where(mine).returning({ id: cid });
    let took: Awaited<ReturnType<RetryPay["pay"]>>;
    try { took = await retry.pay(); }
    catch (e) { await asItWas().catch(() => asItWas()).catch(() => {}); throw e; }
    if (!took) {
      await asItWas().catch(() => asItWas());
      return { ok: false, missing: [], claimed: false, noCredits: true };
    }
  }
  await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Reading documents" });
  let photos: Promise<PhotoImport | void> = Promise.resolve();
  try {
    await expandBundles(id, claimed[0].orgId); // zip bundles: their PDFs and photos become case files first
    // photos go to the naming desk in the background while the documents are read (R2-B14); a problem here must not stop the read
    photos = importCasePhotos(id, claimed[0].orgId).catch((e) => { console.error("scan: photo import failed", id, (e as Error)?.name); });
    const files = await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id));
    const { data, usage, costUsd } = await readCaseDocs(files, { userId: claimed[0].createdBy, orgId: claimed[0].orgId, caseId: id }, { deadline: started + READ_BUDGET_MS });
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
    await notePhotosLeftOut(id, await photos); // the result is shown first; the case page and the desk pick the photos up when they are in
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
    const error = safeError(e);
    console.error("scan failed", id, (e as Error)?.name, String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300)); // the detail stays in the server log
    // never leave the import running behind a failed read; but after a read that ran out of time the failed state must still be
    // written before the function's own limit, so the wait ends at OUTCOME_BY_MS
    await waitUpTo(photos, started + OUTCOME_BY_MS - Date.now());
    const failed = await db.update(schema.cases).set({ status: "failed", error }).where(mine).returning({ id: cid });
    if (failed.length) {
      await db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Scan failed" });
      // a zip of several cars that reached the one-case path (the browser could not look inside it) is not the customer's fault:
      // the credit goes back (unless the case was read before), and the message tells them to upload it again so it is split
      const multi = zipRefunded(error, !!claimed[0].readBefore);
      if (!(e instanceof BadFile) && (multi || !userFixable(error))) await refundCase(claimed[0].orgId, id).catch(() => {}); // our failure: the credit goes back. A bad file is the customer's to replace
    }
    await closeIntakeJobs(id);
    await notePhotosLeftOut(id, await photos);
    return { ok: false, missing: [], claimed: true };
  }
}

/** The web read is the case's intake. Any `intake` job still queued for the case is closed, so a worker never reads it a second time. */
export async function closeIntakeJobs(caseId: string) {
  await db.update(schema.jobs).set({ state: "done" }).where(and(eq(schema.jobs.caseId, caseId), eq(schema.jobs.step, "intake"), eq(schema.jobs.state, "queued"))).catch(() => {});
}
