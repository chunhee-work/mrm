// Unit tests: opening order, Merimen file types, photo plan, badge + rear lamp rules, snapshot, 完成 walk (no database, no network).
import test from "node:test";
import assert from "node:assert/strict";
import { applyCaseRules, arrangeOpening, badgeName, brandOf, fileTypeOf, openingMissing, photoPlan, sameOrder } from "../src/lib/photos/order-rules";
import { snapshotOf } from "../src/lib/photos/snapshot";
import { isEnterPair, nextUnnamed, type Photo } from "../src/lib/photos/desk-rules";
import { PHOTO_RULES } from "../src/lib/playbook/photo-rules";
import { PLAYBOOK_FILES, PLAYBOOK_VERSION } from "../src/lib/playbook/generated";

const sh = (id: number, name: string | null) => ({ id, name });
const names = (l: { name: string | null }[]) => l.map((p) => p.name);

test("opening order: corners FVR FVL RVR RVL, Interior/Road Tax, Odometer, Chassis, Engine, then the rest in file order", () => {
  const input = [
    sh(1, "Front Bumper"), sh(2, "Rear View Left"), sh(3, "Bonnet"), sh(4, "Front View Left"), sh(5, "Engine Compartment"),
    sh(6, "Front View Right"), sh(7, "Chassis Number"), sh(8, "Rear View Right"), sh(9, "Road Tax"), sh(10, "Odometer Reading"),
    sh(11, "Fender LH"), sh(12, "Engine Compartment"),
  ];
  assert.deepEqual(names(arrangeOpening(input)), [
    "Front View Right", "Front View Left", "Rear View Right", "Rear View Left", "Road Tax", "Odometer Reading", "Chassis Number",
    "Engine Compartment", "Engine Compartment", "Front Bumper", "Bonnet", "Fender LH",
  ]);
});
test("opening order: searches ALL photos, keeps a second shot of the same corner where it was, never changes names", () => {
  const input = [sh(1, "Bonnet"), sh(2, "Front View Right"), sh(3, "Front View Right"), sh(4, "Interior View")];
  const out = arrangeOpening(input);
  assert.deepEqual(out.map((p) => p.id), [2, 4, 1, 3]);
  assert.deepEqual(names(out).sort(), names(input).sort());
});
test("opening order: an already correct case stays as it is; unnamed photos keep their place", () => {
  const ok = [sh(1, "Front View Right"), sh(2, "Front View Left"), sh(3, null), sh(4, "Bonnet")];
  assert.ok(sameOrder(ok, arrangeOpening(ok)));
  assert.deepEqual(arrangeOpening([sh(1, null), sh(2, "Odometer Reading")]).map((p) => p.id), [2, 1]);
});
test("missing opening shots are listed, Interior View or Road Tax counts as one slot", () => {
  assert.deepEqual(openingMissing([]), [...PHOTO_RULES.opening.corners, "Interior View / Road Tax", "Odometer Reading", "Chassis Number", "Engine Compartment"]);
  const all = [...PHOTO_RULES.opening.corners, "Road Tax", "Odometer Reading", "Chassis Number", "Engine Compartment"];
  assert.deepEqual(openingMissing(all), []);
  assert.deepEqual(openingMissing(all.filter((n) => n !== "Rear View Left" && n !== "Chassis Number")), ["Rear View Left", "Chassis Number"]);
});
test("Merimen file types (playbook 06)", () => {
  assert.equal(fileTypeOf("Front View Left"), "4 angles of vehicle photos");
  assert.equal(fileTypeOf("Odometer Reading"), "Odometer Reading");
  assert.equal(fileTypeOf("Chassis Number"), "Chassis Number");
  assert.equal(fileTypeOf("Engine Compartment"), "Engine view");
  assert.equal(fileTypeOf("Bonnet"), "Photographs of Damaged Parts");
  assert.equal(fileTypeOf("Interior View"), "Photographs of Damaged Parts");
  assert.equal(fileTypeOf(null), "Photographs of Damaged Parts");
});
test("photo plan: positions follow the order, every row has its type, unnamed photos are left out", () => {
  const p = photoPlan([
    { id: 5, srcName: "a.jpg", name: "Front View Right" }, { id: 6, srcName: "b.jpg", name: null }, { id: 7, srcName: "c.jpg", name: "Bonnet" },
    { id: 8, srcName: "d.jpg", name: "Bonnet" },
  ]);
  assert.equal(p.photos, 3);
  assert.deepEqual(p.rows.map((r) => [r.id, r.position, r.fileType]), [[5, 1, "4 angles of vehicle photos"], [7, 2, "Photographs of Damaged Parts"], [8, 3, "Photographs of Damaged Parts"]]);
  assert.deepEqual(p.types, { "4 angles of vehicle photos": 1, "Photographs of Damaged Parts": 2 });
});

