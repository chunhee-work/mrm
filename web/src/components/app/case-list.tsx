"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useT } from "@/components/lang-provider";
import { kindOf } from "@/lib/file-kind";
import ScanEdge from "@/components/scan-edge";
import { accepted } from "./drop-zone";
import { Cross, EmptySheetArt, NoMatchArt, Plus, Search, Tick, Upload } from "./marks";
import { groupOf, shownOf, StatusMark, type Group } from "./status";

export type CaseRow = {
  id: string;
  plate: string;
  carModel: string | null;
  insurer: string | null;
  status: string;
  pendingDoc: string | null;
};

type Filter = Group | "all";
const FILTERS: Filter[] = ["all", "needs", "active", "done"];
const GROUPS: Group[] = ["needs", "active", "done"]; // the order of the rows under "All"
const REFRESH_MS = 20_000;
const RECEIVED_MS = 8_000;

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// From lg a row is four cells on one line: number, vehicle, status, and a fixed slot for the one button a row can have
// (fixed, so the statuses start at the same place whether or not the row has a button).
const COLS = "lg:grid-cols-[minmax(128px,0.9fr)_minmax(0,2.2fr)_minmax(0,2.1fr)_164px]";
// The row's one button: ink, compact; 44px tall under the finger, 36px (with a taller hit area) from lg.
const ACT =
  "relative inline-flex h-11 min-w-[104px] items-center justify-center gap-2 whitespace-nowrap rounded-[3px] bg-ice px-4 text-[14px] font-semibold leading-none text-bay transition-colors duration-150 hover:bg-icehi before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] lg:h-9 lg:px-3.5";

/**
 * One case, one line: which car, and the one thing its owner needs to know. Done, being worked on,
 * or what it is waiting for. Nothing opens (owner 2026-11-15: "user just need to know it done or not … and if missing thing, then is what").
 * A missing document is sent from the row itself: choosing the files uploads them, there is no second button.
 */
