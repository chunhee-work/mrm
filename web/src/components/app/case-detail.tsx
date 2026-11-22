"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadGuarded, UploadStalled } from "@/lib/upload-guard";
import { useT } from "@/components/lang-provider";
import { kindOf } from "@/lib/file-kind";
import { docKey, failTr, userFixable } from "@/lib/case-text";
import { accepted } from "./drop-zone";
import { whenOf } from "@/lib/fmt-when";
import { Photo, Tick, Upload } from "./marks";
import type { CaseRow } from "./case-list";

/** What a card has just sent: the missing files. */
export type Sent = "files";

/**
 * A case that needs the user, as a card: the vehicle no., in plain words the one thing that is needed, and the one button that does it.
 * A missing document is uploaded right here: choosing the files sends them, there is no second button.
 * `sent` comes from the list, which keeps the card in place for a moment after it went through, so the user sees it was received.
 */
export default function NeedCard({ row, orgId, sent, onSent, compact = false }: { row: CaseRow; orgId: string; sent?: Sent; onSent: (id: string, what: Sent) => void; compact?: boolean }) {
  const { t, lang } = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<{ n: number; total: number; pct: number } | null>(null);
  const [err, setErr] = useState("");
  const uid = useId();
  const titleId = `${uid}-plate`;
  const actId = `${uid}-act`;

  /** Upload the chosen files, then put the case back in the queue. */
  async function send(files: File[]) {
    if (sending) return;
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
        const b = await uploadGuarded(`${folder}/${f.name}`, f, (pct) => setSending({ ...step, pct: Math.round(pct) }));
        done.push({ kind: kindOf(f), url: b.url, name: f.name, size: f.size });
      }
      saving = true;
      const r = await fetch(`/api/cases/${row.id}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: done }) });
      if (!r.ok) throw new Error("not saved");
      onSent(row.id, "files");
      router.refresh();
    } catch (e) {
      setErr(t(e instanceof UploadStalled ? "new.stalled" : saving ? "dash.d.fail" : "new.failUpload"));
    } finally {
      setSending(null);
    }
  }
  async function again() {
    if (sending) return;
    setErr(""); setSending({ n: 0, total: 0, pct: 0 });
    try {
      const r = await fetch(`/api/cases/${row.id}/scan`, { method: "POST" });
      if (r.status === 402) { setErr(t("new.noCredits")); return; }
      if (!r.ok && r.status !== 409) throw new Error("retry");
      router.refresh();
    } catch { setErr(t("case.retryFail")); } finally { setSending(null); }
  }
  function onChosen(list: File[]) {
    const ok = list.filter(accepted);
    if (ok.length) void send(ok);
    else if (list.length) setErr(t("dash.d.badType"));
  }

  const docs = (row.pendingDoc ?? "").split("; ").map((d) => d.trim()).filter(Boolean);
  const say = "text-[16px] font-semibold leading-snug text-fg [text-wrap:pretty]";
  // While it is sending, the button stays where it is (and keeps the focus) and only stops answering.
  const busy = !!sending;
  const button = `btn-primary relative w-full overflow-hidden !gap-2.5 !px-5 sm:w-auto sm:min-w-[168px] ${busy ? "cursor-progress hover:!bg-ice" : ""}`;

  let need: React.ReactNode; // what is needed, in plain words
  let act: React.ReactNode = null; // the one button, if there is something the user can do here
  if (sent) {
    need = (
      <p role="status" className={`flex items-start gap-2.5 ${say}`}>
        <Tick className="mt-[3px] h-4 w-4 shrink-0 text-go" />
        {t("dash.d.received")}
      </p>
    );
  } else if (row.status === "pending_doc" || (row.status === "failed" && userFixable(row.error ?? null))) {
    const names = docs.map((d) => (docKey(d) === "other" ? d : t(`doc.${docKey(d)}`)));
    need = row.status === "failed" ? (
      <>
        {compact && <p className={say}>{t("case.h.failed")}</p>}
        <p className={compact ? "mt-1 text-[14.5px] leading-snug text-fg/80" : say}>{t(failTr(row.error ?? null).key, failTr(row.error ?? null).vars)}</p>
      </>
    ) : docs.length ? (
      <>
        {/* one line says how many; the names follow. On a card they run on as one short paragraph, so a card is 3 lines, not 6 */}
        <p className={say} data-testid="missing-count">{t("dash.d.missingN", { n: String(docs.length) })}</p>
        {compact ? (
          <ol className="mt-2.5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {names.map((d, i) => (
              <li key={`${i}${d}`} className="flex items-baseline gap-2 text-[15px] leading-snug text-fg [overflow-wrap:anywhere]">
                <span className="num w-5 shrink-0 font-semibold">{i + 1}.</span>
                <span className="min-w-0">{d}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[14px] leading-[1.45] text-fg/80 [overflow-wrap:anywhere] [text-wrap:pretty]">{names.join(" · ")}</p>
        )}
      </>
    ) : (
      <p className={say}>{t("dash.d.missingAny")}</p>
    );
    act = (
      <div className="grid gap-3">
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
        {/* named "Upload" + the vehicle no., so the buttons of several cards can be told apart without seeing them */}
        <button type="button" aria-labelledby={`${actId} ${titleId}`} aria-disabled={busy} onClick={() => { if (!busy) input.current?.click(); }} className={button}>
          {sending ? (
            <span id={actId} role="status" className="num font-mono text-[13.5px] font-medium">
              {t("dash.d.uploading", { n: String(sending.n), total: String(sending.total), pct: String(sending.pct) })}
            </span>
          ) : (
            <>
              <Upload />
              <span id={actId}>{t(row.status === "failed" ? "case.replace" : "dash.d.upload")}</span>
            </>
          )}
          {/* how much has gone up: a line of the scan blue along the button's bottom edge */}
          {sending && (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-scan transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `scaleX(${sending.pct / 100})` }}
            />
          )}
        </button>
        {/* R3-B01 / B06: always one line about the photo names: how many to check, "press 完成", or confirmed */}
        {(row.deskTotal ?? 0) > 0 && (
          <Link href={`/cases/${row.id}/photos`} className="btn-quiet !w-full sm:!w-auto" data-testid="photos-link">
            {row.photosDone && !row.deskConfirm ? <Tick className="h-4 w-4 text-go" /> : <Photo />}
            <span>{row.deskConfirm ? t("dash.d.photosN", { n: String(row.deskConfirm) }) : row.photosDone ? t("dash.d.photosDone") : t("dash.d.photosPress")}</span>
          </Link>
        )}
      </div>
    );
  } else if (row.status === "failed") {
    // our side failed: say so, with the reason, and offer Read again (one credit is not taken twice)
    need = <p className={say}>{t(failTr(row.error ?? null).key, failTr(row.error ?? null).vars)}</p>;
    act = (
      <button type="button" aria-labelledby={`${actId} ${titleId}`} onClick={() => void again()} aria-disabled={busy} className={button}>
        <span id={actId}>{t("case.retry")}</span>
      </button>
    );
  } else {
    // the photo names are waiting: the button opens this case on the naming desk
    need = <p className={say}>{t("dash.d.waiting")}</p>;
    act = (
      <Link href={`/cases/${row.id}/photos`} aria-labelledby={`${actId} ${titleId}`} className={button}>
        {row.photosDone && !row.deskConfirm ? <Tick className="h-4 w-4" /> : <Photo />}
        <span id={actId}>{row.deskConfirm ? t("dash.d.photosN", { n: String(row.deskConfirm) }) : row.photosDone ? t("dash.d.photosDone") : (row.deskTotal ?? 0) > 0 ? t("dash.d.photosPress") : t("dash.d.photos")}</span>
      </Link>
    );
  }

  // the case page: the same block, as the banner under the case's title (no second box, no second heading)
  if (compact) {
    return (
      <li className={`list-none border-b border-hair px-5 py-5 sm:px-8 ${sent ? "bg-gotint" : "bg-ambertint"}`} role={row.status === "failed" ? "alert" : "status"}>
        <h3 id={titleId} className="sr-only">{row.plate || t("dash.noPlate")}</h3>
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
          <div className="min-w-0 flex-1 basis-[280px]">{need}</div>
          {!sent && act && <div className="w-full sm:w-auto sm:min-w-[200px]">{act}</div>}
        </div>
        {err && !sent && <p role="alert" className="field-error mt-3">{err}</p>}
      </li>
    );
  }

  // no plate yet: the first file's name tells the cards apart (three cards all called "Not read yet" could not be told apart)
  const title = row.plate || row.firstFile;
  const meta = [row.carModel, row.createdAt ? whenOf(row.createdAt, lang) : ""].filter(Boolean).join(" · ");
  return (
    <li className="sheet flex min-w-0 max-w-full flex-col rounded-[3px] border border-hair bg-panel p-5 lg:p-6">
      <h3 id={titleId} className={`truncate leading-[1.15] text-fg ${row.plate ? "num font-mono text-[24px] font-medium tracking-[0.01em]" : "text-[19px] font-semibold"}`}>
        <Link href={`/cases/${row.id}`} className="underline-offset-4 hover:underline">
          {title || <span className="font-sans text-[20px] font-normal text-mute">{t("dash.noPlate")}</span>}
        </Link>
      </h3>
      {meta && <p className="mt-1 truncate text-[14px] leading-snug text-mute" suppressHydrationWarning>{meta}</p>}
      {/* what is needed, on amber with the amber edge (green once it has been sent): the one place on the card the eye should go.
          It is as tall as its words; the button stands on the card's bottom edge, so neighbouring buttons stay on one line. */}
      {need && <div className={`relative mt-4 flex flex-col justify-center overflow-hidden rounded-[3px] py-3 pl-[19px] pr-4 ${sent ? "bg-gotint" : "bg-ambertint"}`}>
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${sent ? "bg-go" : "bg-amber"}`} />
        {need}
      </div>}
      {!sent && act && <div className="mt-auto pt-4">{act}</div>}
      {err && !sent && <p role="alert" className="field-error mt-3">{err}</p>}
    </li>
  );
}
