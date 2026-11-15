// Database tests of the photo naming desk (plan #9, section H). They need a LOCAL Postgres with the migrations applied:
//   DATABASE_URL=postgres://…@localhost:5432/… PHOTO_STORE_DIR=/tmp/… npm test
// Without a localhost DATABASE_URL every test here is skipped (CI has no database).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "");
if (local && !process.env.PHOTO_STORE_DIR) process.env.PHOTO_STORE_DIR = mkdtempSync(path.join(tmpdir(), "photos-"));
const opts = { skip: local ? false : "needs a local Postgres (DATABASE_URL on localhost)" };
const store = () => process.env.PHOTO_STORE_DIR!;
const fileOf = (p: string) => path.join(store(), p.replace(/[\\/]/g, "__"));

async function kit() {
  const { db, schema } = await import("../src/db");
  const { sql, eq } = await import("drizzle-orm");
  const s = await import("../src/lib/photos/server");
  return { db, schema, sql, eq, s };
}
let seq = 0;
async function newCase(status = "naming", photos = 0, org?: string) {
  const { db, schema } = await kit();
  const orgId = org ?? `org_${Date.now()}_${++seq}`;
  const id = `case_${Date.now()}_${++seq}`;
  if (!org) await db.insert(schema.organizations).values({ id: orgId, name: "Test" });
  await db.insert(schema.cases).values({ id, orgId, plate: "TST1234", status });
  if (photos) {
    await db.insert(schema.casePhotos).values(Array.from({ length: photos }, (_, i) => ({
      caseId: id, position: i, origN: i + 1, srcName: `IMG_${i + 1}.jpg`,
      blobPath: `${orgId}/${id}/photos/h${i}-f-IMG_${i + 1}.jpg`, thumbPath: `${orgId}/${id}/photos/h${i}-s-IMG_${i + 1}.jpg`,
    })));
  }
  const c = (await (await kit()).s.caseInOrg(orgId, id))!;
  return { orgId, id, c };
}
const rows = async (caseId: string) => {
  const { db, schema, eq } = await kit();
  return (await db.select().from(schema.casePhotos).where(eq(schema.casePhotos.caseId, caseId))).sort((a, b) => a.position - b.position);
};
const caseNow = async (orgId: string, id: string) => (await (await kit()).s.caseInOrg(orgId, id))!;
const named = { modelName: "Bonnet", confidence: 0.95, alts: ["Front Bumper"], how: "model" };

test("claim: two callers at the same moment get different photos, in display order", opts, async () => {
  const { s } = await kit();
  const { id } = await newCase("naming", 12);
  const [a, b] = await Promise.all([s.claimSlice(id), s.claimSlice(id)]);
  const ids = [...a, ...b].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "no photo was taken twice");
  assert.equal(ids.length, 12);
  assert.deepEqual(await s.claimSlice(id), []);
  assert.equal(await s.pendingCount(id), 12); // running still counts as not finished
});

test("claim: a photo stuck in 'running' for over 6 minutes is taken again, and the late first answer is ignored", opts, async () => {
  const { s, db, sql } = await kit();
  const { id } = await newCase("naming", 2);
  const first = await s.claimSlice(id);
  await db.execute(sql`UPDATE case_photos SET claimed_at = now() - interval '5 minutes' WHERE case_id = ${id}`);
  assert.deepEqual(await s.claimSlice(id), [], "5 minutes: not yet");
  await db.execute(sql`UPDATE case_photos SET claimed_at = now() - interval '7 minutes' WHERE case_id = ${id}`);
  const second = await s.claimSlice(id);
  assert.equal(second.length, 2);
  assert.equal(await s.writeName(first[0], { ...named, modelName: "Front Bumper" }), false, "the late answer must not land");
  const again = second.find((x) => x.id === first[0].id)!;
  assert.equal(await s.writeName(again, named), true);
  assert.equal(await s.writeName(again, { ...named, modelName: "Grille Front" }), false, "an answered photo is not written twice");
  const r = (await rows(id)).find((x) => x.id === first[0].id)!;
  assert.equal(r.modelName, "Bonnet");
  assert.equal(r.nameState, "named");
  await s.writeFailed(second.filter((x) => x.id !== first[0].id), "name-photos: 529");
  assert.equal((await rows(id)).find((x) => x.id !== first[0].id)!.nameState, "failed");
});

