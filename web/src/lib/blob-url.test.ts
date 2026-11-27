import { test } from "node:test";
import assert from "node:assert/strict";
import { climbs, ownBlobPath } from "./blob-url";

const S = "https://store.public.blob.vercel-storage.com";

test("U3: two dots inside a file name are fine; only a real step out of the folder is refused", () => {
  assert.equal(ownBlobPath(`${S}/org1/b1/report..final.pdf`, "org1"), "/org1/b1/report..final.pdf");
  assert.equal(ownBlobPath(`${S}/org1/b1/IMG..1.jpg`, "org1"), "/org1/b1/IMG..1.jpg");
  assert.equal(ownBlobPath(`${S}/org1/b1/a...b/..hidden.pdf`, "org1"), "/org1/b1/a...b/..hidden.pdf");
  assert.equal(ownBlobPath(`${S}/org1/b1/50%25%20off.pdf`, "org1"), "/org1/b1/50% off.pdf"); // a plain % in a name
  // a `..` part, however it is written
  assert.equal(ownBlobPath(`${S}/org1/../org2/a.pdf`, "org1"), null); // the URL parser folds it: another org's folder
  assert.equal(ownBlobPath(`${S}/org1/%2e%2e/org2/a.pdf`, "org1"), null);
  assert.equal(ownBlobPath(`${S}/org1/..%2f..%2forg2/a.pdf`, "org1"), null);
  assert.equal(ownBlobPath(`${S}/org1/b1%2f..%2f..%2forg2%2fa.pdf`, "org1"), null);
  assert.equal(ownBlobPath(`${S}/org1/%252e%252e%252forg2/a.pdf`, "org1"), null); // encoded twice
  assert.equal(ownBlobPath(`${S}/org1/b1%2f.%2fa.pdf`, "org1"), null); // a `.` part
  assert.equal(ownBlobPath(`${S}/org1/b1%5c..%5ca.pdf`, "org1"), null); // backslashes
  assert.equal(ownBlobPath(`${S}/org1/%zz/a.pdf`, "org1"), null); // not decodable
  assert.equal(climbs("/org1/b/a..b.pdf"), false);
  assert.equal(climbs("/org1/b/../a.pdf"), true);
});

test("U8: only https URLs on the file store, under the organisation's own folder, pass", () => {
  assert.equal(ownBlobPath(`${S}/org1/b1/a.pdf`, "org1"), "/org1/b1/a.pdf");
  assert.equal(ownBlobPath(`${S}/org2/b1/a.pdf`, "org1"), null); // another organisation
  assert.equal(ownBlobPath(`${S}/org10/b1/a.pdf`, "org1"), null); // a longer id that starts the same
  assert.equal(ownBlobPath("http://store.public.blob.vercel-storage.com/org1/b1/a.pdf", "org1"), null); // not https
  assert.equal(ownBlobPath("https://x.example/org1/b1/a.pdf", "org1"), null);
  assert.equal(ownBlobPath("http://169.254.169.254/org1/latest/meta-data/a.pdf", "org1"), null);
  assert.equal(ownBlobPath("https://blob.vercel-storage.com.evil.example/org1/a.pdf", "org1"), null);
  assert.equal(ownBlobPath("https://evilblob.vercel-storage.com/org1/a.pdf", "org1"), null); // no dot before "blob"
  assert.equal(ownBlobPath("https://user:pw@store.public.blob.vercel-storage.com/org1/a.pdf", "org1"), null);
  assert.equal(ownBlobPath("https://store.public.blob.vercel-storage.com:8443/org1/a.pdf", "org1"), null);
  assert.equal(ownBlobPath("not a url", "org1"), null);
  assert.equal(ownBlobPath(`${S}//a.pdf`, ""), null); // no organisation: nothing passes
});

test("U8: the local stand-in store passes only when the blob client is pointed at this machine, and never on Vercel", () => {
  const keep = { api: process.env.VERCEL_BLOB_API_URL, pub: process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL, vercel: process.env.VERCEL };
  try {
    delete process.env.VERCEL_BLOB_API_URL; delete process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL; delete process.env.VERCEL;
    assert.equal(ownBlobPath("http://127.0.0.1:3200/org1/b1/a.pdf", "org1"), null); // nothing set: refused
    process.env.VERCEL_BLOB_API_URL = "http://127.0.0.1:3200";
    assert.equal(ownBlobPath("http://127.0.0.1:3200/org1/b1/a.pdf", "org1"), "/org1/b1/a.pdf");
    assert.equal(ownBlobPath("http://127.0.0.1:3200/org2/b1/a.pdf", "org1"), null); // the folder rule still holds
    assert.equal(ownBlobPath("http://127.0.0.1:9999/org1/b1/a.pdf", "org1"), null); // another port is another server
    assert.equal(ownBlobPath("http://169.254.169.254/org1/a.pdf", "org1"), null);
    process.env.VERCEL = "1";
    assert.equal(ownBlobPath("http://127.0.0.1:3200/org1/b1/a.pdf", "org1"), null);
    delete process.env.VERCEL;
    process.env.VERCEL_BLOB_API_URL = "https://internal.example"; // an override that is not this machine opens nothing
    assert.equal(ownBlobPath("https://internal.example/org1/b1/a.pdf", "org1"), null);
  } finally {
    for (const [k, v] of [["VERCEL_BLOB_API_URL", keep.api], ["NEXT_PUBLIC_VERCEL_BLOB_API_URL", keep.pub], ["VERCEL", keep.vercel]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
