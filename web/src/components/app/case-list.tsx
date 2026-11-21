"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Cross, EmptySheetArt, NoMatchArt, Plus, Search, Tick } from "./marks";
import ScanEdge from "@/components/scan-edge";
import { groupOf, StateMark } from "./status";
import NeedCard, { type Sent } from "./case-detail";
import { CarSides, money, SideChips } from "./done-result";
import type { Side } from "@/lib/damage-sides";

export type CaseRow = {
  id: string;
  plate: string; // empty until the documents have been read
  carModel: string | null;
  insurer: string | null;
  status: string;
  pendingDoc: string | null;
  totalRm: string | null; // total of the finished case, null until known
  sides?: Side[]; // sides of the car that were hit; undefined = not known (not loaded), [] = none found
};

const REFRESH_MS = 20_000;
const HOLD_MS = 5_000; // how long a card stays after its upload went through, saying so

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * The case list (owner 2026-11-15: "user just need to know it done or not, and if missing thing, then is what").
 * On top, one card for each case that needs the user, saying what and with the button that does it.
 * Under it every other case on one line: being worked on, or done. Nothing opens; there are no steps.
 */
export default function CaseList({ rows, orgId, below }: { rows: CaseRow[]; orgId: string; below?: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [held, setHeld] = useState<Record<string, Sent>>({}); // cards that have just sent something: kept on top for a moment
  const timers = useRef<number[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Live: while anything is still being worked on, re-read the list every 20 s (not in a hidden tab).
  const live = rows.some((r) => groupOf(r.status) === "active");
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => { if (!document.hidden) router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  function onSent(id: string, what: Sent) {
    setHeld((h) => ({ ...h, [id]: what }));
    timers.current.push(window.setTimeout(() => setHeld(({ [id]: _gone, ...rest }) => rest), HOLD_MS));
  }

  const needle = squash(q);
  const shown = rows.filter((r) => !needle || squash(r.plate ?? "").includes(needle));
  const onTop = (r: CaseRow) => groupOf(r.status) === "needs" || r.id in held;
  const cards = shown.filter(onTop);
  const waiting = cards.filter((r) => groupOf(r.status) === "needs").length;
  // the quiet list: what is being worked on first, then what is finished (newest first inside each)
  const rest = shown.filter((r) => !onTop(r));
  const active = rest.filter((r) => r.status !== "done");
  const done = rest.filter((r) => r.status === "done");
  const summary = [active.length && t("dash.sumActive", { n: String(active.length) }), done.length && t("dash.sumDone", { n: String(done.length) })].filter(Boolean).join(" · ");

  return (
    <div className="wrap pb-14 pt-6 lg:pb-20 lg:pt-9">
      <div className="flex min-h-11 items-center gap-x-5">
        <h1 className="display-2 text-[30px] text-fg lg:text-[36px]">{t("dash.title")}</h1>
        {rows.length > 0 && (
          <div className="relative ml-auto min-w-0 flex-1 lg:w-[280px] lg:flex-none">
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
        )}
      </div>

      {rows.length === 0 ? (
        <div className="relative mt-5 lg:mt-7">
          <ScanEdge />
          <div className="sheet flex min-h-[420px] flex-col items-center justify-center rounded-[3px] border border-hair bg-panel px-6 py-12 text-center">
            <EmptySheetArt />
            <h2 className="display-3 mt-7 text-[22px] text-fg">{t("dash.emptyTitle")}</h2>
            <p className="mt-2 text-[15px] text-mute">{t("dash.empty")}</p>
            <Link href="/cases/new" className="btn-primary mt-7 !gap-2 !pl-5">
              <Plus />
              {t("dash.new")}
            </Link>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-5 flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center lg:mt-7">
          <NoMatchArt />
          <p className="mt-5 text-[16px] font-medium text-fg">{t("dash.noMatch")}</p>
          <button type="button" className="btn-quiet mt-1" onClick={() => { setQ(""); searchRef.current?.focus(); }}>
            {t("dash.showAll")}
          </button>
        </div>
      ) : (
        <>
          {cards.length > 0 ? (
            <section aria-labelledby="needs-title" className="mt-7 lg:mt-9">
              <h2 id="needs-title" className="flex items-center gap-2.5 text-[16px] font-semibold leading-none text-fg">
                {waiting > 0 ? <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-amber" /> : <Tick className="h-4 w-4 shrink-0 text-go" />}
                {waiting === 0 ? t("dash.needsNone") : waiting === 1 ? t("dash.needsOne") : t("dash.needsMany", { n: String(waiting) })}
              </h2>
              <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
                {cards.map((r) => (
                  <NeedCard key={r.id} row={r} orgId={orgId} sent={held[r.id]} onSent={onSent} />
                ))}
              </ul>
            </section>
          ) : (
            // nothing is waiting for the user: one quiet line says so (not while searching, when it would only be true of what is shown)
            !needle && (
              <p className="mt-7 flex items-center gap-2.5 text-[15px] leading-none text-mute lg:mt-9">
                <Tick className="h-4 w-4 shrink-0 text-go" />
                {t("dash.needsNone")}
              </p>
            )
          )}

          {rest.length > 0 && (
            <section aria-labelledby="rest-title" className={cards.length > 0 ? "mt-10 lg:mt-12" : "mt-5 lg:mt-6"}>
              <h2 id="rest-title" className="text-[15px] leading-none text-mute">{summary}</h2>
              <div className="relative mt-4">
                <ScanEdge />
                <ul className="sheet overflow-hidden rounded-[3px] border border-hair bg-panel">
                  {active.map((r) => {
                    const isDone = r.status === "done";
                    const vehicle = [r.carModel, r.insurer].filter(Boolean).join(" · ");
                    return (
                      <li key={r.id} className={`relative flex items-center gap-4 border-b border-hairsoft px-4 transition-colors duration-150 last:border-b-0 hover:bg-bay/70 lg:px-6 min-h-[64px] py-2.5 lg:min-h-[56px] lg:py-2`}>
                        {/* phones: the vehicle under its number; from lg the two sit side by side, on two columns */}
                        <div className="min-w-0 flex-1 lg:flex lg:items-baseline lg:gap-6">
                          <span className="num block truncate font-mono text-[15.5px] font-medium leading-snug tracking-[0.01em] text-fg lg:w-[168px] lg:shrink-0">
                            <Link href={`/cases/${r.id}`} className="underline-offset-4 before:absolute before:inset-0 before:content-[''] hover:underline">
                              {r.plate || <span className="font-sans text-[15px] font-normal text-mute">{t("dash.noPlate")}</span>}
                            </Link>
                          </span>
                          {vehicle && <span className="mt-1 block truncate text-[14px] leading-snug text-mute lg:mt-0 lg:min-w-0 lg:flex-1 lg:text-[15px]">{vehicle}</span>}
                        </div>
                        <StateMark done={isDone} label={t(isDone ? "dash.done" : "dash.active")} />
                      </li>
                    );
                  })}
                </ul>
                {done.length > 0 && (
                  <ul className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5 ${active.length ? "mt-6" : ""}`}>
                    {done.map((r) => (
                      <li key={r.id} className="sheet relative flex min-w-0 items-center gap-4 rounded-[3px] border border-hair bg-panel p-4 hover:bg-bay/70 lg:p-5">
                        <CarSides sides={r.sides ?? []} className="h-[104px] w-[52px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/cases/${r.id}`} className="num block truncate font-mono text-[18px] font-medium leading-tight text-fg before:absolute before:inset-0 before:content-[''] hover:underline">{r.plate || t("dash.noPlate")}</Link>
                          <p className="mt-0.5 truncate text-[13.5px] text-mute">{[r.carModel, r.insurer].filter(Boolean).join(" · ")}</p>
                          <p className="num mt-2 font-mono text-[20px] font-medium leading-none text-fg">{money(r.totalRm) ?? "–"}</p>
                          <div className="mt-2.5">{r.sides && <SideChips sides={r.sides} small />}</div>
                        </div>
                        <Tick className="h-4 w-4 shrink-0 self-start text-go" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {below && <div className="mt-8 lg:mt-10">{below}</div>}
    </div>
  );
}