test("reorder between two slices: the next slice follows the new order and named photos are not touched", opts, async () => {
  const { s } = await kit();
  const { id, c } = await newCase("naming", 12);
  const first = await s.claimSlice(id);
  for (const x of first) await s.writeName(x, named);
  const before = await rows(id);
  const ids = before.map((r) => r.id);
  const lastFour = ids.slice(8).reverse();
  const r = await s.reorderPhotos(c, [...ids.slice(0, 8), ...lastFour], 0);
  assert.equal(r.status, 200);
  const next = await s.claimSlice(id, 2);
  assert.deepEqual(next.map((x) => x.id).sort(), lastFour.slice(0, 2).sort());
  const after = await rows(id);
  assert.equal(after.filter((x) => x.nameState === "named" && x.modelName === "Bonnet").length, 8);
});

test("rename: a stale version gets 409 with the current row; same as the suggestion means restore", opts, async () => {
  const { s } = await kit();
  const { id, c } = await newCase("naming", 1);
  const [cl] = await s.claimSlice(id);
  await s.writeName(cl, named);
  const p = (await rows(id))[0];
  const a = await s.renamePhoto(c, p.id, "  grille   front ", 0);
  assert.equal(a.status, 200);
  assert.equal((a.body.photo as { finalName: string }).finalName, "Grille Front");
  const b = await s.renamePhoto(c, p.id, "Front Bumper", 0); // the other tab still has version 0
  assert.equal(b.status, 409);
  assert.equal((b.body.photo as { finalName: string; version: number }).finalName, "Grille Front");
  assert.equal((b.body.photo as { version: number }).version, 1);
  const r = await s.renamePhoto(c, p.id, "bonnet", 1);
  assert.equal((r.body.photo as { finalName: string | null }).finalName, null);
  assert.equal((await s.renamePhoto(c, p.id, "x".repeat(121), 2)).status, 400);
  assert.equal((await s.renamePhoto(c, 999_999_999, "Bonnet", 0)).status, 404);
});

test("done: sets the tick and moves waiting_user/naming to phase_b; any edit takes it away again", opts, async () => {
  const { s } = await kit();
  const { orgId, id, c } = await newCase("waiting_user", 2);
  assert.equal((await s.setDone(c, true)).body.reason, "naming");
  for (const x of await s.claimSlice(id)) await s.writeName(x, named);
  const d = await s.setDone(c, true);
  assert.deepEqual([d.status, d.body.status], [200, "phase_b"]);
  let now = await caseNow(orgId, id);
  assert.ok(now.photosDoneAt);
  assert.ok((await rows(id)).every((r) => r.confirmed));
  const p = (await rows(id))[0];
  await s.renamePhoto(now, p.id, "Front Bumper", p.version);
  now = await caseNow(orgId, id);
  assert.equal(now.photosDoneAt, null);
  assert.equal(now.status, "waiting_user");
  assert.ok((await rows(id)).every((r) => !r.confirmed));
});

test("done: a case already at 'checking' or 'done' keeps its status when a photo is edited", opts, async () => {
  const { s, db, schema, eq } = await kit();
  for (const status of ["checking", "done"]) {
    const { orgId, id } = await newCase("naming", 1);
    for (const x of await s.claimSlice(id)) await s.writeName(x, named);
    await s.setDone(await caseNow(orgId, id), true);
    await db.update(schema.cases).set({ status }).where(eq(schema.cases.id, id));
    const p = (await rows(id))[0];
    await s.renamePhoto(await caseNow(orgId, id), p.id, "Front Bumper", p.version);
    const now = await caseNow(orgId, id);
    assert.equal(now.status, status);
    assert.equal(now.photosDoneAt, null);
    assert.ok((await rows(id)).every((r) => !r.confirmed));
    assert.equal((await s.setDone(now, true)).body.error, "status", "done is refused from this status");
  }
});

