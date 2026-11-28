"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { Bin, Chevron, Photo, Plus, Search, Tick, Upload, UploadArt, Working } from "./marks";
import ConfirmDelete from "./confirm-delete";
import NeedCard from "./case-detail";
import { failTr, userFixable } from "@/lib/case-text";
import { DROPPED_PARAM, takeDropped } from "@/lib/dropped-files";
import { keepOrder } from "@/app/dashboard/line-order";
import { LOOK_MS, readAgain } from "@/app/cases/[id]/read-again";
import { useFileDrag } from "./drop-zone";
import { bucketOf, OPEN_BUCKETS, type Bucket } from "./status";
import { StepDots, StepHeads } from "./case-steps";
import type { CaseRow } from "./case-table";
import { DESK_WAITS, systemBusy } from "@/lib/case-steps";
import ProfileCard, { useServerCred, type Cred } from "./profile-card";
import NewCasePick from "./new-case-pick";
import NewCaseForm from "@/app/cases/new/form";
import { WorkshopChoice, type WorkshopOpt, type WorkshopState } from "./workshop-picker";
import CaseLog from "./case-log";
import CaseFiles from "./case-files";
import LoginAlert from "./login-alert";

// the photo desk is big: it is loaded only when a line with photos to name is opened
const NamingDesk = dynamic(() => import("@/components/photos/naming-desk"), { ssr: false, loading: () => <p className="px-1 py-6 text-[14px] text-mute">…</p> });

export type HomeCounts = Record<Bucket, number>;

const REFRESH_MS = 20_000;

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// the user's turn first (on hold, then missing documents, then photos to name), then what is being read, then what the worker has; newest first inside
const RANK: Record<Bucket, number> = { hold: 0, docs: 1, photos: 2, active: 3, closed: 4 };
/** a case the worker holds back until the user confirms its workshop (photos already named, so the line would say "with the worker") */
const wsTurn = (r: CaseRow) => !!r.wsAsk && bucketOf(r) === "active";
const yourTurn = (r: CaseRow) => r.status === "failed" || r.status === "pending_doc" || bucketOf(r) === "photos" || wsTurn(r); // the same cases whose line shows the Confirm button
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
    // the workshop first: Phase A (made in Merimen while the photos are named) waits for this Confirm (owner 2026-11-29)
    if (r.wsAsk && (b === "photos" || b === "active")) return { kind: "here", say: t("tray.act.ws"), tone: "amber", icon: "tick" };
    if (b === "photos") {
      if (!r.deskTotal || r.deskConfirm) return { kind: "here", say: r.deskTotal ? t("tray.act.photosN", { n: String(r.deskConfirm) }) : t("tray.act.addPhotos"), tone: "amber", icon: "photo" };
      return { kind: "here", say: t("tray.act.press"), tone: "amber", icon: "tick" };
    }
    return { kind: null, say: t(r.status === "checking" ? "list.s.checkingAlone" : "list.s.merimenAlone"), busy: false };
  };
}
// the case is being worked on by the system right now (not waiting for the user): its step breathes

/** What every line shows of the account, the same for each case: who handles it in Merimen and the workshops. */
export type Team = { adjuster: string | null; manager: string | null; workshops: { slot: number; name: string }[] };

/** The workshop a case goes to: the name the worker fixed once it is in Merimen, else the name its slot has now. */
const repairerOf = (r: CaseRow, team: Team) => r.wsName || team.workshops.find((w) => w.slot === (r.wsSlot ?? 1))?.name || null;

/**
 * The vehicle no. (or the first file's name while the documents are unread) and, as in Merimen's case list (owner 2026-11-29),
 * the other car's plate in [brackets] beside it, then adjuster, manager, insurer and repairer. No file reference and no person's
 * name: only what tells the cases apart at a glance. Anything not known yet is left out, never a dash.
 */
