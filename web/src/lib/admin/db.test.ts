import test, { before } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { recordCall } from "@/lib/ledger";
import { sendEmail } from "@/lib/email";
import { casesPage, costPage, overview, usersList } from "./queries";

// Needs a local Postgres with the migrations applied (DATABASE_URL on localhost); skipped otherwise (e.g. in CI).
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
const t = local ? test : test.skip;
const hrs = (h: number) => new Date(Date.now() - h * 3600_000);
const ext = { includeInternal: false }, inc = { includeInternal: true };

before(async () => {
  if (!local) return;
  process.env.ADMIN_EMAILS = "owner@x.com";
  await db.execute(sql`TRUNCATE llm_calls, email_log, audit_log, case_events, cases, memberships, organizations, session, "user" RESTART IDENTITY CASCADE`);
  const mk = (id: string, email: string, ageH: number, verified = true) => ({ id, name: id, email, emailVerified: verified, createdAt: hrs(ageH), updatedAt: hrs(ageH) });
  await db.insert(schema.user).values([
    mk("owner", "owner@x.com", 500), mk("smoke", "smoke-tester@autoclaim.invalid", 400),
    mk("a", "alice@real.com", 24), mk("b", "bob@real.com", 2, false), mk("c", "old@real.com", 24 * 20),
  ]);
  await db.insert(schema.session).values({ id: "s1", token: "t1", userId: "a", expiresAt: hrs(-24), createdAt: hrs(5), updatedAt: hrs(1) });
  await db.insert(schema.organizations).values({ id: "org1", name: "o" });
  const cs = (id: string, by: string, status: string, ageH: number, error: string | null = null) => ({ id, orgId: "org1", createdBy: by, plate: "X", status, createdAt: hrs(ageH), error });
  await db.insert(schema.cases).values([cs("c1", "a", "done", 3), cs("c2", "a", "failed", 3, "scan failed"), cs("c3", "b", "reading", 3), cs("c4", "owner", "done", 3), cs("c5", "a", "phase_a", 0.1)]);
  const call = (rid: string, user: string | null, caseId: string | null, usd: string | null, ageH: number, ok = true) => ({
    requestId: rid, userId: user, caseId, purpose: "read_docs", model: "claude-opus-5-5", inputTokens: 10, outputTokens: 5, costUsd: usd, at: hrs(ageH), ok });
  await db.insert(schema.llmCalls).values([
    call("r1", "a", "c1", "1.50000000", 1), call("r2", "a", "c2", "0.50000000", 30), call("r3", "b", "c3", "2.25000000", 1),
    call("r4", "owner", "c4", "9.00000000", 1), call("r5", "smoke", null, "7.00000000", 1), call("r6", null, null, "0.25000000", 1),
    call("r7", "a", "c1", null, 1), call("r8", "a", null, "0", 1, false),
  ]);
  await db.insert(schema.emailLog).values([{ kind: "verify", recipientDomain: "real.com", status: "sent", at: hrs(1) }, { kind: "reset", recipientDomain: "real.com", status: "failed", errorClass: "X", at: hrs(1) }]);
});

