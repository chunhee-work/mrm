"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Chevron, Plus, Search, UploadArt } from "./marks";
import { DROPPED_PARAM, HOLD_MS, holdDropped, takeDropped } from "@/lib/dropped-files";
import { useFileDrag } from "./drop-zone";
import { OPEN_BUCKETS, type Bucket } from "./status";
import ProfileCard, { type Cred } from "./profile-card";
import NewCasePick from "./new-case-pick";

export type HomeCounts = Record<Bucket, number>;

const REFRESH_MS = 20_000;

/**
 * The first page after log in (owner 2026-11-22): four things and nothing else. Who is logged in, a search, two buttons,
 * and how many open cases wait for what. A row of the count opens the table of those cases.
 * Nothing is said twice: "Billing" is in the top bar only, and the bar drops its own "New case" on this page.
 */
export default function Home({ name, counts, busy = false, cred: cred0 }: { name: string; counts: HomeCounts; busy?: boolean; cred: Cred }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cred, setCred] = useState<Cred>(cred0);
  useEffect(() => setCred(cred0), [cred0]);
  // a case can be started only with the details filled in; enforced only while saving really works (key set, migration applied)
  const blocked = cred.blocks;
  const open = OPEN_BUCKETS.reduce((n, b) => n + counts[b], 0);

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

  // the rows are the steps of the step bar; "On hold" is a row only when a case is on hold, so the box keeps its shape
  const rows = OPEN_BUCKETS.filter((b) => b !== "hold" || counts.hold > 0).map((b) => ({ b, n: counts[b], hot: (b === "photos" || b === "hold" || b === "docs") && counts[b] > 0 }));

  const total = <span data-testid="home-total">{t("tray.total", { n: String(open) })}</span>;

  // the rows of the count, as lines of a table
  const table = (
    <section aria-labelledby="open-title" className="sheet overflow-hidden rounded-[4px] border border-hair bg-panel" data-testid="home-open">
      <h2 id="open-title" className="border-b border-hair bg-panel2 px-5 py-3.5 text-[15px] font-semibold leading-none text-fg">{t("tray.open")}</h2>
      <ul>
        {rows.map(({ b, n, hot }) => {
          const inner = (
            <>
              <span className={`num w-11 shrink-0 text-right font-mono text-[22px] font-semibold leading-none ${hot ? "text-amber" : n ? "text-fg" : "text-mute"}`}>{n}</span>
              <span className={`min-w-0 flex-1 text-[16px] font-semibold leading-snug ${n ? "text-fg" : "text-mute"}`}>{t(`tray.b.${b}`)}</span>
              {n > 0 && <Chevron className="shrink-0 -rotate-90 text-mute" />}
            </>
          );
          return (
            <li key={b} className="border-b border-hairsoft" data-bucket={b}>
              {n > 0
                ? <Link href={`/dashboard?view=${b}`} className="flex min-h-[56px] items-center gap-4 px-5 py-2 transition-colors duration-150 hover:bg-panel2">{inner}</Link>
                : <div className="flex min-h-[56px] items-center gap-4 px-5 py-2">{inner}</div>}
            </li>
          );
        })}
      </ul>
      {open > 0
        ? <Link href="/dashboard?view=open" className="flex min-h-[56px] items-center gap-4 px-5 py-2 text-[15px] font-semibold text-fg transition-colors duration-150 hover:bg-panel2">{total}</Link>
        : <p className="flex min-h-[56px] items-center px-5 py-2 text-[15px] font-semibold text-fg">{total}</p>}
    </section>
  );

  // the order of the page the adjusters know: welcome and search, the buttons side by side, the count as a table
  return (
    <div className="wrap pb-14 pt-7 lg:pb-20 lg:pt-12">
      <div className={`mx-auto grid items-start gap-8 ${cred.complete ? "max-w-[1100px] lg:grid-cols-[minmax(0,1fr)_320px]" : "max-w-[760px]"}`}>
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
            : <NewCasePick className="btn-primary !gap-2" testId="home-new"><Plus />{t("dash.new")}</NewCasePick>}
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
