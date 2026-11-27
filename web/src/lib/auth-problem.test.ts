import { test } from "node:test";
import assert from "node:assert/strict";
import { authProblem, badAddress } from "./auth-problem";

test("a failed auth call is named by the server's reason, not by its status number", () => {
  assert.equal(authProblem({ status: 403, code: "EMAIL_NOT_VERIFIED" }), "unverified");
  assert.equal(authProblem({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }), "badLogin");
  assert.equal(authProblem({ status: 400, code: "INVALID_PASSWORD" }), "wrongPassword");
  assert.equal(authProblem({ status: 400, code: "PASSWORD_TOO_LONG" }), "passwordLong");
  assert.equal(authProblem({ status: 400, code: "PASSWORD_TOO_SHORT" }), "passwordShort");
});

test("a 403 that is not about the email is not called unverified; a 4xx that is not about the password is not called a wrong password", () => {
  assert.equal(authProblem({ status: 403, code: "INVALID_ORIGIN" }), "other");
  assert.equal(authProblem({ status: 403 }), "other");
  assert.equal(authProblem({ status: 401, code: "UNAUTHORIZED" }), "other");
  assert.equal(authProblem({ status: 400, code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }), "other");
  assert.equal(authProblem({ status: 500 }), "other");
});

test("too many tries and no answer at all come before any code", () => {
  assert.equal(authProblem({ status: 429 }), "tooMany");
  assert.equal(authProblem({ status: 429, code: "EMAIL_NOT_VERIFIED" }), "tooMany");
  assert.equal(authProblem({}), "offline");
  assert.equal(authProblem({ status: 0 }), "offline");
  assert.equal(authProblem(null), "offline");
});

test("a malformed address is told from other refusals", () => {
  assert.equal(badAddress({ status: 400, code: "VALIDATION_ERROR" }), true);
  assert.equal(badAddress({ status: 400, code: "INVALID_EMAIL" }), true);
  assert.equal(badAddress({ status: 400, code: "EMAIL_ALREADY_VERIFIED" }), false);
  assert.equal(badAddress({ status: 400 }), false);
  assert.equal(badAddress({ status: 429 }), false);
  assert.equal(badAddress({ status: 500, code: "VALIDATION_ERROR" }), false);
  assert.equal(badAddress(null), false);
});
