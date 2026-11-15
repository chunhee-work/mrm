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
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const root = path.resolve(__dirname, "..");
const pg = new PGlite();
const db = drizzle(pg, { schema });

// Swap the three modules scan-case.ts imports: server-only (throws outside Next), the db, and the Claude call.
let claude: () => Promise<any> = async () => { throw new Error("claude not set"); };
const stubs: Record<string, unknown> = {
  "server-only": {},
  "@/db": { db, schema },
  "@/lib/read-docs": { readCaseDocs: () => claude() },
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
  const tests: [string, () => Promise<void>][] = [
    ["auto: uploaded -> phase_a, one usage row, fields saved", async () => {
      claude = ok(); const id = await newCase("uploaded");
      const r = await scanCase(id, "auto");
      const c = await get(id);
      assert.equal(r.claimed, true); assert.equal(c.status, "phase_a"); assert.equal(c.error, null);
      assert.equal(c.insurer, "Allianz"); assert.equal(c.carModel, "Myvi");
      assert.equal(await usageRows(id), 1);
      assert.deepEqual(await events(id), ["Reading documents", "Documents read"]);
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