test("done: other statuses are left alone; a failed photo blocks until it is named by hand", opts, async () => {
  const { s } = await kit();
  const { orgId, id, c } = await newCase("pending_doc", 2);
  const cl = await s.claimSlice(id);
  await s.writeName(cl[0], named);
  await s.writeFailed([cl[1]], "name-photos: 500");
  const blocked = await s.setDone(c, true);
  assert.deepEqual([blocked.status, blocked.body.reason, blocked.body.count], [409, "unnamed", 1]);
  const failed = (await rows(id)).find((r) => r.nameState === "failed")!;
  await s.renamePhoto(c, failed.id, "Front Bumper", failed.version);
  const ok = await s.setDone(await caseNow(orgId, id), true);
  assert.deepEqual([ok.status, ok.body.status], [200, "pending_doc"]);
  assert.equal((await rows(id)).find((r) => r.id === failed.id)!.nameState, "failed", "kept for the record");
  assert.equal((await s.setDone(await newCase("naming", 0).then((x) => x.c), true)).body.reason, "empty");
});

test("reorder: must be a permutation; the second writer on an old order gets 409; renames are independent", opts, async () => {
  const { s } = await kit();
  const { orgId, id, c } = await newCase("naming", 3);
  const ids = (await rows(id)).map((r) => r.id);
  assert.equal((await s.reorderPhotos(c, [ids[0], ids[1]], 0)).status, 409);
  assert.equal((await s.reorderPhotos(c, [ids[0], ids[1], 5], 0)).status, 409);
  const a = await s.reorderPhotos(c, [ids[2], ids[0], ids[1]], 0);
  assert.deepEqual([a.status, a.body.rev], [200, 1]);
  assert.equal((await s.reorderPhotos(c, [ids[1], ids[0], ids[2]], 0)).status, 409, "tab B still had rev 0");
  assert.deepEqual((await rows(id)).map((r) => r.id), [ids[2], ids[0], ids[1]]);
  const r = await s.renamePhoto(await caseNow(orgId, id), ids[0], "Bonnet", 0); // version of a photo is not touched by a reorder
  assert.equal(r.status, 200);
  assert.deepEqual((await rows(id)).map((x) => x.origN), [3, 1, 2], "upload numbers never change");
});

test("extras: the same name twice is one chip; deleting twice is fine; names are cleaned", opts, async () => {
  const { s, db, schema, eq } = await kit();
  const { id, c } = await newCase("naming", 0);
  const [a, b] = await Promise.all([s.addExtra(c, "bumper clips"), s.addExtra(c, "  Bumper   Clips ")]);
  assert.equal(a.status, 200);
  assert.equal((a.body.extra as { id: number }).id, (b.body.extra as { id: number }).id);
  assert.equal((await s.addExtra(c, "")).status, 400);
  const list = await db.select().from(schema.caseExtras).where(eq(schema.caseExtras.caseId, id));
  assert.equal(list.length, 1);
  assert.equal((await s.removeExtra(c, list[0].id)).status, 200);
  assert.equal((await s.removeExtra(c, list[0].id)).status, 200);
  const other = await newCase("naming", 0);
  const x = await s.addExtra(other.c, "Bonnet");
  await s.removeExtra(c, (x.body.extra as { id: number }).id); // another case's chip is not ours to remove
  assert.equal((await db.select().from(schema.caseExtras).where(eq(schema.caseExtras.caseId, other.id))).length, 1);
});

test("access: a case of another organisation does not exist for you, and neither do its photos", opts, async () => {
  const { s, db, schema, eq } = await kit();
  const mine = await newCase("naming", 1);
  const theirs = await newCase("naming", 1);
  assert.equal(await s.caseInOrg(mine.orgId, theirs.id), null);
  const theirPhoto = (await rows(theirs.id))[0];
  assert.equal(await s.photoPathOf(mine.c, theirPhoto.id, "s"), null);
  assert.equal((await s.renamePhoto(mine.c, theirPhoto.id, "Bonnet", 0)).status, 404);
  const myPhoto = (await rows(mine.id))[0];
  assert.ok((await s.photoPathOf(mine.c, myPhoto.id, "s"))!.includes("-s-"));
  assert.ok((await s.photoPathOf(mine.c, myPhoto.id, "full"))!.includes("-f-"));
  // membership is read from the database on every request (session.ts): a removed member has no organisation left
  await db.insert(schema.user).values({ id: `u_${mine.id}`, name: "T", email: `${mine.id}@test.invalid` });
  await db.insert(schema.memberships).values({ orgId: mine.orgId, userId: `u_${mine.id}` });
  await db.delete(schema.memberships).where(eq(schema.memberships.userId, `u_${mine.id}`));
  assert.equal((await db.select().from(schema.memberships).where(eq(schema.memberships.userId, `u_${mine.id}`))).length, 0);
});

