"use client";
import { useRouter } from "next/navigation";
import { LANGS, type Lang } from "@/lib/i18n";
import { useT } from "./lang-provider";

const SHORT: Record<Lang, string> = { en: "EN", zh: "中文", ms: "BM" };

/** Compact segmented control. Keeps the existing `lang` cookie mechanism. */
export default function LangSwitch() {
  const { lang, t } = useT();
  const router = useRouter();
  function pick(l: Lang) {
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <div role="group" aria-label={t("lang.label")} className="inline-flex h-11 items-center lg:h-9">
      <div className="inline-flex h-8 items-stretch rounded-[3px] border border-hair bg-panel p-[2px]">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            lang={l === "zh" ? "zh-CN" : l}
            aria-pressed={l === lang}
            onClick={() => pick(l)}
            className={`relative min-w-[36px] rounded-[2px] px-2 min-[400px]:min-w-[42px] lg:min-w-[34px] text-[12px] font-semibold leading-none transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] ${
              l === lang ? "bg-ice text-bay" : "text-mute hover:text-ice"
            }`}
          >
            {SHORT[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
