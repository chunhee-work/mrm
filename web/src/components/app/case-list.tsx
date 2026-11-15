"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { localeOf } from "@/lib/i18n";
import { useT } from "@/components/lang-provider";
import { Chevron, Cross, EmptySheetArt, NoMatchArt, Plus, Search } from "./marks";
import ScanEdge from "@/components/scan-edge";
import { groupOf, StatusMark, stepOf, TRACK, type Group } from "./status";
import CaseDetail from "./case-detail";

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
const GROUPS: Group[] = ["needs", "active", "done"]; // the order of the sections under "All"
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

export default function CaseList({ rows, orgId, now: serverNow }: { rows: CaseRow[]; orgId: string; now: number }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(serverNow);
  const [openId, setOpenId] = useState<string | null>(null); // the one row that is open
  const [keptId, setKeptId] = useState<string | null>(null); // the row that was open before: its panel stays in the page while it closes
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
  const shown = rows.filter((r) => (filter === "all" || groupOf(r.status) === filter) && (!needle || squash(r.plate ?? "").includes(needle)));
  // "All" is layered: what needs the user first, then what is being worked on, then what is finished (newest first inside each)
  const sections: { group: Group | null; rows: CaseRow[] }[] =
    filter === "all"
      ? GROUPS.map((group) => ({ group, rows: shown.filter((r) => groupOf(r.status) === group) })).filter((s) => s.rows.length > 0)
      : [{ group: null, rows: shown }];
  const lastId = sections.at(-1)?.rows.at(-1)?.id;

  function toggle(id: string) {
    setKeptId(openId);
    setOpenId(openId === id ? null : id);
  }
  const openRow = shown.find((r) => r.id === openId);
  const openHere = !!openRow;
  const openGroup = openRow ? groupOf(openRow.status) : null;
  // Escape closes the open row and hands the focus back to it.
  useEffect(() => {
    if (!openId || !openHere) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setKeptId(openId);
      setOpenId(null);
      document.getElementById(`case-row-${openId}`)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId, openHere]);
  // Once the panel has opened (or its case has moved to another section), bring all of it into view.
  useEffect(() => {
    if (!openId || !openHere) return;
    const id = window.setTimeout(() => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`case-item-${openId}`)?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }, 260);
    return () => window.clearTimeout(id);
  }, [openId, openHere, openGroup]);

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? FILTERS.length - 1 : step ? (i + step + FILTERS.length) % FILTERS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setFilter(FILTERS[to]);
    tabs.current[to]?.focus();
  }

  const cols = "lg:grid-cols-[minmax(132px,1fr)_minmax(0,2.3fr)_minmax(0,2.1fr)_minmax(112px,0.9fr)_12px]";

  function renderCase(r: CaseRow) {
    const group = groupOf(r.status);
    const needs = group === "needs";
    const open = r.id === openId;
    const at = new Date(r.createdAt);
    return (
      <div
        key={r.id}
        id={`case-item-${r.id}`}
        role="presentation"
        className={`scroll-mt-12 border-b border-hair transition-[padding] duration-200 motion-reduce:transition-none ${open ? "px-1 py-2 lg:px-2" : r.id === lastId ? "-mb-px" : ""}`}
      >
        {/* the open case lifts off the list: a white sheet with an ink outline, a step in from the edges (the row's own padding gives the step back, so its cells stay on the columns) */}
        <div role="presentation" className={`relative ${open ? "sheet z-[2] rounded-[3px] bg-panel outline outline-1 outline-ice" : ""}`}>
          <div
            role="row"
            className={`relative flex min-h-[66px] items-center gap-3 py-2.5 transition-[padding,background-color] duration-200 motion-reduce:transition-none lg:grid lg:min-h-[60px] lg:gap-x-6 lg:py-2 ${cols} ${
              open ? "px-3 lg:px-4" : `px-4 lg:px-6 ${needs ? "bg-ambertint hover:bg-amber/[0.17]" : "hover:bg-icetint/50"}`
            }`}
          >
            {/* phones and portrait tablets: two lines (number + status, vehicle + time); from lg the four cells sit on the column grid */}
            <div role="presentation" className="flex min-w-0 flex-1 flex-col gap-[5px] lg:contents">
              <div role="presentation" className="flex items-start justify-between gap-3 lg:contents">
                <span role="cell" className="num shrink-0 font-mono text-[15.5px] font-medium tracking-[0.01em] text-fg lg:order-1 lg:min-w-0 lg:shrink">
                  {/* the whole row is this button: its ::after covers the row */}
                  <button
                    type="button"
                    id={`case-row-${r.id}`}
                    aria-expanded={open}
                    aria-controls={`case-detail-${r.id}`}
                    aria-label={r.plate ? undefined : r.carModel || t(`status.${r.status}`)}
                    onClick={() => toggle(r.id)}
                    className="block max-w-full truncate text-left after:absolute after:inset-0 after:rounded-[3px] after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ice"
                  >
                    {r.plate || <span className="font-sans text-[15px] font-normal text-mute">{group === "active" ? t("dash.d.reading") : "—"}</span>}
                  </button>
                </span>
                <span role="cell" className="min-w-0 lg:order-3">
                  <StatusMark status={r.status} label={t(`status.${r.status}`)} detail={r.pendingDoc} slot />
                </span>
              </div>
              <div role="presentation" className="flex items-baseline justify-between gap-4 lg:contents">
                <span role="cell" className="min-w-0 truncate text-[14px] text-mute lg:order-2 lg:text-[15px]">
                  {r.carModel ? <span className={`mr-2.5 font-medium lg:mr-3 ${group === "done" ? "" : "text-fg"}`}>{r.carModel}</span> : null}
                  {r.insurer}
                </span>
                <span role="cell" className="shrink-0 whitespace-nowrap text-[13px] text-mute lg:order-4 lg:text-right lg:text-[14px]">
                  <time dateTime={r.createdAt} title={fmt.abs.format(at)} suppressHydrationWarning>
                    {relative(fmt.rel, at.getTime(), now)}
                  </time>
                </span>
              </div>
            </div>
            <Chevron className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none lg:order-5 ${open ? "rotate-180 text-fg" : "text-mute"}`} />
            {/* being worked on: a line along the bottom edge, as long as the case has got, with a glint running along it */}
            {group === "active" && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px z-[1] h-[2px]">
                <span className="case-glint block h-full bg-scan" style={{ width: `${((stepOf(r.status) + 1) / TRACK.length) * 100}%` }} />
              </span>
            )}
          </div>
          <div role="row" id={`case-detail-${r.id}`} className="case-panel" data-open={open} aria-hidden={!open} inert={!open}>
            <div role="cell" aria-colspan={4}>
              {(open || r.id === keptId) && <CaseDetail row={r} orgId={orgId} abs={fmt.abs} />}
            </div>
          </div>
          {needs && <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-amber ${open ? "rounded-l-[3px]" : ""}`} />}
        </div>
      </div>
    );
  }

  return (
    <div className="app-fill wrap flex min-h-[460px] flex-col pb-6 pt-6 lg:pb-9 lg:pt-9">
      <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-4 lg:flex-nowrap lg:gap-x-8">
        <h1 className="display-2 text-[30px] text-fg lg:text-[36px]">{t("dash.title")}</h1>

        {rows.length > 0 && (
          <>
            <div data-tabrow className="order-3 -mx-4 w-[calc(100%+32px)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-full sm:px-0 lg:order-none lg:w-auto [&::-webkit-scrollbar]:hidden">
              <div role="tablist" aria-label={t("dash.col.status")} className="inline-flex h-11 items-stretch rounded-[3px] border border-hair bg-panel p-[3px]">
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
                        on ? "bg-ice text-bay" : "text-fg hover:bg-icetint hover:text-ice"
                      }`}
                    >
                      {t(`dash.f.${f}`)}
                      <span
                        className={`num font-mono text-[12.5px] font-medium ${
                          amber ? "flex h-5 min-w-5 items-center justify-center rounded-[2px] bg-amber px-1 text-fg" : on ? "text-bay/75" : "text-mute"
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
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-mute transition-colors hover:text-ice"
                >
                  <Cross />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="relative mt-5 min-h-0 flex-1 lg:mt-7">
        <ScanEdge />
        <div
          id="case-panel"
          role={rows.length > 0 ? "tabpanel" : undefined}
          aria-labelledby={rows.length > 0 ? `tab-${filter}` : undefined}
          className="sheet flex h-full flex-col overflow-hidden rounded-[3px] border border-hair bg-panel"
        >
          {rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <EmptySheetArt />
              <h2 className="display-3 mt-7 text-[22px] text-fg">{t("dash.emptyTitle")}</h2>
              <p className="mt-2 text-[15px] text-mute">{t("dash.empty")}</p>
              <Link href="/cases/new" className="btn-primary mt-7 !gap-2 !pl-5">
                <Plus />
                {t("dash.new")}
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <NoMatchArt />
              <p className="mt-5 text-[16px] font-medium text-fg">{t("dash.noMatch")}</p>
              <button type="button" className="btn-quiet mt-1" onClick={() => { setQ(""); setFilter("all"); }}>
                {t("dash.showAll")}
              </button>
            </div>
          ) : (
            <div role="table" aria-label={t("dash.title")} tabIndex={0} className="app-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]">
              <div role="row" className={`note sticky top-0 z-10 hidden h-10 items-center gap-x-6 border-b border-hair bg-panel px-6 text-mute lg:grid ${cols}`}>
                <span role="columnheader" className="order-1">{t("dash.col.plate")}</span>
                <span role="columnheader" className="order-3">{t("dash.col.status")}</span>
                <span role="columnheader" className="order-2">{t("dash.col.vehicle")}</span>
                <span role="columnheader" className="order-4 text-right">{t("dash.col.created")}</span>
              </div>
              {/* one flat run of rows (no wrapper per section), so a case that moves to another section stays the same element and keeps its open panel */}
              {sections.flatMap((sec) => [
                sec.group && (
                  <div key={`head-${sec.group}`} role="row" className="flex h-9 items-center border-b border-hair bg-bay px-4 lg:px-6">
                    <span role="cell" aria-colspan={4} className="note flex items-center gap-2.5 font-medium uppercase tracking-[0.08em] text-fg">
                      {t(`dash.f.${sec.group}`)}
                      <span className="num font-normal text-mute">{sec.rows.length}</span>
                    </span>
                  </div>
                ),
                ...sec.rows.map(renderCase),
              ])}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
