import { test } from "node:test";
import assert from "node:assert/strict";
import { crossSiteWrite } from "./same-origin";

const base = { method: "POST", host: "app.example.com", origin: "https://app.example.com", fetchSite: "same-origin", hasOurCookie: true };

test("our own pages may write", () => {
  assert.equal(crossSiteWrite(base), false);
  assert.equal(crossSiteWrite({ ...base, fetchSite: null }), false, "an older browser sends only Origin");
  assert.equal(crossSiteWrite({ ...base, host: "localhost:3100", origin: "http://localhost:3100" }), false, "a local run, with a port");
  assert.equal(crossSiteWrite({ ...base, host: "APP.example.com" }), false, "host names compare without case");
});

test("another site may not write with the visitor's cookie", () => {
  assert.equal(crossSiteWrite({ ...base, origin: "https://evil.test", fetchSite: "cross-site" }), true);
  assert.equal(crossSiteWrite({ ...base, origin: "https://evil.test", fetchSite: null }), true, "Origin alone is enough");
  assert.equal(crossSiteWrite({ ...base, origin: null, fetchSite: "cross-site" }), true, "Sec-Fetch-Site alone is enough");
  assert.equal(crossSiteWrite({ ...base, origin: "https://example.com", fetchSite: "same-site" }), true, "the marketing host is another origin");
  assert.equal(crossSiteWrite({ ...base, origin: "https://app.example.com.evil.test", fetchSite: null }), true, "a look-alike host");
  assert.equal(crossSiteWrite({ ...base, origin: "http://app.example.com:8080", fetchSite: null }), true, "another port is another origin");
  assert.equal(crossSiteWrite({ ...base, origin: "null", fetchSite: null }), true, "a sandboxed frame");
  assert.equal(crossSiteWrite({ ...base, origin: "not a url", fetchSite: null }), true);
  for (const method of ["PUT", "PATCH", "DELETE", "post"]) assert.equal(crossSiteWrite({ ...base, method, origin: "https://evil.test" }), true, method);
});

test("reads, and callers that are not a signed-in browser, are left alone", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(crossSiteWrite({ ...base, method, origin: "https://evil.test", fetchSite: "cross-site" }), false, method);
  assert.equal(crossSiteWrite({ ...base, origin: "https://evil.test", fetchSite: "cross-site", hasOurCookie: false }), false, "no cookie of ours: nothing to ride on (worker, cron, payment servers)");
  assert.equal(crossSiteWrite({ ...base, origin: null, fetchSite: null }), false, "a script with a cookie jar (our own tests) sends neither header");
});
