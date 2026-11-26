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
const stubs: Record<string, unknown> = {
  "server-only": {},
  "@/db": { db, schema },
  "@/lib/read-docs": { readCaseDocs: () => claude(), BadFile: class BadFile extends Error {} },
  "@/lib/expand-bundles": { expandBundles: async () => 0 },
  "@/lib/photos/import-files": { importCasePhotos: async () => ({ added: 0, skipped: [] }) },
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

  const { scanCase, leaseTime } = await import("../src/lib/scan-case");
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
      assert.equal(c.status, "failed"); assert.equal(c.error, "api down"); assert.deepEqual(c.caseData, { keep: true });
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