function CaseItem({ row, orgId }: { row: CaseRow; orgId: string }) {
  const { t } = useT();
  const router = useRouter();
  const item = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<number | null>(null); // how much of the upload has gone up (0 to 100), while it runs
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // "Received" is a passing word: by the time it goes, the list has been read again and the row speaks for itself.
  useEffect(() => {
    if (!sent) return;
    const id = window.setTimeout(() => setSent(false), RECEIVED_MS);
    return () => window.clearTimeout(id);
  }, [sent]);

  /** Upload the chosen files (none for "Try again"), then put the case back in the queue. */
  async function send(files: File[]) {
    if (sending !== null) return;
    setErr("");
    setSending(0);
    let saving = false;
    try {
      const folder = `${orgId}/${row.id}-add-${crypto.randomUUID()}`;
      const total = files.reduce((n, f) => n + f.size, 0) || 1;
      const done = [];
      let before = 0;
      for (const f of files) {
        const base = before;
        const b = await upload(`${folder}/${f.name}`, f, {
          access: "private", handleUploadUrl: "/api/upload", multipart: f.size > 20e6,
          onUploadProgress: (p) => setSending(Math.min(100, Math.round(((base + p.loaded) / total) * 100))),
        });
        before += f.size;
        done.push({ kind: kindOf(f), url: b.url, name: f.name, size: f.size });
      }
      saving = true;
      const r = await fetch(`/api/cases/${row.id}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: done }) });
      if (!r.ok) throw new Error("not saved");
      // the button is about to go: keep the keyboard's place on this row
      if (document.activeElement === button.current) item.current?.focus();
      setSent(true);
      router.refresh();
    } catch {
      setErr(t(saving ? "dash.a.fail" : "new.failUpload"));
    } finally {
      setSending(null);
    }
  }
  function onChosen(list: File[]) {
    const ok = list.filter(accepted);
    if (ok.length) void send(ok);
    else if (list.length) setErr(t("dash.a.badType"));
  }

  const real = shownOf(row.status);
  // Just sent: the row says "in progress" straight away, it does not wait for the list to be read again.
  const shown = sent && real === "missing" ? "working" : real;
  const needs = shown === "missing" || shown === "stopped" || shown === "confirm";
  // a case on hold has no button: there is nothing for the user to press, the team picks it up
  const act = shown === "missing" ? "upload" : null;
  // Below lg, a row that needs the user (or has just been sent) gives its status a full line of its own under the car,
  // so a long list of missing documents has room; its button sits where the other rows have their status.
  const wide = needs || sent;
  const docs = (row.pendingDoc ?? "").split("; ").map((d) => d.trim()).filter(Boolean);
  const label =
    shown === "missing" ? (docs.length ? t("dash.s.missing", { what: docs.join(", ") }) : t("dash.s.missingSome")) : t(`dash.s.${shown}`);
  const statusId = `case-status-${row.id}`;
  const busy = sending !== null;

  return (
    <li
      ref={item}
      tabIndex={-1}
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-b px-4 py-3.5 transition-colors duration-150 last:-mb-px focus-visible:outline-offset-[-2px] lg:min-h-[68px] lg:gap-x-6 lg:px-6 lg:py-3 ${COLS} ${
        needs ? "border-amber/25 bg-ambertint" : "border-hair hover:bg-bay"
      }`}
    >
      {/* phones and portrait tablets: number over vehicle, and to their right the status or the row's button */}
      <div className="min-w-0 lg:contents">
        <p className="num truncate font-mono text-[16px] font-medium leading-[22px] tracking-[0.01em] text-fg">
          {row.plate || <span className="font-sans text-[15px] font-normal tracking-normal text-mute">{t("dash.unread")}</span>}
        </p>
        <p className="mt-0.5 truncate text-[14px] leading-[20px] text-mute lg:mt-0 lg:text-[15px] lg:leading-[22px]">
          {row.carModel ? <span className={`mr-2 ${shown === "done" ? "" : "text-fg"}`}>{row.carModel}</span> : null}
          {row.carModel && row.insurer ? " " : null}
          {row.insurer}
        </p>
      </div>

      <p
        id={statusId}
        className={`flex min-w-0 items-start gap-2.5 text-[15px] leading-[22px] ${
          needs ? "font-medium text-fg" : shown === "done" ? "text-mute" : "text-fg"
        } ${wide ? "max-lg:col-span-2 max-lg:row-start-2 max-lg:-ml-[3px]" : "whitespace-nowrap"} ${act || sent ? "" : "lg:col-span-2"}`}
      >
        <StatusMark shown={shown} />
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      </p>

      {(act || sent) && (
        <div className="flex justify-end max-lg:col-start-2 max-lg:row-start-1">
          {/* always in the page while the row can act, so "Received" is announced when it arrives */}
          <p role="status" className={sent ? "flex h-11 items-center gap-2 whitespace-nowrap text-[14px] font-medium text-fg lg:h-9" : "sr-only"}>
            {sent && (
              <>
                <Tick className="h-[15px] w-[15px] shrink-0 text-go" />
                {t("dash.a.received")}
              </>
            )}
          </p>
          {!sent && act === "upload" && (
            <>
              <input
                ref={input}
                type="file"
                multiple
                accept=".zip,.pdf,image/*"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                onChange={(e) => { onChosen(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
              <button
                ref={button}
                type="button"
                aria-describedby={statusId}
                aria-disabled={busy}
                onClick={() => { if (!busy) input.current?.click(); }}
                className={`${ACT} ${busy ? "num cursor-progress hover:bg-ice" : ""}`}
              >
                {busy ? t("dash.a.uploading", { pct: String(sending) }) : <><Upload />{t("dash.a.upload")}</>}
                {/* the upload so far, along the button's bottom edge */}
                {busy && (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-[3px]">
                    <span className="block h-full origin-left bg-scan transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${sending / 100})` }} />
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* what went wrong, under the status and on its text's left edge (the square sits in the mark's slot) */}
      {err && (
        <p role="alert" className="col-span-2 flex items-start gap-2.5 text-[14px] font-medium leading-[20px] text-fg max-lg:-ml-[3px] lg:col-start-3">
          <span aria-hidden="true" className="mx-[3px] mt-[5px] h-[10px] w-[10px] shrink-0 bg-amber" />
          {err}
        </p>
      )}
      {needs && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-amber" />}
    </li>
  );
}

export default function CaseList({ rows, orgId }: { rows: CaseRow[]; orgId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
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
  // "All" is layered: what needs the user first, then what is being worked on, then what is finished (newest first inside each).
  // One flat run of rows, so a case that moves to another layer stays the same element and keeps what it was doing.
  const ordered = filter === "all" ? GROUPS.flatMap((g) => shown.filter((r) => groupOf(r.status) === g)) : shown;

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? FILTERS.length - 1 : step ? (i + step + FILTERS.length) % FILTERS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setFilter(FILTERS[to]);
    tabs.current[to]?.focus();
  }

  return (
    <div className="app-fill wrap flex min-h-[460px] flex-col pb-6 pt-6 lg:pb-9 lg:pt-9">
      <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-4 lg:flex-nowrap lg:gap-x-8">
        <h1 className="display-2 text-[30px] text-fg lg:text-[36px]">{t("dash.title")}</h1>

        {rows.length > 0 && (
          <>
            <div data-tabrow className="order-3 -mx-4 w-[calc(100%+32px)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-full sm:px-0 lg:order-none lg:w-auto [&::-webkit-scrollbar]:hidden">
              <div role="tablist" aria-label={t("dash.filter")} className="inline-flex h-11 items-stretch rounded-[3px] border border-hair bg-panel p-[3px]">
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
          ) : ordered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <NoMatchArt />
              <p className="mt-5 text-[16px] font-medium text-fg">{t("dash.noMatch")}</p>
              <button type="button" className="btn-quiet mt-1" onClick={() => { setQ(""); setFilter("all"); }}>
                {t("dash.showAll")}
              </button>
            </div>
          ) : (
            <ul aria-label={t("dash.title")} tabIndex={0} className="app-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]">
              {ordered.map((r) => <CaseItem key={r.id} row={r} orgId={orgId} />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
