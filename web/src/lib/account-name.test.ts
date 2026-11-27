import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, MAX_NAME, nameAtSignUp, nameFromEmail, shownCompany } from "./account-name";

test("Company row: a name sign-up made from the email is not shown; a real company name is", () => {
  assert.equal(nameFromEmail("Ahmad+claims@abc.my"), "Ahmad");
  assert.equal(shownCompany("Ahmad", "ahmad+claims@abc.my"), "");
  assert.equal(shownCompany("ahmad@abc.my", "ahmad@abc.my"), "");
  assert.equal(shownCompany("ABC Motor Sdn Bhd", "ahmad@abc.my"), "ABC Motor Sdn Bhd");
  assert.equal(shownCompany(null, "ahmad@abc.my"), "");
});

test("a changed account name: trimmed, not empty, not longer than the limit, text only", () => {
  assert.equal(cleanName("  Ahmad Motor  "), "Ahmad Motor");
  assert.equal(cleanName("x".repeat(MAX_NAME)), "x".repeat(MAX_NAME));
  assert.equal(cleanName("x".repeat(MAX_NAME + 1)), null);
  assert.equal(cleanName(" ".repeat(5)), null);
  assert.equal(cleanName(""), null);
  for (const notText of [null, 7, {}, ["a"]]) assert.equal(cleanName(notText), null);
  assert.equal(cleanName("车".repeat(MAX_NAME)), "车".repeat(MAX_NAME));
});

test("a new account's name: what the form sends is kept; too long is cut, never refused; nothing usable falls back to the email", () => {
  assert.equal(nameAtSignUp(nameFromEmail("ahmad@abc.my"), "ahmad@abc.my"), "ahmad");
  assert.equal(nameAtSignUp("  Ahmad  ", "a@abc.my"), "Ahmad");
  assert.equal(nameAtSignUp("x".repeat(5000), "a@abc.my"), "x".repeat(MAX_NAME));
  assert.equal(nameAtSignUp("   ", "ahmad@abc.my"), "ahmad");
  assert.equal(nameAtSignUp(undefined, "ahmad@abc.my"), "ahmad");
  // a name the sign-up form makes always passes the check a changed name gets
  const long = `${"a".repeat(200)}@abc.my`;
  assert.equal(cleanName(nameFromEmail(long)), nameFromEmail(long));
  // cut between whole characters, never through one
  assert.equal(nameAtSignUp("😀".repeat(MAX_NAME + 3), "a@abc.my"), "😀".repeat(MAX_NAME));
});
