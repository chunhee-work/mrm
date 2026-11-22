import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Hard test 2026-11-22 (axe on the live site): the green "Finished" button had light text at 4.07:1, under the WCAG AA 4.5:1 minimum.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const light = css.slice(css.indexOf(".theme-light"));
const tok = (name: string) => { const m = light.match(new RegExp(`--c-${name}: (\\d+) (\\d+) (\\d+);`)); assert.ok(m, name); return [m[1], m[2], m[3]].map(Number); };
const lum = (c: number[]) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg: number[], bg: number[], o: number) => fg.map((v, i) => o * v + (1 - o) * bg[i]);

test("white-app green (done) is readable: light text on it, and as text on white", () => {
  const go = tok("go"), bay = tok("bay"), panel = tok("panel");
  assert.ok(ratio(bay, go) >= 4.5, `Finished button text ${ratio(bay, go).toFixed(2)}:1`);
  assert.ok(ratio(go, panel) >= 4.5, `green text on white ${ratio(go, panel).toFixed(2)}:1`);
  // the "7/11 cases done" line on the Finished button is drawn at 90% opacity
  assert.ok(ratio(mix(bay, go, 0.9), go) >= 4.5, `done count ${ratio(mix(bay, go, 0.9), go).toFixed(2)}:1`);
  const desk = readFileSync(new URL("../components/photos/naming-desk.tsx", import.meta.url), "utf8");
  assert.match(desk, /st\?\.done \? "opacity-90" : "opacity-70"/);
});
