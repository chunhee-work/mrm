// Removing a line from a case's Activity list (plan #148). Needs a LOCAL Postgres with the migrations applied
// (DATABASE_URL on localhost); without one the database tests are skipped (CI has no database).
import test from "node:test";
import assert from "node:assert/strict";

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
const opts = { skip: local ? false : "needs a local Postgres (DATABASE_URL on localhost)" };

async function kit() {
  const { db, schema } = await import("../src/db");
  const { sql, eq } = await import("drizzle-orm");
  const ev = await import("../src/lib/case-events");
  return { db, schema, sql, eq, ev };
}
let seq = 0;
async function newCase(lines: number, opt: { deleted?: boolean } = {}) {
  const { db, schema } = await kit();
  const orgId = `org_ev_${Date.now()}_${++seq}`;
  const id = `case_ev_${Date.now()}_${++seq}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Test" });
  await db.insert(schema.cases).values({ id, orgId, plate: "TST1234", status: "waiting_user", deletedAt: opt.deleted ? new Date() : null });
  const ids: number[] = [];
  for (let i = 0; i < lines; i++) {
    const [r] = await db.insert(schema.caseEvents).values({ caseId: id, step: "phase_a", message: `line ${i}`, at: new Date(Date.now() - (lines - i) * 60_000) }).returning({ id: schema.caseEvents.id });
    ids.push(r.id);
  }
  return { orgId, id, ids };
}

test("eventIdOf: only a positive whole number that fits an int", async () => {
  const { eventIdOf } = await import("../src/lib/case-events");
  assert.equal(eventIdOf("12"), 12);
  for (const bad of ["0", "-1", "1.5", "abc", "", "12a", "01", "99999999999", "2147483648"]) assert.equal(eventIdOf(bad), null, bad);
});

test("hide: the line leaves the Activity list, stays in the table, and hiding twice is a no-op", opts, async () => {
  const { ev, db, schema, eq } = await kit();
  const { orgId, id, ids } = await newCase(3);
  assert.equal(await ev.setEventHidden(orgId, "user_a", id, ids[1], true), true);
  assert.deepEqual((await ev.activityOf(id, 100)).map((e) => e.id), [ids[0], ids[2]]);
  const [row] = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.id, ids[1]));
  assert.ok(row.hiddenAt);
  assert.equal(row.hiddenBy, "user_a");
  // hiding again keeps the first time and who did it
  assert.equal(await ev.setEventHidden(orgId, "user_b", id, ids[1], true), true);
  const [again] = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.id, ids[1]));
  assert.equal(again.hiddenBy, "user_a");
  assert.equal(again.hiddenAt!.getTime(), row.hiddenAt!.getTime());
  // every row is still there for the backend readers
  assert.equal((await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, id))).length, 3);
});

test("unhide: Undo brings the line back; unhiding a shown line is a no-op", opts, async () => {
  const { ev } = await kit();
  const { orgId, id, ids } = await newCase(2);
  assert.equal(await ev.setEventHidden(orgId, "u", id, ids[0], false), true);
  await ev.setEventHidden(orgId, "u", id, ids[0], true);
  assert.equal(await ev.setEventHidden(orgId, "u", id, ids[0], false), true);
  assert.deepEqual((await ev.activityOf(id, 100)).map((e) => e.id), ids);
});

test("not found: unknown line, a line of another case, another organisation, a deleted case", opts, async () => {
  const { ev } = await kit();
  const a = await newCase(1);
  const b = await newCase(1);
  const gone = await newCase(1, { deleted: true });
  assert.equal(await ev.setEventHidden(a.orgId, "u", a.id, 2_000_000_000, true), false);
  assert.equal(await ev.setEventHidden(a.orgId, "u", a.id, b.ids[0], true), false, "line of another case");
  assert.equal(await ev.setEventHidden(a.orgId, "u", b.id, b.ids[0], true), false, "case of another organisation");
  assert.equal(await ev.setEventHidden(gone.orgId, "u", gone.id, gone.ids[0], true), false, "deleted case");
  assert.equal(await ev.setEventHidden(b.orgId, "u", b.id, b.ids[0], false), true);
  assert.equal((await ev.activityOf(b.id, 100)).length, 1, "nothing of b was hidden");
});

test("newest-N window: hiding lines lets older ones move in; the count is the lines shown", opts, async () => {
  const { ev } = await kit();
  const { orgId, id, ids } = await newCase(5);
  assert.deepEqual((await ev.activityOf(id, 3)).map((e) => e.id), ids.slice(2));
  await ev.setEventHidden(orgId, "u", id, ids[4], true);
  await ev.setEventHidden(orgId, "u", id, ids[3], true);
  const shown = await ev.activityOf(id, 3);
  assert.deepEqual(shown.map((e) => e.id), ids.slice(0, 3));
  assert.equal(shown.length, 3);
});

test("self-heal time: hiding the newest line does not change the case's last activity", opts, async () => {
  const { ev, db, schema, eq } = await kit();
  const { orgId, id, ids } = await newCase(3);
  const before = await ev.lastEventAt(id);
  await ev.setEventHidden(orgId, "u", id, ids[2], true);
  const after = await ev.lastEventAt(id);
  assert.equal(after!.getTime(), before!.getTime());
  const [newest] = await db.select({ at: schema.caseEvents.at }).from(schema.caseEvents).where(eq(schema.caseEvents.id, ids[2]));
  assert.equal(after!.getTime(), newest.at.getTime());
  assert.equal(await ev.lastEventAt("no_such_case"), null);
});
