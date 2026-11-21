import type { Lang } from "./i18n";

/** "21 Nov 2026, 23:44" in Malaysia time, in the page language (R2-U02: cases with the same plate are told apart by when they were uploaded). */
export function whenOf(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur", hour12: false }).format(new Date(iso));
}
