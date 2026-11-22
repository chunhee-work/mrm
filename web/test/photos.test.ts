// Unit tests of the photo naming desk rules (plan #9, section H). No database, no network.
import test from "node:test";
import assert from "node:assert/strict";
import {
  canonName, doneBlock, isPermutation, normalizePick, pathInCase, photoModel, photoPath, sliceCostUsd, sliceMatches,
  statusAfterDone, statusAfterRegister, costCapUsd, NONE, PART_NAMES,
} from "../src/lib/photos/rules";
import { altsOf, classifyPaste, counts, fileIdentity, fileProblem, moved, visible, UndoStack, type Photo } from "../src/lib/photos/desk-rules";
import { logLine, safeError } from "../src/lib/photos/log";
import { assertTextOnly, buildJevRequest, TypeSafeImageError } from "../src/lib/typesafe";
import { pickContext, SYSTEM } from "../src/lib/photos/name-photos";
import { PHOTO_DICTS, photoT } from "../src/lib/photos/strings";
import { titleCase } from "../src/lib/photos/rules";
import { whenOf } from "../src/lib/fmt-when";

const photo = (o: Partial<Photo> = {}): Photo => ({
  id: 1, origN: 9, position: 0, srcName: "a.jpg", state: "named", how: "model", modelName: "Bonnet", confidence: 0.95,
  alts: [], finalName: null, error: null, version: 0, ...o,
});