test("brand of the vehicle: first word, two words for the two-word makes", () => {
  assert.equal(brandOf("PERODUA MYVI 1.3 5 Dr Hatch"), "PERODUA");
  assert.equal(brandOf("Land Rover Evoque"), "LAND ROVER");
  assert.equal(brandOf(""), "");
});
test("badge: (LOGO) and a single letter become the brand, brackets are CAPITALS, a name outside the list is not invented", () => {
  assert.equal(badgeName("Tailgate Badge (LOGO)", "PERODUA MYVI"), "Tailgate Badge (PERODUA)");
  assert.equal(badgeName("Boot Lid Badge (P)", "PROTON SAGA"), "Boot Lid Badge (PROTON)");
  assert.equal(badgeName("Grille Badge (logo)", "TOYOTA VIOS"), "Grille Badge (TOYOTA)");
  assert.equal(badgeName("Tailgate Badge (PERODUA)", "PERODUA MYVI"), null);
  assert.equal(badgeName("Bonnet", "PERODUA MYVI"), null);
  assert.equal(badgeName("Tailgate Badge (LOGO)", "ZZZ UNKNOWN"), null); // Tailgate Badge (ZZZ) is not in the name list
});
test("rear lamps come as a pair: plain Rear Lamp becomes the missing Inner/Outer and is marked unsure", () => {
  const rows = [
    { id: 1, modelName: "Rear Lamp Inner LH", confidence: 0.95 },
    { id: 2, modelName: "Rear Lamp RH", confidence: 0.97 },
    { id: 3, modelName: "Bonnet", confidence: 0.99 },
  ];
  const ch = applyCaseRules(rows, "HONDA CIVIC");
  assert.deepEqual(ch.map((c) => [c.id, c.modelName, c.why]), [[2, "Rear Lamp Outer RH", "rear_lamp"]]);
  assert.ok((ch[0].confidence ?? 1) <= 0.59);
  assert.deepEqual(applyCaseRules([{ id: 1, modelName: "Rear Lamp Outer LH", confidence: 1 }, { id: 2, modelName: "Rear Lamp LH", confidence: 1 }], "").map((c) => c.modelName), ["Rear Lamp Inner LH"]);
  assert.deepEqual(applyCaseRules([{ id: 1, modelName: "Rear Lamp LH", confidence: 1 }, { id: 2, modelName: "Rear Lamp RH", confidence: 1 }], ""), []); // no pair on this car
});

test("snapshot: golden vector shared with the worker, and any change of name, order or extras changes it", () => {
  const base = snapshotOf([{ id: 1, name: "Bonnet" }, { id: 2, name: null }, { id: 3, name: "Front Bumper" }], ["Bumper Clips", "Cowl Panel"]);
  assert.equal(base, "2c07a7b2ad7aaa00740008fa2a413e08ee704347358e943066e7abdbc647fe9b"); // worker/tests/test_photo_sync.py uses the same value
  assert.notEqual(base, snapshotOf([{ id: 1, name: "Bonnet" }, { id: 3, name: "Front Bumper" }, { id: 2, name: null }], ["Bumper Clips", "Cowl Panel"]));
  assert.notEqual(base, snapshotOf([{ id: 1, name: "Bonnet 2" }, { id: 2, name: null }, { id: 3, name: "Front Bumper" }], ["Bumper Clips", "Cowl Panel"]));
  assert.notEqual(base, snapshotOf([{ id: 1, name: "Bonnet" }, { id: 2, name: null }, { id: 3, name: "Front Bumper" }], ["Bumper Clips"]));
  assert.equal(base, snapshotOf([{ id: 1, name: "Bonnet" }, { id: 2, name: null }, { id: 3, name: "Front Bumper" }], ["cowl panel", "bumper clips"])); // extras: case and order do not matter
});

const ph = (id: number, name: string | null, o: Partial<Photo> = {}): Photo => ({
  id, origN: id, position: id, srcName: `${id}.jpg`, state: "named", how: "model", modelName: name, confidence: 0.95, alts: [], finalName: null, error: null, version: 0, ...o,
});
test("完成 walk: first click goes to the first unnamed photo, the next click to the next, then round again", () => {
  const photos = [ph(1, "Bonnet"), ph(2, null), ph(3, "Fender LH"), ph(4, null), ph(5, null)];
  assert.equal(nextUnnamed(photos, null)?.id, 2);
  assert.equal(nextUnnamed(photos, 2)?.id, 4);
  assert.equal(nextUnnamed(photos, 4)?.id, 5);
  assert.equal(nextUnnamed(photos, 5)?.id, 2);
  // photo 2 got a name since: the walk restarts at the first one that is left
  assert.equal(nextUnnamed(photos.map((p) => (p.id === 2 ? { ...p, finalName: "Cowl Panel" } : p)), 2)?.id, 4);
  assert.equal(nextUnnamed([ph(1, "Bonnet")], null), null);
  // a photo that is still being named is not "unnamed"
  assert.equal(nextUnnamed([ph(1, null, { state: "pending" })], null), null);
});
test("Enter, Enter pair: only within 700 ms", () => {
  assert.equal(isEnterPair(1000, 1699), true);
  assert.equal(isEnterPair(1000, 1700), false);
  assert.equal(isEnterPair(0, 50), false); // no first Enter yet
});

test("playbook copy in the site: the files the prompts use are there and carry a version", () => {
  assert.match(PLAYBOOK_VERSION, /^[0-9a-f]{12}$/);
  for (const f of ["01-read-documents.md", "03-photo-naming.md", "06-upload-docs-and-photos.md", "07-select-parts-and-labour.md", "08-estimate-details.md", "11-car-logos.md"]) {
    assert.ok((PLAYBOOK_FILES[f] ?? "").length > 500, f);
  }
});

// review round 1 (plan #48): the same fixture, with non-ASCII names, gives the same hash in worker/tests/test_photo_sync.py
test("snapshot: non-ASCII golden value shared with the worker", () => {
  const h = snapshotOf([{ id: 1, name: "Bonnet" }, { id: 2, name: null }, { id: 3, name: "Pintu Kereta İ" }, { id: 4, name: "😀 Lamp" }], ["Ünder Tray", "😀 Clip", "Zebra", "éclat", "Ａ wide"]);
  assert.equal(h, "6a87cfb036917649e85c8c8758e362eab2f8838b7492de2957c224c7b310c428");
});
