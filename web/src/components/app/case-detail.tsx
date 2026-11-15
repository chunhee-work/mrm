"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useT } from "@/components/lang-provider";
import { kindOf } from "@/lib/file-kind";
import { accepted } from "./drop-zone";
import { Tick, Upload } from "./marks";
import { groupOf, stepOf, TRACK } from "./status";
import type { CaseRow } from "./case-list";

type T = (key: string, vars?: Record<string, string>) => string;

/** The eight stops of a case joined by a line: a column on phones, a row with the names underneath from sm. */
function Track({ status, t }: { status: string; t: T }) {
  const at = stepOf(status);
  const live = groupOf(status) === "active";
  const ended = status === "done";
  return (
    <ol aria-label={t("dash.d.progress")} className="flex flex-col sm:grid sm:grid-cols-8">
      {TRACK.map((s, i) => {
        const here = i === at && !ended;
        const past = i < at || ended;
        return (
          <li key={s} aria-current={here ? "step" : undefined} className="relative flex h-8 items-center gap-3 sm:h-auto sm:flex-col sm:gap-2.5">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute left-[9px] top-[-50%] h-full w-[2px] sm:left-auto sm:right-1/2 sm:top-[9px] sm:h-[2px] sm:w-full ${i <= at ? "bg-scan" : "bg-hair"} ${
                  here && live ? "case-link-live" : ""
                }`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                past ? "bg-scan text-panel" : here ? `border-2 bg-panel ${live ? "case-ping border-scan" : "border-amber"}` : "border-[1.5px] border-hair2 bg-panel"
              }`}
            >
              {past ? <Tick className="h-[11px] w-[11px]" /> : here ? <span className={`relative h-2 w-2 rounded-full ${live ? "bg-scan" : "bg-amber"}`} /> : null}
            </span>
            <span className={`text-[14px] leading-tight sm:px-1 sm:text-center sm:text-[12.5px] sm:[text-wrap:balance] ${here ? "font-semibold text-fg" : "text-mute"}`}>
              {t(`status.${s}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What opens under a case row: how far the case has got, and what (if anything) it needs from the user.
 * A missing document is uploaded right here: choosing the files sends them, there is no second button.
 */
export default function CaseDetail({ row, orgId, abs }: { row: CaseRow; orgId: string; abs: Intl.DateTimeFormat }) {
  const { t } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<{ n: number; total: number; pct: number } | null>(null);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const group = groupOf(row.status);

  // "Received" stays up while the case is back in the queue; it goes when the case next stops or finishes.
  const wasActive = useRef(false);
  useEffect(() => {
    const active = group === "active";
    if (!active && wasActive.current) setSent(false);
    wasActive.current = active;
  }, [group]);

  /** Upload the chosen files (none for "Try again"), then put the case back in the queue. */
  async function send(files: File[]) {
    setErr("");
    setSending({ n: 0, total: files.length, pct: 0 });
    let saving = false;
    try {
      const folder = `${orgId}/${row.id}-add-${crypto.randomUUID()}`;
      const done = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const step = { n: i + 1, total: files.length };
        setSending({ ...step, pct: 0 });
        const b = await upload(`${folder}/${f.name}`, f, {
          access: "private", handleUploadUrl: "/api/upload", multipart: f.size > 20e6,
          onUploadProgress: (p) => setSending({ ...step, pct: Math.round(p.percentage) }),
        });
        done.push({ kind: kindOf(f), url: b.url, name: f.name, size: f.size });
      }
      saving = true;
      const r = await fetch(`/api/cases/${row.id}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: done }) });
      if (!r.ok) throw new Error("not saved");
      setSent(true);
      router.refresh();
    } catch {
      setErr(t(saving ? "dash.d.fail" : "new.failUpload"));
    } finally {
      setSending(null);
    }
  }
  function onChosen(list: File[]) {
    const ok = list.filter(accepted);
    if (ok.length) void send(ok);
    else if (list.length) setErr(t("dash.d.badType"));
  }

  const lead = "text-[15px] font-semibold leading-snug text-fg";
  const docs = (row.pendingDoc ?? "").split("; ").map((d) => d.trim()).filter(Boolean);
  const hasTrack = stepOf(row.status) >= 0;
  // On phones the panel is one column: a case that needs the user says what it needs before it shows how far it got.
  const needFirst = group === "needs" || sent;
  const split = "border-t border-hair pt-5 lg:border-t-0 lg:pt-0"; // the rule above whichever block comes second

  let need: React.ReactNode;
  if (sent && (group === "active" || row.status === "pending_doc" || row.status === "failed")) {
    need = (
      <p role="status" className={`flex items-start gap-2.5 ${lead}`}>
        <Tick className="mt-[3px] h-[15px] w-[15px] shrink-0 text-go" />
        {t("dash.d.received")}
      </p>
    );
  } else if (row.status === "pending_doc") {
    need = (
      <>
        <h3 className={lead}>{t("dash.d.missingTitle")}</h3>
        {docs.length > 0 && (
          <ul className="mt-2.5 grid gap-1.5">
            {docs.map((d) => (
              <li key={d} className="flex items-start gap-2.5 text-[15px] leading-snug text-fg">
                <span aria-hidden="true" className="mt-[6px] h-[9px] w-[9px] shrink-0 rounded-full bg-amber" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{d}</span>
              </li>
            ))}
          </ul>
        )}
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
        {sending ? (
          <div role="status" className="mt-4 flex h-12 flex-col justify-center gap-2">
            <p className="num font-mono text-[13.5px] font-medium leading-none text-fg">
              {t("dash.d.uploading", { n: String(sending.n), total: String(sending.total), pct: String(sending.pct) })}
            </p>
            <span aria-hidden="true" className="block h-[2px] bg-hair">
              <span className="block h-full bg-scan transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${sending.pct}%` }} />
            </span>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="btn-primary mt-4 w-full !gap-2.5 !px-5 sm:w-auto">
            <Upload />
            {t("dash.d.upload")}
          </button>
        )}
        <p className="hint mt-3">{t("dash.d.uploadHint")}</p>
      </>
    );
  } else if (row.status === "failed") {
    need = (
      <>
        <p className={lead}>{t("dash.d.failed")}</p>
        <button type="button" onClick={() => void send([])} disabled={!!sending} className={`btn-primary mt-4 w-full sm:w-auto sm:min-w-[148px] ${sending ? "cursor-progress" : ""}`}>
          {t("dash.d.retry")}
        </button>
      </>
    );
  } else if (row.status === "waiting_user") {
    need = <p className={lead}>{t("dash.d.waiting")}</p>;
  } else if (row.status === "done") {
    need = (
      <p className={`flex items-start gap-2.5 ${lead}`}>
        <Tick className="mt-[3px] h-[15px] w-[15px] shrink-0 text-go" />
        <span>
          {t("dash.d.finished")}
          {row.doneAt && <time dateTime={row.doneAt} className="ml-2.5 font-normal text-mute">{abs.format(new Date(row.doneAt))}</time>}
        </span>
      </p>
    );
  } else {
    need = <p className={lead}>{t("dash.d.working")}</p>;
  }

  return (
    <div className="rounded-b-[3px] border-t border-hair bg-bay px-3 pb-6 pt-5 lg:px-4 lg:pb-7 lg:pt-6">
      <div className={`grid gap-y-6 ${hasTrack ? "lg:grid-cols-[minmax(0,1fr)_288px] xl:grid-cols-[minmax(0,1fr)_348px]" : ""}`}>
        {hasTrack && (
          <div className={`min-w-0 lg:pr-8 ${needFirst ? split : ""}`}>
            <p className="note mb-3.5 font-medium uppercase tracking-[0.08em] text-mute sm:mb-4">{t("dash.d.progress")}</p>
            <Track status={row.status} t={t} />
          </div>
        )}
        <div className={`min-w-0 ${hasTrack ? `lg:border-l lg:border-hair lg:pl-8 ${needFirst ? "order-first lg:order-none" : split}` : "max-w-[520px]"}`}>
          {need}
          {err && <p role="alert" className="field-error mt-3">{err}</p>}
          <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-hair pt-4 text-[13.5px] leading-snug">
            <dt className="text-mute">{t("dash.col.created")}</dt>
            <dd className="text-fg"><time dateTime={row.createdAt}>{abs.format(new Date(row.createdAt))}</time></dd>
            {row.insurer && (
              <>
                <dt className="text-mute">{t("dash.d.insurer")}</dt>
                <dd className="text-fg">{row.insurer}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
