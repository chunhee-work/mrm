"use client";
import { WorkshopChoice, type WorkshopOpt, type WorkshopState } from "@/components/app/workshop-picker";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { needsUser } from "@/lib/ext/login-state";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import ScanEdge from "@/components/scan-edge";
import { Tick, Working } from "@/components/app/marks";
import { ResultBlock } from "@/components/app/done-result";
import type { Side } from "@/lib/damage-sides";
import ShotTimeline, { type Shot } from "@/components/app/shot-timeline";
import NeedCard from "@/components/app/case-detail";
import { failTr, userFixable } from "@/lib/case-text";
import CaseLog from "@/components/app/case-log";
import CaseFiles from "@/components/app/case-files";
import BackLink from "@/components/app/back-link";
import CaseSteps from "@/components/app/case-steps";
import { whenOf } from "@/lib/fmt-when";
import type { Cred } from "@/components/app/profile-card";
import { readAgain } from "./read-again";

export type CaseDetail = {
  id: string;
  plate: string;
  status: string;
  insurer: string | null;
  carModel: string | null;
  totalRm: string | null;
  sides?: Side[]; // undefined: could not be loaded
  missing: string[];
  fileCount: number;
  files: { id: number; name: string; kind: string; size: number }[];
  orgId: string;
  error: string | null;
  photos: number;
  photosTodo: number;
  facts: { owner: string; policyNo: string | null; policeReport: string | null; accidentAt: string | null; atFaultPlate: string | null; atFaultInsurer: string | null } | null;
  events: { at: string; message: string }[];
  stale: boolean; // reading, but no news for 6 minutes: the server is already restarting it
  cred?: Cred | null;
  credConfigured?: boolean;
  workshops?: WorkshopOpt[]; // the account's workshops (a choice is shown from two on)
  workshop?: WorkshopState; // the one this case belongs to; whether it still asks for Confirm or is fixed
  shots?: Shot[] | null; // null: flag off, table not there yet, or not the submitter
  sameCount?: number; // other cases of this org with the same plate (R2-U02)
  createdAt?: string;
  desk?: { total: number; confirm: number; edited: number; doneAt: string | null } | null; // the photo desk: how many photos, how many still to confirm
  photoPlan?: { mode: string; action: string; upload: number; relabel: number; reorder: number } | null; // latest photo step of Phase A/B
};

const REFRESH_MS = 5_000;
const SLOW_MS = 30_000; // the user's turn: the system still adds things behind it (photos being brought in, the worker's lines), so those can show up to 30 s late

