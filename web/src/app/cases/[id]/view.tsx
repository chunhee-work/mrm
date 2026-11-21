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
import { docKey, eventTr, failTr, userFixable } from "@/lib/case-text";

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
  files: { name: string; kind: string; size: number }[];
  orgId: string;
  error: string | null;
  photos: number;
  photosTodo: number;
  facts: { owner: string; policyNo: string | null; policeReport: string | null; accidentAt: string | null; atFaultPlate: string | null; atFaultInsurer: string | null } | null;
  events: { at: string; message: string }[];
  stale: boolean; // reading, but no news for 6 minutes: the server is already restarting it
  cred?: { blocked: boolean; verifyState: string } | null;
  shots?: Shot[] | null; // null: flag off, table not there yet, or not the submitter
};

const REFRESH_MS = 5_000;

export default function CaseView({ c }: { c: CaseDetail }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [allLog, setAllLog] = useState(false);

  const working = c.status === "uploaded" || c.status === "reading";
  useEffect(() => {
    if (!working) return;
    // poll only while the case is being read; stop at any other status, pause in a hidden tab, catch up when it is shown again
    const tick = () => { if (!document.hidden) router.refresh(); };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [working, router]);

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
    <ul>
      <NeedCard row={{ id: c.id, plate: c.plate, carModel: c.carModel, insurer: c.insurer, status: c.status, pendingDoc: c.missing.join("; "), error: c.error }} orgId={c.orgId} onSent={() => router.refresh()} />
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
    <details open className="group">
      <summary className="label mb-3 flex cursor-pointer list-none items-center gap-2">{t("case.log")}<span className="note text-mute">· {c.events.length}</span></summary>
      <ul className="rounded-[4px] border border-hair">
        {shownLog.map((e, i) => {
          const tr = eventTr(e.message);
          const text = tr.key ? t(tr.key, tr.key === "ev.pending" ? { docs: (tr.vars?.docs ?? "").split("; ").map((d) => t(`doc.${docKey(d)}`)).join("; ") } : tr.vars) : tr.raw ?? e.message;
          return (
            <li key={i} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 py-2.5 text-[14px] text-fg last:border-b-0">
              <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
              <time dateTime={e.at} className="num note shrink-0 text-mute" suppressHydrationWarning>
                {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}
              </time>
            </li>
          );
        })}
      </ul>
      {newest.length > LOG_SHORT && (
        <button type="button" className="btn-quiet mt-2" onClick={() => setAllLog((v) => !v)}>{allLog ? t("case.showLess") : t("case.showAll")}</button>
      )}
    </details>
  );

  const Files = () => c.files.length ? (
    <details className="group">
      <summary className="label mb-3 flex cursor-pointer list-none items-center gap-2">{t("case.files")}<span className="note text-mute">· {c.files.length}</span></summary>
      <ul className="rounded-[4px] border border-hair">
        {c.files.map((f, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 border-b border-hair px-4 py-2.5 text-[14px] text-fg last:border-b-0">
            <span className="min-w-0 [overflow-wrap:anywhere]">{f.name}</span>
            <span className="num note shrink-0 text-mute">{f.size < 1e6 ? `${Math.max(1, Math.round(f.size / 1e3))} KB` : `${(f.size / 1e6).toFixed(1)} MB`}</span>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  const PhotosButton = () => c.photos > 0 || c.status === "naming" || c.status === "waiting_user" ? (
    <Link href={`/cases/${c.id}/photos`} className="btn-primary self-start">
      {t("case.photosBtn")}{c.photosTodo > 0 ? ` (${c.photosTodo})` : ""}
    </Link>
  ) : null;

  const sub = working ? (c.stale ? t("case.stale") : t("case.reading")) : failed ? t(failTr(c.error).key, failTr(c.error).vars) : pending ? t("case.missing") : "";
  const title = c.plate || t("case.untitled");

  const Header = () => (
    <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hair px-5 py-3 sm:min-h-[68px] sm:px-8">
      <h1 className={`display-2 text-[24px] text-fg sm:text-[28px] ${c.plate ? "num font-mono" : ""}`}>{title}</h1>
      {Status()}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <div className="wrap flex flex-1 flex-col pb-10 pt-6 lg:pb-14 lg:pt-9">
      <Link href="/dashboard" className="btn-quiet mb-4 self-start">{t("case.back")}</Link>
      <div className="relative mx-auto w-full max-w-[860px]">
        <ScanEdge />
        <div className="sheet rounded-[3px] border border-hair bg-panel">{children}</div>
      </div>
    </div>
  );

  // one banner says what happened and offers the action; facts and activity sit under it
  return shell(
    <>
      {Header()}
      {c.cred && (c.cred.blocked || c.cred.verifyState === "bad_credentials" || c.cred.verifyState === "locked" || c.cred.verifyState === "otp" || c.cred.verifyState === "unknown") && (
        <div role="alert" className="border-b border-hair bg-ambertint px-5 py-3 text-[15px] text-fg sm:px-8">
          <p>{t("w.banner")}</p>
          <Link href="/connection" className="mt-1 inline-block font-semibold text-fg underline">{t("conn.title")}</Link>
        </div>
      )}
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
      {c.status === "done" && <ResultBlock carModel={c.carModel} totalRm={c.totalRm} sides={c.sides} />}
      <div className="grid gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          {facts.length > 0 && <section aria-labelledby="case-found"><h2 id="case-found" className="label mb-3">{t("case.found")}</h2>{Facts()}</section>}
          {needsFiles && <section aria-labelledby="case-missing"><h2 id="case-missing" className="label mb-3">{t("case.missing")}</h2>{MissingList()}</section>}
          {PhotosButton()}
        </div>
        <section aria-labelledby="case-log" className="grid content-start gap-6"><div id="case-log">{Log()}</div>{Files()}</section>
        {c.shots && <div className="lg:col-span-2"><ShotTimeline caseId={c.id} shots={c.shots} /></div>}
      </div>
    </>
  );
}
