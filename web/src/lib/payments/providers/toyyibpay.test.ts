import test from "node:test";
import assert from "node:assert/strict";
import { baseUrl } from "./toyyibpay";

test("test mode never uses the live host", () => {
  assert.equal(baseUrl("test", undefined), "https://dev.toyyibpay.com");
  assert.equal(baseUrl("test", ""), "https://dev.toyyibpay.com");
  assert.equal(baseUrl("test", "https://toyyibpay.com"), "https://dev.toyyibpay.com");
  assert.equal(baseUrl("test", "https://dev.toyyibpay.com/"), "https://dev.toyyibpay.com");
});
test("live mode defaults to the live host", () => {
  assert.equal(baseUrl("live", undefined), "https://toyyibpay.com");
  assert.equal(baseUrl("live", "https://toyyibpay.com/"), "https://toyyibpay.com");
});
test("look-alike hosts are not the sandbox", () => {
  assert.equal(baseUrl("test", "https://dev.toyyibpay.com.evil.test"), "https://dev.toyyibpay.com");
  assert.equal(baseUrl("test", "https://toyyibpay.com/?dev.toyyibpay.com"), "https://dev.toyyibpay.com");
});