test("closed list: a name outside the list is dropped and the next valid alternative takes over, marked unsure", () => {
  const r = normalizePick({ n: 1, name: "Front Thingamajig", confidence: 0.97, alts: ["Bonnet", "Front Bumper"] }, "TOYOTA VIOS", 20);
  assert.equal(r.modelName, "Bonnet");
  assert.ok((r.confidence ?? 1) <= 0.3);
  assert.deepEqual(r.alts, ["Front Bumper"]);
});
test("closed list: spelling is taken from the list, whatever case the model used", () => {
  const r = normalizePick({ n: 1, name: "front bumper", confidence: 0.92, alts: [] }, "", 20);
  assert.equal(r.modelName, "Front Bumper");
  assert.equal(r.confidence, 0.92);
});
test("__none__ and nothing valid: no name, no confidence", () => {
  for (const name of [NONE, "not a part"]) {
    const r = normalizePick({ n: 1, name, confidence: 0.9, alts: ["also nothing"] }, "", 20);
    assert.deepEqual(r, { modelName: null, confidence: null, alts: [], how: "model" });
  }
});
test("never General View", () => {
  const gv = PART_NAMES.find((n) => /general view/i.test(n));
  if (gv) assert.equal(normalizePick({ n: 1, name: gv, confidence: 0.9, alts: [] }, "", 20).modelName, null);
  assert.ok(/Never pick a name containing "General View"/.test(SYSTEM));
});
test("opening shots are flagged fixed only inside the opening block", () => {
  assert.equal(normalizePick({ n: 1, name: "Front View Right", confidence: 0.8, alts: [] }, "", 1).how, "rule");
  assert.equal(normalizePick({ n: 1, name: "Front View Right", confidence: 0.8, alts: [] }, "", 30).how, "model");
  assert.equal(normalizePick({ n: 1, name: "Bonnet", confidence: 0.8, alts: [] }, "", 2).how, "model");
});
test("car-model rules: a Perodua has no Front Panel Assembly; other makes have no Fender Inner", () => {
  const p = normalizePick({ n: 1, name: "Front Panel Assembly", confidence: 0.95, alts: ["Fender Inner LH"] }, "PERODUA MYVI 1.3", 20);
  assert.equal(p.modelName, "Fender Inner LH");
  assert.ok((p.confidence ?? 1) <= 0.3);
  const t = normalizePick({ n: 1, name: "Fender Inner LH", confidence: 0.95, alts: [] }, "TOYOTA VIOS", 20);
  assert.equal(t.modelName, "Front Panel Assembly");
});
test("confidence is clamped to 0..1 and alternatives are capped at two, without repeats", () => {
  const r = normalizePick({ n: 1, name: "Bonnet", confidence: 7, alts: ["Bonnet", "Front Bumper", "Headlamp LH", "Headlamp RH"] }, "", 20);
  assert.equal(r.confidence, 1);
  assert.deepEqual(r.alts, ["Front Bumper", "Headlamp LH"]);
});
test("a slice answer must cover exactly the photos that were sent", () => {
  const p = (n: number) => ({ n, name: "Bonnet", confidence: 1, alts: [] });
  assert.ok(sliceMatches([3, 1, 2], [p(1), p(2), p(3)]));
  assert.ok(!sliceMatches([1, 2, 3], [p(1), p(2)]));
  assert.ok(!sliceMatches([1, 2, 3], [p(1), p(2), p(4)]));
  assert.ok(!sliceMatches([1, 2], [p(1), p(1)]));
});
test("context: the claimed photos plus two neighbours each side, in order, at most 12 pictures", () => {
  const all = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
  assert.deepEqual(pickContext(all, new Set([10, 11, 12])), [8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(pickContext(all, new Set([1, 2])), [1, 2, 3, 4]);
  const eight = pickContext(all, new Set([5, 6, 7, 8, 9, 10, 11, 12]));
  assert.deepEqual(eight, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.ok(pickContext(all, new Set([1, 5, 9, 13, 17, 21, 25, 29])).length <= 12);
});

test("names: one canonical form (trim, inner spaces, control characters, list spelling, 120 max)", () => {
  assert.equal(canonName("  front   bumper \n"), "Front Bumper");
  assert.equal(canonName("My own\tpart"), "My Own Part");
  assert.equal(canonName(""), null);
  assert.equal(canonName("   "), null);
  assert.equal(canonName("x".repeat(121)), null);
  assert.equal(canonName(42), null);
});
test("reorder must be a permutation of the case's photo ids", () => {
  assert.ok(isPermutation([1, 2, 3], [3, 1, 2]));
  assert.ok(!isPermutation([1, 2, 3], [1, 2]));
  assert.ok(!isPermutation([1, 2, 3], [1, 2, 2]));
  assert.ok(!isPermutation([1, 2, 3], [1, 2, 4]));
  assert.ok(!isPermutation([1, 2, 3], "1,2,3"));
  assert.ok(!isPermutation([1, 2], [1, "2"]));
});
test("done: blocked by no photos, photos still naming, or photos with no name; a hand-named failed photo does not block", () => {
  assert.deepEqual(doneBlock([]), { reason: "empty", count: 0 });
  assert.equal(doneBlock([{ nameState: "pending", modelName: null, finalName: null }])?.reason, "naming");
  assert.equal(doneBlock([{ nameState: "failed", modelName: null, finalName: null }])?.reason, "unnamed");
  assert.equal(doneBlock([{ nameState: "named", modelName: null, finalName: null }])?.reason, "unnamed");
  assert.equal(doneBlock([{ nameState: "failed", modelName: null, finalName: "Bonnet" }]), null);
  assert.equal(doneBlock([{ nameState: "named", modelName: "Bonnet", finalName: null }]), null);
});
test("status rule: only the naming statuses ever move", () => {
  assert.equal(statusAfterDone("waiting_user", true), "phase_b");
  assert.equal(statusAfterDone("naming", true), "phase_b");
  for (const s of ["uploaded", "phase_a", "pending_doc", "reading", "failed", "done", "checking"]) assert.equal(statusAfterDone(s, true), s);
  assert.equal(statusAfterDone("phase_b", false), "waiting_user");
  for (const s of ["done", "checking", "naming", "uploaded"]) assert.equal(statusAfterDone(s, false), s);
  assert.equal(statusAfterRegister("uploaded"), "naming");
  assert.equal(statusAfterRegister("phase_a"), "naming");
  assert.equal(statusAfterRegister("reading"), "reading");
});
test("photo paths stay inside the organisation and case", () => {
  const p = photoPath("org1", "case1", "abc123", "s", "../../IMG 0001 (1).JPG");
  assert.ok(p.startsWith("org1/case1/photos/abc123-s-"));
  assert.ok(pathInCase(p, "org1", "case1"));
  assert.ok(!pathInCase(p, "org1", "case2"));
  assert.ok(!pathInCase(p, "org2", "case1"));
  assert.ok(!pathInCase("org1/case1/photos/../../x", "org1", "case1"));
  assert.ok(!pathInCase("org1/case1/photos//x", "org1", "case1"));
  assert.ok(!pathInCase(123, "org1", "case1"));
});
test("models and cost: only the two allowed ids; price table; cap default", () => {
  assert.equal(photoModel(undefined), "claude-sonnet-5-5");
  assert.equal(photoModel("claude-opus-5-5"), "claude-opus-5-5");
  assert.equal(photoModel("something-else"), "claude-sonnet-5-5");
  assert.equal(sliceCostUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 2);
  assert.equal(sliceCostUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 100_000, cache_read_input_tokens: 1_000_000 }), 1.1);
  assert.equal(costCapUsd(undefined), 3);
  assert.equal(costCapUsd("1.5"), 1.5);
  assert.equal(costCapUsd("-1"), 3);
});

test("TypeSafe client: text only. Any image, asset or image-looking value throws, and the image header is never sent", () => {
  const bad: unknown[] = [
    { state: "x", questions: [], assets: ["a"] },
    { state: "x", questions: [{ id: "q", image: "abc" }] },
    { state: "x", questions: [{ id: "q", text: "data:image/jpeg;base64,AAAA" }] },
    { state: "x", questions: [{ id: "q", text: "/9j/4AAQSkZJRgABAQ" }] },
    { state: "x", questions: [{ id: "q", text: "https://example.com/damage.jpg" }] },
    { state: "x", questions: [{ id: "q", data: new Uint8Array(4) }] },
    { state: "photo.png", questions: [] },
    { state: "x", questions: [{ id: "q", nested: { deep: { photos: [] } } }] },
  ];
  for (const b of bad) assert.throws(() => buildJevRequest(b as never, "k"), TypeSafeImageError);
  assert.throws(() => assertTextOnly("x".repeat(20_001)), TypeSafeImageError);
  const ok = buildJevRequest({ state: "Bonnet dented at the leading edge", questions: [{ id: "cond", type: "choice", options: ["repair", "replace"] }] }, "k");
  const headers = ok.init.headers as Record<string, string>;
  assert.ok(!Object.keys(headers).some((h) => /danger|image/i.test(h)));
  assert.ok(!/assets/.test(String(ok.init.body)));
});

test("logs carry ids, an error name and a status. Never a body or a path", () => {
  const sdk = Object.assign(new Error("400 {\"image\":\"/9j/4AAQSkZJRgABAQ\",\"path\":\"org1/case1/photos/abc-f-IMG.jpg\"}"), {
    name: "BadRequestError", status: 400, request: { body: "/9j/4AAQSkZJRgABAQ" }, path: "org1/case1/photos/abc-f-IMG.jpg",
  });
  for (const line of [logLine("photos.name", { caseId: "c1", photoId: 7 }, sdk), logLine("photos.register", { caseId: "c1" }, sdk), logLine("photos.img", { caseId: "c1", photoId: "7" }, sdk), safeError("name-photos", sdk).message]) {
    assert.ok(!/9j|org1|IMG|image|photos\/abc/.test(line), line);
  }
  assert.equal(safeError("name-photos", sdk).message, "name-photos: 400");
  assert.equal(safeError("name-photos", new TypeError("secret detail")).message, "name-photos: TypeError");
  assert.equal(JSON.parse(logLine("r", {}, { name: "weird name with spaces and /paths" })).errorName, "Error");
});

test("desk: what counts as to confirm, edited, naming", () => {
  const list = [
    photo({ id: 1 }),
    photo({ id: 2, confidence: 0.7, alts: ["Front Bumper"] }),
    photo({ id: 3, how: "rule", confidence: 0.5, modelName: "Front View Right" }),
    photo({ id: 4, finalName: "Grille Front" }),
    photo({ id: 5, state: "failed", modelName: null, confidence: null }),
    photo({ id: 6, state: "pending", modelName: null, confidence: null }),
    photo({ id: 7, state: "named", modelName: null, confidence: null }),
  ];
  assert.deepEqual(counts(list), { total: 7, confirm: 3, edited: 1, naming: 1, unnamed: 2, failed: 1 });
  assert.deepEqual(visible(list, "confirm").map((p) => p.id), [5, 7, 2]); // the ones with no name first
  assert.deepEqual(visible(list, "edited").map((p) => p.id), [4]);
  assert.deepEqual(altsOf(list[1]), ["Front Bumper"]);
  assert.deepEqual(altsOf(list[3]), ["Bonnet"]); // edited: the suggestion is one press away
  assert.deepEqual(altsOf(list[0]), []);
});
test("desk: paste saves a list name at once, asks for anything else", () => {
  const p = photo({ modelName: "Bonnet", finalName: "Grille Front" });
  assert.deepEqual(classifyPaste("", p), { kind: "empty" });
  assert.deepEqual(classifyPaste("grille front", p), { kind: "noop" });
  assert.deepEqual(classifyPaste(" Bonnet ", p), { kind: "restore" });
  assert.deepEqual(classifyPaste("front bumper", p), { kind: "save", name: "Front Bumper" });
  assert.equal(classifyPaste("Some sentence from an email", p).kind, "confirm");
  assert.equal(classifyPaste("Front Bumper\nBonnet", p).kind, "confirm");
  assert.equal(classifyPaste("x".repeat(500), p).kind, "confirm");
});
test("desk: undo is newest first, one step per typing session, and steps of a photo changed elsewhere are dropped", () => {
  const u = new UndoStack();
  assert.equal(u.peek(), undefined); // empty stack: nothing to undo
  u.push({ caseId: "c", photoId: 1, prev: null, after: 1 });
  u.push({ caseId: "c", photoId: 1, prev: "A", after: 2 });
  u.push({ caseId: "c", photoId: 2, prev: null, after: 1, session: "s" });
  u.push({ caseId: "c", photoId: 2, prev: "Fro", after: 2, session: "s" }); // same typing session
  assert.equal(u.size, 3);
  assert.deepEqual(u.peek(), { caseId: "c", photoId: 2, prev: null, after: 2, session: "s" });
  u.sync("c", [{ id: 1, version: 2 }, { id: 2, version: 5 }]); // photo 2 was changed in another tab
  assert.equal(u.size, 2);
  const top = u.peek()!;
  assert.equal(top.prev, "A");
  u.done(top, 3); // the undo itself was write number 3
  assert.equal(u.peek()!.after, 3); // the older step now follows the new version
  u.sync("c", [{ id: 1, version: 3 }]);
  assert.equal(u.size, 1);
  u.sync("c", [{ id: 1, version: 9 }], (id) => id === 1); // a refresh while our own save of photo 1 is on its way
  assert.equal(u.size, 1, "a photo that is mid-save keeps its undo steps");
  u.sync("c", [], (id) => id === 1);
  assert.equal(u.size, 1);
  u.dropPhoto("c", 1); // a 409 on undo
  assert.equal(u.size, 0);
});
test("desk: move within the list", () => {
  assert.deepEqual(moved([1, 2, 3, 4, 5], 4, 1), [1, 5, 2, 3, 4]);
  const same = [1, 2];
  assert.equal(moved(same, 0, 0), same);
  assert.equal(moved(same, 0, 9), same);
});
test("upload: SHA-256 id, and a random id with no duplicate check when hashing is not possible", async () => {
  const data = new TextEncoder().encode("abc").buffer as ArrayBuffer;
  const ok = await fileIdentity(async () => data, (a, d) => crypto.subtle.digest(a, d), () => "rnd");
  assert.equal(ok.hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(ok.id, "ba7816bf8f01");
  for (const digest of [null, async () => { throw new Error("out of memory"); }]) {
    const fb = await fileIdentity(async () => data, digest, () => "0.k3j9x2abcdefgh");
    assert.equal(fb.hash, null);
    assert.match(fb.id, /^r[a-z0-9]{1,11}$/);
  }
});
test("upload: HEIC, other types and files over 25 MB are refused with a reason", () => {
  const max = 25 * 1024 * 1024;
  assert.equal(fileProblem({ name: "a.HEIC", type: "", size: 1 }, max), "heic");
  assert.equal(fileProblem({ name: "a.jpg", type: "image/heic", size: 1 }, max), "heic");
  assert.equal(fileProblem({ name: "a.gif", type: "image/gif", size: 1 }, max), "type");
  assert.equal(fileProblem({ name: "a.jpg", type: "image/jpeg", size: max + 1 }, max), "size");
  assert.equal(fileProblem({ name: "a.jpg", type: "image/jpeg", size: max }, max), null);
});
test("strings: Chinese and Malay have every key English has", () => {
  const keys = Object.keys(PHOTO_DICTS.en).sort();
  assert.deepEqual(Object.keys(PHOTO_DICTS.zh).sort(), keys);
  assert.deepEqual(Object.keys(PHOTO_DICTS.ms).sort(), keys);
});

// ---- QC round 3 ----
test("R3-B10: a part name that is not in the catalogue gets a capital on every word; catalogue spelling and capitals stay", () => {
  assert.equal(titleCase("bumper cl"), "Bumper Cl");
  assert.equal(canonName("  bumper   cl "), "Bumper Cl");
  assert.equal(canonName("front bumper"), "Front Bumper"); // the catalogue spelling wins
  assert.equal(canonName("my RH bracket (proton)"), "My RH Bracket (proton)"); // capitals and brackets are not touched
  assert.equal(titleCase("Bumper Cl"), "Bumper Cl");
});

test("R3-B02: no done message claims that the AI started anything; the case that waits for documents says so", () => {
  for (const l of ["en", "zh", "ms"] as const) {
    const d = PHOTO_DICTS[l];
    for (const k of ["doneToast", "doneToast.phase_b", "doneToast.pending_doc", "doneToast.other", "allDoneToast", "doneHint"]) {
      assert.ok(d[k], `${l} ${k}`);
      assert.ok(!/started|已通知|telah mula|mula Step 2 untuk|马上做/i.test(d[k]), `${l} ${k}: ${d[k]}`);
    }
  }
  assert.match(PHOTO_DICTS.en["doneToast.pending_doc"], /missing documents/);
  assert.match(PHOTO_DICTS.zh["doneToast.pending_doc"], /缺的文件/);
});

test("R3-U07: the finished state is not the same word as the button; U02 says why Done was cancelled", () => {
  for (const l of ["en", "zh", "ms"] as const) {
    const d = PHOTO_DICTS[l];
    assert.notEqual(d.doneOn, d.done, l);
    assert.ok(d.doneCancelled && d.doneUndo && d.was && d.tabEdited && d.legendOpen, l);
  }
  assert.equal(PHOTO_DICTS.en.doneOn, "Finished ✓");
});

test("R3-B08: the desk tab time is written in the page language (not always English)", () => {
  const iso = "2026-11-21T19:10:00Z";
  assert.match(whenOf(iso, "en"), /Nov/);
  assert.doesNotMatch(whenOf(iso, "zh"), /Nov/);
  assert.match(whenOf(iso, "zh"), /03:10/); // Malaysia time
});

import { fill } from "../src/lib/plural";
import { translate, LANGS } from "../src/lib/i18n";
// @ts-ignore: a plain .mjs file without types
import nextConfig from "../next.config.mjs";

test("R4-B01: count strings use the singular for 1 and the plural otherwise, in every language", () => {
  assert.equal(fill("{n} {n?photo|photos}", { n: 1 }), "1 photo");
  assert.equal(fill("{n} {n?photo|photos}", { n: 2 }), "2 photos");
  assert.equal(fill("{n} {n?photo|photos}", { n: 0 }), "0 photos");
  assert.equal(photoT("en")("block.unnamed", { n: 1 }), "1 photo still has no name");
  assert.equal(photoT("en")("block.unnamed", { n: 61 }), "61 photos still have no name");
  assert.equal(photoT("en")("doneCount", { d: 5, n: 1 }), "5/1 case done");
  assert.equal(translate("en", "case.pp.todo", { n: "1" }).startsWith("1 photo name still to check"), true);
  assert.equal(translate("en", "case.pp.summary", { n: "1", edited: "1" }), "1 photo, 1 changed by you");
  for (const lang of LANGS) {
    for (const n of ["1", "2"]) for (const k of ["case.pp.todo", "case.pp.summary", "new.photosN", "bill.cases"]) {
      const s = translate(lang, k as never, { n, edited: "0" });
      assert.ok(!/\{[a-z]/.test(s), `${lang} ${k} has an unfilled placeholder: ${s}`);
    }
  }
  assert.ok(!/\b1 (photos|cases|files)\b/.test(translate("en", "new.photosN", { n: "1" })));
});

test("R4-B03: streaming metadata is off for every browser, so <title> and meta stay in <head>", () => {
  const re = (nextConfig as { htmlLimitedBots?: RegExp }).htmlLimitedBots;
  assert.ok(re instanceof RegExp);
  assert.ok(re!.test("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"));
  assert.ok(re!.test("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"));
});
