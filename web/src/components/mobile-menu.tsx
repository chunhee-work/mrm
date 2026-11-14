"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Item = { href: string; label: string; primary?: boolean };

export default function MobileMenu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);
  return (
    <div ref={ref} className="lg:hidden">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="-mr-2.5 flex h-11 w-11 items-center justify-center text-ice"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          {open ? <path d="M5 5l12 12M17 5L5 17" /> : <path d="M3 7h16M3 15h16" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-hair bg-bay shadow-[0_12px_24px_-16px_rgba(0,0,0,0.8)]">
          <ul className="wrap py-2">
            {items.map((it) => (
              <li key={it.href} className="border-b border-hair last:border-0">
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={`flex h-[52px] items-center justify-between text-[17px] font-medium ${it.primary ? "text-ice" : "text-fg"}`}
                >
                  {it.label}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
