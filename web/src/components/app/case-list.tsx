"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { localeOf } from "@/lib/i18n";
import { useT } from "@/components/lang-provider";
import { Crop, Cross, EmptySheetArt, NoMatchArt, Plus, Search } from "./marks";
import { groupOf, StatusMark, type Group } from "./status";

export type CaseRow = {
  id: string;
  plate: string;
  carModel: string | null;
  insurer: string | null;
  status: string;
  pendingDoc: string | null;
  createdAt: string; // ISO
  doneAt: string | null; // ISO
};

type Filter = Group | "all";
const FILTERS: Filter[] = ["all", "needs", "active", "done"];
const REFRESH_MS = 20_000;

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function relative(rtf: Intl.RelativeTimeFormat, then: number, now: number) {
  const s = Math.round((then - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return rtf.format(0, "second");
  if (a < 3600) return rtf.format(Math.trunc(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.trunc(s / 3600), "hour");
  if (a < 86400 * 14) return rtf.format(Math.trunc(s / 86400), "day");
  if (a < 86400 * 60) return rtf.format(Math.trunc(s / (86400 * 7)), "week");
  if (a < 86400 * 365) return rtf.format(Math.trunc(s / (86400 * 30)), "month");
  return rtf.format(Math.trunc(s / (86400 * 365)), "year");
}

export default function CaseList({ rows, now: serverNow }: { rows: CaseRow[]; now: number }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(serverNow);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { needs: 0, active: 0, done: 0, all: rows.length };
    for (const r of rows) c[groupOf(r.status)]++;
    return c;
  }, [rows]);

  // Live: while anything is still being worked on, re-read the list every 20 s (not in a hidden tab).
  const live = counts.active > 0;
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { if (!document.hidden) router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  // Keep "5 minutes ago" honest between refreshes.
  useEffect(() => { setNow(Date.now()); }, [serverNow]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const fmt = useMemo(() => {
    const locale = localeOf(lang);
    return {
      rel: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      abs: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }),
    };
  }, [lang]);

  // Phones: the tab row scrolls sideways; keep the selected tab in view.
  useEffect(() => {
    const el = tabs.current[FILTERS.indexOf(filter)];
    const row = el?.closest<HTMLElement>("[data-tabrow]");
    if (!el || !row || row.scrollWidth <= row.clientWidth) return;
    const a = el.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    if (a.left < b.left + 16) row.scrollLeft += a.left - b.left - 16;
    else if (a.right > b.right - 16) row.scrollLeft += a.right - b.right + 16;
  }, [filter]);

  const needle = squash(q);
  const shown = rows.filter((r) => (filter === "all" || groupOf(r.status) === filter) && (!needle || squash(r.plate).includes(needle)));

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? FILTERS.length - 1 : step ? (i + step + FILTERS.length) % FILTERS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setFilter(FILTERS[to]);
    tabs.current[to]?.focus();
  }

  const cols = "lg:grid-cols-[minmax(132px,1fr)_minmax(0,2.3fr)_minmax(0,2.1fr)_minmax(112px,0.9fr)]";

  return (
    <div className="app-fill wrap flex min-h-[460px] flex-col pb-6 pt-6 lg:pb-9 lg:pt-9">
      <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-4 lg:flex-nowrap lg:gap-x-8">
        <h1 className="display-2 text-[30px] text-ink lg:text-[36px]">{t("dash.title")}</h1>

        {rows.length > 0 && (
          <>
            <div data-tabrow className="order-3 -mx-4 w-[calc(100%+32px)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-full sm:px-0 lg:order-none lg:w-auto [&::-webkit-scrollbar]:hidden">
              <div role="tablist" aria-label={t("dash.col.status")} className="inline-flex h-11 items-stretch rounded-[4px] border border-hair bg-white p-[3px]">
                {FILTERS.map((f, i) => {
                  const on = f === filter;
                  const amber = f === "needs" && counts.needs > 0;
                  return (
                    <button
                      key={f}
                      ref={(el) => { tabs.current[i] = el; }}
                      type="button"
                      role="tab"
                      id={`tab-${f}`}
                      aria-selected={on}
                      aria-controls="case-panel"
                      tabIndex={on ? 0 : -1}
                      onClick={() => setFilter(f)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-[2px] px-2.5 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] text-[14px] sm:gap-2 sm:px-3.5 font-semibold leading-none transition-colors duration-150 ${
                        on ? "bg-ink text-white" : "text-deep hover:bg-inktint hover:text-ink"
                      }`}
                    >
                      {t(`dash.f.${f}`)}
                      <span
                        className={`num font-mono text-[12.5px] font-medium ${
                          amber ? "flex h-5 min-w-5 items-center justify-center rounded-[2px] bg-signal px-1 text-deep" : on ? "text-white/75" : "text-mute"
                        }`}
                      >
                        {counts[f]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative order-2 min-w-0 flex-1 lg:order-none lg:ml-auto lg:w-[280px] lg:flex-none">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape" && q) { e.stopPropagation(); setQ(""); } }}
                aria-label={t("dash.search")}
                placeholder={t("dash.search")}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="input !h-11 !pl-[42px] !pr-11 placeholder:!text-mute"
              />
              {q && (
                <button
                  type="button"
                  aria-label={t("dash.clear")}
                  onClick={() => { setQ(""); searchRef.current?.focus(); }}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-mute transition-colors hover:text-ink"
                >
                  <Cross />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="relative mt-5 min-h-0 flex-1 lg:mt-7">
        <Crop />
        <div
          id="case-panel"
          role={rows.length > 0 ? "tabpanel" : undefined}
          aria-labelledby={rows.length > 0 ? `tab-${filter}` : undefined}
          className="flex h-full flex-col overflow-hidden rounded-[4px] border border-hair bg-white"
        >
          {rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <EmptySheetArt />
              <h2 className="display-3 mt-7 text-[22px] text-deep">{t("dash.emptyTitle")}</h2>
              <p className="mt-2 text-[15px] text-mute">{t("dash.empty")}</p>
              <Link href="/cases/new" className="btn-primary mt-7 !gap-2 !pl-5">
                <Plus />
                {t("dash.new")}
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <NoMatchArt />
              <p className="mt-5 text-[16px] font-medium text-deep">{t("dash.noMatch")}</p>
              <button type="button" className="btn-quiet mt-1" onClick={() => { setQ(""); setFilter("all"); }}>
                {t("dash.showAll")}
              </button>
            </div>
          ) : (
            <div role="table" aria-label={t("dash.title")} aria-rowcount={shown.length + 1} tabIndex={0} className="app-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]">
              <div role="row" className={`note sticky top-0 z-10 hidden h-10 items-center gap-x-6 border-b border-hair bg-white px-6 text-mute lg:grid ${cols}`}>
                <span role="columnheader" className="order-1">{t("dash.col.plate")}</span>
                <span role="columnheader" className="order-3">{t("dash.col.status")}</span>
                <span role="columnheader" className="order-2">{t("dash.col.vehicle")}</span>
                <span role="columnheader" className="order-4 text-right">{t("dash.col.created")}</span>
              </div>
              {shown.map((r) => {
                const needs = groupOf(r.status) === "needs";
                const at = new Date(r.createdAt);
                return (
                  <div
                    key={r.id}
                    role="row"
                    className={`flex min-h-[66px] flex-col justify-center gap-[5px] border-b border-hair px-4 py-2.5 last:-mb-px lg:grid lg:min-h-[60px] lg:items-center lg:gap-x-6 lg:gap-y-0 lg:px-6 lg:py-2 ${cols} ${needs ? "bg-signaltint" : ""}`}
                  >
                    {/* phones and portrait tablets: two lines (number + status, vehicle + time); from lg the four cells sit on the column grid */}
                    <div role="presentation" className="flex items-start justify-between gap-3 lg:contents">
                      <span role="cell" className="num shrink-0 font-mono text-[15.5px] font-medium tracking-[0.01em] text-deep lg:order-1 lg:shrink lg:truncate">
                        {r.plate}
                      </span>
                      <span role="cell" className="min-w-0 lg:order-3">
                        <StatusMark status={r.status} label={t(`status.${r.status}`)} detail={r.pendingDoc} slot />
                      </span>
                    </div>
                    <div role="presentation" className="flex items-baseline justify-between gap-4 lg:contents">
                      <span role="cell" className="min-w-0 truncate text-[14px] text-mute lg:order-2 lg:text-[15px]">
                        {r.carModel ? <span className="mr-2.5 font-medium text-deep lg:mr-3">{r.carModel}</span> : null}
                        {r.insurer}
                      </span>
                      <span role="cell" className="shrink-0 whitespace-nowrap text-[13px] text-mute lg:order-4 lg:text-right lg:text-[14px]">
                        <time dateTime={r.createdAt} title={fmt.abs.format(at)} suppressHydrationWarning>
                          {relative(fmt.rel, at.getTime(), now)}
                        </time>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