t("overview numbers reconcile with the seeded rows, internal accounts left out", async () => {
  const o = await overview(ext);
  assert.deepEqual(o.users, { total: 3, verified: 2, d7: 2, d30: 3 });
  assert.equal(o.signups.length, 30);
  assert.equal(o.signups.reduce((a, s) => a + s.n, 0), 3);
  assert.equal(o.cases.total, 4); assert.equal(o.cases.failed7, 1);
  assert.deepEqual(o.cases.byStatus, { done: 1, failed: 1, reading: 1, phase_a: 1 });
  assert.equal(o.cost.d30, 1.5 + 0.5 + 2.25 + 0.25); // a, b and the system call; not owner/smoke
  assert.equal(o.cost.today >= 3.75, true);
  assert.equal(o.cost.calls, 6); assert.equal(o.cost.unpriced, 1); assert.equal(o.cost.failedCalls, 1);
  assert.deepEqual([o.email.sent7, o.email.failed7], [1, 1]);
});
t("the include-internal toggle brings the owner and smoke numbers back", async () => {
  const o = await overview(inc);
  assert.equal(o.users.total, 5); assert.equal(o.cases.total, 5); assert.equal(o.cost.calls, 8);
  assert.equal(o.cost.d30, 1.5 + 0.5 + 2.25 + 9 + 7 + 0.25);
});
t("users list: search by email or name, newest first, per-user cost and cases", async () => {
  const all = await usersList(ext, "", 0);
  assert.deepEqual(all.rows.map((u) => u.id), ["b", "a", "c"]); assert.equal(all.total, 3);
  const a = all.rows.find((u) => u.id === "a")!;
  assert.equal(a.cases, 3); assert.equal(a.cost, 2); assert.equal(a.lastSeen !== null, true);
  assert.deepEqual((await usersList(ext, "ALI", 0)).rows.map((u) => u.id), ["a"]);
  assert.deepEqual((await usersList(ext, "%", 0)).rows, []); // % is literal, not a wildcard
  assert.equal((await usersList(inc, "", 0)).total, 5);
});
t("cost page groups by day, model, purpose, user and case", async () => {
  const c = await costPage(ext);
  assert.equal(c.byModel.length, 1); assert.equal(c.byModel[0].calls, 6); assert.equal(c.byModel[0].unpriced, 1);
  assert.equal(c.byUser[0].email, "bob@real.com"); assert.equal(c.byUser[0].usd, 2.25);
  assert.equal(c.topCases[0].caseId, "c3");
  assert.equal(c.byDay.reduce((a, d) => a + d.usd, 0), 4.5);
});
t("cases page lists stuck (>1 h, unfinished) and failed with reasons", async () => {
  const c = await casesPage(ext);
  assert.deepEqual(c.stuck.map((s) => s.id), ["c3"]); // c5 is only 6 minutes old
  assert.deepEqual(c.failed.map((f) => [f.id, f.error]), [["c2", "scan failed"]]);
});
t("ledger: the same request id twice is one row; a different payload is flagged, first row wins", async () => {
  const row = { requestId: "dup1", userId: "a", caseId: "c1", purpose: "read_docs", model: "claude-opus-5-5", inputTokens: 1, outputTokens: 1, costUsd: "0.1" };
  assert.equal(await recordCall(row), "inserted");
  assert.equal(await recordCall(row), "replay");
  assert.equal(await recordCall({ ...row, userId: "b", inputTokens: 99 }), "conflict");
  const r = await db.execute(sql`SELECT count(*) n FROM llm_calls WHERE request_id = 'dup1'`);
  assert.equal(Number((r.rows ?? r)[0].n), 1);
  const [stored] = await db.select().from(schema.llmCalls).where(sql`request_id = 'dup1'`);
  assert.equal(stored.userId, "a");
  const au = await db.execute(sql`SELECT count(*) n FROM audit_log WHERE action = 'llm_calls_conflict'`);
  assert.equal(Number((au.rows ?? au)[0].n), 1);
  await recordCall({ ...row, requestId: "x".repeat(81) }); // over-long id is rejected by the CHECK, never thrown
});
t("email log keeps kind, domain and outcome only (no subject, body or link)", async () => {
  delete process.env.RESEND_API_KEY;
  await sendEmail("someone@Secret-Domain.com", "SECRET SUBJECT 12345", "<a href='https://x/token=ABC'>link</a>", "verify");
  const r = await db.execute(sql`SELECT * FROM email_log WHERE recipient_domain = 'secret-domain.com'`);
  const row = (r.rows ?? r)[0];
  assert.equal(row.kind, "verify"); assert.equal(row.status, "skipped");
  assert.equal(Object.keys(row).sort().join(), "at,error_class,id,kind,recipient_domain,status");
  assert.equal(JSON.stringify(row).includes("SECRET SUBJECT") || JSON.stringify(row).includes("ABC"), false);
});
