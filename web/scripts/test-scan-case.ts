/**
 * Acceptance tests for the scan-claim rules (auto / retry / recover, lease-guarded writes, 3-read cap).
 * Runs against a real in-memory Postgres (PGlite) with the real migrations, so CI needs no database service.
 * Only the Claude call is replaced. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const root = path.resolve(__dirname, "..");
const pg = new PGlite();
const db = drizzle(pg, { schema });

// Swap the three modules scan-case.ts imports: server-only (throws outside Next), the db, and the Claude call.
let claude: () => Promise<any> = async () => { throw new Error("claude not set"); };
let readOpts: { deadline?: number } | undefined; // what the last read was called with
const noneLeftOut = { heic: 0, big: 0, limit: 0, unreadable: 0 };
let photoImport: () => Promise<any> = async () => ({ added: 0, skipped: [], leftOut: noneLeftOut });
let unzip: () => Promise<number> = async () => 0;
let signedIn = "o"; // the organisation of the signed-in user, for the routes imported below
const stubs: Record<string, unknown> = {
  "server-only": {},
  "@/lib/session": { getUserOrNull: async () => ({ user: { id: "u" }, orgId: signedIn }) },
  "@/db": { db, schema },
  "@/lib/read-docs": { readCaseDocs: (_f: unknown, _c: unknown, o?: { deadline?: number }) => { readOpts = o; return claude(); }, BadFile: class BadFile extends Error {} },
  "@/lib/expand-bundles": { expandBundles: () => unzip() },
  "@/lib/photos/import-files": { importCasePhotos: () => photoImport() },
};
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  return request in stubs ? stubs[request] : origLoad.call(this, request, ...rest);
};

const ok = (missing: string[] = []) => async () => ({
  data: { missing, client_policy: { insurer: "Allianz" }, client_vehicle: { model: "Myvi" } },
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 }, costUsd: 0.01,
});

let n = 0;
async function newCase(status: string, error: string | null = null, extra: Record<string, unknown> = {}) {
  const id = `t${++n}`;
  await db.insert(schema.cases).values({ id, orgId: "o", plate: "ABC123", status, error, ...extra });
  await db.insert(schema.caseFiles).values({ caseId: id, kind: "pdf", blobUrl: "x", originalName: "a.pdf" });
  return id;
}
const get = async (id: string) => (await db.select().from(schema.cases).where(eq(schema.cases.id, id)))[0];
const events = async (id: string) => (await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, id))).map((e) => e.message);
const usageRows = async (id: string) => (await db.select().from(schema.usage).where(eq(schema.usage.caseId, id))).length;
const readEvent = (id: string) => db.insert(schema.caseEvents).values({ caseId: id, step: "read_docs", message: "Reading documents" });

async function main() {
  const dir = path.join(root, "drizzle");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
    for (const s of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec("set session_replication_role = replica"); // no org/user rows needed for these tests

  const { scanCase, leaseTime, safeError, leftOutLines } = await import("../src/lib/scan-case");
  const { dropBadFiles } = await import("../src/lib/drop-bad-files");
  const tests: [string, () => Promise<void>][] = [
    ["R2-B02 Replace files: the bad file leaves the case, the good ones stay; other failures remove nothing", async () => {
      const id = await newCase("failed", "bad_file:a.pdf|corrupt");
      await db.insert(schema.caseFiles).values({ caseId: id, kind: "pdf", blobUrl: "y", originalName: "good.pdf" });
      assert.equal(await dropBadFiles(id, "pending_doc", "bad_file:a.pdf|corrupt"), 0); // not failed: untouched
      assert.equal(await dropBadFiles(id, "failed", "Reading timed out"), 0);
      assert.equal(await dropBadFiles(id, "failed", "bad_file:a.pdf|corrupt"), 1);
      const left = (await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).map((f) => f.originalName);
      assert.deepEqual(left, ["good.pdf"]);
      // a guess over several PDFs removes nothing; a long name with "|" or ";" in it still finds its row
      assert.equal(await dropBadFiles(id, "failed", "bad_file:good.pdf; x.pdf|corrupt"), 0);
      const long = `${"x".repeat(150)} | a; b %.pdf`;
      await db.insert(schema.caseFiles).values({ caseId: id, kind: "pdf", blobUrl: "z", originalName: long });
      const { badFileName } = await import("../src/lib/case-text"); // what BadFile writes (read-docs is stubbed here)
      assert.equal(await dropBadFiles(id, "failed", `bad_file:${badFileName(long)}|corrupt`), 1);
      assert.equal((await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).length, 1);
    }],
    ["Replace files when we could not tell which PDF: every PDF goes (the customer sends them all again); a zip left empty goes too", async () => {
      const id = await newCase("failed", "bad_file:|corrupt");
      const [z] = await db.insert(schema.caseFiles).values({ caseId: id, kind: "bundle_zip", blobUrl: "zipurl", originalName: "docs.zip" }).returning({ id: schema.caseFiles.id });
      const [z2] = await db.insert(schema.caseFiles).values({ caseId: id, kind: "bundle_zip", blobUrl: "zip2", originalName: "mixed.zip" }).returning({ id: schema.caseFiles.id });
      await db.insert(schema.caseFiles).values([
        { caseId: id, kind: "pdf", blobUrl: `o/c/unzipped-${z.id}/b.pdf`, originalName: "b.pdf" },
        { caseId: id, kind: "pdf", blobUrl: `o/c/unzipped-${z2.id}/c.pdf`, originalName: "c.pdf" },
        { caseId: id, kind: "photo", blobUrl: `o/c/unzipped-${z2.id}/p.jpg`, originalName: "p.jpg" },
      ]);
      assert.equal(await dropBadFiles(id, "failed", "bad_file:|corrupt"), 4); // 3 PDFs + docs.zip, now empty
      const left = (await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).map((f) => f.originalName).sort();
      assert.deepEqual(left, ["mixed.zip", "p.jpg"]); // mixed.zip still has its photo, so it is not opened again
    }],
    ["Replace files after a refused zip: that zip leaves the case (it would be opened again and fail); an opened zip of the same name stays", async () => {
      const id = await newCase("failed", "bad: zip.zip: the zip cannot be opened");
      await db.insert(schema.caseFiles).values([
        { caseId: id, kind: "bundle_zip", blobUrl: "z1", originalName: "bad: zip.zip" },
        { caseId: id, kind: "bundle_zip", blobUrl: "z2", originalName: "good.zip" },
      ]);
      assert.equal(await dropBadFiles(id, "failed", "bad: zip.zip: the zip cannot be opened"), 1);
      const left = (await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).map((f) => f.originalName).sort();
      assert.deepEqual(left, ["a.pdf", "good.zip"]);
      // two "Archive.zip": the earlier one was opened (its PDF is in the case), the later one was refused
      const [opened] = await db.insert(schema.caseFiles).values({ caseId: id, kind: "bundle_zip", blobUrl: "z3", originalName: "Archive.zip" }).returning({ id: schema.caseFiles.id });
      await db.insert(schema.caseFiles).values([
        { caseId: id, kind: "pdf", blobUrl: `o/c/unzipped-${opened.id}/claim.pdf`, originalName: "claim.pdf" },
        { caseId: id, kind: "bundle_zip", blobUrl: "z4", originalName: "Archive.zip" },
      ]);
      assert.equal(await dropBadFiles(id, "failed", "Archive.zip: the zip cannot be opened"), 1);
      const now = (await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).map((f) => f.blobUrl).sort();
      assert.ok(now.includes("z3") && !now.includes("z4"), "the opened Archive.zip stays, the refused one goes");
    }],
    ["auto: uploaded -> phase_a, one usage row, fields saved", async () => {
      claude = ok(); const id = await newCase("uploaded");
      const r = await scanCase(id, "auto");
      const c = await get(id);
      assert.equal(r.claimed, true); assert.equal(c.status, "phase_a"); assert.equal(c.error, null);
      assert.equal(c.insurer, "Allianz"); assert.equal(c.carModel, "Myvi");
      assert.equal(await usageRows(id), 1);
      assert.deepEqual(await events(id), ["Reading documents", "Documents read"]);
    }],
    ["case uploaded without a plate gets the one read from the documents; a typed plate is kept", async () => {
      claude = async () => ({ ...(await ok()()), data: { ...(await ok()()).data, plate: "wxy 1234 a" } });
      const id = await newCase("uploaded", null, { plate: "" }); await scanCase(id, "auto");
      assert.equal((await get(id)).plate, "WXY1234A");
      const id2 = await newCase("uploaded"); await scanCase(id2, "auto");
      assert.equal((await get(id2)).plate, "ABC123");
    }],
    ["empty text from the reader is stored as NULL in the insurer and car model columns", async () => {
      claude = async () => ({ ...(await ok()()), data: { missing: [], plate: "", client_policy: { insurer: "" }, client_vehicle: { model: "" } } });
      const id = await newCase("uploaded"); await scanCase(id, "auto"); const c = await get(id);
      assert.equal(c.insurer, null); assert.equal(c.carModel, null); assert.equal(c.status, "phase_a");
    }],
    ["missing documents -> pending_doc with the list", async () => {
      claude = ok(["Police report"]); const id = await newCase("uploaded");
      await scanCase(id, "auto"); const c = await get(id);
      assert.equal(c.status, "pending_doc"); assert.equal(c.pendingDoc, "Police report");
    }],
    ["auto cannot claim anything but uploaded", async () => {
      claude = ok(); const id = await newCase("failed");
      assert.equal((await scanCase(id, "auto")).claimed, false); assert.equal((await get(id)).status, "failed");
    }],
    ["double trigger: two simultaneous auto runs -> exactly one read", async () => {
      claude = ok(); const id = await newCase("uploaded");
      const r = await Promise.all([scanCase(id, "auto"), scanCase(id, "auto"), scanCase(id, "retry")]);
      assert.equal(r.filter((x) => x.claimed).length, 1); assert.equal(await usageRows(id), 1);
    }],
    ["retry works from failed and pending_doc, clears error + missing list", async () => {
      claude = ok();
      for (const st of ["failed", "pending_doc"]) {
        const id = await newCase(st, "boom", { pendingDoc: "old" });
        assert.equal((await scanCase(id, "retry")).claimed, true);
        const c = await get(id); assert.equal(c.status, "phase_a"); assert.equal(c.error, null); assert.equal(c.pendingDoc, null);
      }
    }],
    ["retry cannot claim a case that is reading", async () => {
      const id = await newCase("reading", "lease:2026-01-01T00:00:00.000Z|x");
      assert.equal((await scanCase(id, "retry")).claimed, false);
    }],
    ["failed read -> failed + 'Scan failed' event, no usage row, old case_data kept", async () => {
      claude = async () => { throw new Error("api down"); };
      const id = await newCase("uploaded", null, { caseData: { keep: true } });
      await scanCase(id, "auto"); const c = await get(id);
      assert.equal(c.status, "failed"); assert.equal(c.error, "Reading failed"); assert.deepEqual(c.caseData, { keep: true }); // U11: never the exception's own words
      assert.equal(await usageRows(id), 0); assert.deepEqual(await events(id), ["Reading documents", "Scan failed"]);
    }],
    ["no PDF -> failed with a message", async () => {
      claude = async () => { throw new Error("no PDF in this case"); };
      const id = await newCase("uploaded"); await scanCase(id, "auto");
      assert.equal((await get(id)).status, "failed");
    }],
    ["recover: needs the same lease the caller saw", async () => {
      claude = ok(); const lease = "lease:2026-01-01T00:00:00.000Z|abc"; const id = await newCase("reading", lease);
      assert.equal((await scanCase(id, "recover", "lease:other")).claimed, false);
      assert.equal((await get(id)).status, "reading");
      assert.equal((await scanCase(id, "recover", lease)).claimed, true);
      assert.equal((await get(id)).status, "phase_a");
    }],
    ["recover: 4 simultaneous page loads on one stale case -> one read", async () => {
      claude = ok(); const lease = "lease:2026-01-01T00:00:00.000Z|abc"; const id = await newCase("reading", lease);
      const r = await Promise.all([1, 2, 3, 4].map(() => scanCase(id, "recover", lease)));
      assert.equal(r.filter((x) => x.claimed).length, 1); assert.equal(await usageRows(id), 1);
    }],
    ["recover: after 3 reads -> failed 'Reading timed out', never read a 4th time", async () => {
      claude = ok(); const lease = "lease:2026-01-01T00:00:00.000Z|abc"; const id = await newCase("reading", lease);
      for (let i = 0; i < 3; i++) await readEvent(id);
      const r = await scanCase(id, "recover", lease);
      const c = await get(id);
      assert.equal(r.claimed, false); assert.equal(c.status, "failed"); assert.equal(c.error, "Reading timed out");
      assert.equal(await usageRows(id), 0);
    }],
    ["lease-guarded write: a slow old attempt cannot overwrite the newer attempt", async () => {
      let release!: () => void; const gate = new Promise<void>((r) => (release = r));
      claude = async () => { await gate; return ok(["Old result"])(); };
      const id = await newCase("uploaded");
      const slow = scanCase(id, "auto"); // holds lease A, waiting on Claude
      await new Promise((r) => setTimeout(r, 200));
      const seen = (await get(id)).error;
      claude = ok(); // the replacement attempt finishes first
      assert.equal((await scanCase(id, "recover", seen)).claimed, true);
      assert.equal((await get(id)).status, "phase_a");
      release(); const old = await slow;
      const c = await get(id);
      assert.equal(old.ok, false); assert.equal(c.status, "phase_a"); assert.equal(c.pendingDoc, null);
      assert.equal(await usageRows(id), 2); // both reads were paid for
    }],
    ["B15: a queued intake job is closed when the web read finishes (ok or failed), so a worker never reads the case again", async () => {
      claude = ok(["police report"]); const id = await newCase("uploaded");
      await db.insert(schema.jobs).values({ caseId: id, step: "intake", state: "queued" });
      await db.insert(schema.jobs).values({ caseId: id, step: "photo_model", state: "queued" });
      await scanCase(id, "auto");
      const js = await db.select().from(schema.jobs).where(eq(schema.jobs.caseId, id));
      assert.deepEqual(js.map((j) => [j.step, j.state]).sort(), [["intake", "done"], ["photo_model", "queued"]]);
      claude = async () => { throw new Error("boom"); };
      const id2 = await newCase("uploaded"); await db.insert(schema.jobs).values({ caseId: id2, step: "intake", state: "queued" });
      await scanCase(id2, "auto");
      assert.equal((await db.select().from(schema.jobs).where(eq(schema.jobs.caseId, id2)))[0].state, "done");
    }],
    ["B03: our failure gives the credit back once; a bad file does not", async () => {
      process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
      const { debitCase, refundCase } = await import("../src/lib/payments/case-credit");
      await db.insert(schema.creditsLedger).values({ orgId: "o", delta: 2000, reason: "purchase:x" });
      const bal = async () => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = 'o'`)) as any).rows[0].b);
      const before = await bal();
      claude = async () => { throw new Error("Connection error"); };
      const id = await newCase("uploaded"); assert.equal(await debitCase("o", id), true); assert.equal(await bal(), before - 1000);
      await scanCase(id, "auto"); assert.equal(await bal(), before); // failed on our side: refunded
      assert.equal(await refundCase("o", id), false); assert.equal(await bal(), before); // never twice
      claude = async () => { throw new (stubs["@/lib/read-docs"] as any).BadFile("bad_file:a.pdf|empty"); };
      const id2 = await newCase("uploaded"); await debitCase("o", id2); const mid = await bal();
      await scanCase(id2, "auto"); assert.equal(await bal(), mid); // customer's bad file: no refund
      delete process.env.CREDITS_ENFORCE;
    }],
    ["a zip of several cars (or cars at different levels) on the one-case path gives the credit back, unless the case was read before", async () => {
      process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
      const { debitCase } = await import("../src/lib/payments/case-credit");
      const { ZIP_WHY } = await import("../src/lib/case-text");
      await db.insert(schema.creditsLedger).values({ orgId: "o", delta: 3000, reason: "purchase:multi" });
      const bal = async () => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = 'o'`)) as any).rows[0].b);
      for (const why of [ZIP_WHY.multi, ZIP_WHY.layout]) {
        claude = async () => { throw new Error(`cars.zip: ${why}`); };
        const id = await newCase("uploaded"); await debitCase("o", id); const before = await bal();
        await scanCase(id, "auto"); assert.equal(await bal(), before + 1000, why); // never read: refunded
        const read = await newCase("uploaded", null, { caseData: { missing: [] } }); await debitCase("o", read); const mid = await bal();
        await scanCase(read, "auto"); assert.equal(await bal(), mid, why); // read before: that read stays paid for
      }
      delete process.env.CREDITS_ENFORCE;
    }],
    ["B03: no balance -> no debit and false; enough -> exactly one debit even if asked twice; exempt orgs never pay", async () => {
      process.env.CREDITS_ENFORCE = "on"; process.env.CREDITS_EXEMPT_ORGS = "free-org, other";
      const { debitCase, hasCredit } = await import("../src/lib/payments/case-credit");
      const bal = async (o: string) => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = ${o}`)) as any).rows[0].b);
      assert.equal(await hasCredit("poor"), false);
      assert.equal(await debitCase("poor", "c-poor"), false); assert.equal(await bal("poor"), 0);
      await db.insert(schema.creditsLedger).values({ orgId: "rich", delta: 1000, reason: "purchase:r" });
      assert.equal(await hasCredit("rich"), true);
      const [a, b] = await Promise.all([debitCase("rich", "c-rich"), debitCase("rich", "c-rich")]);
      assert.ok(a || b); assert.equal(await bal("rich"), 0); // one debit, never two
      assert.equal(await debitCase("free-org", "c-free"), true); assert.equal(await bal("free-org"), 0);
      delete process.env.CREDITS_ENFORCE; delete process.env.CREDITS_EXEMPT_ORGS;
    }],
    ["U11: a failed read stores only a fixed text the case page knows; the exception's own words never reach the case", async () => {
      const { ZIP_WHY, failTr, userFixable } = await import("../src/lib/case-text");
      const BadFile = (stubs["@/lib/read-docs"] as any).BadFile;
      const raw = ['connect ECONNREFUSED 10.0.0.5:5432', 'Failed query: select "id" from "cases" where secret = $1\nparams: abc', "401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"},\"request_id\":\"req_1\"}",
        "cannot download claim.zip", "claim.zip: unexpected EOF", "400 max_tokens: too large", "no structured output (stop_reason: max_tokens)"];
      for (const m of raw) assert.equal(safeError(new Error(m)), "Reading failed", m);
      assert.equal(safeError("a string"), "Reading failed"); assert.equal(safeError(null), "Reading failed");
      // the texts the page understands are kept as they are
      assert.equal(safeError(new BadFile("bad_file:a.pdf|corrupt")), "bad_file:a.pdf|corrupt");
      assert.equal(safeError(new Error(`cars.zip: ${ZIP_WHY.multi}`)), `cars.zip: ${ZIP_WHY.multi}`);
      assert.equal(safeError(new Error("no PDF in this case")), "no PDF in this case");
      assert.equal(safeError(new Error("Reading timed out")), "Reading timed out");
      // and the plain text is our failure on the page: "Read again", not "Replace files"
      assert.equal(failTr("Reading failed").key, "case.err.other"); assert.equal(userFixable("Reading failed"), false);
      // through a real read: the stored text and the credit rule agree
      claude = async () => { throw new Error('Failed query: select 1\nparams: secret'); };
      const id = await newCase("uploaded"); await scanCase(id, "auto");
      assert.equal((await get(id)).error, "Reading failed");
      unzip = async () => { throw new Error(`cars.zip: ${ZIP_WHY.corrupt}`); };
      try { const z = await newCase("uploaded"); await scanCase(z, "auto"); assert.equal((await get(z)).error, `cars.zip: ${ZIP_WHY.corrupt}`); } finally { unzip = async () => 0; }
    }],
    ["U10: the read is given a deadline under the function limit; a read that runs out of time fails as 'Reading timed out' and the credit goes back", async () => {
      process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
      const { debitCase } = await import("../src/lib/payments/case-credit");
      await db.insert(schema.creditsLedger).values({ orgId: "o", delta: 1000, reason: "purchase:u10" });
      const bal = async () => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = 'o'`)) as any).rows[0].b);
      const id = await newCase("uploaded"); await debitCase("o", id); const paid = await bal();
      const t0 = Date.now();
      claude = async () => { throw new Error("Reading timed out"); }; // what readCaseDocs throws when its deadline passes
      await scanCase(id, "auto");
      assert.ok(readOpts?.deadline && readOpts.deadline - t0 > 200_000 && readOpts.deadline - t0 < 290_000, `deadline ${readOpts?.deadline && readOpts.deadline - t0} ms after the start`);
      const c = await get(id);
      assert.equal(c.status, "failed"); assert.equal(c.error, "Reading timed out");
      assert.deepEqual(await events(id), ["Reading documents", "Scan failed"]);
      assert.equal(await bal(), paid + 1000);
      delete process.env.CREDITS_ENFORCE;
    }],
    ["a case nobody paid for is never read by a read that starts by itself: it shows as failed, and 'Read again' reads it", async () => {
      process.env.CREDITS_ENFORCE = "on"; process.env.CREDITS_EXEMPT_ORGS = "free-org";
      const { debitCase, refundCase, debitRetry } = await import("../src/lib/payments/case-credit");
      const { failTr, userFixable } = await import("../src/lib/case-text");
      const NOT_PAID = "Reading failed (no credit taken)";
      let reads = 0;
      claude = async () => { reads++; return ok()(); };
      try {
        await db.insert(schema.creditsLedger).values({ orgId: "o", delta: 5000, reason: "purchase:unpaid-test" });
        // 1. the credit was never taken (the debit failed) and the case could not be removed
        const never = await newCase("uploaded"); await db.insert(schema.jobs).values({ caseId: never, step: "intake", state: "queued" });
        const r = await scanCase(never, "auto");
        assert.deepEqual(r, { ok: false, missing: [], claimed: false }); assert.equal(reads, 0);
        let c = await get(never);
        assert.equal(c.status, "failed"); assert.equal(c.error, NOT_PAID); assert.equal(c.caseData, null);
        assert.deepEqual(await events(never), ["Scan failed"]); assert.equal(await usageRows(never), 0);
        assert.equal((await db.select().from(schema.jobs).where(eq(schema.jobs.caseId, never)))[0].state, "done"); // the worker does not read it either
        assert.equal(failTr(NOT_PAID).key, "case.err.other"); assert.equal(userFixable(NOT_PAID), false); // "Read again", which takes the credit:
        assert.equal(await debitRetry("o", never), "charged");
        assert.equal((await scanCase(never, "retry")).ok, true); assert.equal(reads, 1); assert.equal((await get(never)).status, "phase_a");
        // 2. the credit was taken and went back (no balance at that moment, or the debit call failed halfway)
        const back = await newCase("uploaded"); assert.equal(await debitCase("o", back), true); assert.equal(await refundCase("o", back), true);
        await scanCase(back, "auto");
        c = await get(back); assert.equal(c.status, "failed"); assert.equal(c.error, NOT_PAID); assert.equal(reads, 1);
        // 3. the same pick-up twice at once: still no read
        const twice = await newCase("uploaded"); await Promise.all([scanCase(twice, "auto"), scanCase(twice, "auto")]);
        assert.equal((await get(twice)).error, NOT_PAID); assert.deepEqual(await events(twice), ["Scan failed"]); assert.equal(reads, 1);
        // 3b. an unpaid case whose automatic read died right after it was taken (before it could be marked): picked up again later, still not read
        const died = await newCase("reading", "lease:2026-01-01T00:00:00.000Z|died");
        assert.equal((await scanCase(died, "recover", "lease:2026-01-01T00:00:00.000Z|died")).claimed, false);
        assert.equal((await get(died)).error, NOT_PAID); assert.equal(reads, 1);
        // 4. a paid case is read as always; so is one whose retry was paid for after a refund
        const paid = await newCase("uploaded"); await debitCase("o", paid);
        assert.equal((await scanCase(paid, "auto")).ok, true); assert.equal(reads, 2);
        const again = await newCase("uploaded"); await debitCase("o", again); await refundCase("o", again); assert.equal(await debitRetry("o", again), "charged");
        assert.equal((await scanCase(again, "auto")).ok, true); assert.equal(reads, 3);
        // 5. an organisation that never pays, and a case made while charging was off that comes back with new files, read free as before
        const free = await newCase("uploaded", null, { orgId: "free-org" });
        assert.equal((await scanCase(free, "auto")).ok, true); assert.equal(reads, 4);
        const old = await newCase("uploaded", null, { caseData: { missing: ["Police report"] } }); await readEvent(old); // read once, no ledger row at all
        assert.equal((await scanCase(old, "auto")).ok, true); assert.equal(reads, 5);
        // 6. charging off: nothing is asked of the ledger
        delete process.env.CREDITS_ENFORCE;
        const off = await newCase("uploaded"); assert.equal((await scanCase(off, "auto")).ok, true); assert.equal(reads, 6);
      } finally { delete process.env.CREDITS_ENFORCE; delete process.env.CREDITS_EXEMPT_ORGS; }
    }],
    ["U2: photos that could not be used are said on the case's activity list, one line per reason, once", async () => {
      assert.deepEqual(leftOutLines({ leftOut: { heic: 3, big: 2, limit: 1, unreadable: 4 } }),
        ["Photos left out: 3 (HEIC)", "Photos left out: 2 (over 25 MB)", "Photos left out: 1 (more than 300 photos)", "Photos left out: 4 (cannot be opened)"]);
      assert.deepEqual(leftOutLines({ leftOut: noneLeftOut }), []); assert.deepEqual(leftOutLines(undefined), []);
      try {
        photoImport = async () => ({ added: 31, skipped: [], leftOut: { heic: 6, big: 0, limit: 0, unreadable: 3 } });
        claude = ok(["police report"]); const id = await newCase("uploaded");
        await scanCase(id, "auto");
        assert.deepEqual(await events(id), ["Reading documents", "Pending: police report", "Photos left out: 6 (HEIC)", "Photos left out: 3 (cannot be opened)"]);
        // read again: the same photos are still left out, and that is not said a second time; a new count is
        photoImport = async () => ({ added: 0, skipped: [], leftOut: { heic: 6, big: 0, limit: 0, unreadable: 4 } });
        claude = ok(); await scanCase(id, "retry");
        assert.deepEqual((await events(id)).filter((m) => m.startsWith("Photos")), ["Photos left out: 6 (HEIC)", "Photos left out: 3 (cannot be opened)", "Photos left out: 4 (cannot be opened)"]);
        // a failed read says it too, after the failure line
        photoImport = async () => ({ added: 1, skipped: [], leftOut: { heic: 0, big: 2, limit: 0, unreadable: 0 } });
        claude = async () => { throw new Error("api down"); }; const bad = await newCase("uploaded");
        await scanCase(bad, "auto");
        assert.deepEqual(await events(bad), ["Reading documents", "Scan failed", "Photos left out: 2 (over 25 MB)"]);
        // an import that itself fails adds nothing and never fails the read
        photoImport = async () => { throw new Error("store down"); };
        claude = ok(); const fine = await newCase("uploaded");
        assert.equal((await scanCase(fine, "auto")).ok, true);
        assert.deepEqual(await events(fine), ["Reading documents", "Documents read"]);
      } finally { photoImport = async () => ({ added: 0, skipped: [], leftOut: noneLeftOut }); }
    }],
    ["S-U1: one case is read at most so many times an hour, and so is one organisation, whoever starts the read; an hour later it reads again", async () => {
      const { CASE_READS_PER_HOUR, ORG_READS_PER_HOUR, readCapHit } = await import("../src/lib/read-cap");
      const hourAgo = (caseId: string) => db.execute(sql`update case_events set at = now() - interval '61 minutes' where case_id = ${caseId}`);
      // one case: the reads of the last hour count, the first one too
      claude = ok(["police report"]);
      const id = await newCase("pending_doc", null, { orgId: "cap-a" });
      for (let k = 1; k < CASE_READS_PER_HOUR; k++) await readEvent(id);
      assert.equal(await readCapHit(id, "cap-a"), null);
      assert.equal((await scanCase(id, "retry")).claimed, true); // the last one allowed
      assert.equal(await readCapHit(id, "cap-a"), "case");
      const reads = await usageRows(id);
      assert.deepEqual(await scanCase(id, "retry"), { ok: false, missing: [], claimed: false });
      assert.equal((await get(id)).status, "pending_doc"); // left as it was
      assert.equal(await usageRows(id), reads); // the model was not called
      // new files put the case back to `uploaded`: the read that starts by itself waits too, and the case keeps waiting
      await db.update(schema.cases).set({ status: "uploaded" }).where(eq(schema.cases.id, id));
      assert.equal((await scanCase(id, "auto")).claimed, false);
      assert.equal((await get(id)).status, "uploaded");
      // another case of the same organisation is not held back by this one
      const other = await newCase("uploaded", null, { orgId: "cap-a" });
      assert.equal((await scanCase(other, "auto")).claimed, true);
      // an hour later the case reads again
      await db.update(schema.cases).set({ status: "uploaded", error: null }).where(eq(schema.cases.id, id));
      await hourAgo(id);
      assert.equal(await readCapHit(id, "cap-a"), null);
      assert.equal((await scanCase(id, "auto")).claimed, true);

      // one organisation: reads of all its cases count, also those of a case the user deleted since
      claude = ok();
      const busy = await newCase("phase_a", null, { orgId: "cap-b" });
      await db.insert(schema.caseEvents).values(Array.from({ length: ORG_READS_PER_HOUR }, () => ({ caseId: busy, step: "read_docs", message: "Reading documents" })));
      await db.update(schema.cases).set({ deletedAt: new Date() }).where(eq(schema.cases.id, busy));
      const fresh = await newCase("uploaded", null, { orgId: "cap-b" });
      assert.equal(await readCapHit(fresh, "cap-b"), "org");
      assert.equal((await scanCase(fresh, "auto")).claimed, false);
      assert.equal((await scanCase(fresh, "retry")).claimed, false);
      assert.deepEqual([(await get(fresh)).status, await events(fresh)], ["uploaded", []]);
      // a dead read of that organisation is not started again over the limit, and is not given up on either: it waits
      const dead = "lease:2026-01-01T00:00:00.000Z|x";
      const stuck = await newCase("reading", dead, { orgId: "cap-b" });
      assert.equal((await scanCase(stuck, "recover", dead)).claimed, false);
      assert.deepEqual([(await get(stuck)).status, (await get(stuck)).error], ["reading", dead]);
      // another organisation is not held back
      const theirs = await newCase("uploaded", null, { orgId: "cap-c" });
      assert.equal(await readCapHit(theirs, "cap-c"), null);
      assert.equal((await scanCase(theirs, "auto")).ok, true);
      // one read drops out of the hour: there is room for exactly one more
      await db.execute(sql`update case_events set at = now() - interval '61 minutes' where id = (select min(id) from case_events where case_id = ${busy})`);
      assert.equal((await scanCase(fresh, "auto")).ok, true);
      const next = await newCase("uploaded", null, { orgId: "cap-b" });
      assert.equal((await scanCase(next, "auto")).claimed, false);
    }],
    ["S-U9: upload tokens are counted per organisation, kind and clock hour; over the limit none is given until the next hour", async () => {
      const { takeUploadToken, CASE_TOKENS_PER_HOUR, PHOTO_TOKENS_PER_HOUR } = await import("../src/lib/upload-cap");
      assert.ok(CASE_TOKENS_PER_HOUR >= 300 * 10 && PHOTO_TOKENS_PER_HOUR >= 2 * 300 * 10); // ten full cases in an hour never meet it
      const H = 3600_000, t0 = 500_000 * H + 5; // some clock hour
      const count = async (key: string) => (await db.select().from(schema.verification).where(eq(schema.verification.identifier, key))).map((r) => r.value);
      // requests at the same moment are all counted
      assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => takeUploadToken("tok-a", "case", t0))), new Array(20).fill(true));
      assert.deepEqual(await count("upload-tokens:case:tok-a"), ["20"]);
      // at the limit: the last one is given, the next is not, and it stays refused for the rest of the hour
      await db.execute(sql`update verification set value = ${String(CASE_TOKENS_PER_HOUR - 1)} where identifier = 'upload-tokens:case:tok-a'`);
      assert.equal(await takeUploadToken("tok-a", "case", t0 + 1000), true);
      assert.equal(await takeUploadToken("tok-a", "case", t0 + 2000), false);
      assert.equal(await takeUploadToken("tok-a", "case", t0 + H - 10), false);
      // desk photos are counted apart, and so is every other organisation
      assert.equal(await takeUploadToken("tok-a", "photo", t0), true);
      assert.equal(await takeUploadToken("tok-b", "case", t0), true);
      // the next clock hour starts at one again; the row of an hour that is over is removed once it has run out
      await db.execute(sql`update verification set expires_at = now() - interval '1 minute' where identifier = 'upload-tokens:case:tok-a'`);
      assert.equal(await takeUploadToken("tok-a", "case", t0 + H), true);
      assert.deepEqual(await count("upload-tokens:case:tok-a"), ["1"]);
      // rows that are not ours (sign-in codes live in the same table) are never touched
      await db.insert(schema.verification).values({ id: "other", identifier: "signup-again:a@b.c", value: "1", expiresAt: new Date(Date.now() - 60_000) });
      await db.execute(sql`delete from verification where identifier = 'upload-tokens:case:tok-b'`);
      assert.equal(await takeUploadToken("tok-b", "case", t0 + H), true);
      assert.deepEqual(await count("signup-again:a@b.c"), ["1"]);
    }],
    ["S-U1b: 'Read again' pressed twice (or five times) at the same moment is one read and one credit, never a free read; no credit, a lost claim or a failed read cost nothing", async () => {
      process.env.CREDITS_ENFORCE = "on"; delete process.env.CREDITS_EXEMPT_ORGS;
      const { POST } = await import("../src/app/api/cases/[id]/scan/route");
      const { debitCase, refundCase } = await import("../src/lib/payments/case-credit");
      const press = async (id: string) => { const r = await POST(new Request("http://x/"), { params: Promise.resolve({ id }) }); return { status: r.status, body: await r.json() }; };
      const ledger = async (id: string) => {
        const rows = await db.select().from(schema.creditsLedger).where(eq(schema.creditsLedger.caseId, id));
        return { debits: rows.filter((r) => r.delta < 0).length, refunds: rows.filter((r) => r.delta > 0).length };
      };
      const bal = async (o: string) => Number(((await db.execute(sql`SELECT COALESCE(SUM(delta),0)::int AS b FROM credits_ledger WHERE org_id = ${o}`)) as any).rows[0].b);
      /** A case that failed on our side: paid for when made, and the credit given back. */
      const refunded = async (org: string) => {
        const id = await newCase("uploaded", null, { orgId: org });
        assert.equal(await debitCase(org, id), true); assert.equal(await refundCase(org, id), true);
        await db.update(schema.cases).set({ status: "failed", error: "Reading failed" }).where(eq(schema.cases.id, id));
        return id;
      };
      let reads = 0;
      const slow = (out: () => Promise<any>) => async () => { reads++; await new Promise((r) => setTimeout(r, 30)); return out(); };
      try {
        for (const [org, presses] of [["race2", 2], ["race5", 5]] as const) {
          signedIn = org;
          await db.insert(schema.creditsLedger).values({ orgId: org, delta: 3000, reason: `purchase:${org}` });
          const id = await refunded(org);
          reads = 0; claude = slow(ok());
          const answers = await Promise.all(Array.from({ length: presses }, () => press(id)));
          assert.equal(reads, 1, `${presses} presses`);
          assert.deepEqual(answers.map((a) => a.status).sort(), [200, ...new Array(presses - 1).fill(409)]);
          assert.deepEqual(await ledger(id), { debits: 2, refunds: 1 }); // the first read's credit went back, this read took one: paid for
          assert.equal(await bal(org), 2000); // one credit for the one read, not none and not two
          assert.equal((await get(id)).status, "phase_a");
        }
        // the same, when the read then fails on our side: its credit goes back once, as before
        signedIn = "race-fail";
        await db.insert(schema.creditsLedger).values({ orgId: "race-fail", delta: 1000, reason: "purchase:race-fail" });
        const bad = await refunded("race-fail");
        reads = 0; claude = slow(async () => { throw new Error("Connection error"); });
        const failed = await Promise.all([press(bad), press(bad), press(bad)]);
        assert.equal(reads, 1);
        assert.deepEqual(failed.map((a) => a.status).sort(), [200, 409, 409]);
        assert.deepEqual(await ledger(bad), { debits: 2, refunds: 2 }); assert.equal(await bal("race-fail"), 1000);
        assert.equal((await get(bad)).status, "failed");
        // no credit left: nothing is read, nothing is taken, and the case is exactly as it was (also the documents it waits for)
        signedIn = "race-poor";
        const poor = await newCase("pending_doc", null, { orgId: "race-poor", pendingDoc: "police report" });
        await db.insert(schema.creditsLedger).values([{ orgId: "race-poor", delta: -1000, reason: `case:${poor}`, caseId: poor }, { orgId: "race-poor", delta: 1000, reason: `case-refund:failed:${poor}:x`, caseId: poor }]);
        reads = 0; claude = slow(ok());
        const none = await Promise.all([press(poor), press(poor)]);
        assert.equal(reads, 0);
        assert.ok(none.some((a) => a.status === 402 && a.body.error === "no_credits") && none.every((a) => a.status === 402 || a.status === 409), JSON.stringify(none));
        const after = await get(poor);
        assert.deepEqual([after.status, after.error, after.pendingDoc], ["pending_doc", null, "police report"]);
        assert.deepEqual(await ledger(poor), { debits: 2, refunds: 2 }); assert.equal(await bal("race-poor"), 0); // tried and undone, nothing kept
        assert.deepEqual(await events(poor), []);
        // a case that is still paid for reads again without a second credit; two presses are still one read
        signedIn = "race-paid";
        await db.insert(schema.creditsLedger).values({ orgId: "race-paid", delta: 1000, reason: "purchase:race-paid" });
        const paid = await newCase("pending_doc", null, { orgId: "race-paid", pendingDoc: "police report" });
        assert.equal(await debitCase("race-paid", paid), true);
        reads = 0; claude = slow(ok());
        assert.deepEqual((await Promise.all([press(paid), press(paid)])).map((a) => a.status).sort(), [200, 409]);
        assert.equal(reads, 1); assert.deepEqual(await ledger(paid), { debits: 1, refunds: 0 }); assert.equal(await bal("race-paid"), 0);
        // read too often in the last hour: the press is answered 429 "too_many", nothing is read and no credit is taken
        const { CASE_READS_PER_HOUR } = await import("../src/lib/read-cap");
        signedIn = "race-cap";
        await db.insert(schema.creditsLedger).values({ orgId: "race-cap", delta: 1000, reason: "purchase:race-cap" });
        const often = await refunded("race-cap");
        await db.insert(schema.caseEvents).values(Array.from({ length: CASE_READS_PER_HOUR }, () => ({ caseId: often, step: "read_docs", message: "Reading documents" })));
        reads = 0; claude = slow(ok());
        assert.deepEqual(await press(often), { status: 429, body: { error: "too_many" } });
        assert.equal(reads, 0); assert.deepEqual(await ledger(often), { debits: 1, refunds: 1 }); assert.equal(await bal("race-cap"), 1000);
        assert.equal((await get(often)).status, "failed");
      } finally { delete process.env.CREDITS_ENFORCE; signedIn = "o"; }
    }],
    ["S-U1b: when taking the credit itself fails, nothing is read and the case goes back to what it was", async () => {
      claude = ok(); const id = await newCase("failed", "Reading failed");
      const was = { status: "failed", error: "Reading failed", pendingDoc: null };
      await assert.rejects(scanCase(id, "retry", null, { was, pay: async () => { throw new Error("ledger down"); } }), /ledger down/);
      const c = await get(id);
      assert.deepEqual([c.status, c.error, await events(id), await usageRows(id)], ["failed", "Reading failed", [], 0]);
      // a case that changed since the caller looked at it is not taken at all, and nothing is asked of the ledger
      let asked = 0;
      const r = await scanCase(id, "retry", null, { was: { ...was, error: "Reading timed out" }, pay: async () => { asked++; return "charged"; } });
      assert.deepEqual([r.claimed, asked, (await get(id)).status], [false, 0, "failed"]);
      // as the caller saw it and paid: read
      assert.equal((await scanCase(id, "retry", null, { was, pay: async () => "charged" })).ok, true);
    }],
    ["leaseTime reads the lease time, ignores other text", async () => {
      assert.equal(leaseTime("lease:2026-01-01T00:00:00.000Z|abc"), Date.parse("2026-01-01T00:00:00.000Z"));
      assert.equal(leaseTime("api down"), null); assert.equal(leaseTime(null), null);
    }],
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("ok   -", name); } catch (e) { failed++; console.log("FAIL -", name, "\n      ", (e as Error).message); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}
main();
