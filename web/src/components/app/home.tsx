"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Bin, Chevron, Photo, Plus, Search, Tick, Upload, UploadArt, Working } from "./marks";
import ConfirmDelete from "./confirm-delete";
import NeedCard from "./case-detail";
import { failTr, userFixable } from "@/lib/case-text";
import { DROPPED_PARAM, HOLD_MS, holdDropped, takeDropped } from "@/lib/dropped-files";
import { useFileDrag } from "./drop-zone";
import { bucketOf, OPEN_BUCKETS, type Bucket } from "./status";
import { StepDots, StepHeads } from "./case-steps";
import type { CaseRow } from "./case-table";
import { currentStepOf, DESK_WAITS, systemBusy } from "@/lib/case-steps";
import { whenOf } from "@/lib/fmt-when";
import ProfileCard, { type Cred } from "./profile-card";
import { checking as loginChecking, needsUser } from "@/lib/ext/login-state";
import NewCasePick from "./new-case-pick";

// the photo desk is big: it is loaded only when a line with photos to name is opened
const NamingDesk = dynamic(() => import("@/components/photos/naming-desk"), { ssr: false, loading: () => <p className="px-1 py-6 text-[14px] text-mute">…</p> });

export type HomeCounts = Record<Bucket, number>;

const REFRESH_MS = 20_000;

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// the user's turn first (on hold, then missing documents, then photos to name), then what is being read, then what the worker has; newest first inside
const RANK: Record<Bucket, number> = { hold: 0, docs: 1, photos: 2, active: 3, closed: 4 };
const yourTurn = (r: CaseRow) => r.status === "failed" || r.status === "pending_doc" || bucketOf(r) === "photos";
function sortCases(rows: CaseRow[]) {
  return [...rows].sort((a, b) => (yourTurn(a) ? 0 : 1) - (yourTurn(b) ? 0 : 1) || RANK[bucketOf(a)] - RANK[bucketOf(b)] || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * What one case waits for. "here": the button opens the line and the job is done right there (upload a document, read again,
 * name the photos on the desk shown inside the line). Owner 2026-11-27: "all done in the first page, never jump to others pages".
 * null: nothing for the user to do, the line says why.
 */
type Act = { kind: "here"; say: string; tone: "red" | "amber"; icon: "retry" | "upload" | "photo" | "tick" } | { kind: null; say: string; busy: boolean };
function useAct() {
  const { t } = useT();
  return (r: CaseRow): Act => {
    const b = bucketOf(r);
    if (b === "hold") return userFixable(r.error ?? null)
      ? { kind: "here", say: t("case.replace"), tone: "red", icon: "upload" } // the files were wrong: new files, not a second read
      : { kind: "here", say: t("case.retry"), tone: "red", icon: "retry" };
    if (b === "docs") {
      if (r.status !== "pending_doc") return { kind: null, say: t("list.s.reading"), busy: true };
      const n = (r.pendingDoc ?? "").split("; ").filter((d) => d.trim()).length;
      return { kind: "here", say: n ? t("tray.act.docsN", { n: String(n) }) : t("tray.act.docsAny"), tone: "amber", icon: "upload" };
    }
    if (b === "photos") {
      if (!r.deskTotal || r.deskConfirm) return { kind: "here", say: r.deskTotal ? t("tray.act.photosN", { n: String(r.deskConfirm) }) : t("tray.act.addPhotos"), tone: "amber", icon: "photo" };
      return { kind: "here", say: t("tray.act.press"), tone: "amber", icon: "tick" };
    }
    return { kind: null, say: t(r.status === "checking" ? "list.s.checkingAlone" : "list.s.merimenAlone"), busy: false };
  };
}
// the case is being worked on by the system right now (not waiting for the user): its step breathes

/** The vehicle no. (or the first file's name while the documents are unread), and the car under it. */
function Who({ r }: { r: CaseRow }) {
  const { t } = useT();
  return (
    <div className="min-w-0">
      <p className="num truncate font-mono text-[16px] font-semibold tracking-[0.01em] text-fg" data-testid="home-case">
        {r.plate || <span className="font-sans text-[15px] font-normal text-mute">{r.firstFile || t("dash.noPlate")}</span>}
      </p>
      <p className="mt-0.5 truncate text-[13.5px] leading-snug text-mute">{[r.carModel, r.insurer].filter(Boolean).join(" · ") || " "}</p>
    </div>
  );
}

function ActIcon({ icon }: { icon: "retry" | "upload" | "photo" | "tick" }) {
  if (icon === "upload") return <Upload className="h-4 w-4 shrink-0" />;
  if (icon === "photo") return <Photo className="h-4 w-4 shrink-0" />;
  if (icon === "tick") return <Tick className="h-4 w-4 shrink-0" />;
  return <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#dc2626] text-[11px] font-bold leading-none text-white">!</span>;
}

/**
 * The action of a line, small and to the right. Its look says what it does: red = something went wrong, amber = your turn.
 * Every button opens the line, where the job is done.
 */
function ActButton({ r, onHere }: { r: CaseRow; onHere: () => void }) {
  const a = useAct()(r);
  if (a.kind === null) return <span className="pointer-events-none flex min-w-0 items-center gap-2 text-[14px] text-mute">{a.busy ? <Working className="shrink-0 text-scan" /> : <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-mute" />}<span className="truncate">{a.say}</span></span>;
  const look = a.tone === "red"
    ? "border-[#dc2626]/60 bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2]"
    : "border-amber/70 bg-ambertint text-fg hover:border-amber hover:bg-amber/20";
  const cls = `pointer-events-auto relative z-10 inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold transition-colors duration-150 ${look}`;
  return <button type="button" onClick={onHere} className={cls} data-testid="home-act" data-act="here"><ActIcon icon={a.icon} /><span className="truncate">{a.say}</span></button>;
}

function Empty({ needle, blocked = false }: { needle: string; blocked?: boolean }) {
  const { t } = useT();
  // details missing: no drop and no New case yet, so the line does not point at them
  return <p className="px-5 py-10 text-center text-[15px] text-mute" data-testid="home-empty">{t(needle ? "tray.noMatch" : blocked ? "tray.emptyBlocked" : "tray.empty")}</p>;
}

/** "Try again" right on this page, after one more press that says it can use a credit. */
function RetryHere({ r }: { r: CaseRow }) {
  const { t } = useT();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function again() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/cases/${r.id}/scan`, { method: "POST" });
      if (res.status === 402) { setErr(t("new.noCredits")); return; }
      if (!res.ok && res.status !== 409) throw new Error("retry");
      router.refresh();
    } catch { setErr(t("case.retryFail")); } finally { setBusy(false); setAsk(false); }
  }
  return (
    <div className="rounded-[4px] border border-[#dc2626]/30 bg-[#fef2f2] px-4 py-3">
      <p className="text-[15px] font-semibold text-[#991b1b]">{t("tray.here.failed")}</p>
      <p className="mt-0.5 text-[14px] text-fg/80">{t(failTr(r.error ?? null).key, failTr(r.error ?? null).vars)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!ask
          ? <button type="button" onClick={() => setAsk(true)} className="btn-primary !min-h-[40px] !px-4 text-[14px]" data-testid="home-retry">{t("case.retry")}</button>
          : (
            <>
              <span className="text-[14px] font-medium text-fg" role="status">{t("tray.here.costs")}</span>
              <button type="button" onClick={() => void again()} aria-disabled={busy} className="btn-primary !min-h-[40px] !px-4 text-[14px]" data-testid="home-retry-yes">{busy ? t("tray.here.working") : t("tray.here.yes")}</button>
              <button type="button" onClick={() => setAsk(false)} className="btn-quiet !min-h-[40px] !px-3 text-[14px]">{t("tray.here.no")}</button>
            </>
          )}
      </div>
      {err && <p role="alert" className="field-error mt-2">{err}</p>}
    </div>
  );
}

/** What opens under a line when it is pressed: the job itself when it can be done here, then the facts, then the way into the full case page. */
function More({ r, orgId, onDesk }: { r: CaseRow; orgId: string; onDesk: (on: boolean) => void }) {
  const { t, lang } = useT();
  const router = useRouter();
  const step = currentStepOf(r);
  const a = useAct()(r);
  const [sent, setSent] = useState(false);
  const [ask, setAsk] = useState(false);
  // "Received" stays a moment after the upload (the case has moved on by then), then the card is back to what the case needs
  useEffect(() => { if (!sent) return; const id = window.setTimeout(() => setSent(false), 4000); return () => window.clearTimeout(id); }, [sent]);
  // a document is uploaded right here, with the same picker, limits and progress as the case page (one component, NeedCard)
  // the photo desk, in this line: the job of step 2, and on the way while documents are still missing.
  // Once shown it stays while the line is open: after 完成 the case moves to step 3, and the desk keeps its message and its undo.
  const [deskOpen, setDeskOpen] = useState(bucketOf(r) === "photos");
  // documents being read (or a read that failed): the desk waits, as on the case page
  // keyed on the step, not the row object (a new one comes with every refresh): a desk the user closed stays closed
  const bucket = bucketOf(r);
  useEffect(() => { if (bucket === "photos") setDeskOpen(true); else if (DESK_WAITS.includes(r.status)) setDeskOpen(false); }, [bucket, r.status]);
  // while a line shows the photo desk, a dropped file goes to the desk and does not start a new case (the page-wide drop is off);
  // a line with nothing to drop into leaves the page-wide drop on
  const takesFiles = deskOpen; // the upload of a missing document is a picker only, so a page drop there still starts a new case
  useEffect(() => { if (!takesFiles) return; onDesk(true); return () => onDesk(false); }, [onDesk, takesFiles]);
  const desk = (
    <div className="overflow-hidden rounded-[4px] border border-hair bg-panel" data-testid="home-desk">
      <NamingDesk orgId={orgId} initialId={r.id} embedded onDone={() => router.refresh()}
        tabs={[{ id: r.id, plate: r.plate || t("dash.noPlate"), carModel: r.carModel, done: !!r.photosDone, photos: r.deskTotal ?? 0, at: r.createdAt ?? "", dup: false, edited: 0 }]} />
    </div>
  );
  const job = sent || r.status === "pending_doc" || (r.status === "failed" && userFixable(r.error ?? null))
    ? (
      <>
        <ul className="overflow-hidden rounded-[4px]"><NeedCard row={r} orgId={orgId} sent={sent ? "files" : undefined} onSent={() => setSent(true)} onPhotos={() => setDeskOpen((v) => !v)} /></ul>
        {deskOpen && desk}
      </>
    )
    : r.status === "failed" ? <RetryHere r={r} />
    : deskOpen ? desk
    : null;
  const facts: [string, string][] = [[t("list.col.when"), r.createdAt ? whenOf(r.createdAt, lang) : "–"]];
  if (r.deskTotal) facts.push([t("steps.photos"), t("tray.more.photos", { n: String(r.deskTotal - (r.deskConfirm ?? 0)), total: String(r.deskTotal) })]);
  return (
    <div id={`more-${r.id}`} className="space-y-3 border-t border-hairsoft bg-panel2/60 px-4 pb-4 pt-3 lg:px-5" data-testid="home-more">
      {job}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <dl className="flex flex-wrap gap-x-10 gap-y-2 text-[14px]">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[12.5px] text-mute">{k}</dt><dd className="text-fg" suppressHydrationWarning>{v}</dd></div>)}
        </dl>
        <div className="flex shrink-0 items-center gap-1">
          {/* a case the worker has not taken yet can still be deleted (same pop-up and rules as the case list) */}
          {r.canDelete && (
            <button type="button" onClick={() => setAsk(true)} data-testid="del-open" aria-label={t("del.aria", { plate: r.plate || r.firstFile || t("dash.noPlate") })}
              className="btn-quiet !min-h-[40px] !gap-1.5 !px-3 text-[14px] text-mute hover:text-fg"><Bin />{t("del.btn")}</button>
          )}
          <Link href={`/cases/${r.id}`} className="btn-quiet !min-h-[40px] !px-3 text-[14px]" data-testid="home-open-case">{t("tray.more.open")} →</Link>
        </div>
      </div>
      <ConfirmDelete row={ask ? { id: r.id, plate: r.plate || r.firstFile || "" } : null} onClose={() => setAsk(false)} onGone={() => router.refresh()} onStale={() => router.refresh()} />
      {/* the sentence about what comes next, only when no job is waiting here (the job says it already) */}
      {!job && a.kind === null && <p className="text-[13.5px] text-mute">{t(step === "merimen" && r.status === "checking" ? "case.pp.next.checking" : `steps.next.${step}`)}</p>}
    </div>
  );
}

/** One line per case, the step names once over the step column. A press on the line opens its details right under it. */
function StepTable({ rows: found, all, needle, orgId, total, onDesk, blocked }: { rows: CaseRow[]; all: CaseRow[]; needle: string; orgId: string; total: number; onDesk: (on: boolean) => void; blocked: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  // while a line is open the list keeps its order: a case that moves on (完成 pressed in it) stays where the user is looking
  const [order, setOrder] = useState<string[] | null>(null);
  // a search typed while a line is open keeps that line (and the photo desk in it) on screen
  const kept = open && !found.some((x) => x.id === open) ? all.find((x) => x.id === open) : undefined;
  const rows = kept ? [...found, kept] : found;
  // switching straight to another line keeps the order the user is looking at (built from what is on screen, not a fresh sort)
  const toggle = (id: string | null) => {
    setOpen(id);
    if (!id) { setOrder(null); return; }
    const seen = lines.map((x) => x.id);
    setOrder(order ? [...seen, ...order.filter((o) => !seen.includes(o))] : seen);
  };
  const at = (id: string) => { const i = order ? order.indexOf(id) : -1; return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const lines = order ? [...rows].sort((a, b) => at(a.id) - at(b.id)) : rows;
  // the open case left the list (deleted, or closed elsewhere): back to the normal list
  useEffect(() => { if (open && !all.some((x) => x.id === open)) { setOpen(null); setOrder(null); } }, [open, all]);
  // the list loses its own scroll box while a line is open: bring the opened line to the top of the screen
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(`[data-line="${CSS.escape(open)}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open]);
  // wide screens: vehicle | steps | action | arrow. The step and action tracks give way before the vehicle no. does.
  const COLS = "xl:grid xl:grid-cols-[minmax(150px,1fr)_260px_220px_20px] xl:items-center xl:gap-x-6";
  return (
    <section aria-labelledby="open-title" className="sheet overflow-hidden rounded-[4px] border border-hair bg-panel" data-testid="home-open">
      <div className={`border-b border-hair bg-panel2 px-4 py-3 xl:px-5 ${COLS}`}>
        <h2 id="open-title" className="whitespace-nowrap text-[15px] font-semibold leading-none text-fg">{t("tray.open")} <span className="num ml-1 font-mono text-[13px] font-medium text-mute">{total}</span></h2>
        <StepHeads className="mt-3 pr-8 text-[12px] font-medium text-mute xl:mt-0 xl:pr-0" />
      </div>
      {rows.length === 0 ? <Empty needle={needle} blocked={blocked} /> : (
        <ul className={open ? "" : "max-h-[min(680px,72vh)] overflow-y-auto overscroll-contain"} data-testid="home-list">
          {lines.map((r) => {
            const on = open === r.id;
            return (
              <li key={r.id} className="scroll-mt-20 border-b border-hairsoft last:border-b-0" data-line={r.id} data-bucket={bucketOf(r)} data-open={on || undefined}>
                <div className={`relative px-4 py-3 transition-colors duration-150 hover:bg-panel2 xl:px-5 ${on ? "bg-panel2" : ""} ${COLS}`}>
                  {/* the whole line is one button that opens the details; the action button sits on top of it */}
                  <button
                    type="button" aria-expanded={on} aria-controls={`more-${r.id}`} onClick={() => toggle(on ? null : r.id)}
                    aria-label={`${r.plate || r.firstFile || t("dash.noPlate")}: ${t(on ? "tray.more.hide" : "tray.more.show")}`}
                    className="absolute inset-0 z-0 w-full rounded-none outline-offset-[-2px]" data-testid="home-row"
                  />
                  <div className="pointer-events-none relative flex items-start justify-between gap-3 xl:contents">
                    <Who r={r} />
                    <Chevron className={`mt-1 shrink-0 text-mute transition-transform duration-200 xl:order-4 xl:mt-0 ${on ? "" : "-rotate-90"}`} />
                  </div>
                  <StepDots status={r.status} photos={r.deskTotal ?? 0} photosDone={!!r.photosDone} busy={systemBusy(r)} className="pointer-events-none relative my-3 pr-8 xl:my-0 xl:pr-0" />
                  {/* while the line is open the job is right below it: the button would only say it twice */}
                  <div className="pointer-events-none relative flex xl:justify-end">{!on && <ActButton r={r} onHere={() => toggle(r.id)} />}</div>
                </div>
                {on && <More r={r} orgId={orgId} onDesk={onDesk} />}
              </li>
            );
          })}
        </ul>
      )}
      {total > rows.length && !needle && (
        <Link href="/dashboard?view=open" className="block border-t border-hair px-4 py-3 text-[14px] font-semibold text-fg hover:bg-panel2 xl:px-5">{t("tray.more.all", { n: String(total) })} →</Link>
      )}
    </section>
  );
}

/**
 * The first page after log in (owner 2026-11-22, reworked 2026-11-27): who is logged in, a search, two buttons, and every open case
 * on one line with its own step bar, so nothing has to be opened to see where a case is. A press on a line opens its details and,
 * where it can be done here, the job itself. Nothing is said twice: "Billing" is in the side bar (the phone menu on a phone) only, and the bar drops its own
 * "New case" on this page.
 */
export default function Home({ name, counts, cases, busy = false, cred: cred0, orgId }: { name: string; counts: HomeCounts; cases: CaseRow[]; busy?: boolean; cred: Cred; orgId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cred, setCred] = useState<Cred>(cred0);
  // complete, but the login needs the user (a code from the phone, a wrong password), is still being checked, or is blocked
  const loginNeeds = cred.complete && (needsUser(cred) || loginChecking(cred));
  // once the check comes back fine the card stays a few seconds, so "login works" is seen before it goes.
  // Worked out while rendering (not in an effect), so the card is never gone for a frame in between.
  const [okHold, setOkHold] = useState(false);
  const [wasNeeded, setWasNeeded] = useState(loginNeeds);
  if (wasNeeded !== loginNeeds) {
    setWasNeeded(loginNeeds);
    setOkHold(wasNeeded && !loginNeeds && cred.verifyState === "ok");
  }
  useEffect(() => { if (!okHold) return; const id = window.setTimeout(() => setOkHold(false), 5000); return () => window.clearTimeout(id); }, [okHold]);
  // a new cred0 object comes with every refresh: take it only when the server's value really changed, so a refresh that
  // started before a poll came back cannot put the older state back (and blink the card)
  const credKey = JSON.stringify(cred0);
  const [lastKey, setLastKey] = useState(credKey);
  if (lastKey !== credKey) { setLastKey(credKey); setCred(cred0); }
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
  const [lineOpen, setLineOpen] = useState(false); // a line of the list is open
  const [picking, setPicking] = useState(false); // a file picked from New case is on its way
  const over = useFileDrag(!going && !picking && !blocked && !lineOpen, (files) => { holdDropped(files); setGoing(true); router.push(`/cases/new?${DROPPED_PARAM}=1`); });

  // every open case on this page, each with its own step bar: nothing to open in between (owner 2026-11-27).
  // Typing in the search narrows this list at once; Go searches every case, closed ones too.
  const needle = squash(q);
  const shown = sortCases(cases).filter((r) => !needle || squash(r.plate || r.firstFile || "").includes(needle)); // the plate, or the file name a line shows while it has none
  const table = <StepTable rows={shown} all={cases} needle={needle} orgId={orgId} total={OPEN_BUCKETS.reduce((n, b) => n + counts[b], 0)} onDesk={setLineOpen} blocked={blocked} />;

  // the order of the page the adjusters know: welcome and search, the buttons side by side, then the open cases
  return (
    <div className="wrap pb-14 pt-7 lg:pb-20 lg:pt-12">
      <div className={`mx-auto grid items-start gap-8 ${cred.complete ? "max-w-[1240px]" : "max-w-[760px]"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <h1 className="display-3 text-[22px] text-fg [text-wrap:balance] lg:text-[26px]" data-testid="home-welcome">{t("tray.welcome", { name })}</h1>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto sm:flex-nowrap">
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
        </div>
        {!cred.complete && <div className="mt-8"><ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact={false} /></div>}
        {/* the login needs the user: say it here, not only on the details page */}
        {(loginNeeds || (okHold && cred.complete)) && (
          <div className="mt-8 max-w-[520px]"><ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact /></div>
        )}
        {/* a wide screen has Closed cases in the side bar (side-bar.tsx); New case stays here at every width */}
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:mt-7 lg:flex">
          {blocked
            ? <span role="link" aria-disabled="true" title={t("pf.needFirst")} className="btn-primary !gap-2 cursor-not-allowed opacity-55" data-testid="home-new"><Plus />{t("dash.new")}</span>
            : <NewCasePick className="btn-primary !gap-2 lg:!px-8" testId="home-new" onOpening={setPicking} held={going}><Plus />{t("dash.new")}</NewCasePick>}
          <Link href="/dashboard?view=closed" className="btn-line lg:hidden" data-testid="home-closed">
            {t("tray.closed")}
            <span className="num font-mono text-[13px] font-medium opacity-60">{counts.closed}</span>
          </Link>
        </div>
        {blocked && <p className="mt-3 text-[14.5px] text-mute" data-testid="pf-need">{t("pf.needFirst")}</p>}
        {/* a complete profile has its own page (/details), linked from the side bar and the phone menu */}
        <div className="mt-9 lg:mt-6">{table}</div>
      </div>
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
