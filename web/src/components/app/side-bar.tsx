"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Brand } from "@/components/brand-mark";
import { Chevron, Exit } from "./marks";
import { Gear, logOut } from "./app-bar";
import ProfileCard, { type Cred } from "./profile-card";

function Icon({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d={d} /></svg>;
}
const CASES = "M4 5h16M4 12h16M4 19h10";
const CLOSED = "M5 12.5l4.5 4.5L19 7.5";
const BILLING = "M3 7h18v11H3zM3 11h18";

/**
 * Wide screens: everything that is not the work itself sits in one column on the left (owner 2026-11-27, after a reference
 * with a left rail): the brand, the places to go, the user's details for APC bot, and the account at the bottom. No search and
 * no New case here (owner: "no search, no + new on here"): both stay on the page.
 * The page on the right keeps the whole width for the cases. Phones keep the top bar (app-bar.tsx).
 */
/** The bottom of the side bar: who is signed in and the credits left; a press opens Settings and Log out above it. */
function Account({ name, email, credits }: { name: string; email: string; credits: number | null }) {
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
    <div ref={ref} className="relative border-t border-hair p-2" data-testid="side-account">
      {open && (
        <div role="menu" aria-label={email} className="absolute inset-x-2 bottom-[calc(100%+4px)] rounded-[4px] border border-hair bg-panel p-1 shadow-xl">
          <p className="truncate px-3 pb-1 pt-2 text-[12.5px] text-mute">{email}</p>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={`${menuItem} text-fg`}><Gear className="shrink-0 text-mute" />{t("nav.settings")}</Link>
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setBusy(true); void logOut(); }} className={`${menuItem} text-[#dc2626] disabled:opacity-55`} data-testid="side-logout"><Exit className="shrink-0" />{t("nav.logout")}</button>
        </div>
      )}
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-[4px] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-panel2">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-[12px] font-bold text-panel">{initials}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium text-fg">{who}</span>
          {credits != null && <span className="block truncate text-[13px] text-mute" data-testid="side-credits">{t("bill.credits", { n: credits.toLocaleString(lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY") })}</span>}
        </span>
        <Chevron className={`shrink-0 text-mute transition-transform duration-150 ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}

export default function SideBar({ email, name, credits, cred: cred0, closed }: { email: string; name: string; credits: number | null; cred: Cred | null; closed: number }) {
  const { t } = useT();
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [cred, setCred] = useState(cred0);
  useEffect(() => setCred(cred0), [cred0]);
  const view = path === "/dashboard" ? sp.get("view") : null;
  const item = (here: boolean) =>
    `flex h-10 items-center gap-3 rounded-[4px] px-3 text-[15px] transition-colors duration-150 ${here ? "bg-panel2 font-semibold text-fg" : "font-medium text-fg/80 hover:bg-panel2 hover:text-fg"}`;
  return (
    <aside className="sticky top-0 hidden h-screen h-dvh w-[260px] shrink-0 flex-col border-r border-hair bg-panel lg:flex" data-testid="side-bar">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 pt-6">
        <Link href="/dashboard" className="px-2"><Brand small /></Link>
        <nav aria-label={t("nav.menu")} className="grid gap-0.5">
          <Link href="/dashboard" aria-current={path === "/dashboard" && !view ? "page" : undefined} className={item((path === "/dashboard" && view !== "closed") || path.startsWith("/cases/"))}><Icon d={CASES} />{t("nav.cases")}</Link>
          <Link href="/dashboard?view=closed" aria-current={view === "closed" ? "page" : undefined} className={item(view === "closed")} data-testid="side-closed">
            <Icon d={CLOSED} /><span className="flex-1">{t("tray.closed")}</span><span className="num font-mono text-[12.5px] text-mute">{closed}</span>
          </Link>
          <Link href="/billing" aria-current={path.startsWith("/billing") ? "page" : undefined} className={item(path.startsWith("/billing"))}><Icon d={BILLING} />{t("nav.billing")}</Link>
        </nav>
        {/* the details APC bot uses; not filled in yet: the first page asks for them in full */}
        {cred?.complete && <ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact look="rail" />}
      </div>
      <Account name={name} email={email} credits={credits} />
    </aside>
  );
}
