// Progress screenshots: who may see them. No database, no network, no Blob store.
import test from "node:test";
import assert from "node:assert/strict";
import { mayView, shotHandlers, type Deps, type ShotRow } from "../src/lib/screenshots/access";

const CASE = { id: "case1", orgId: "orgA", createdBy: "userA" };
const row = (o: Partial<ShotRow> = {}): ShotRow => ({
  id: "s1", caseId: "case1", userId: "userA", orgId: "orgA", step: "case_opened",
  blobPathname: "screenshots/userA/case1/case_opened-20261121T010203000000Z.jpg", deletedAt: null, ...o,
});
function make(viewer: { userId: string; orgId: string } | null, o: Partial<Deps> = {}, enabled = true) {
  const opened: string[] = [];
  const d: Deps = {
    enabled: () => enabled,
    viewer: async () => viewer,
    loadCase: async (id) => (id === CASE.id ? CASE : null),
    listShots: async (caseId, userId) => [row(), row({ id: "s2", userId: "userB" })].filter((r) => r.caseId === caseId && r.userId === userId),
    loadShot: async (id) => ({ s1: row(), s2: row({ id: "s2", userId: "userB", blobPathname: "screenshots/userB/case1/x.jpg" }) } as Record<string, ShotRow>)[id] ?? null,
    open: async (p) => { opened.push(p); return { body: new Uint8Array([0xff, 0xd8]) as unknown as BodyInit, contentType: "image/jpeg" }; },
    ...o,
  };
  return { h: shotHandlers(d), opened };
}

test("owner: list 200 and image 200 from the private store", async () => {
  const { h, opened } = make({ userId: "userA", orgId: "orgA" });
  const l = await h.list("case1");
  assert.equal(l.status, 200);
  assert.deepEqual((await l.json()).shots, [{ id: "s1", step: "case_opened" }]);
  const i = await h.image("case1", "s1");
  assert.equal(i.status, 200);
  assert.equal(i.headers.get("content-type"), "image/jpeg");
  assert.match(i.headers.get("cache-control") ?? "", /private/);
  assert.deepEqual(opened, [row().blobPathname]);
});
test("same organisation, other user: 404 for the list and for the picture", async () => {
  const { h, opened } = make({ userId: "userB", orgId: "orgA" });
  assert.equal((await h.list("case1")).status, 404);
  assert.equal((await h.image("case1", "s1")).status, 404);
  assert.equal(opened.length, 0);
});
test("other organisation: 404", async () => {
  const { h, opened } = make({ userId: "userC", orgId: "orgZ" });
  assert.equal((await h.list("case1")).status, 404);
  assert.equal((await h.image("case1", "s1")).status, 404);
  assert.equal(opened.length, 0);
});
test("user B cannot read A's picture by asking for it under B's own case id or with a guessed id", async () => {
  const { h } = make({ userId: "userB", orgId: "orgA" }, { loadCase: async () => ({ id: "case1", orgId: "orgA", createdBy: "userB" }) });
  assert.equal((await h.image("case1", "s1")).status, 404); // row belongs to userA
});
test("signed out: 401; flag off: 404 even for the owner", async () => {
  assert.equal((await make(null).h.list("case1")).status, 401);
  assert.equal((await make({ userId: "userA", orgId: "orgA" }, {}, false).h.list("case1")).status, 404);
  assert.equal((await make({ userId: "userA", orgId: "orgA" }, {}, false).h.image("case1", "s1")).status, 404);
});
test("default deny: case without a submitter, deleted rows, wrong path prefix", () => {
  const v = { userId: "userA", orgId: "orgA" };
  assert.equal(mayView(v, { ...CASE, createdBy: null }), false);
  assert.equal(mayView(v, CASE, row({ deletedAt: new Date() })), false);
  assert.equal(mayView(v, CASE, row({ blobPathname: "screenshots/userB/case1/x.jpg" })), false);
  assert.equal(mayView(v, CASE, row({ blobPathname: "other/userA/case1/x.jpg" })), false);
  assert.equal(mayView(v, CASE, row({ caseId: "case2" })), false);
  assert.equal(mayView(null, CASE), false);
  assert.equal(mayView(v, null), false);
  assert.equal(mayView(v, CASE, row()), true);
});
