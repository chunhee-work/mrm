import test from "node:test";
import assert from "node:assert/strict";
import { accountRedirect, appOriginFor } from "./hosts";

const AUTH = "https://app.example.com";

test("on the marketing host, account pages go to the same path on the app host", () => {
  assert.equal(accountRedirect("example.com", "/login", "", AUTH), "https://app.example.com/login");
  assert.equal(accountRedirect("www.example.com", "/signup", "?plan=1", AUTH), "https://app.example.com/signup?plan=1");
  assert.equal(accountRedirect("EXAMPLE.com:443", "/cases/new", "", AUTH), "https://app.example.com/cases/new");
  assert.equal(accountRedirect("example.com", "/reset-password", "?token=abc", AUTH), "https://app.example.com/reset-password?token=abc");
});

test("marketing pages stay where they are, and so does everything on the app host, previews and localhost", () => {
  for (const path of ["/", "/faq", "/privacy", "/contact", "/loginx", "/api/auth/sign-in/email"]) assert.equal(accountRedirect("example.com", path, "", AUTH), null, path);
  for (const host of ["app.example.com", "autoclaim-web-abc.vercel.app", "localhost:3000", "evil-example.com", "example.com.evil.test", "", null]) assert.equal(accountRedirect(host, "/login", "", AUTH), null, String(host));
});

test("no app host configured, or one that is not app.<domain> over https: nothing is redirected", () => {
  for (const auth of ["", "not a url", "http://localhost:3000", "https://example.com", "http://app.example.com"]) {
    assert.equal(appOriginFor("example.com", auth), "", auth);
    assert.equal(accountRedirect("example.com", "/login", "", auth), null, auth);
  }
});

test("the details page opens on the app host too", () => {
  assert.equal(accountRedirect("example.com", "/details", "", AUTH), "https://app.example.com/details");
});
