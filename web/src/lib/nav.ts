// Does this click open another page of the app (so the top bar in nav-progress.tsx should run)?
export function isInternalNav(e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">, a: { href: string; target: string; hasDownload: boolean }, here: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.hasDownload || (a.target && a.target !== "_self")) return false;
  let to: URL, now: URL;
  try { to = new URL(a.href, here); now = new URL(here); } catch { return false; }
  if (to.origin !== now.origin || /^\/api\//.test(to.pathname)) return false;
  return to.pathname !== now.pathname || to.search !== now.search;
}
