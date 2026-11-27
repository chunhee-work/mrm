"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Brand, BrandMark } from "@/components/brand-mark";
import { Chevron, Exit } from "./marks";
import { Gear, logOut } from "./app-bar";
import type { Cred } from "./profile-card";

function Icon({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d={d} /></svg>;
}
const CASES = "M4 5h16M4 12h16M4 19h10";
const CLOSED = "M5 12.5l4.5 4.5L19 7.5";
const BILLING = "M3 7h18v11H3zM3 11h18";
const DETAILS = "M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";

/**
 * Wide screens: everything that is not the work itself sits in one column on the left (owner 2026-11-27, after a reference
 * with a left rail): the brand, the places to go, the user's details for APC bot, and the account at the bottom. No search and
 * no New case here (owner: "no search, no + new on here"): both stay on the page.
 * The page on the right keeps the whole width for the cases. Phones keep the top bar (app-bar.tsx).
 */
/** The bottom of the side bar: who is signed in and the credits left; a press opens Settings and Log out above it. */
function Account({ name, email, credits, thin }: { name: string; email: string; credits: number | null; thin: boolean }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", down);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down); };
  }, [open]);
  const who = name.trim() || email;
  const initials = (who.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
  const menuItem = "flex h-10 w-full items-center gap-3 rounded-[3px] px-3 text-left text-[14.5px] font-medium transition-colors duration-150 hover:bg-panel2";
  return (
    <div ref={ref} className={`relative border-t border-hair ${thin ? "p-2.5" : "p-2"}`} data-testid="side-account">
      {open && (
        <div role="menu" aria-label={email} className={`absolute bottom-[calc(100%+4px)] z-50 rounded-[4px] border border-hair bg-panel p-1 shadow-xl ${thin ? "left-2 w-[240px]" : "inset-x-2"}`}>
          <p className="truncate px-3 pb-1 pt-2 text-[12.5px] text-mute">{email}</p>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={`${menuItem} text-fg`}><Gear className="shrink-0 text-mute" />{t("nav.settings")}</Link>
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setBusy(true); void logOut(); }} className={`${menuItem} text-[#dc2626] disabled:opacity-55`} data-testid="side-logout"><Exit className="shrink-0" />{t("nav.logout")}</button>
        </div>
      )}
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={thin ? `${who}${credits != null ? ` · ${credits}` : ""}` : undefined}
        className={`flex w-full items-center gap-3 rounded-[4px] py-2 text-left transition-colors duration-150 hover:bg-panel2 ${thin ? "justify-center px-0" : "px-2.5"}`}>
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-[12px] font-bold text-panel">{initials}</span>
        {!thin && <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium text-fg">{who}</span>
          {credits != null && <span className="block truncate text-[13px] text-mute" data-testid="side-credits">{t("bill.credits", { n: credits.toLocaleString(lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY") })}</span>}
        </span>}
        {!thin && <Chevron className={`shrink-0 text-mute transition-transform duration-150 ${open ? "" : "rotate-180"}`} />}
      </button>
    </div>
  );
}

const PANEL = "M4 4h16v16H4zM9.5 4v16";

export default function SideBar({ email, name, credits, cred, closed, thin: thin0 }: { email: string; name: string; credits: number | null; cred: Cred | null; closed: number; thin: boolean }) {
  const { t } = useT();
  const path = usePathname();
  const sp = useSearchParams();
  // the panel button folds the bar to a thin strip of icons and back; remembered in a cookie so the next page opens the same way
  const [thin, setThin] = useState(thin0);
  function fold() {
    const next = !thin;
    setThin(next);
    document.cookie = `side=${next ? "thin" : "wide"}; path=/; max-age=31536000; samesite=lax`;
  }
  const view = path === "/dashboard" ? sp.get("view") : null;
  const item = (here: boolean) =>
    `relative flex h-10 items-center gap-3 rounded-[4px] text-[15px] transition-colors duration-150 ${thin ? "justify-center px-0" : "px-3"} ${here ? "bg-panel2 font-semibold text-fg" : "font-medium text-fg/80 hover:bg-panel2 hover:text-fg"}`;
  const label = (text: string) => (thin ? <span className="sr-only">{text}</span> : <span className="min-w-0 flex-1 truncate">{text}</span>);
  const dot = cred ? (!cred.complete || cred.blocks || cred.blocked || cred.verifyState !== "ok" ? "bg-amber" : "bg-go") : "";
  const links = [
    { href: "/dashboard", d: CASES, text: t("nav.cases"), here: (path === "/dashboard" && view !== "closed") || path.startsWith("/cases/"), id: "side-cases" },
    { href: "/dashboard?view=closed", d: CLOSED, text: t("tray.closed"), here: view === "closed", id: "side-closed", count: closed },
    // the details APC bot uses: one line, the dot says whether Merimen took the login; the page itself holds the form
    { href: "/details", d: DETAILS, text: t("pf.title"), here: path.startsWith("/details"), id: "side-details", dot },
  ];
  // Billing sits at the very bottom, just above the account (owner 2026-11-27)
  const billing = { href: "/billing", d: BILLING, text: t("nav.billing"), here: path.startsWith("/billing"), id: "side-billing" };
  return (
    <aside className={`sticky top-0 hidden h-screen h-dvh shrink-0 flex-col border-r border-hair bg-panel transition-[width] duration-200 motion-reduce:transition-none lg:flex ${thin ? "w-[68px]" : "w-[260px]"}`} data-testid="side-bar" data-thin={thin || undefined}>
      <div className={`flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden pb-4 pt-5 ${thin ? "px-2.5" : "px-4"}`}>
        <div className={`flex items-center ${thin ? "flex-col gap-4" : "justify-between pl-2"}`}>
          <Link href="/dashboard" aria-label={t("nav.cases")}>{thin ? <BrandMark size={30} /> : <Brand small />}</Link>
          <button type="button" onClick={fold} aria-label={t(thin ? "side.open" : "side.close")} title={t(thin ? "side.open" : "side.close")} aria-expanded={!thin}
            className="flex h-9 w-9 items-center justify-center rounded-[4px] text-mute transition-colors hover:bg-panel2 hover:text-fg" data-testid="side-fold"><Icon d={PANEL} /></button>
        </div>
        <nav aria-label={t("nav.menu")} className="grid gap-0.5">
          {links.map((l) => (
            <Link key={l.id} href={l.href} aria-current={l.here ? "page" : undefined} className={item(l.here)} data-testid={l.id} title={thin ? l.text : undefined}>
              <Icon d={l.d} />{label(l.text)}
              {!thin && l.count != null && <span className="num font-mono text-[12.5px] text-mute">{l.count}</span>}
              {l.dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${l.dot} ${thin ? "absolute right-2.5 top-2" : ""}`} />}
            </Link>
          ))}
        </nav>
      </div>
      <div className={`pb-2 ${thin ? "px-2.5" : "px-4"}`}>
        <Link href={billing.href} aria-current={billing.here ? "page" : undefined} className={item(billing.here)} data-testid={billing.id} title={thin ? billing.text : undefined}><Icon d={billing.d} />{label(billing.text)}</Link>
      </div>
      <Account name={name} email={email} credits={credits} thin={thin} />
    </aside>
  );
}
