import type { Lang } from "./i18n";

const KL = "Asia/Kuala_Lumpur";
const localeOf = (lang: Lang) => (lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-GB");

/** "21 Nov 2026, 23:44" in Malaysia time, in the page language (R2-U02: cases with the same plate are told apart by when they were uploaded). */
export function whenOf(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "medium", timeStyle: "short", timeZone: KL, hour12: false }).format(new Date(iso));
}

const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KL, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // 2026-11-21

/**
 * The time of one activity line, kept short: "23:44" for today (Malaysia time), "21 Nov, 23:44" for another day of this year
 * (the hour alone does not say which day), and the full date for another year.
 */
export function logWhen(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: KL });
  const day = dayOf(d), today = dayOf(now);
  if (day === today) return time;
  if (day.slice(0, 4) !== today.slice(0, 4)) return whenOf(iso, lang);
  const date = new Intl.DateTimeFormat(localeOf(lang), { day: "numeric", month: "short", timeZone: KL }).format(d);
  return lang === "zh" ? `${date} ${time}` : `${date}, ${time}`;
}
