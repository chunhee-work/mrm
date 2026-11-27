// One check for every route that is handed the URL of an uploaded file (new case, added files, zip split).
// The server later downloads these URLs, so only our own file store and only the caller's own folder may pass.
// No imports: also safe in the browser.

const STORE_HOST = ".blob.vercel-storage.com";

/**
 * The stand-in store of the local hard test (scripts/fake-blob.mjs): the origin the blob client was pointed at, and only when
 * that is this machine. Never on a real deployment.
 */
function localStore(): string | null {
  if (process.env.VERCEL === "1") return null;
  const raw = process.env.VERCEL_BLOB_API_URL || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Does a decoded path step out of its folder? True for a part that is `.` or `..` (also when it was written with %2e or %2f,
 * or hidden under a second layer of encoding) and for a backslash. Dots inside a file name ("report..final.pdf") are fine.
 */
export function climbs(path: string): boolean {
  if (path.includes("\\")) return true;
  let p = path;
  for (let layer = 0; layer < 3; layer++) {
    if (p.split(/[\\/]/).some((part) => part === "." || part === "..")) return true;
    // One escape at a time, and only plain characters (the dot, the slashes and % are among them). Decoding the whole path at once
    // stopped at the first "%" that is no escape ("100%" in a name) and so let a `..` hidden behind it through.
    const next = p.replace(/%([0-7][0-9a-f])/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (next === p) return false;
    p = next;
  }
  return false;
}

/**
 * The decoded path of an uploaded file when the URL is https, on our file store, and under the organisation's own folder
 * (`/<orgId>/…`) without stepping out of it. Anything else gives null and must be refused.
 */
export function ownBlobPath(url: string, orgId: string): string | null {
  let u: URL;
  let path: string;
  try { u = new URL(url); path = decodeURIComponent(u.pathname); } catch { return null; }
  const onStore = (u.protocol === "https:" && u.hostname.endsWith(STORE_HOST) && u.port === "") || u.origin === localStore();
  if (!onStore || u.username || u.password) return null;
  if (!orgId || !path.startsWith(`/${orgId}/`) || climbs(path)) return null;
  return path;
}
