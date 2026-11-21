// Same AES-256-GCM layout as autopilot_worker/crypto.py and web/src/lib/crypto/merimen-cred.ts.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function usernameHint(name) {
  const s = String(name || "").trim();
  if (s.length <= 2) return "•".repeat(s.length);
  return s.slice(0, 2) + "…";
}

function gcmEncrypt(key, nonce, plain, aad) {
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(aad));
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}
function gcmDecrypt(key, nonce, blob, aad) {
  const ct = blob.subarray(0, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function seal(masterB64, orgId, username, password) {
  const master = Buffer.from(masterB64, "base64");
  if (master.length !== 32) throw new Error("key");
  const dek = randomBytes(32);
  const dekNonce = randomBytes(12);
  const userNonce = randomBytes(12);
  const passNonce = randomBytes(12);
  const b64 = (b) => b.toString("base64");
  return {
    username_hint: usernameHint(username),
    wrapped_dek: b64(gcmEncrypt(master, dekNonce, dek, `dek:${orgId}`)),
    dek_nonce: b64(dekNonce),
    username_ct: b64(gcmEncrypt(dek, userNonce, Buffer.from(username), `user:${orgId}`)),
    username_nonce: b64(userNonce),
    password_ct: b64(gcmEncrypt(dek, passNonce, Buffer.from(password), `pass:${orgId}`)),
    password_nonce: b64(passNonce),
  };
}

import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

export function openSecret(masterB64, orgId, row, field) {
  const master = Buffer.from(masterB64, "base64");
  const dek = gcmDecrypt(master, Buffer.from(row.dek_nonce, "base64"), Buffer.from(row.wrapped_dek, "base64"), `dek:${orgId}`);
  const which = field === "pass" ? ["password_ct", "password_nonce", `pass:${orgId}`] : ["username_ct", "username_nonce", `user:${orgId}`];
  return gcmDecrypt(dek, Buffer.from(row[which[1]], "base64"), Buffer.from(row[which[0]], "base64"), which[2]).toString();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const msg = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(openSecret(msg.master, msg.org, msg.row, msg.field || "pass"));
}
