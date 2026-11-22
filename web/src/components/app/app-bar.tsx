"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { Brand } from "@/components/brand-mark";
import { LANGS, LANG_LABEL, type Lang } from "@/lib/i18n";
import { Burger, Chevron, Exit, Plus } from "./marks";
import { VIEWS } from "./status";

// three buttons share one phone-wide row: each language in one short word (the full name is the spoken label)
const MENU_LANG: Record<Lang, string> = { en: "English", zh: "中文", ms: "Melayu" };

async function logOut() {
  await authClient.signOut();
  window.location.href = "/";
}

/** Closes on Escape (focus back to the trigger) and on a press outside `ref`. */
function useDismiss(open: boolean, close: (refocus: boolean) => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open, close, ref]);
}

function Gear({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

function AccountMenu({ email }: { email: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const settingsItem = useRef<HTMLAnchorElement>(null);
  const close = useRef((refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); }).current;
  useDismiss(open, close, ref);
  useEffect(() => { if (open) settingsItem.current?.focus(); }, [open]);
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}
        className={`flex h-10 max-w-[260px] items-center gap-2 rounded-[3px] border px-3 text-[14px] font-medium text-fg transition-colors duration-150 hover:border-mute ${open ? "border-ice bg-panel" : "border-transparent"}`}
      >
        <span className="truncate">{email}</span>
        <Chevron className={`shrink-0 text-mute transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id="account-menu"
          role="menu"
          aria-label={email}
          onKeyDown={(e) => { if (e.key === "Tab") setOpen(false); }}
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[220px] rounded-[3px] menu border border-hair bg-panel p-1"
        >
          <Link
            ref={settingsItem}
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center gap-3 rounded-[2px] px-3 text-left text-[15px] font-medium text-fg transition-colors duration-150 hover:bg-icetint hover:text-ice focus-visible:bg-icetint focus-visible:outline-offset-0"
          >
            <Gear className="shrink-0 text-ice" />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => { setBusy(true); void logOut(); }}
            className="flex h-11 w-full items-center gap-3 rounded-[2px] px-3 text-left text-[15px] font-medium text-fg transition-colors duration-150 hover:bg-icetint hover:text-ice focus-visible:bg-icetint focus-visible:outline-offset-0 disabled:opacity-55"
          >
            <Exit className="shrink-0 text-ice" />
            {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Phone menu: a "Language" row that says the current one; pressing it shows the three choices under it. */
function MenuLang({ lang, label, pick }: { lang: Lang; label: string; pick: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-hair">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-lang"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[52px] w-full items-center justify-between gap-4 text-[17px] font-medium text-fg"
        data-testid="menu-lang-open"
      >
        <span className="flex items-center gap-3">
          <span className="h-[18px] w-[2px] bg-transparent" aria-hidden="true" />
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-normal text-mute">
          <span className="truncate" lang={lang === "zh" ? "zh-CN" : lang}>{MENU_LANG[lang]}</span>
          <Chevron className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div id="menu-lang" role="group" aria-label={label} className="flex items-center gap-2 pb-3 pl-[14px]" data-testid="menu-lang">
          {LANGS.map((l) => (
            <button
              key={l} type="button" lang={l === "zh" ? "zh-CN" : l} aria-label={LANG_LABEL[l]} aria-pressed={l === lang} onClick={() => pick(l)}
              className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-[3px] border px-2 text-[14px] ${l === lang ? "border-ice bg-ice font-semibold text-bay" : "border-hair font-medium text-fg"}`}
            >
              <span className="truncate">{MENU_LANG[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ email, path }: { email: string; path: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef((refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); }).current;
  useDismiss(open, close, ref);
  // "New case" is a button in the bar itself (always in view), so the menu holds only the places to go
  const links = [
    { href: "/dashboard", label: t("nav.cases") },
    { href: "/billing", label: t("nav.billing") },
    { href: "/settings", label: t("nav.settings") },
  ];
  function pickLang(l: Lang) {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    router.refresh();
  }
  return (
    <div ref={ref} className="lg:hidden">
      <button
        ref={trigger}
        type="button"
        aria-label={t("nav.menu")}
        aria-expanded={open}
        aria-controls="app-menu"
        onClick={() => setOpen((v) => !v)}
        className="-mr-2.5 flex h-11 w-11 items-center justify-center text-ice"
      >
        <Burger open={open} />
      </button>
      {open && (
        <div id="app-menu" className="absolute inset-x-0 top-full menu border-b border-hair bg-panel">
          <div className="wrap pb-3 pt-2">
            <ul>
              {links.map((l) => {
                const here = path === l.href;
                return (
                  <li key={l.href} className="border-b border-hair">
                    <Link
                      href={l.href}
                      aria-current={here ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex h-[52px] items-center justify-between text-[17px] font-medium ${here ? "text-ice" : "text-fg"}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`h-[18px] w-[2px] ${here ? "bg-ice" : "bg-transparent"}`} aria-hidden="true" />
                        {l.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* the language, on a phone: one row like the others; the three choices show only once it is opened (owner 2026-11-22) */}
            <MenuLang lang={lang} label={t("lang.label")} pick={pickLang} />
            <div className="flex h-[52px] items-center justify-between gap-4 pl-[14px]">
              <span className="min-w-0 truncate text-[14px] text-mute">{email}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setBusy(true); void logOut(); }}
                className="-mr-1 flex h-11 shrink-0 items-center gap-2.5 px-1 text-[15px] font-semibold text-ice disabled:opacity-55"
              >
                {t("nav.logout")}
                <Exit />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "New case", the one main action of the bar. */
function NewCase({ onNew }: { onNew: boolean }) {
  const { t } = useT();
  return (
    <Link
      href="/cases/new"
      aria-current={onNew ? "page" : undefined}
      data-testid="new-case"
      className={`!h-10 !gap-1.5 !pl-3 !pr-3.5 !text-[14.5px] lg:!gap-2 lg:!pl-4 lg:!pr-5 lg:!text-[15px] ${onNew ? "btn-line bg-panel max-lg:hidden" : "btn-primary"}`}
    >
      <Plus />
      <span className="max-[359px]:sr-only">{t("nav.newCase")}</span>
    </Link>
  );
}

/**
 * Not on the first page: its own "New case" button is right there, and the owner wants nothing said twice (2026-11-22).
 * A view or a search of /dashboard is the case table, which has no such button, so the bar keeps it there.
 */
function NewCaseUnlessHome({ path }: { path: string }) {
  const sp = useSearchParams();
  const table = (VIEWS as readonly string[]).includes(sp.get("view") ?? "") || !!sp.get("q");
  if (path === "/dashboard" && !table) return null;
  return <NewCase onNew={path === "/cases/new"} />;
}

/** Top bar of the signed-in app: the working frame. */
export default function AppBar({ email }: { email: string }) {
  const { t } = useT();
  const path = usePathname();
  const onCases = path === "/dashboard";
  const onNew = path === "/cases/new";
  const onBilling = path.startsWith("/billing");
  return (
    <header className="sticky top-0 z-40 border-b border-hair bg-panel">
      <div className="wrap relative flex h-[60px] items-center gap-4 lg:h-16 lg:gap-10">
        <Link href="/dashboard" className="-my-2 flex items-center py-2">
          <Brand small />
        </Link>
        <nav aria-label={t("nav.menu")} className="hidden self-stretch lg:flex">
          <Link
            href="/dashboard"
            aria-current={onCases ? "page" : undefined}
            className={`relative flex items-center px-1 text-[15px] transition-colors duration-150 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:transition-colors after:duration-150 ${
              onCases ? "font-semibold text-ice after:bg-ice" : "font-medium text-fg after:bg-transparent hover:text-ice"
            }`}
          >
            {t("nav.cases")}
          </Link>
          <Link
            href="/billing"
            aria-current={onBilling ? "page" : undefined}
            className={`relative ml-8 flex items-center px-1 text-[15px] transition-colors duration-150 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:transition-colors after:duration-150 ${
              onBilling ? "font-semibold text-ice after:bg-ice" : "font-medium text-fg after:bg-transparent hover:text-ice"
            }`}
          >
            {t("nav.billing")}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 lg:gap-4">
          {email ? <AccountMenu email={email} /> : null}
          {/* the one main action is in the bar at every width: on a phone it used to sit inside the menu, two presses away */}
          <Suspense fallback={<NewCase onNew={onNew} />}><NewCaseUnlessHome path={path} /></Suspense>
          <MobileMenu email={email} path={path} />
        </div>
      </div>
    </header>
  );
}
