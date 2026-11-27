import test from "node:test";
import assert from "node:assert/strict";
import { stepsOf } from "./case-steps";

const s = (status: string, photos = 0, photosDone = false) => stepsOf({ status, photos, photosDone }).map((x) => `${x.id}:${x.state}${x.open ? "" : "!"}`).join(" ");

test("reading: only step 1 is open", () => assert.equal(s("reading", 5), "docs:current photos:locked! merimen:locked! done:locked!"));
test("photos to name", () => assert.equal(s("waiting_user", 78), "docs:complete photos:current merimen:locked! done:locked!"));
test("after Done the worker step is current and step 2 can be revisited", () => assert.equal(s("phase_b", 78, true), "docs:complete photos:complete merimen:current done:locked!"));
test("missing document: photos still open", () => assert.equal(s("pending_doc", 78), "docs:current photos:current merimen:locked! done:locked!"));
test("closed case: all complete", () => assert.equal(s("done", 78, true), "docs:complete photos:complete merimen:complete done:complete"));
