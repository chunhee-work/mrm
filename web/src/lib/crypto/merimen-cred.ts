import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope encryption for the Merimen user name and password (AES-256-GCM).
// Layout matches worker/autopilot_worker/crypto.py: 12-byte nonce, 16-byte tag appended.
// The password is never logged and never returned to the browser.

export type Sealed = {
  usernameHint: string;
  wrappedDek: string;
  dekNonce: string;
  usernameCt: string;
  usernameNonce: string;
  passwordCt: string;
  passwordNonce: string;
};

export function masterKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function usernameHint(name: string): string {
  const s = name.trim();
  if (s.length <= 2) return "•".repeat(s.length);
  return s.slice(0, 2) + "…";
}

function gcmEncrypt(key: Buffer, nonce: Buffer, plain: Buffer, aad: string): Buffer {
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(aad));
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}
function gcmDecrypt(key: Buffer, nonce: Buffer, blob: Buffer, aad: string): Buffer {
  const ct = blob.subarray(0, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, nonce);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function seal(master: Buffer, orgId: string, username: string, password: string): Sealed {
  const dek = randomBytes(32);
  const dekNonce = randomBytes(12);
  const userNonce = randomBytes(12);
  const passNonce = randomBytes(12);
  const b64 = (b: Buffer) => b.toString("base64");
  return {
    usernameHint: usernameHint(username),
    wrappedDek: b64(gcmEncrypt(master, dekNonce, dek, `dek:${orgId}`)),
    dekNonce: b64(dekNonce),
    usernameCt: b64(gcmEncrypt(dek, userNonce, Buffer.from(username), `user:${orgId}`)),
    usernameNonce: b64(userNonce),
    passwordCt: b64(gcmEncrypt(dek, passNonce, Buffer.from(password), `pass:${orgId}`)),
    passwordNonce: b64(passNonce),
  };
}

/** OTP uses the org data key. The password ciphertext is not decrypted here. */
export function sealOtp(master: Buffer, orgId: string, row: { wrappedDek: string; dekNonce: string }, code: string): { codeCt: string; codeNonce: string } {
  const dek = gcmDecrypt(master, Buffer.from(row.dekNonce, "base64"), Buffer.from(row.wrappedDek, "base64"), `dek:${orgId}`);
  const nonce = randomBytes(12);
  return { codeNonce: nonce.toString("base64"), codeCt: gcmEncrypt(dek, nonce, Buffer.from(code), `otp:${orgId}`).toString("base64") };
}

export function cleanSecret(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!s || s.length > max) return null;
  return s;
}

/** True when the master key env var (MERIMEN_CRED_KEY, 32 bytes, base64) is set on this server. Saving needs it. */
export const credKeyReady = (env: Record<string, string | undefined> = process.env) => masterKey(env.MERIMEN_CRED_KEY) !== null;
