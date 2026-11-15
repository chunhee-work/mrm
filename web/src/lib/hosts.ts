/**
 * Two hosts, one deployment. The system lives on its own host (env BETTER_AUTH_URL, "app.<domain>"); the bare domain
 * (and www) is the marketing site. The auth server only accepts sign-in from its own host, and a session made on one
 * host does not exist on the other, so everything to do with an account belongs on the app host.
 */

/** Paths that belong to the system: asked for on the marketing host, they are sent to the app host. */
const ACCOUNT = /^\/(login|signup|forgot-password|reset-password|dashboard|cases|billing|admin)(\/|$)/;

/** The app's origin when `host` is the marketing host of the same domain; "" on the app host itself, on previews and on localhost. */
export function appOriginFor(host: string | null | undefined, authUrl: string | undefined = process.env.BETTER_AUTH_URL): string {
  let app: URL;
  try { app = new URL(authUrl ?? ""); } catch { return ""; }
  if (app.protocol !== "https:" || !app.hostname.startsWith("app.")) return "";
  const bare = app.hostname.slice(4);
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  return h === bare || h === `www.${bare}` ? app.origin : "";
}

/** Where a request for `path` on `host` should go instead, or null to serve it as it is. */
export function accountRedirect(host: string | null | undefined, path: string, search = "", authUrl?: string): string | null {
  if (!ACCOUNT.test(path)) return null;
  const origin = authUrl === undefined ? appOriginFor(host) : appOriginFor(host, authUrl);
  return origin ? origin + path + search : null;
}
