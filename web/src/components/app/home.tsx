"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Chevron, Plus, Search, UploadArt, Working } from "./marks";
import { DROPPED_PARAM, HOLD_MS, holdDropped, takeDropped } from "@/lib/dropped-files";
import { useFileDrag } from "./drop-zone";
import { bucketOf, type Bucket } from "./status";
import { StepDots, StepHeads } from "./case-steps";
import type { CaseRow } from "./case-table";
import { currentStepOf } from "@/lib/case-steps";
import { whenOf } from "@/lib/fmt-when";
import ProfileCard, { type Cred } from "./profile-card";

export type HomeCounts = Record<Bucket, number>;

const REFRESH_MS = 20_000;

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// the user's turn first (on hold, missing documents, photos to name), then what is being read, then what the worker has; newest first inside
const RANK: Record<Bucket, number> = { hold: 0, photos: 1, docs: 2, active: 3, closed: 4 };
const yourTurn = (r: CaseRow) => r.status === "failed" || r.status === "pending_doc" || bucketOf(r) === "photos";
function sortCases(rows: CaseRow[]) {
  return [...rows].sort((a, b) => (yourTurn(a) ? 0 : 1) - (yourTurn(b) ? 0 : 1) || RANK[bucketOf(a)] - RANK[bucketOf(b)] || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** What one case waits for, and the one button that does it (null: nothing for the user to do, the line says why). */
function useNext() {
  const { t } = useT();
  return (r: CaseRow): { href: string | null; say: string; hot: boolean; busy?: boolean } => {
    const b = bucketOf(r);
    if (b === "hold") return { href: `/cases/${r.id}`, say: t("tray.act.hold"), hot: true };
    if (b === "docs") {
      if (r.status !== "pending_doc") return { href: null, say: t("list.s.reading"), hot: false, busy: true };
      const n = (r.pendingDoc ?? "").split("; ").filter((d) => d.trim()).length;
      return { href: `/cases/${r.id}`, say: n ? t("tray.act.docsN", { n: String(n) }) : t("tray.act.docsAny"), hot: true };
    }
    if (b === "photos") {
      if (!r.deskTotal) return { href: `/cases/${r.id}`, say: t("tray.act.addPhotos"), hot: true };
      return { href: `/cases/${r.id}/photos`, say: r.deskConfirm ? t("tray.act.photosN", { n: String(r.deskConfirm) }) : t("tray.act.press"), hot: true };
    }
    return { href: null, say: t(r.status === "checking" ? "list.s.checkingAlone" : "list.s.merimenAlone"), hot: false };
  };
}

/** The vehicle no. (or the first file's name while the documents are unread), and the car under it. */
function Who({ r }: { r: CaseRow }) {
  const { t } = useT();
  return (
    <div className="min-w-0">
      <p className="num truncate font-mono text-[16px] font-semibold tracking-[0.01em] text-fg" data-testid="home-case">
        {r.plate || <span className="font-sans text-[15px] font-normal text-mute">{r.firstFile || t("dash.noPlate")}</span>}
      </p>
      <p className="mt-0.5 truncate text-[13.5px] leading-snug text-mute">{[r.carModel, r.insurer].filter(Boolean).join(" · ") || "\u00a0"}</p>
    </div>
  );
}

const WORKING = ["uploaded", "reading", "phase_a", "phase_b", "checking"];

/** What opens under a line when it is pressed: the facts of the case, what happens next, and the way into the full case page. */
function More({ r }: { r: CaseRow }) {
  const { t, lang } = useT();
  const step = currentStepOf(r);
  const act = useNext()(r).href; // the line has a button for the job: the "next" sentence would only repeat it
  const missing = r.status === "pending_doc" ? (r.pendingDoc ?? "").split("; ").map((d) => d.trim()).filter(Boolean) : [];
  // only what the line does not already say (the car and insurer are on the line itself)
  const facts: [string, string][] = [[t("list.col.when"), r.createdAt ? whenOf(r.createdAt, lang) : "–"]];
  if (r.deskTotal) facts.push([t("steps.photos"), t("tray.more.photos", { n: String(r.deskTotal - (r.deskConfirm ?? 0)), total: String(r.deskTotal) })]);
  return (
    <div id={`more-${r.id}`} className="border-t border-hairsoft bg-panel2/60 px-4 pb-4 pt-3 lg:px-5" data-testid="home-more">
      <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[12.5px] text-mute">{k}</dt><dd className="truncate text-fg" suppressHydrationWarning>{v}</dd></div>)}
      </dl>
      {missing.length > 0 && (
        <div className="mt-3 text-[14px]">
          <p className="text-[12.5px] text-mute">{t("tray.more.missing")}</p>
          <ul className="mt-1 list-disc pl-5 text-fg">{missing.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[13.5px] text-mute">{act ? "" : t(r.status === "failed" ? "steps.next.failed" : step === "merimen" && r.status === "checking" ? "case.pp.next.checking" : `steps.next.${step}`)}</p>
        <Link href={`/cases/${r.id}`} className="btn-line !min-h-[40px] shrink-0 !px-4 text-[14px]" data-testid="home-open-case">{t("tray.more.open")}</Link>
      </div>
    </div>
  );
}

/** The action of a case: an amber button when it is the user's turn, a quiet line when it is not. */
function Next({ r, full = false }: { r: CaseRow; full?: boolean }) {
  const n = useNext()(r);
  if (!n.href) return <span className="pointer-events-none flex min-w-0 items-center gap-2 text-[14px] text-mute">{n.busy ? <Working className="shrink-0 text-scan" /> : <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-mute" />}<span className="truncate">{n.say}</span></span>;
  return (
    <Link href={n.href} className={`relative z-10 inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-[4px] border border-amber bg-ambertint px-3.5 text-[14.5px] font-semibold text-fg transition-colors duration-150 hover:bg-amber hover:text-bay ${full ? "w-full" : ""}`} data-testid="home-act">
      <span className="truncate">{n.say}</span><Chevron className="shrink-0 -rotate-90" />
    </Link>
  );
}

function Empty({ needle }: { needle: string }) {
  const { t } = useT();
  return <p className="px-5 py-10 text-center text-[15px] text-mute" data-testid="home-empty">{t(needle ? "tray.noMatch" : "tray.empty")}</p>;
}

/** One line per case, the step names once over the step column. A press on the line opens its details right under it. */
function StepTable({ rows, needle }: { rows: CaseRow[]; needle: string }) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_300px_236px_20px] lg:items-center lg:gap-x-6";
  return (
    <section aria-labelledby="open-title" className="sheet overflow-hidden rounded-[4px] border border-hair bg-panel" data-testid="home-open">
      <div className={`border-b border-hair bg-panel2 px-4 py-3 lg:px-5 ${COLS}`}>
        <h2 id="open-title" className="whitespace-nowrap text-[15px] font-semibold leading-none text-fg">{t("tray.open")} <span className="num ml-1 font-mono text-[13px] font-medium text-mute">{rows.length}</span></h2>
        <StepHeads className="mt-3 pr-8 text-[12px] font-medium text-mute lg:mt-0 lg:pr-0" />
      </div>
      {rows.length === 0 ? <Empty needle={needle} /> : (
        <ul className="max-h-[min(680px,72vh)] overflow-y-auto overscroll-contain" data-testid="home-list">
          {rows.map((r) => {
            const on = open === r.id;
            return (
              <li key={r.id} className="border-b border-hairsoft last:border-b-0" data-bucket={bucketOf(r)} data-open={on || undefined}>
                <div className={`relative px-4 py-3 transition-colors duration-150 hover:bg-panel2 lg:px-5 ${on ? "bg-panel2" : ""} ${COLS}`}>
                  {/* the whole line is one button that opens the details; the action button sits on top of it */}
                  <button
                    type="button" aria-expanded={on} aria-controls={`more-${r.id}`} onClick={() => setOpen(on ? null : r.id)}
                    aria-label={`${r.plate || r.firstFile || t("dash.noPlate")}: ${t(on ? "tray.more.hide" : "tray.more.show")}`}
                    className="absolute inset-0 z-0 w-full rounded-none outline-offset-[-2px]" data-testid="home-row"
                  />
                  <div className="pointer-events-none relative flex items-start justify-between gap-3 lg:contents">
                    <Who r={r} />
                    <Chevron aria-hidden="true" className={`mt-1 shrink-0 text-mute transition-transform duration-200 lg:order-4 lg:mt-0 ${on ? "" : "-rotate-90"}`} />
                  </div>
                  <StepDots status={r.status} photos={r.deskTotal ?? 0} photosDone={!!r.photosDone} busy={WORKING.includes(r.status)} className="pointer-events-none relative my-3 pr-8 lg:my-0 lg:pr-0" />
                  <div className="relative flex lg:justify-end"><Next r={r} full /></div>
                </div>
                {on && <More r={r} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The first page after log in (owner 2026-11-22): four things and nothing else. Who is logged in, a search, two buttons,
 * and how many open cases wait for what. A row of the count opens the table of those cases.
 * Nothing is said twice: "Billing" is in the top bar only, and the bar drops its own "New case" on this page.
 */
export default function Home({ name, counts, cases, busy = false, cred: cred0 }: { name: string; counts: HomeCounts; cases: CaseRow[]; busy?: boolean; cred: Cred }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cred, setCred] = useState<Cred>(cred0);
  useEffect(() => setCred(cred0), [cred0]);
  // a case can be started only with the details filled in; enforced only while saving really works (key set, migration applied)
  const blocked = cred.blocks;

  // while something is being worked on the numbers move by themselves: read them again every 20 s (not in a hidden tab)
  const live = busy; // something is being read or worked on by the worker: the numbers move by themselves (a case waiting for the user does not)
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { if (!document.hidden) router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  // files dragged anywhere onto the page start a new case: they wait in memory and the new-case page picks them up
  // after the drop the overlay stays until the new-case page replaces this one, so the wait is not a blank moment
  const [going, setGoing] = useState(false);
  // files held by a drop whose trip to the new-case page was cut short are let go when this page shows again
  useEffect(() => { takeDropped(); }, []);
  // if the trip never ends (navigation stalled), the overlay goes when the hold runs out and drops work again
  useEffect(() => { if (!going) return; const id = window.setTimeout(() => setGoing(false), HOLD_MS); return () => window.clearTimeout(id); }, [going]);
  const over = useFileDrag(!going && !blocked, (files) => { holdDropped(files); setGoing(true); router.push(`/cases/new?${DROPPED_PARAM}=1`); });

  // every open case on this page, each with its own step bar: nothing to open in between (owner 2026-11-27).
  // Typing in the search narrows this list at once; Go searches every case, closed ones too.
  const needle = squash(q);
  const shown = sortCases(cases).filter((r) => !needle || squash(r.plate ?? "").includes(needle) || squash(r.firstFile ?? "").includes(needle));
  const table = <StepTable rows={shown} needle={needle} />;

  // the order of the page the adjusters know: welcome and search, the buttons side by side, the count as a table
  return (
    <div className="wrap pb-14 pt-7 lg:pb-20 lg:pt-12">
      <div className={`mx-auto grid items-start gap-8 ${cred.complete ? "max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_300px]" : "max-w-[760px]"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <h1 className="display-3 text-[22px] text-fg [text-wrap:balance] lg:text-[26px]" data-testid="home-welcome">{t("tray.welcome", { name })}</h1>
          <form
            role="search" className="flex w-full min-w-0 gap-2 sm:w-[320px]" data-testid="home-search"
            onSubmit={(e) => { e.preventDefault(); const v = q.trim(); router.push(v ? `/dashboard?q=${encodeURIComponent(v)}` : "/dashboard?view=all"); }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
              <input
                type="text" inputMode="search" enterKeyHint="search" name="q" value={q} onChange={(e) => setQ(e.target.value)}
                aria-label={t("dash.search")} placeholder={t("dash.search")} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                className="input !pl-[42px] placeholder:!text-mute"
              />
            </div>
            <button type="submit" className="btn-line shrink-0 !px-5">{t("tray.go")}</button>
          </form>
        </div>
        {!cred.complete && <div className="mt-8"><ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact={false} /></div>}
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          {blocked
            ? <span role="link" aria-disabled="true" title={t("pf.needFirst")} className="btn-primary !gap-2 cursor-not-allowed opacity-55" data-testid="home-new"><Plus />{t("dash.new")}</span>
            : <Link href="/cases/new" className="btn-primary !gap-2" data-testid="home-new"><Plus />{t("dash.new")}</Link>}
          <Link href="/dashboard?view=closed" className="btn-line" data-testid="home-closed">
            {t("tray.closed")}
            <span className="num font-mono text-[13px] font-medium opacity-60">{counts.closed}</span>
          </Link>
        </div>
        {blocked && <p className="mt-3 text-[14.5px] text-mute" data-testid="pf-need">{t("pf.needFirst")}</p>}
        <div className="mt-9">{table}</div>
      </div>
      {cred.complete && <aside className="min-w-0 lg:pt-[3.75rem]"><ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact /></aside>}
      </div>
      {(over || going) && (
        <div aria-hidden="true" data-testid="home-overlay" className="pointer-events-none fixed inset-0 z-50 bg-panel/90 p-4 backdrop-blur-[2px]">
          <div className="app-dash flex h-full flex-col items-center justify-center gap-4 bg-icetint text-center" data-over="true">
            <span className="text-ice"><UploadArt size={72} lift /></span>
            <p className="display-3 px-6 text-[22px] text-fg">{t("tray.drop")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