function Who({ r, team }: { r: CaseRow; team: Team }) {
  const { t } = useT();
  const plate = (
    <p className="num truncate font-mono text-[16px] font-semibold tracking-[0.01em] text-fg" data-testid="home-case">
      {r.plate || <span className="font-sans text-[15px] font-normal text-mute">{r.firstFile || t("dash.noPlate")}</span>}
    </p>
  );
  const tp = r.tpPlate ? <span className="num font-mono text-[14px] font-medium text-mute" data-testid="home-tp">[{r.tpPlate}]</span> : null;
  const insurer = r.tpInsurer ?? null; // the claimant's own insurer is not the one Merimen lists: left out until the at-fault one is read
  const repairer = repairerOf(r, team);
  // Merimen's columns, labelled, in Merimen's order
  const cells: [string, string | null][] = [["adjuster", team.adjuster], ["manager", team.manager], ["insurer", insurer], ["repairer", repairer]];
  const have = cells.filter(([, v]) => v) as [string, string][];
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-2">{plate}{tp}</div>
      {have.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px] leading-snug" data-testid="home-who">
          {have.map(([k, v]) => <div key={k} className="contents"><dt className="text-mute">{t(`row.${k}`)}</dt><dd className="truncate text-fg" title={v}>{v}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

function ActIcon({ icon, white = false }: { icon: "retry" | "upload" | "photo" | "tick"; white?: boolean }) {
  if (icon === "upload") return <Upload className="h-4 w-4 shrink-0" />;
  if (icon === "photo") return <Photo className="h-4 w-4 shrink-0" />;
  if (icon === "tick") return <Tick className="h-4 w-4 shrink-0" />;
  return <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none ${white ? "bg-white text-[#b91c1c]" : "bg-[#dc2626] text-white"}`}>!</span>;
}

/**
 * The action of a line, small and to the right. Its look says what it does: red = something went wrong, amber = your turn.
 * Every button opens the line, where the job is done.
 */
function ActButton({ r, onHere }: { r: CaseRow; onHere: () => void }) {
  const a = useAct()(r);
  if (a.kind === null) return <span className="pointer-events-none flex min-w-0 items-center gap-2 text-[14px] text-mute">{a.busy ? <Working className="shrink-0 text-scan" /> : <span aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded-full bg-mute" />}<span className="truncate">{a.say}</span></span>;
  // owner 2026-11-28: "CTA button more bigger and more like CTA button ... the whole middle": a solid button across the line
  const look = a.tone === "red"
    ? "bg-[#b91c1c] text-white shadow-[0_6px_16px_-6px_rgba(185,28,28,0.55)] hover:bg-[#991b1b]"
    : "bg-[#b45309] text-white shadow-[0_6px_16px_-6px_rgba(180,83,9,0.55)] hover:bg-[#92400e]";
  const cls = `pointer-events-auto relative z-10 inline-flex h-12 w-full min-w-0 items-center justify-center gap-2.5 rounded-[6px] px-5 text-[16px] font-semibold transition-[background-color,transform] duration-150 active:translate-y-px ${look}`;
  return <button type="button" onClick={onHere} className={cls} data-testid="home-act" data-act="here"><ActIcon icon={a.icon} white /><span className="truncate">{a.say}</span><span aria-hidden="true" className="ml-0.5 shrink-0 text-[18px] leading-none">→</span></button>;
}

function Empty({ needle, blocked = false }: { needle: string; blocked?: boolean }) {
  const { t } = useT();
  // details missing: no drop and no New case yet, so the line does not point at them
  return <p className="px-5 py-10 text-center text-[15px] text-mute" data-testid="home-empty">{t(needle ? "tray.noMatch" : blocked ? "tray.emptyBlocked" : "tray.empty")}</p>;
}

/**
 * "Try again" right on this page, after one more press that says it can use a credit.
 * The server answers only when the read is over, which can take minutes. So the button does not wait for the answer to show
 * what is going on: while the answer is out the list is read every few seconds (`look`), and as soon as the server has
 * started the read the line shows it as being read (this card is gone then). When the list could not be read meanwhile
 * (a hidden tab, the upload box open), the server itself is asked what the case is doing before anything is called a
 * failure (readAgain): only a press that never got there brings the line back as it was, with the message.
 */
function RetryHere({ r, look, relist }: { r: CaseRow; look: () => void; relist: () => void }) {
  const { t } = useT();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(look, LOOK_MS);
    return () => window.clearInterval(id);
  }, [busy, look]);
  async function again() {
    if (busy) return;
    setBusy(true); setErr("");
    const out = await readAgain(r.id, { onLate: relist });
    if (out === "no_credits") setErr(t("new.noCredits"));
    else if (out === "too_many") setErr(t("case.readTooMany"));
    else if (out === "fail") setErr(t("case.retryFail")); // the server still has the case as failed: the read never started
    setBusy(false); setAsk(false);
    relist(); // whatever became of the request, the line shows what the server has (a read it did start, the new result)
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
function More({ r, orgId, onDesk, workshops, ctl }: { r: CaseRow; orgId: string; onDesk: (on: boolean) => void; workshops: WorkshopOpt[]; ctl: ListCtl }) {
  const { t } = useT();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [ask, setAsk] = useState(false);
  // "Received" stays a moment after the upload (the case has moved on by then), then the card is back to what the case needs
  useEffect(() => { if (!sent) return; const id = window.setTimeout(() => setSent(false), 4000); return () => window.clearTimeout(id); }, [sent]);
  // a document is uploaded right here, with the same picker, limits and progress as the case page (one component, NeedCard)
  // the photo desk, in this line: the job of step 2, and on the way while documents are still missing.
  // Once shown it stays while the line is open, until 完成: then it closes by itself (owner 2026-11-28) and the line keeps the
  // desk's message, with "See photo names" to open it again (完成 is taken back there with the Finished button). A document still
  // missing (pending_doc): the desk stays, its message is the only one there.
  const [deskOpen, setDeskOpen] = useState(bucketOf(r) === "photos");
  // 完成 pressed in the desk: the desk closes by itself and its message stays here (owner 2026-11-28)
  const [finished, setFinished] = useState("");
  const reopen = useRef<HTMLButtonElement>(null);
  // the press was inside the desk that is gone now: the keyboard carries on from the button that opens it again
  useEffect(() => { if (finished) reopen.current?.focus(); }, [finished]);
  // documents being read (or a read that failed): the desk waits, as on the case page
  // keyed on the step, not the row object (a new one comes with every refresh): a desk the user closed stays closed
  const bucket = bucketOf(r);
  useEffect(() => { if (bucket === "photos") setDeskOpen(true); else if (DESK_WAITS.includes(r.status)) setDeskOpen(false); }, [bucket, r.status]);
  // while a line shows the photo desk, a dropped file goes to the desk and does not start a new case (the page-wide drop is off);
  // a line with nothing to drop into leaves the page-wide drop on
  const takesFiles = deskOpen; // the upload of a missing document is a picker only, so a page drop there still starts a new case
  useEffect(() => { if (!takesFiles) return; onDesk(true); return () => onDesk(false); }, [onDesk, takesFiles]);
  const desk = (
    <div className="overflow-clip rounded-[4px] border border-hair bg-panel" data-testid="home-desk">
      <NamingDesk orgId={orgId} initialId={r.id} embedded onDone={ctl.relist} onFinished={(said, status) => { if (status === "pending_doc") return; setFinished(said); setDeskOpen(false); }}
        tabs={[{ id: r.id, plate: r.plate || t("dash.noPlate"), carModel: r.carModel, done: !!r.photosDone, photos: r.deskTotal ?? 0, at: r.createdAt ?? "", dup: false, edited: 0 }]} />
    </div>
  );
  const job = sent || r.status === "pending_doc" || (r.status === "failed" && userFixable(r.error ?? null))
    ? (
      <>
        <ul className="overflow-hidden rounded-[4px]"><NeedCard row={r} orgId={orgId} sent={sent ? "files" : undefined} onSent={() => setSent(true)} onBusy={ctl.onUpload} onPhotos={() => { if (!DESK_WAITS.includes(r.status)) setDeskOpen((v) => !v); }} /></ul>
        {deskOpen && desk}
      </>
    )
    : r.status === "failed" ? <RetryHere r={r} look={ctl.look} relist={ctl.relist} />
    : deskOpen ? desk
    : null;
  const reading = r.status === "uploaded" || r.status === "reading";
  // past the photo step (or 完成 just pressed, before the list is read again) the names are done
  const named = !!finished || !!r.photosDone || bucket !== "photos";
  return (
    <div id={`more-${r.id}`} className="space-y-4 border-t border-hairsoft bg-panel2/60 px-4 pb-4 pt-3 lg:px-5" data-testid="home-more">
      {/* documents being read: say so here, nothing to press (owner 2026-11-27: everything stays on the first page) */}
      {reading && (
        <div role="status" className="flex items-start gap-3 rounded-[4px] border border-hair bg-panel px-4 py-3" data-testid="home-reading">
          <Working className="mt-[3px] shrink-0 text-scan" />
          <div className="min-w-0"><p className="text-[15px] font-medium text-fg">{t("case.h.reading")}</p><p className="mt-0.5 text-[14px] text-mute">{t("case.reading")}</p></div>
        </div>
      )}
      {job}
      {/* the names stay one press away once the desk is closed: open it again to look them over (owner 2026-11-28) */}
      {!deskOpen && !sent && (r.deskTotal ?? 0) > 0 && !DESK_WAITS.includes(r.status) && r.status !== "pending_doc" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[4px] border border-hair bg-panel px-4 py-3" data-testid="home-names">
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${named ? "bg-go/10 text-go" : "bg-ambertint text-fg"}`}>{named ? <Tick className="h-4 w-4" /> : <Photo className="h-4 w-4" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">{t("tray.names.title")} <span className="num ml-1 font-mono text-[13px] font-medium text-mute">{r.deskTotal}</span></p>
            <p className="mt-0.5 text-[14px] text-mute" data-testid="home-names-say">{finished || t(named ? "tray.names.done" : "tray.names.todo")}</p>
          </div>
          <button ref={reopen} type="button" onClick={() => { setFinished(""); setDeskOpen(true); }} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[6px] border border-fg/25 bg-panel px-4 text-[15px] font-semibold text-fg transition-colors duration-150 hover:border-fg hover:bg-panel2 max-sm:w-full max-sm:justify-center" data-testid="home-names-open">
            <Photo className="h-4 w-4 shrink-0" />{t("tray.names.open")}
          </button>
        </div>
      )}
      <Brief r={r} workshops={workshops} relist={ctl.relist} />
      {r.canDelete && (
        <div className="flex justify-end">
          {/* a case the worker has not taken yet can still be deleted (same pop-up and rules as the case list) */}
          <button type="button" onClick={() => setAsk(true)} data-testid="del-open" aria-label={t("del.aria", { plate: r.plate || r.firstFile || t("dash.noPlate") })}
            className="btn-quiet !min-h-[40px] !gap-1.5 !px-3 text-[14px] text-mute hover:text-fg"><Bin />{t("del.btn")}</button>
        </div>
      )}
      <ConfirmDelete row={ask ? { id: r.id, plate: r.plate || r.firstFile || "" } : null} onClose={() => setAsk(false)} onGone={() => router.refresh()} onStale={() => router.refresh()} />
      {/* always there, so the desk's message is read out when it lands in the "Photo names" card */}
      <p role="status" className="sr-only">{finished}</p>
    </div>
  );
}