test("upload: only noted, existing files are registered; identical files are skipped; strays can be discarded", opts, async () => {
  const { s, db, schema, eq } = await kit();
  const { orgId, id, c } = await newCase("uploaded", 0);
  const hash = (ch: string) => ch.repeat(64);
  const mk = async (tag: string, h: string | null, note = true, file = true) => {
    const blobPath = `${orgId}/${id}/photos/${tag}-f-IMG.jpg`, thumbPath = `${orgId}/${id}/photos/${tag}-s-IMG.jpg`;
    for (const p of [blobPath, thumbPath]) {
      if (note) assert.deepEqual(await s.noteUpload(c, orgId, p, h), { ok: true });
      if (file) writeFileSync(fileOf(p), "jpeg");
    }
    return { blobPath, thumbPath, name: `${tag}.jpg`, size: 4, hash: h };
  };
  const a = await mk("aaa", hash("a")), b = await mk("bbb", hash("b"));
  const noNote = await mk("ccc", hash("c"), false), noFile = await mk("ddd", hash("d"), true, false);
  const r = await s.registerPhotos(c, orgId, [a, b, noNote, noFile, { blobPath: "other/x/photos/1", thumbPath: "y", name: "evil.jpg", size: 1 }]);
  assert.equal(r.status, 200);
  assert.deepEqual((r.body.added as { srcName: string; origN: number }[]).map((p) => [p.srcName, p.origN]), [["aaa.jpg", 1], ["bbb.jpg", 2]]);
  assert.deepEqual((r.body.rejected as string[]).sort(), ["ccc.jpg", "ddd.jpg", "evil.jpg"]);
  assert.equal((await caseNow(orgId, id)).status, "naming");
  assert.equal((await db.select().from(schema.caseFiles).where(eq(schema.caseFiles.caseId, id))).length, 2);

  // the same bytes again under another file name: refused before upload, and skipped at registration
  assert.deepEqual(await s.noteUpload(c, orgId, `${orgId}/${id}/photos/zzz-f-COPY.jpg`, hash("a")), { ok: false, reason: "duplicate" });
  assert.deepEqual(await s.noteUpload(c, orgId, a.blobPath, null), { ok: false, reason: "taken" }, "a stored photo is never replaced");
  assert.deepEqual(await s.noteUpload(c, orgId, `other/${id}/photos/x`, null), { ok: false, reason: "path" });
  // the same entry twice in one request: one photo, and its files stay
  const twice = await mk("fff", hash("f"));
  const rt = await s.registerPhotos(await caseNow(orgId, id), orgId, [twice, twice]);
  assert.deepEqual([(rt.body.added as unknown[]).length, rt.body.duplicates], [1, ["fff.jpg"]]);
  assert.ok(existsSync(fileOf(twice.blobPath)) && existsSync(fileOf(twice.thumbPath)), "the kept photo's files are not cleaned up");

  const e = await mk("eee", null);
  const dup = { ...e, hash: hash("b") };
  const r2 = await s.registerPhotos(await caseNow(orgId, id), orgId, [dup]);
  assert.deepEqual([(r2.body.added as unknown[]).length, r2.body.duplicates], [0, ["eee.jpg"]]);
  assert.ok(!existsSync(fileOf(e.blobPath)), "the identical file's blob is not kept");
  assert.equal((await rows(id)).length, 3);

  // discard
  const stray = `${orgId}/${id}/photos/stray-s-IMG.jpg`;
  await s.noteUpload(c, orgId, stray, null);
  writeFileSync(fileOf(stray), "jpeg");
  const otherCase = await newCase("naming", 0, orgId);
  const d = await s.discardPaths(c, orgId, [stray, a.blobPath, `${orgId}/${otherCase.id}/photos/x-f-IMG.jpg`, `${orgId}/${id}/photos/../x`]);
  assert.deepEqual(d.body.deleted, [stray]);
  assert.equal((d.body.rejected as string[]).length, 3);
  assert.ok(existsSync(fileOf(a.blobPath)), "a registered photo cannot be discarded");
  assert.deepEqual((await s.discardPaths(c, orgId, [stray])).body.deleted, [stray], "discarding again is a success");
  assert.equal((await s.registerPhotos(c, orgId, [])).status, 400);
  assert.equal((await s.registerPhotos(c, orgId, Array(41).fill(a))).status, 400);
});

