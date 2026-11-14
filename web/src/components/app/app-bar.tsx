"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/lang-provider";
import { Brand } from "@/components/brand-mark";
import LangSwitch from "@/components/lang-switch";
import { Burger, Chevron, Exit, Plus } from "./marks";

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

function AccountMenu({ email }: { email: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const close = useRef((refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); }).current;
  useDismiss(open, close, ref);
  useEffect(() => { if (open) item.current?.focus(); }, [open]);
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
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[220px] rounded-[3px] border border-hair bg-panel p-1 shadow-[0_12px_24px_-16px_rgba(0,0,0,0.8)]"
        >
          <button
            ref={item}
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

function MobileMenu({ email, path }: { email: string; path: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef((refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); }).current;
  useDismiss(open, close, ref);
  const links = [
    { href: "/dashboard", label: t("nav.cases") },
    { href: "/cases/new", label: t("nav.newCase"), plus: true },
  ];
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
        <div id="app-menu" className="absolute inset-x-0 top-full border-b border-hair bg-bay shadow-[0_12px_24px_-16px_rgba(0,0,0,0.8)]">
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
                      {l.plus ? <Plus className="text-ice" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
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

/** Top bar of the signed-in app: the working frame. */
export default function AppBar({ email }: { email: string }) {
  const { t } = useT();
  const path = usePathname();
  const onCases = path === "/dashboard";
  const onNew = path === "/cases/new";
  return (
    <header className="sticky top-0 z-40 border-b border-hair bg-bay">
      <div className="wrap relative flex h-[60px] items-center gap-4 lg:h-16 lg:gap-10">
        <Link href="/dashboard" className="-my-2 flex items-center py-2">
          <Brand />
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
        </nav>
        <div className="ml-auto flex items-center gap-1.5 lg:gap-4">
          <LangSwitch />
          {email ? <AccountMenu email={email} /> : null}
          <Link
            href="/cases/new"
            aria-current={onNew ? "page" : undefined}
            className={`hidden !h-10 !gap-2 !pl-4 !pr-5 lg:inline-flex ${onNew ? "btn-line bg-panel" : "btn-primary"}`}
          >
            <Plus />
            {t("nav.newCase")}
          </Link>
          <MobileMenu email={email} path={path} />
        </div>
      </div>
    </header>
  );
}