/**
 * How an open line reads the list again (all three come from the page, which knows what must not be disturbed):
 * `look` a quiet look, skipped when it could disturb something; `relist` after something changed, it waits for a running
 * upload and asks the server first; `onUpload` tells the page that files are going up in the line.
 */
type ListCtl = { look: () => void; relist: () => void; onUpload: (busy: boolean) => void };

type BriefData = { events: { at: string; message: string }[]; files: { id: number; name: string; size: number }[]; workshop: WorkshopState | null };

/** The rest of what the case page shows, in the open line: the workshop choice, the activity and the files. Read when the
 * line opens and again when its status changes, so it follows the case without the user leaving the first page. */
function Brief({ r, workshops, relist }: { r: CaseRow; workshops: WorkshopOpt[]; relist: () => void }) {
  const { t } = useT();
  const [d, setD] = useState<BriefData | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/cases/${r.id}/brief`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((j: BriefData | null) => { if (live && j) setD(j); }, () => {});
    return () => { live = false; };
  }, [r.id, r.status, r.photosDone, tick]);
  // while the documents are read new activity keeps coming with the same status: read it again every 10 s (visible tab only)
  const reading = r.status === "uploaded" || r.status === "reading";
  useEffect(() => {
    if (!reading) return;
    const id = window.setInterval(() => { if (!document.hidden && navigator.onLine) setTick((n) => n + 1); }, 10_000);
    return () => window.clearInterval(id);
  }, [reading]);
  if (!d) return null;
  const showWs = !!d.workshop?.shown;
  const live = reading;
  const shown = [...d.events].reverse().slice(0, 6);
  if (!showWs && !d.events.length && !d.files.length) return null; // nothing to show: no empty box
  return (
    <div className="space-y-4" data-testid="home-brief">
      {showWs && (
        <WorkshopChoice caseId={r.id} workshops={workshops} state={d.workshop!} onSaved={() => { setTick((n) => n + 1); relist(); }} testid="home-ws" /* the collapsed line stops asking too */ />
      )}
      {(d.events.length > 0 || d.files.length > 0) && (
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {d.events.length > 0 && (
            <section className="min-w-0" data-testid="home-log">
              <h3 className="label mb-3">{t("case.log")}</h3>
              <CaseLog events={shown} live={live} />
            </section>
          )}
          {d.files.length > 0 && (
            <section className="min-w-0"><CaseFiles caseId={r.id} files={d.files} testid="home-files" /></section>
          )}
        </div>
      )}
    </div>
  );
}

/** One line per case, the step names once over the step column. A press on the line opens its details right under it. */
function StepTable({ rows: found, all, needle, orgId, total, onDesk, blocked, workshops, openId, ctl, team }: { team: Team; rows: CaseRow[]; all: CaseRow[]; needle: string; orgId: string; total: number; onDesk: (on: boolean) => void; blocked: boolean; workshops: WorkshopOpt[]; openId?: string; ctl: ListCtl }) {
  const { t } = useT();
  // ?open=<id> (from the case table): that line starts open, so a case is never shown on another page
  const [open, setOpen] = useState<string | null>(openId && all.some((x) => x.id === openId) ? openId : null);
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
  // a case made meanwhile (the upload box above) shows where a fresh page would put it, not under everything else
  const lines = order ? keepOrder(found, order, kept ? [kept] : []) : rows;
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
  const act = useAct();
  const COLS = "xl:grid xl:grid-cols-[minmax(150px,1fr)_260px_220px_20px] xl:items-center xl:gap-x-6";
  return (
    <section aria-labelledby="open-title" className="sheet overflow-clip rounded-[4px] border border-hair bg-panel" data-testid="home-open">
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
                    <Who r={r} team={team} />
                    <Chevron className={`mt-1 shrink-0 text-mute transition-transform duration-200 xl:order-4 xl:mt-0 xl:col-start-4 xl:row-start-1 ${on ? "" : "-rotate-90"}`} />
                  </div>
                  <StepDots status={r.status} photos={r.deskTotal ?? 0} photosDone={!!r.photosDone} busy={systemBusy(r) && !wsTurn(r)} className="pointer-events-none relative my-3 pr-8 xl:my-0 xl:pr-0" />
                  {/* while the line is open the job is right below it: the button would only say it twice.
                      A job for the user: a wide button under the steps (on wide screens across the step and action columns) */}
                  <div className={`pointer-events-none relative flex ${!on && act(r).kind ? "xl:col-span-2 xl:col-start-2 xl:mt-3" : "xl:justify-end"}`}>{!on && <ActButton r={r} onHere={() => toggle(r.id)} />}</div>
                </div>
                {on && <More r={r} orgId={orgId} onDesk={onDesk} workshops={workshops} ctl={ctl} />}
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
export default function Home({ name, counts, cases, busy = false, waiting = false, cred: cred0, orgId, workshops = [], openId }: { name: string; counts: HomeCounts; cases: CaseRow[]; busy?: boolean; waiting?: boolean; cred: Cred; orgId: string; workshops?: WorkshopOpt[]; openId?: string }) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cred, setCred] = useServerCred(cred0);
  // a case can be started only with the details filled in; enforced only while saving really works (key set, migration applied)
  const blocked = cred.blocks;

  // while something is being worked on the numbers move by themselves: read them again every 20 s (not in a hidden tab)
  const [panel, setPanel] = useState<{ key: number; initial: File[] | "lost"; more?: { n: number; files: File[] } } | null>(null);
  const [upBusy, setUpBusy] = useState(false); // the box is uploading: New case and the page drop wait
  const [lineUp, setLineUp] = useState(false); // an open line is uploading files (a missing document, replaced files)
  // not while the upload box is open: a refresh that fails reloads the page and would empty the box.
  // And not while files go up in an open line: the list is left alone until that upload has ended.
  const live = busy && !panel && !lineUp;
  // live: something is being read or worked on by the worker: the numbers move by themselves (a case waiting for the user does not)
  useEffect(() => {
    if (!live) return;
    // not in a hidden tab, and not while offline: a refresh that cannot reach the server makes Next reload the whole page,
    // which would lose typed text and running uploads
    const id = window.setInterval(() => { if (!document.hidden && navigator.onLine) router.refresh(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);
  // a quiet look at the list for an open line (its "Read again" is waiting for the server): under the same rules as the refresh above
  const quiet = useRef(false);
  quiet.current = !!panel || lineUp;
  const look = useCallback(() => { if (!document.hidden && navigator.onLine && !quiet.current) router.refresh(); }, [router]);

  // Cases waiting to be read (a zip of many cars makes many at once) are started a few at a time, each time the server is
  // asked for this page. That must not wait for the user to look at the tab, or for the upload box to close: whenever the page
  // is not reading itself again, a small request asks the server to carry on with the next ones. It changes nothing on screen.
  // `waiting` comes from the server's own count of cases still to be read, not from the lines on this page (the list is cut at 500).
  // It stops for good when the server says nothing is waiting any more (this page can be old in a hidden tab), and when the
  // server refuses it (signed out in another tab: 401, or any answer that is not ours); a new reading of the page starts it again.
  const stopped = useRef(false);
  useEffect(() => { stopped.current = false; }, [cases]);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      if (!navigator.onLine || stopped.current || (live && !document.hidden)) return; // the refresh above does it while it runs
      void fetch("/api/cases/heal", { method: "POST", redirect: "manual" }).then(async (x) => {
        // a redirect (never followed) or a 4xx is a "no": nothing more to ask for. A 5xx or a lost connection is tried again next time.
        if (x.type === "opaqueredirect" || x.redirected || (x.status >= 300 && x.status < 500)) { stopped.current = true; return; }
        if (!x.ok) return;
        const j = (await x.json()) as { waiting?: number };
        if (j.waiting === 0) stopped.current = true;
      }).catch(() => {});
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [waiting, live]);

  // a new case is uploaded right on this page (owner 2026-11-27: "all done in the first page, never jump to others pages"):
  // files picked with New case or dropped anywhere on the page open the upload box above the list, which checks and sends them.
  // `key` gives every new start its own box, so a fresh pick never inherits the list or the message of the last one.
  const [made, setMade] = useState<"one" | "many" | null>(null); // "Case started" for a few seconds once the box is done
  useEffect(() => { if (!made) return; const id = window.setTimeout(() => setMade(null), 6000); return () => window.clearTimeout(id); }, [made]);
  const start = (initial: File[] | "lost") => { setMade(null); setPanel((p) => ({ key: (p?.key ?? 0) + 1, initial })); };
  // a pick while the box is open adds to it (a fresh box would throw away files still waiting there for a press of Upload)
  const pick = (files: File[]) => { if (!panel) return start(files); setPanel((p) => p && { ...p, more: { n: (p.more?.n ?? 0) + 1, files } }); };
  // New case pressed on another page: its files wait in memory for this page (?dropped=1); a plain visit lets any old hold go
  const handOff = useRef(false); // read once (React may run this effect twice; the second run would find the files gone)
  useEffect(() => {
    if (handOff.current) return;
    handOff.current = true;
    const url = new URL(window.location.href);
    const handed = url.searchParams.has(DROPPED_PARAM);
    // the marker comes off with null state, so Next takes the clean address in (its own state would make it ignore the change
    // and write the marker back later). Not router.replace: a new query is a new page to Next and would rebuild this one.
    // A tick later, because on a fresh load Next hooks the history only after this page's effects have run.
    if (handed) { url.searchParams.delete(DROPPED_PARAM); window.setTimeout(() => window.history.replaceState(null, "", url.pathname + url.search), 0); }
    const f = takeDropped();
    if (handed && !blocked) start(f.length ? f : "lost");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the box opens under New case, which can be below the fold (a phone, the details card above): bring it into view
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    boxRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [panel?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [deskShown, setDeskShown] = useState(false); // an open line shows the photo desk (it takes the drops then)
  const gone = useRef(false); // this page is being left: nothing is read again for it
  useEffect(() => { gone.current = false; return () => { gone.current = true; }; }, []);
  const boxShown = !!panel && (!blocked || upBusy); // a box already sending finishes even if the details turn incomplete meanwhile
  useEffect(() => { if (panel && blocked && !upBusy) setPanel(null); }, [panel, blocked, upBusy]);
  // while the box is shown its own drop zone takes the window's drops (added to its list; refused while it uploads)
  const over = useFileDrag(boxShown ? "off" : !blocked && !deskShown, (files) => start(files));
  // a send that ended may have made cases on any path (a split cut short, a lost answer): read the list again
  // Only when online: a refresh that cannot reach the server makes Next reload the whole page, losing the box and its message.
  // navigator.onLine is not enough (Wi-Fi with no internet, a server error): first ask the server something small, and refresh
  // only once it answers; otherwise try again a little later, a few times. A newer call replaces a waiting one.
  // And never while files go up in an open line (`hold`): the list is read once that upload has ended (`owed`).
  const relistTry = useRef(0);
  useEffect(() => () => { relistTry.current = -1; }, []); // gone: stop trying
  const hold = useRef(false);
  const owed = useRef(false);
  const relist = useCallback(() => {
    if (gone.current) return;
    const me = ++relistTry.current;
    const attempt = async (left: number) => {
      if (relistTry.current !== me) return;
      if (hold.current) { owed.current = true; return; }
      const ok = navigator.onLine && await fetch("/api/cases/credit", { cache: "no-store" }).then((r) => r.status < 500, () => false);
      if (relistTry.current !== me) return;
      if (hold.current) { owed.current = true; return; }
      if (ok) return router.refresh();
      if (left > 0) window.setTimeout(() => void attempt(left - 1), 10_000);
    };
    void attempt(5);
  }, [router]);
  useEffect(() => {
    hold.current = lineUp;
    if (!lineUp && owed.current) { owed.current = false; relist(); }
  }, [lineUp, relist]);
  // the photo desk of a line was closed (the line too, or only the desk): names were given in it, so the line's own count
  // ("Name 5 photos") is read again and does not stay at what it was when the page was loaded
  const onDesk = useCallback((on: boolean) => { setDeskShown(on); if (!on) relist(); }, [relist]);
  const ctl = useMemo(() => ({ look, relist, onUpload: setLineUp }), [look, relist]);

  // every open case on this page, each with its own step bar: nothing to open in between (owner 2026-11-27).
  // Typing in the search narrows this list at once; closed cases have their own list (Closed cases).
  const needle = squash(q);
  const shown = sortCases(cases).filter((r) => !needle || squash(r.plate || r.firstFile || "").includes(needle)); // the plate, or the file name a line shows while it has none
  const table = <StepTable rows={shown} all={cases} needle={needle} orgId={orgId} total={OPEN_BUCKETS.reduce((n, b) => n + counts[b], 0)} onDesk={onDesk} blocked={blocked} workshops={workshops} openId={openId} ctl={ctl} team={{ adjuster: cred.adjuster, manager: cred.manager, workshops: cred.workshops }} />;

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
            onSubmit={(e) => e.preventDefault()} // the list filters as the user types; Enter stays on this page (owner 2026-11-27: no Go button, no other page)
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
              <input
                type="text" inputMode="search" enterKeyHint="search" name="q" value={q} onChange={(e) => setQ(e.target.value)}
                aria-label={t("dash.search")} placeholder={t("dash.search")} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                className="input !pl-[42px] placeholder:!text-mute"
              />
            </div>
          </form>
          </div>
        </div>
        {!cred.complete && <div className="mt-8"><ProfileCard cred={cred} setCred={setCred} onSaved={() => router.refresh()} compact={false} /></div>}
        {/* the Merimen login needs the user: one red line here, fixed in place (owner 2026-11-27) */}
        <div className="mt-7 empty:hidden"><LoginAlert cred={cred} setCred={setCred} onSaved={() => router.refresh()} /></div>
        {/* a wide screen has Closed cases in the side bar (side-bar.tsx); New case stays here at every width */}
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:mt-7 lg:flex">
          {blocked
            ? <span role="link" aria-disabled="true" title={t("pf.needFirst")} className="btn-primary !gap-2 cursor-not-allowed opacity-55" data-testid="home-new"><Plus />{t("dash.new")}</span>
            : <NewCasePick className="btn-primary !gap-2 lg:!px-8" testId="home-new" held={upBusy} onPicked={pick}><Plus />{t("dash.new")}</NewCasePick>}
          <Link href="/dashboard?view=closed" className="btn-line lg:hidden" data-testid="home-closed">
            {t("tray.closed")}
            <span className="num font-mono text-[13px] font-medium opacity-60">{counts.closed}</span>
          </Link>
        </div>
        {blocked && <p className="mt-3 text-[14.5px] text-mute" data-testid="pf-need">{t("pf.needFirst")}</p>}
        {panel && boxShown && (
          <div ref={boxRef} className="mt-6 scroll-mt-20 lg:scroll-mt-4">
            <NewCaseForm key={panel.key} orgId={orgId} workshops={workshops}
              embed={{ initial: panel.initial, more: panel.more, dragOff: deskShown, onEnded: relist, onBusy: setUpBusy, onClose: () => setPanel(null), onMade: (id) => { setPanel(null); setMade(id ? "one" : "many"); relist(); } }} />
          </div>
        )}
        {made && <p role="status" className="mt-6 flex items-center gap-2 text-[15px] font-medium text-fg" data-testid="home-made"><Tick className="h-4 w-4 shrink-0 text-ice" />{t(made === "one" ? "new.made" : "new.madeN")}</p>}
        {/* a complete profile has its own page (/details), linked from the side bar and the phone menu */}
        <div className="mt-9 lg:mt-6">{table}</div>
      </div>
      </div>
      {over && (
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
