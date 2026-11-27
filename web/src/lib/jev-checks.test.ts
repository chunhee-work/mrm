import { test } from "node:test";
import assert from "node:assert/strict";
import { jevInsurerWarnings, localInsurer, localRegion, type Ask } from "./jev-checks";
import { eventTr } from "./case-text";
import { DICTS } from "./i18n";
import type { CaseDataT } from "./read-docs";

const data = (over: Partial<{ ins: string; cli: string; place: string }> = {}) => ({
  at_fault: { policy: { insurer: over.ins ?? "Allianz General Insurance Company (Malaysia) Berhad" } },
  client_policy: { insurer: over.cli ?? "Tokio Marine Insurans (Malaysia) Berhad" },
  police: { place: over.place ?? "Jalan Ampang, Kuala Lumpur" },
}) as unknown as CaseDataT;
const reply = (a: Record<string, [string, number]>): Ask => async () => ({ answers: Object.fromEntries(Object.entries(a).map(([k, [choice, confidence]]) => [k, { choice, confidence }])) });

test("the code reads insurer names and Liberty regions", () => {
  assert.equal(localInsurer("Etiqa General Takaful Berhad"), "Etiqa General Takaful");
  assert.equal(localInsurer("Zurich General Insurance Malaysia"), "Zurich General Insurance");
  assert.equal(localInsurer("Lonpac Insurance Bhd"), null);
  assert.equal(localRegion("Jalan Ampang, Kuala Lumpur"), "Klang Valley");
  assert.equal(localRegion("Kuantan, Pahang"), "East Coast");
  assert.equal(localRegion("Somewhere"), null);
});

test("quiet when Jev agrees or is not sure", async () => {
  assert.deepEqual(await jevInsurerWarnings(data(), {}, reply({ ins: ["Allianz", 0.99], cli: ["Tokio Marine", 0.97] })), []);
  assert.deepEqual(await jevInsurerWarnings(data(), {}, reply({ ins: ["Zurich General Insurance", 0.6], cli: ["Tokio Marine", 0.5] })), []);
});

test("a confident disagreement becomes one event line that every language can show", async () => {
  const w = await jevInsurerWarnings(data(), {}, reply({ ins: ["Zurich General Insurance", 0.95], cli: ["Tokio Marine", 0.97] }));
  assert.equal(w.length, 1);
  const t = eventTr(w[0]);
  assert.equal(t.key, "ev.jevAt");
  assert.deepEqual(t.vars, { text: "Allianz General Insurance Company (Malaysia) Berhad", jev: "Zurich General Insurance", mine: "Allianz" });
  const b = await jevInsurerWarnings(data({ ins: "Liberty General Insurance Berhad" }), {}, reply({ ins: ["Liberty", 0.99], cli: ["Tokio Marine", 0.99], br: ["Northern", 0.95] }));
  assert.equal(eventTr(b[0]).key, "ev.jevBranch");
  for (const k of ["ev.jevAt", "ev.jevCli", "ev.jevBranch"]) for (const l of ["en", "zh", "ms"] as const) assert.ok((DICTS[l] as Record<string, string>)[k], `${l} ${k}`);
});

test("the branch is asked only for Liberty", async () => {
  const seen: string[][] = [];
  const ask: Ask = async (i) => { seen.push(Object.keys(i.questions)); return reply({ ins: ["Allianz", 0.99], cli: ["Tokio Marine", 0.99] })(i, { purpose: "" }); };
  await jevInsurerWarnings(data(), {}, ask);
  assert.deepEqual(seen[0], ["ins", "cli"]);
});

test("never throws and never waits long when Jev fails or hangs", async () => {
  assert.deepEqual(await jevInsurerWarnings(data(), {}, async () => { throw new Error("boom"); }), []);
  assert.deepEqual(await jevInsurerWarnings(data(), {}, () => new Promise(() => {}), 20), []);
});

test("sends text only: no asset, image or file field", async () => {
  let sent = "";
  await jevInsurerWarnings(data(), {}, async (i) => { sent = JSON.stringify(i); return {}; });
  assert.ok(sent.length > 0);
  assert.doesNotMatch(sent, /asset|image|file|photo/i);
});

test("our rules not knowing the insurer or the place is not a disagreement", async () => {
  assert.deepEqual(await jevInsurerWarnings(data({ ins: "Lonpac Insurance Bhd" }), {}, reply({ ins: ["Allianz", 0.99], cli: ["Tokio Marine", 0.99] })), []);
  assert.equal(localRegion("Jalan Ipoh, Kuala Lumpur"), null); // two regions hit: ambiguous
  assert.deepEqual(await jevInsurerWarnings(data({ ins: "Liberty General Insurance Berhad", place: "Jalan Ipoh, Kuala Lumpur" }), {}, reply({ ins: ["Liberty", 0.99], cli: ["Tokio Marine", 0.99], br: ["Klang Valley", 0.9] })), []);
});

test("a number or object where the reader should have put text does not throw", async () => {
  const bad = { at_fault: { policy: { insurer: 5 } }, client_policy: { insurer: {} }, police: { place: null } } as unknown as CaseDataT;
  assert.deepEqual(await jevInsurerWarnings(bad, {}, reply({})), []);
});