test("cleanup: an upload never registered is removed after a day; a fresh one stays", opts, async () => {
  const { s, db, schema, sql, eq } = await kit();
  const { orgId, id, c } = await newCase("naming", 0);
  const old = `${orgId}/${id}/photos/old-f-IMG.jpg`, fresh = `${orgId}/${id}/photos/new-f-IMG.jpg`;
  for (const p of [old, fresh]) { await s.noteUpload(c, orgId, p, null); writeFileSync(fileOf(p), "jpeg"); }
  await db.execute(sql`UPDATE photo_uploads SET created_at = now() - interval '25 hours' WHERE path = ${old}`);
  assert.deepEqual(await s.sweepUploads(id), { removed: 1, failed: 0 });
  assert.ok(!existsSync(fileOf(old)));
  assert.ok(existsSync(fileOf(fresh)));
  assert.deepEqual((await db.select().from(schema.photoUploads).where(eq(schema.photoUploads.caseId, id))).map((r) => r.path), [fresh]);
});

test("cost cap: when the case has used its budget no photo is sent, the rest are marked and can be named by hand", opts, async () => {
  const { db, schema } = await kit();
  const { runSlice } = await import("../src/lib/photos/name-photos");
  const { orgId, id, c } = await newCase("naming", 3);
  await db.insert(schema.usage).values({ caseId: id, costUsd: "3.0000" });
  const out = await runSlice(c);
  assert.deepEqual(out, { claimed: 0, named: 0, failed: 3, remaining: 0, capped: true });
  const r = await rows(id);
  assert.ok(r.every((x) => x.nameState === "failed" && x.nameError === "cost limit reached"));
  const { s } = await kit();
  for (const x of r) await s.renamePhoto(c, x.id, "Bonnet", x.version);
  assert.equal((await s.setDone(await caseNow(orgId, id), true)).status, 200);
});

test("state: photos in display order, extras in the order added, no blob paths", opts, async () => {
  const { s } = await kit();
  const { id, c } = await newCase("naming", 3);
  await s.addExtra(c, "Bumper Clips");
  await s.addExtra(c, "Bonnet");
  const st = await s.photoState(c);
  const body = st.body as { photos: Record<string, unknown>[]; extras: { name: string }[]; done: boolean; rev: number };
  assert.deepEqual(body.photos.map((p) => p.origN), [1, 2, 3]);
  assert.deepEqual(body.extras.map((e) => e.name), ["Bumper Clips", "Bonnet"]);
  assert.ok(!JSON.stringify(body).includes(`${id}/photos/`), "pathnames never leave the server");
});

test.after(async () => {
  if (!local) return;
  const { db } = await kit();
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
});

test("done then new photos: the tick goes away; two registrations at the same moment get their own numbers", opts, async () => {
  const { s } = await kit();
  const { orgId, id, c } = await newCase("waiting_user", 2);
  for (const x of await s.claimSlice(id)) assert.equal(await s.writeName(x, named), true, "a normal answer lands");
  assert.equal((await s.setDone(c, true)).body.status, "phase_b");
  const mk = async (tag: string) => {
    const blobPath = `${orgId}/${id}/photos/${tag}-f-IMG.jpg`, thumbPath = `${orgId}/${id}/photos/${tag}-s-IMG.jpg`;
    for (const p of [blobPath, thumbPath]) { await s.noteUpload(c, orgId, p, null); writeFileSync(fileOf(p), "jpeg"); }
    return { blobPath, thumbPath, name: `${tag}.jpg`, size: 4, hash: null };
  };
  const [a, b] = [await mk("new1"), await mk("new2")];
  const now = await caseNow(orgId, id);
  const [ra, rb] = await Promise.all([s.registerPhotos(now, orgId, [a]), s.registerPhotos(now, orgId, [b])]);
  assert.deepEqual([ra.status, rb.status], [200, 200]);
  const all = await rows(id);
  assert.deepEqual(all.map((r) => r.origN).sort(), [1, 2, 3, 4]);
  assert.deepEqual(all.map((r) => r.position), [0, 1, 2, 3]);
  const after = await caseNow(orgId, id);
  assert.equal(after.photosDoneAt, null);
  assert.equal(after.status, "waiting_user");
});
