/**
 * A page on another site must not be able to make a signed-in visitor's browser change things here.
 * The session cookie is SameSite=Lax, which already keeps it off another site's POSTs. This is the second lock:
 * a request that changes something, carries one of our cookies and says it comes from another site is refused
 * before it reaches any route (middleware.ts).
 *
 * Left alone on purpose: reads (GET/HEAD/OPTIONS); requests with no cookie of ours (the worker, cron, the payment
 * providers' servers: each of those routes has its own secret); requests with no Origin and no Sec-Fetch-Site
 * (not a browser, or a very old one).
 */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSiteWrite(req: { method: string; host: string | null; origin: string | null; fetchSite: string | null; hasOurCookie: boolean }): boolean {
  if (READS.has(req.method.toUpperCase()) || !req.hasOurCookie) return false;
  // browsers say where a request comes from; "same-site" is another host of our own domain (the marketing site), which has no business writing here either
  const site = (req.fetchSite ?? "").toLowerCase();
  if (site === "cross-site" || site === "same-site") return true;
  if (!req.origin) return false;
  if (req.origin === "null") return true; // a sandboxed frame or a file opened from disk
  try { return new URL(req.origin).host.toLowerCase() !== (req.host ?? "").toLowerCase(); } catch { return true; }
}
