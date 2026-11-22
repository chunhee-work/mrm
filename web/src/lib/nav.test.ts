import { test } from "node:test";
import assert from "node:assert/strict";
import { isInternalNav } from "./nav";

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const a = (href: string, more: Partial<{ target: string; hasDownload: boolean }> = {}) => ({ href, target: "", hasDownload: false, ...more });
const here = "https://app.autopilotclaim.com/dashboard";

test("hard test: the top bar runs for a click that opens another page of the app", () => {
  assert.equal(isInternalNav(click, a("/cases/abc"), here), true);
  assert.equal(isInternalNav(click, a("https://app.autopilotclaim.com/billing"), here), true);
  assert.equal(isInternalNav(click, a("/dashboard?q=x"), here), true);
});

test("…and not for the same page, other sites, new tabs, downloads, file links or modified clicks", () => {
  assert.equal(isInternalNav(click, a("/dashboard"), here), false);
  assert.equal(isInternalNav(click, a("/dashboard#main"), here), false);
  assert.equal(isInternalNav(click, a("https://wa.me/60123"), here), false);
  assert.equal(isInternalNav(click, a("/cases/abc", { target: "_blank" }), here), false);
  assert.equal(isInternalNav(click, a("/api/cases/1/files/2", { hasDownload: true }), here), false);
  assert.equal(isInternalNav(click, a("/api/cases/1/files/2"), here), false);
  assert.equal(isInternalNav({ ...click, metaKey: true }, a("/cases/abc"), here), false);
  assert.equal(isInternalNav({ ...click, defaultPrevented: true }, a("/cases/abc"), here), false);
});
