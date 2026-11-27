import test from "node:test";
import assert from "node:assert/strict";
import { currentStepOf, stepsOf } from "./case-steps";

const s = (status: string, photos = 0, photosDone = false) => stepsOf({ status, photos, photosDone }).map((x) => `${x.id}:${x.state}${x.open ? "" : "!"}`).join(" ");

test("reading: only step 1 is open", () => assert.equal(s("reading", 5), "docs:current photos:locked! merimen:locked! done:locked!"));
test("photos to name", () => assert.equal(s("waiting_user", 78), "docs:complete photos:current merimen:locked! done:locked!"));
test("after Done the worker step is current and step 2 can be revisited", () => assert.equal(s("phase_b", 78, true), "docs:complete photos:complete merimen:current done:locked!"));
test("missing document: photos still open", () => assert.equal(s("pending_doc", 78), "docs:current photos:locked merimen:locked! done:locked!"));
test("closed case: all complete", () => assert.equal(s("done", 78, true), "docs:complete photos:complete merimen:complete done:complete"));

import { bucketOf } from "../components/app/status";
test("home groups and the step bar agree for every status", () => {
  const map: Record<string, string> = { docs: "docs", photos: "photos", merimen: "active", done: "closed" };
  for (const status of ["uploaded", "reading", "pending_doc", "phase_a", "naming", "waiting_user", "phase_b", "checking", "done", "failed"]) {
    for (const photosDone of [false, true]) {
      const b = bucketOf({ status, photosDone });
      if (status === "failed") assert.equal(b, "hold");
      else assert.equal(b, map[currentStepOf({ status, photosDone })], `${status}/${photosDone}`);
      const cur = stepsOf({ status, photos: 5, photosDone }).filter((x) => x.state === "current");
      assert.ok(cur.length <= 1, `one current step for ${status}/${photosDone}`);
    }
  }
});
