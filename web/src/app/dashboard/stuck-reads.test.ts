import { test } from "node:test";
import assert from "node:assert/strict";
import { HEAL_PER_VISIT, pickReads, pickStuck } from "./stuck-reads";

const now = Date.parse("2026-11-27T04:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000);
const row = (id: string, status: string, min: number, error: string | null = null) => ({ id, status, error, createdAt: ago(min) });
const lease = (min: number) => `lease:${ago(min).toISOString()}|x`;

test("D1 heal looks at every case it is given, however old: a read never started, and a read that died", () => {
  const rows = [
    row("new", "uploaded", 0.5), // made half a minute ago: its own start is still on the way
    row("late", "uploaded", 3),
    row("old-late", "uploaded", 60 * 24 * 40), // far outside any "newest 200"
    row("alive", "reading", 30, lease(2)),
    row("dead", "reading", 60 * 24 * 40, lease(7)),
    row("dead-no-lease", "reading", 10),
    row("done", "done", 5),
    row("failed", "failed", 5, "Reading timed out"),
  ];
  const p = pickStuck(rows, now);
  assert.deepEqual(p.late.map((c) => c.id), ["late", "old-late"]);
  assert.deepEqual(p.stale.map((c) => c.id), ["dead", "dead-no-lease"]);
  assert.equal(p.room, HEAL_PER_VISIT - 1); // one read is alive
});

test("D1 heal starts nothing more while enough reads are running", () => {
  const rows = [row("a", "reading", 1, lease(1)), row("b", "reading", 1, lease(1)), row("c", "reading", 1, lease(1)), row("late", "uploaded", 5)];
  assert.equal(pickStuck(rows, now).room, 0);
});

test("heal: the first page and the heal request pick the same reads in the same order (dead ones first, then the oldest waiting), never more than there is room for", () => {
  // as the shared query gives them: oldest first
  const rows = [
    row("dead", "reading", 600, lease(7)),
    row("w1", "uploaded", 50),
    row("alive", "reading", 40, lease(1)),
    row("w2", "uploaded", 30),
    row("w3", "uploaded", 20),
    row("fresh", "uploaded", 0.5),
  ];
  const picked = pickReads(rows, now, false);
  assert.deepEqual(picked.map((r) => `${r.mode} ${r.id}`), ["recover dead", "auto w1"]); // one read is alive: room for two
  assert.equal(picked[0].seen, rows[0].error); // the lease it saw: a newer attempt is never taken over
  assert.deepEqual(pickReads(rows, now, false), picked); // asked twice at the same moment: the same cases, so the claim lets one through
});

test("heal: while a zip split runs its new cases are left alone, a dead read is still started again", () => {
  const rows = [row("dead", "reading", 600, lease(7)), row("w1", "uploaded", 50), row("w2", "uploaded", 30)];
  assert.deepEqual(pickReads(rows, now, true).map((r) => r.id), ["dead"]);
  assert.deepEqual(pickReads(rows, now, false).map((r) => r.id), ["dead", "w1", "w2"]);
});
