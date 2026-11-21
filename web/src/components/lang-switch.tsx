"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGS, LANG_LABEL, type Lang } from "@/lib/i18n";
import { useT } from "./lang-provider";

const SHORT: Record<Lang, string> = { en: "EN", zh: "中文", ms: "BM" };

/** A globe button; its menu holds the three languages. Keeps the existing `lang` cookie mechanism. */
export default function LangSwitch() {
  const { lang, t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  function pick(l: Lang) {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={box} className="relative inline-flex h-11 items-center lg:h-9">
      <button
        ref={btn}
        type="button"
        aria-label={`${t("lang.label")}: ${LANG_LABEL[lang]}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 min-w-[44px] items-center justify-center gap-1.5 rounded-[3px] border border-hair bg-panel px-2.5 text-mute transition-colors before:absolute before:-inset-1 before:content-[''] hover:text-ice"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.25" />
          <ellipse cx="12" cy="12" rx="4" ry="9.25" />
          <path d="M2.75 12h18.5M4.2 7.2h15.6M4.2 16.8h15.6" />
        </svg>
        <span className="text-[12px] font-semibold leading-none" lang={lang === "zh" ? "zh-CN" : lang}>{SHORT[lang]}</span>
      </button>
      {open && (
        <ul id={menuId} role="group" aria-label={t("lang.label")} className="absolute right-0 top-full z-50 mt-1 min-w-[148px] overflow-hidden rounded-[3px] border border-hair bg-panel shadow-lg">
          {LANGS.map((l) => (
            <li key={l}>
              <button
                type="button"
                lang={l === "zh" ? "zh-CN" : l}
                aria-pressed={l === lang}
                onClick={() => pick(l)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[14px] transition-colors hover:text-ice ${l === lang ? "font-semibold text-fg" : "text-mute"}`}
              >
                <span>{LANG_LABEL[l]}</span>
                <span className="text-[12px] font-semibold">{SHORT[l]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
