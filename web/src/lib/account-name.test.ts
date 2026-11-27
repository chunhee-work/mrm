import { test } from "node:test";
import assert from "node:assert/strict";
import { nameFromEmail, shownCompany } from "./account-name";

test("Company row: a name sign-up made from the email is not shown; a real company name is", () => {
  assert.equal(nameFromEmail("Ahmad+claims@abc.my"), "Ahmad");
  assert.equal(shownCompany("Ahmad", "ahmad+claims@abc.my"), "");
  assert.equal(shownCompany("ahmad@abc.my", "ahmad@abc.my"), "");
  assert.equal(shownCompany("ABC Motor Sdn Bhd", "ahmad@abc.my"), "ABC Motor Sdn Bhd");
  assert.equal(shownCompany(null, "ahmad@abc.my"), "");
});