export default function CaseView({ c }: { c: CaseDetail }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""); // the message key of what went wrong with "Read again"
  const [allLog, setAllLog] = useState(false);

  const working = c.status === "uploaded" || c.status === "reading";
  const failed = c.status === "failed";
  const pending = c.status === "pending_doc";
  // whose turn it is (owner 2026-11-27): the user's when the photo names wait for them, or the worker asks for them
  const photosOpen = c.desk != null && c.desk.total > 0 && !c.desk.doneAt;
  const photoTurn = !working && !failed && !pending && (c.status === "waiting_user" || (photosOpen && ["naming", "phase_a"].includes(c.status)));
  // owner 2026-11-29: the worker does not make the case in Merimen before the workshop is confirmed, so that is the user's turn too
  // (the same rule as the list's wsTurn); like the list's button, the banner names the workshop first (the desk button stays)
  const wsTurn = !working && !failed && !pending && !!c.workshop?.needsConfirm && ["naming", "phase_a", "waiting_user"].includes(c.status);
  const yourTurn = photoTurn || wsTurn;
  // poll while the case moves by itself (read, then the worker's steps); stop when it waits for a person or is done
  const moving = working || ["naming", "phase_a", "phase_b", "checking"].includes(c.status);
  // Fast only while something is in progress: the system is working, or "Read again" was pressed and its answer is still out.
  // On the user's turn nothing here waits for the system, but it still works behind (photos are still being brought in, the
  // worker makes the case in Merimen): a look now and then is enough, and the photo count can be up to SLOW_MS behind.
  const everyMs = busy ? REFRESH_MS : !moving ? 0 : yourTurn ? SLOW_MS : REFRESH_MS;
  useEffect(() => {
    if (!everyMs) return;
    // stop at any other status, pause in a hidden tab and while offline (a refresh that cannot reach the server makes Next
    // load the whole page again, and the browser shows its own error page); catch up when the tab or the connection is back
    const tick = () => { if (!document.hidden && navigator.onLine) router.refresh(); };
    const id = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("online", tick); };
  }, [everyMs, router]);

  // pending_doc is not retried here: the same files would give the same missing list (an add-documents flow comes later)
  const canRetry = c.status === "failed" && !userFixable(c.error);

  // "Read again": the answer only comes when the read is over, which can take minutes. Until then the page keeps looking at
  // the case itself (the fast poll above): once the server shows it as being read, the page follows the case, not the request.
  // When the page saw nothing (a hidden tab pauses the poll), the server is asked what the case is doing before anything is
  // called a failure (readAgain): only a press that never got there brings the button back with the message.
  const taken = useRef(false); // the server took this press: the case was seen being read
  useEffect(() => {
    if (working) setErr(""); // being read now: a message about an earlier press no longer applies
    if (!busy) return;
    if (working) taken.current = true;
    else if (taken.current) setBusy(false); // read and over while the answer is still out (or lost): the button is free again
  }, [busy, working]);
  async function retry() {
    if (busy) return;
    setBusy(true); setErr(""); taken.current = false;
    const fresh = () => { if (navigator.onLine) router.refresh(); }; // offline it could only fail, and a failed refresh loads the whole page again
    const out = await readAgain(c.id, { onLate: fresh });
    if (out === "no_credits") setErr("new.noCredits"); // no credit left: say that, not "could not start"
    else if (out === "too_many") setErr("case.readTooMany");
    // a read the server did start is shown by the case itself (its status and its reason), whatever became of this request
    else if (out === "fail" && !taken.current) setErr("case.retryFail");
    setBusy(false);
    fresh();
  }

  // only what the documents gave: an empty value is left out, not shown as a dash
  const facts: [string, string][] = ([
    [t("case.plate"), c.plate],
    [t("case.insurer"), c.insurer],
    [t("case.model"), c.carModel],
    ...(c.facts ? ([
      [t("case.owner"), c.facts.owner],
      [t("case.policy"), c.facts.policyNo],
      [t("case.police"), c.facts.policeReport],
      [t("case.accident"), c.facts.accidentAt],
      [t("case.atFault"), [c.facts.atFaultPlate, c.facts.atFaultInsurer].filter(Boolean).join(" · ")],
    ] as [string, string | null][]) : []),
  ] as [string, string | null][]).filter((r): r is [string, string] => !!r[1]);

  // past the documents and no accepted Merimen login yet: step 3 cannot run, so ask for it here
  const merimenAsk = !!c.cred && !!c.credConfigured && c.cred.storageOk && !["uploaded", "reading", "failed", "pending_doc", "done"].includes(c.status)
    && (!c.cred.complete || needsUser(c.cred));
  const finished = !working && !failed;
  const headline = working ? t("case.h.reading") : failed ? t("case.h.failed") : pending ? t("case.h.pending", { n: String(c.missing.length || 1) }) : t("case.h.ok");

  // where the case is and what comes next (owner 2026-11-27: after "Read" the page said nothing about what happens now,
  // whose turn it is, or what comes after). The system's turn says "nothing for you to do"; the user's turn has the button.
  const later = !working && !failed && !pending && c.status !== "done"; // read, and the work goes on after it
  const nowKey = wsTurn ? "case.now.ws" : yourTurn ? "case.now.you" : ({ naming: "case.now.naming", phase_a: "case.now.phase_a", waiting_user: "case.now.phase_a", phase_b: "case.now.phase_b", checking: "case.now.checking" } as Record<string, string>)[c.status];
  const nextKey = yourTurn ? (c.status === "waiting_user" ? "case.next.phase_b" : "case.next.phase_a")
    : c.status === "naming" ? "case.next.you"
    : c.status === "phase_a" ? (c.desk?.doneAt ? "case.next.phase_b" : "case.next.you")
    : c.status === "phase_b" ? "case.next.checking" : c.status === "checking" ? "case.next.done" : null;
  const deskBtn = c.desk && c.desk.total > 0 ? (
    <Link href={`/cases/${c.id}/photos`} className="btn-primary shrink-0" data-testid="desk-link">
      {c.desk.confirm > 0 ? t("case.namePhotosN", { n: String(c.desk.confirm) }) : c.desk.doneAt ? t("case.namePhotosDone") : t("case.namePhotosPress")}
    </Link>
  ) : null;

  const Mark = () =>
    working ? <Working className="shrink-0 text-scan" /> :
    finished && !pending ? <Tick className="h-[18px] w-[18px] shrink-0 text-go" /> :
    <span aria-hidden="true" className="h-[10px] w-[10px] shrink-0 rounded-full bg-amber" />;

  const Retry = () => canRetry ? (
    <div>
      <button type="button" onClick={retry} disabled={busy || working} className="btn-primary">{busy ? t("case.retrying") : t("case.retry")}</button>
      {err && <p role="alert" className="field-error mt-3">{t(err)}</p>}
    </div>
  ) : null;

  const Status = () => (
    <div aria-live="polite" className="inline-flex items-center gap-2.5 whitespace-nowrap text-[14px] font-medium leading-none text-fg">
      {t(`status.${c.status}`)}{Mark()}
    </div>
  );

  // what is missing, in the fixed names, with the upload button right here (the same card as on the dashboard)
  const needsFiles = c.status === "pending_doc" || (c.status === "failed" && userFixable(c.error));
  const MissingList = () => needsFiles ? (
    <ul className="min-w-0">
      <NeedCard row={{ id: c.id, plate: c.plate, carModel: c.carModel, insurer: c.insurer, status: c.status, pendingDoc: c.missing.join("; "), error: c.error, deskConfirm: c.desk?.confirm }} orgId={c.orgId} onSent={() => router.refresh()} />
    </ul>
  ) : null;

  const Facts = () => facts.length ? (
    <dl className="rounded-[4px] border border-hair">
      {facts.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 py-3 last:border-b-0">
          <dt className="note shrink-0 text-mute">{k}</dt>
          <dd className="min-w-0 text-right text-[15px] text-fg [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  ) : null;

  // newest first; the lists grow with their content (no inner scroll box), long ones show 5 and "Show all"
  const LOG_SHORT = 5;
  const newest = [...c.events].reverse();
  const shownLog = allLog ? newest : newest.slice(0, LOG_SHORT);
  const Log = () => (
    // always open (owner 2026-11-27: "must be always showing, not I open then only show"); the 5 newest, then "Show all"
    <section aria-labelledby="case-log-title" data-testid="case-log">
      <h2 id="case-log-title" className="label mb-3 flex items-center gap-2">{t("case.log")}<span className="note text-mute">· {c.events.length}</span></h2>
      <CaseLog events={shownLog} live={working} waiting={c.status === "waiting_user"} />
      {newest.length > LOG_SHORT && (
        <button type="button" className="btn-quiet mt-2 !text-[15px] !font-medium !text-mute hover:!text-fg" data-testid="log-more" onClick={() => setAllLog((v) => !v)}>{allLog ? t("case.showLess") : t("case.showAll")}</button>
      )}
    </section>
  );

  // a press opens a window over the page: the list first, a file inside the same window, Back at the top left
  const Files = () => c.files.length ? <section><CaseFiles caseId={c.id} files={c.files} testid="case-files" /></section> : null;

  // the photo desk: ONE link and ONE status line, never an empty box (R3-B01, R3-U01)
  const deskShown = !working && !failed && c.desk != null && c.desk.total > 0 && !["done", "uploaded", "reading", "failed"].includes(c.status);
  const deskStatus = (): string => {
    const d = c.desk!;
    if (c.photoPlan) {
      return c.photoPlan.action === "refused" ? t("case.photoPlan.refused")
        : t(c.photoPlan.mode === "live" ? "case.photoPlan.live" : "case.photoPlan.dry", { upload: String(c.photoPlan.upload), relabel: String(c.photoPlan.relabel), reorder: String(c.photoPlan.reorder) });
    }
    if (!d.doneAt) return d.confirm > 0 ? t("case.pp.todo", { n: String(d.confirm) }) : t("case.pp.press");
    // 完成 was pressed and the worker has not written a plan yet: say what was confirmed and what happens next, in the real state
    const next = c.status === "pending_doc" ? "case.pp.next.pending_doc" : c.status === "phase_b" ? "case.pp.next.phase_b" : c.status === "checking" ? "case.pp.next.checking" : "case.pp.next.early";
    return `${t("case.pp.confirmed", { when: whenOf(d.doneAt, lang) })} · ${t("case.pp.summary", { n: String(d.total), edited: String(d.edited) })}${lang === "zh" ? "。" : ". "}${t(next)}`;
  };
  // on the user's turn the banner already says "check the photo names" with the button: no second box saying it again
  const DeskLink = () => ((deskShown && !photoTurn) || c.photoPlan) ? (
    <section aria-labelledby="case-photos" className="min-w-0">
      <h2 id="case-photos" className="label mb-3">{t("case.photoPlan")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-hair px-4 py-3">
        <p className="min-w-0 text-[14.5px] text-fg [text-wrap:pretty]" data-testid="photo-plan-line" suppressHydrationWarning>
          {c.desk ? deskStatus() : c.photoPlan ? t("case.photoPlan.dry", { upload: String(c.photoPlan.upload), relabel: String(c.photoPlan.relabel), reorder: String(c.photoPlan.reorder) }) : ""}
        </p>
        {deskShown && !photoTurn && ( /* the banner above has the button on the user's turn */
          <Link href={`/cases/${c.id}/photos`} className="btn-primary" data-testid="desk-link">
            {c.desk!.confirm > 0 ? t("case.namePhotosN", { n: String(c.desk!.confirm) }) : c.desk!.doneAt ? t("case.namePhotosDone") : t("case.namePhotosPress")}
          </Link>
        )}
      </div>
    </section>
  ) : null;

  const sub = working ? (c.stale ? t("case.stale") : t("case.reading")) : failed ? t(failTr(c.error).key, failTr(c.error).vars) : pending ? t("case.missing") : "";
  // no plate yet: the first file's name is the title (it used to read "New case", like the upload page)
  const title = c.plate || c.files[0]?.name || t("case.untitled");

  const Busy = () => <Working className="shrink-0 text-scan" />;
  const Next = () => (
    // A: one line of what is happening now, one line of what comes next, and the button when it is the user's turn
    <div className={`flex flex-wrap items-center justify-between gap-4 border-b border-hair px-5 py-4 sm:px-8 ${yourTurn ? "bg-ambertint" : "bg-panel2"}`} role="status" data-testid="case-next">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-[3px]">{yourTurn ? <span aria-hidden="true" className="block h-[10px] w-[10px] rounded-full bg-amber" /> : Busy()}</span>
        <div className="min-w-0">
          <p className="text-[17px] font-medium leading-snug text-fg">{t(nowKey!)}</p>
          {nextKey && <p className="mt-1 text-[14px] text-mute">{t(nextKey)}</p>}
          {!yourTurn && <p className="mt-1 text-[14px] text-mute">{t("case.idle")}</p>}
        </div>
      </div>
      {photoTurn && deskBtn}
    </div>
  );

  const Header = () => (
    <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hair px-5 py-3 sm:min-h-[68px] sm:px-8">
      <div className="min-w-0">
        <h1 className={`text-fg [overflow-wrap:anywhere] ${c.plate ? "display-2 num font-mono text-[24px] sm:text-[28px]" : "text-[20px] font-semibold leading-tight sm:text-[22px]"}`}>{title}</h1>
        {c.createdAt && <p className="mt-2 text-[13.5px] leading-none text-mute" suppressHydrationWarning>{t("case.uploaded", { when: whenOf(c.createdAt, lang) })}</p>}
      </div>
      {/* the banner right below already says what is wrong or that the files are being read (owner 2026-11-27: "remove top
          right, it's repeat"): no second "missing", "reading" or "failed" up here; later stages still show their name */}
      {!needsFiles && !working && !failed && !later && Status()}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <div className="wrap flex flex-1 flex-col pb-10 pt-6 lg:pb-14 lg:pt-9">
      <BackLink href="/dashboard" className="mb-4" testid="case-back">{t("nav.home")}</BackLink>
      <div className="relative mx-auto w-full max-w-[860px]">
        <ScanEdge />
        <div className="sheet rounded-[3px] border border-hair bg-panel">{children}</div>
      </div>
    </div>
  );

  // one banner says what happened and offers the action; facts and activity sit under it
  // the record of the case (activity, files): there when wanted, folded until then. With nothing about photos to show,
  // it sits in the free half next to the facts instead of under an empty space.
  const record = "grid min-w-0 grid-cols-1 gap-y-1 [&_summary]:mb-0 [&_summary]:min-h-11 [&_details[open]>summary]:mb-3";
  const recordBeside = facts.length > 0 && !(deskShown && !photoTurn) && !c.photoPlan;
  return shell(
    <>
      {Header()}
      <div className="border-b border-hair px-5 py-3 sm:px-8"><CaseSteps caseId={c.id} status={c.status} photos={c.desk?.total ?? c.photos} photosDone={!!c.desk?.doneAt} hint={false} /></div>
      {c.workshop?.shown && c.workshops && (
        <div className="border-b border-hair px-5 py-3 sm:px-8">
          <WorkshopChoice caseId={c.id} workshops={c.workshops} state={c.workshop} onSaved={() => router.refresh()} testid="case-ws" />
        </div>
      )}
      {(c.sameCount ?? 0) > 0 && (
        <p className="border-b border-hair px-5 py-2.5 text-[14px] text-mute sm:px-8" data-testid="same-plate">{t("case.samePlate", { n: String(c.sameCount) })}</p>
      )}
      {merimenAsk && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hair bg-ambertint px-5 py-4 sm:px-8" data-testid="ml-banner">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-snug text-fg">{t(c.cred && c.cred.complete ? "w.banner" : "pf.needTitle")}</p>
            <p className="mt-1 text-[14.5px] leading-snug text-fg/80 [text-wrap:pretty]">{t("pf.needSub")}</p>
          </div>
          <Link href="/details" className="btn-primary !h-11">{t("pf.edit")}</Link>
        </div>
      )}
      {needsFiles ? (
        // what is missing and the button that sends it, once, right under the title (it used to be said four times on this page)
        MissingList()
      ) : later && nowKey ? Next() : (
        <div className={`flex flex-wrap items-center justify-between gap-4 border-b border-hair px-5 py-4 sm:px-8 ${failed || pending ? "bg-ambertint" : working ? "bg-panel2" : ""}`} role={failed ? "alert" : "status"}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-[3px]">{Mark()}</span>
            <div className="min-w-0">
              <p className="text-[17px] font-medium leading-snug text-fg">{headline}</p>
              {sub && !pending && <p className="mt-1 text-[14px] text-mute">{sub}</p>}
            </div>
          </div>
          {Retry()}
        </div>
      )}
      {c.status === "done" && <ResultBlock carModel={c.carModel} totalRm={c.totalRm} sides={c.sides} />}
      <div className="grid grid-cols-1 gap-6 px-5 py-6 sm:px-8 sm:py-8">
        {(facts.length > 0 || (deskShown && !photoTurn) || c.photoPlan) && (
          <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {facts.length > 0 && <section aria-labelledby="case-found" className="min-w-0"><h2 id="case-found" className="label mb-3">{t("case.found")}</h2>{Facts()}</section>}
            {DeskLink()}
            {recordBeside && <div className={`${record} lg:pt-8`}>{Log()}{Files()}</div>}
          </div>
        )}
        {c.shots && <ShotTimeline caseId={c.id} shots={c.shots} />}
        {!recordBeside && <div className={`${record} gap-x-6 lg:grid-cols-2`}>{Log()}{Files()}</div>}
      </div>
    </>
  );
}
