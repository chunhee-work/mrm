"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
import BackLink from "@/components/app/back-link";
import CaseSteps from "@/components/app/case-steps";
import { whenOf } from "@/lib/fmt-when";

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
  cred?: { blocked: boolean; verifyState: string } | null;
  shots?: Shot[] | null; // null: flag off, table not there yet, or not the submitter
  sameCount?: number; // other cases of this org with the same plate (R2-U02)
  createdAt?: string;
  desk?: { total: number; confirm: number; edited: number; doneAt: string | null } | null; // the photo desk: how many photos, how many still to confirm
  photoPlan?: { mode: string; action: string; upload: number; relabel: number; reorder: number } | null; // latest photo step of Phase A/B
};

const REFRESH_MS = 5_000;

export default function CaseView({ c }: { c: CaseDetail }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [allLog, setAllLog] = useState(false);

  const working = c.status === "uploaded" || c.status === "reading";
  // poll while the case moves by itself (read, then the worker's steps); stop when it waits for a person or is done
  const moving = working || ["naming", "phase_a", "phase_b", "checking"].includes(c.status);
  useEffect(() => {
    if (!moving) return;
    // stop at any other status, pause in a hidden tab, catch up when it is shown again
    const tick = () => { if (!document.hidden) router.refresh(); };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [moving, router]);

  // pending_doc is not retried here: the same files would give the same missing list (an add-documents flow comes later)
  const canRetry = c.status === "failed" && !userFixable(c.error);

  async function retry() {
    setBusy(true); setErr(false);
    try {
      const r = await fetch(`/api/cases/${c.id}/scan`, { method: "POST" });
      if (r.status === 402) { setErr(true); } else if (!r.ok && r.status !== 409) setErr(true); // 409 = someone already started it
    } catch { setErr(true); }
    setBusy(false);
    router.refresh();
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

  const failed = c.status === "failed";
  const pending = c.status === "pending_doc";
  const finished = !working && !failed;
  const headline = working ? t("case.h.reading") : failed ? t("case.h.failed") : pending ? t("case.h.pending", { n: String(c.missing.length || 1) }) : t("case.h.ok");

  // where the case is and what comes next (owner 2026-11-27: after "Read" the page said nothing about what happens now,
  // whose turn it is, or what comes after). The system's turn says "nothing for you to do"; the user's turn has the button.
  const photosOpen = c.desk != null && c.desk.total > 0 && !c.desk.doneAt;
  const yourTurn = !working && !failed && !pending && (c.status === "waiting_user" || (photosOpen && ["naming", "phase_a"].includes(c.status)));
  const later = !working && !failed && !pending && c.status !== "done"; // read, and the work goes on after it
  const nowKey = yourTurn ? "case.now.you" : ({ naming: "case.now.naming", phase_a: "case.now.phase_a", waiting_user: "case.now.phase_a", phase_b: "case.now.phase_b", checking: "case.now.checking" } as Record<string, string>)[c.status];
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
      {err && <p role="alert" className="field-error mt-3">{t("case.retryFail")}</p>}
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
      <CaseLog events={shownLog} live={working} />
      {newest.length > LOG_SHORT && (
        <button type="button" className="btn-quiet mt-2 !text-[15px] !font-medium !text-mute hover:!text-fg" data-testid="log-more" onClick={() => setAllLog((v) => !v)}>{allLog ? t("case.showLess") : t("case.showAll")}</button>
      )}
    </section>
  );

  const Files = () => c.files.length ? (
    <details className="group" data-testid="case-files">
      <summary className="label mb-3 flex cursor-pointer list-none items-center gap-2"><span aria-hidden="true" className="inline-block text-mute transition-transform group-open:rotate-90">▸</span>{t("case.files")}<span className="note text-mute">· {c.files.length}</span></summary>
      <ul className="rounded-[4px] border border-hair">
        {c.files.map((f) => (
          <li key={f.id} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 text-[14px] text-fg last:border-b-0">
            {/* a click opens the file itself in a new tab (PDF and photos show there, a zip downloads); the route checks the session every time */}
            <a href={`/api/cases/${c.id}/files/${f.id}`} target="_blank" rel="noopener" data-testid="file-open"
              className="min-w-0 py-3 font-medium underline decoration-hair2 underline-offset-4 transition-colors duration-150 [overflow-wrap:anywhere] hover:decoration-fg">{f.name}</a>
            <span className="num note shrink-0 text-mute">{f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${(f.size / 1e6).toFixed(1)} MB`}</span>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

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
  const DeskLink = () => ((deskShown && !yourTurn) || c.photoPlan) ? (
    <section aria-labelledby="case-photos" className="min-w-0">
      <h2 id="case-photos" className="label mb-3">{t("case.photoPlan")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-hair px-4 py-3">
        <p className="min-w-0 text-[14.5px] text-fg [text-wrap:pretty]" data-testid="photo-plan-line" suppressHydrationWarning>
          {c.desk ? deskStatus() : c.photoPlan ? t("case.photoPlan.dry", { upload: String(c.photoPlan.upload), relabel: String(c.photoPlan.relabel), reorder: String(c.photoPlan.reorder) }) : ""}
        </p>
        {deskShown && !yourTurn && ( /* the banner above has the button on the user's turn */
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
      {yourTurn && deskBtn}
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
  const recordBeside = facts.length > 0 && !(deskShown && !yourTurn) && !c.photoPlan;
  return shell(
    <>
      {Header()}
      <div className="border-b border-hair px-5 py-3 sm:px-8"><CaseSteps caseId={c.id} status={c.status} photos={c.desk?.total ?? c.photos} photosDone={!!c.desk?.doneAt} hint={false} /></div>
      {(c.sameCount ?? 0) > 0 && (
        <p className="border-b border-hair px-5 py-2.5 text-[14px] text-mute sm:px-8" data-testid="same-plate">{t("case.samePlate", { n: String(c.sameCount) })}</p>
      )}
      {c.cred && (c.cred.blocked || c.cred.verifyState === "bad_credentials" || c.cred.verifyState === "locked" || c.cred.verifyState === "otp" || c.cred.verifyState === "unknown") && (
        <div role="alert" className="border-b border-hair bg-ambertint px-5 py-3 text-[15px] text-fg sm:px-8">
          <p>{t("w.banner")}</p>
          <Link href="/connection" className="mt-1 inline-block font-semibold text-fg underline">{t("conn.title")}</Link>
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
        {(facts.length > 0 || (deskShown && !yourTurn) || c.photoPlan) && (
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
