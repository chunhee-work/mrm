"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Bin, Chevron, Cross, NoMatchArt, Search, Tick, Working } from "./marks";
import ConfirmDelete from "./confirm-delete";
import BackLink from "./back-link";
import { bucketOf, inView, type View } from "./status";
import { whenOf } from "@/lib/fmt-when";
import { money } from "./done-result";

/** One case as the first page and the table need it. */
export type CaseRow = {
  id: string;
  plate: string; // empty until the documents have been read
  carModel: string | null;
  insurer: string | null;
  status: string;
  pendingDoc: string | null;
  totalRm?: string | null; // total of the finished case, null until known
  error?: string | null; // why a failed case failed (cases.error)
  createdAt?: string; // ISO
  deskConfirm?: number; // photos still to name (R2-B05); 0 once 完成 was pressed (R3-B01)
  deskTotal?: number; // photos of the case
  photosDone?: boolean; // 完成 was pressed on the desk
  firstFile?: string | null; // name of the first uploaded file, so a case without a plate can be told apart
  canDelete?: boolean; // the worker has not taken it: it can still be deleted from the list
};

const REFRESH_MS = 20_000;
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// vehicle no. · vehicle · insurer · received · status · the arrow
const COLS = "lg:grid lg:grid-cols-[160px_minmax(0,1.1fr)_minmax(0,1.3fr)_132px_minmax(0,1.2fr)_12px_36px] lg:items-center lg:gap-x-6";

/**
 * The cases behind one row of the home page's count (or behind a search), as a plain table: one case per line, the whole line
 * opens the case. `view` null = a search over every case.
 */
