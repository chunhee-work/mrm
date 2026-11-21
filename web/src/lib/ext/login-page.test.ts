import test from "node:test";
import assert from "node:assert/strict";
import { classifyLogin } from "./login-page";

test("a locked account is not reported as a wrong password, even when the page says password", () => {
  const text = "Invalid password. Your account has been locked. locktime=15";
  assert.equal(classifyLogin({ text, hasPassword: true }), "locked");
});

test("wrong user name or password, in English and Chinese", () => {
  assert.equal(classifyLogin({ text: "Invalid User ID or password", hasPassword: true }), "bad_credentials");
  assert.equal(classifyLogin({ text: "用户名或密码错误", hasPassword: true }), "bad_credentials");
});

test("a code page, and the word contact is not a code", () => {
  assert.equal(classifyLogin({ text: "Enter the verification code" }), "otp");
  assert.equal(classifyLogin({ text: "Please contact the workshop", hasPassword: true }), "unknown");
  assert.equal(classifyLogin({ hasOtp: true, hasPassword: true }), "otp");
});

test("logged in only when the claims address has a session and the password box is gone", () => {
  const url = "https://www.merimen.com.my/claims/index.cfm?CFID=1&RID=2";
  assert.equal(classifyLogin({ url, text: "Home", hasPassword: false }), "success");
  assert.equal(classifyLogin({ url, text: "Home", hasPassword: true }), "unknown");
});