export default function CaseTable({ rows, view, q0 }: { rows: CaseRow[]; view: View | null; q0: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [q, setQ] = useState(q0);
  const searchRef = useRef<HTMLInputElement>(null);

  const [gone, setGone] = useState<Set<string>>(new Set()); // rows deleted in this visit: gone at once, the refresh confirms it
  const [ask, setAsk] = useState<CaseRow | null>(null); // the row the pop-up asks about

  const mine = (view ? rows.filter((r) => inView(r, view)) : rows).filter((r) => !gone.has(r.id));
  const live = mine.some((r) => ["uploaded", "reading", "phase_a", "phase_b", "checking"].includes(r.status));
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { if (!document.hidden) router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  const needle = squash(q);
  const shown = mine.filter((r) => !needle || squash(r.plate ?? "").includes(needle));
  const title = !view ? (q.trim() ? t("list.found", { q: q.trim() }) : t("list.all"))
    : view === "all" ? t("list.all") : view === "open" ? t("tray.open") : view === "closed" ? t("tray.closed") : t(`tray.b.${view}`);

  /**
   * What the line says: where the case is in the steps, as the step bar says it. Inside one step's own list the title already names the step,
   * so the line only gives the detail (never the same words twice).
   */
  const alone = !!view && view !== "open" && view !== "all";
  const label = (r: CaseRow) => r.plate || r.firstFile || "";
  const status = (r: CaseRow) => {
    const b = bucketOf(r);
    if (b === "closed") return <><Tick className="h-4 w-4 shrink-0 text-go" /><span className="min-w-0 truncate">{money(r.totalRm) ?? t("dash.done")}</span></>;
    const wait = (say: string) => <><span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-amber" /><span className="min-w-0 truncate font-semibold">{say}</span></>;
    if (b === "active" && r.status === "checking") return <><span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-mute" /><span className="min-w-0 truncate">{t(alone ? "list.s.checkingAlone" : "list.s.checking")}</span></>;
    if (b === "active") return <><span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-mute" /><span className="min-w-0 truncate">{t(alone ? "list.s.merimenAlone" : "list.s.merimen")}</span></>;
    if (b === "hold") return wait(t("dash.d.failed"));
    if (b === "docs") {
      if (r.status !== "pending_doc") return <><Working className="shrink-0 text-scan" /><span className="min-w-0 truncate">{t("list.s.reading")}</span></>;
      const docs = (r.pendingDoc ?? "").split("; ").filter((d) => d.trim()).length;
      return wait(docs ? t("dash.d.missingN", { n: String(docs) }) : t("dash.d.missingAny"));
    }
    if (!r.deskTotal) return wait(t(alone ? "list.s.photosAddAlone" : "list.s.photosAdd"));
    return wait(r.deskConfirm ? t(alone ? "list.s.photosN" : "dash.d.photosN", { n: String(r.deskConfirm) }) : t(alone ? "list.s.photosPress" : "dash.d.photosPress"));
  };

  return (
    <div className="wrap pb-14 pt-5 lg:pb-20 lg:pt-8">
      <BackLink href="/dashboard" testid="list-back">{t("nav.home")}</BackLink>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="display-3 min-w-0 text-[24px] text-fg [overflow-wrap:anywhere] lg:text-[28px]" data-testid="list-title">{title}</h1>
        <p className="num text-[15px] text-mute" data-testid="list-count">{t("list.n", { n: String(shown.length) })}</p>
        <div className="relative ml-auto w-full min-w-0 sm:w-[280px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
          <input
            ref={searchRef} type="text" inputMode="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && q) { e.stopPropagation(); setQ(""); } }}
            aria-label={t("dash.search")} placeholder={t("dash.search")} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="input !h-11 !pl-[42px] !pr-11 placeholder:!text-mute"
          />
          {q && (
            <button type="button" aria-label={t("dash.clear")} onClick={() => { setQ(""); searchRef.current?.focus(); }} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-mute transition-colors hover:text-ice">
              <Cross />
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
          <NoMatchArt />
          <p className="mt-5 text-[16px] font-medium text-fg">{t(needle ? "dash.noMatch" : "list.empty")}</p>
          {needle
            ? <button type="button" className="btn-quiet mt-1" onClick={() => { setQ(""); searchRef.current?.focus(); }}>{t("dash.showAll")}</button>
            : <Link href="/dashboard" className="btn-quiet mt-1">{t("nav.home")}</Link>}
        </div>
      ) : (
        <div className="sheet mt-5 overflow-hidden rounded-[4px] border border-hair bg-panel" data-testid="case-table">
          <div aria-hidden="true" className={`hidden border-b border-hair bg-panel2 px-6 py-3 text-[13px] font-semibold leading-none text-mute ${COLS}`}>
            <span>{t("list.col.plate")}</span><span>{t("list.col.car")}</span><span>{t("list.col.insurer")}</span><span>{t("list.col.when")}</span><span>{t("list.col.status")}</span><span /><span />
          </div>
          <ul>
            {shown.map((r) => {
              const when = r.createdAt ? whenOf(r.createdAt, lang) : "";
              const plateCls = `num min-w-0 truncate text-left font-mono text-[16px] font-semibold tracking-[0.01em] text-fg underline-offset-4 before:absolute before:inset-0 before:content-[''] hover:underline`;
              const plate = r.plate || <span className="font-sans text-[15px] font-normal text-mute">{r.firstFile || t("dash.noPlate")}</span>;
              return (
                <li key={r.id} className={`relative border-b border-hairsoft px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-panel2 lg:min-h-[56px] lg:px-6 lg:py-2 ${COLS}`} data-bucket={bucketOf(r)}>
                  <div className="flex items-center justify-between gap-4 lg:contents">
                    {/* an open case opens in its line on the Cases page (everything stays on the first page); a closed one has its record page */}
                    <Link href={r.status === "done" ? `/cases/${r.id}` : `/dashboard?open=${encodeURIComponent(r.id)}`} className={plateCls}>{plate}</Link>
                    {/* a phone: the status ends the first line; a wide screen: it is the fifth column */}
                    <span className="flex min-w-0 shrink-0 items-center gap-2 text-[14px] leading-none text-fg max-lg:max-w-[62%] lg:order-5 lg:shrink">{status(r)}</span>
                    <span className="hidden min-w-0 truncate text-[15px] text-fg lg:block">{r.carModel || "–"}</span>
                    <span className="hidden min-w-0 truncate text-[15px] text-fg lg:block">{r.insurer || "–"}</span>
                    <span className="hidden text-[14px] text-mute lg:block" suppressHydrationWarning>{when}</span>
                    <Chevron className="hidden -rotate-90 text-mute lg:order-6 lg:block" />
                    {r.canDelete && (
                      <button type="button" aria-label={t("del.aria", { plate: label(r) || t("dash.noPlate") })} title={t("del.btn")} data-testid="del-open" onClick={() => setAsk(r)}
                        className="relative z-10 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] text-mute transition-colors hover:bg-panel hover:text-fg lg:order-7 lg:mr-0 lg:h-9 lg:w-9">
                        <Bin />
                      </button>
                    )}
                    {/* a case without the button keeps the same room, so the statuses of a phone's rows start at the same place */}
                    {!r.canDelete && <span aria-hidden="true" className="-mr-2 h-11 w-11 shrink-0 lg:hidden" />}
                  </div>
                  <p className="mt-1.5 truncate text-[13.5px] leading-snug text-mute lg:hidden" suppressHydrationWarning>{[r.carModel, r.insurer, when].filter(Boolean).join(" · ")}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ConfirmDelete row={ask && { id: ask.id, plate: label(ask) }} onClose={() => setAsk(null)}
        onGone={(id) => { setGone((g) => new Set([...g, id])); router.refresh(); }} onStale={() => router.refresh()} />
    </div>
  );
}
