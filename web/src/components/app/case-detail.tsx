"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadGuarded, UploadStalled } from "@/lib/upload-guard";
import { useT } from "@/components/lang-provider";
import { kindOf } from "@/lib/file-kind";
import { docKey, failTr, userFixable } from "@/lib/case-text";
import { accepted } from "./drop-zone";
import { MAX_FILE_BYTES, MAX_FILES, MAX_PDF_BYTES, MAX_TOTAL_BYTES } from "@/lib/upload-rules";
import { Photo, Tick, Upload } from "./marks";
import type { CaseRow } from "./case-table";

/** What a card has just sent: the missing files. */
export type Sent = "files";

/**
 * What a case needs from the user, as the banner under the case's title: in plain words the one thing that is needed, and the one button that does it.
 * A missing document is uploaded right here: choosing the files sends them, there is no second button.
 * `sent` comes from the page, which keeps the banner for a moment after the files went through, so the user sees they were received.
 */
/** `onPhotos`: the photo desk opens on the same page (the first page's line) instead of on its own page. */
export default function NeedCard({ row, orgId, sent, onSent, onPhotos }: { row: CaseRow; orgId: string; sent?: Sent; onSent: (id: string, what: Sent) => void; onPhotos?: () => void }) {
  const { t } = useT();
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
      if (r.status === 402) { setErr(t("new.noCredits")); return; } // a zip of several cars (or cars at different levels) was refunded: reading it again takes a credit
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
    if (!ok.length) { if (list.length) setErr(t("dash.d.badType")); return; }
    // the same limits the server checks, before anything is uploaded: one empty or too-big file would fail the whole send.
    // Nothing is sent then, so the note stays on this card (a partial send would close the card and hide it).
    const out = ok.filter((f) => f.size === 0 || f.size > MAX_FILE_BYTES || (kindOf(f) === "pdf" && f.size > MAX_PDF_BYTES));
    if (out.length) { setErr(t("dash.d.fixFirst", { name: out.map((f) => f.name).join(", "), mb: String(MAX_FILE_BYTES / 1048576), pdf: String(MAX_PDF_BYTES / 1048576) })); return; }
    if (ok.length > MAX_FILES) { setErr(t("new.tooMany", { max: String(MAX_FILES), n: String(ok.length) })); return; }
    const bytes = ok.reduce((n, f) => n + f.size, 0);
    if (bytes > MAX_TOTAL_BYTES) { setErr(t("new.tooMuch", { gb: String(MAX_TOTAL_BYTES / 1024 ** 3), size: `${(bytes / 1024 ** 3).toFixed(1)} GB` })); return; }
    void send(ok);
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
        <p className={say}>{t("case.h.failed")}</p>
        <p className="mt-1 text-[14.5px] leading-snug text-fg/80">{t(failTr(row.error ?? null).key, failTr(row.error ?? null).vars)}</p>
      </>
    ) : docs.length ? (
      <>
        {/* one line says how many, the names follow in two columns. The numbers run down the left column first, then the
            right one (owner 2026-11-22: 1, 2 on the left and 3, 4 on the right), not across */}
        <p className={say} data-testid="missing-count">{t("dash.d.missingN", { n: String(docs.length) })}</p>
        <ol className="mt-2.5 grid gap-x-8 gap-y-1.5 sm:grid-flow-col sm:grid-cols-2 sm:[grid-template-rows:repeat(var(--rows),auto)]" style={{ "--rows": Math.ceil(names.length / 2) } as React.CSSProperties} data-testid="missing-list">
          {names.map((d, i) => (
            <li key={`${i}${d}`} className="flex items-baseline gap-2 text-[15px] leading-snug text-fg [overflow-wrap:anywhere]">
              <span className="num w-5 shrink-0 font-semibold">{i + 1}.</span>
              <span className="min-w-0">{d}</span>
            </li>
          ))}
        </ol>
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
          (() => {
            const inner = (
              <>
                {row.photosDone && !row.deskConfirm ? <Tick className="h-4 w-4 text-go" /> : <Photo />}
                <span>{row.deskConfirm ? t("dash.d.photosN", { n: String(row.deskConfirm) }) : row.photosDone ? t("dash.d.photosDone") : t("dash.d.photosPress")}</span>
              </>
            );
            return onPhotos
              ? <button type="button" onClick={onPhotos} className="btn-quiet !w-full sm:!w-auto" data-testid="photos-link">{inner}</button>
              : <Link href={`/cases/${row.id}/photos`} className="btn-quiet !w-full sm:!w-auto" data-testid="photos-link">{inner}</Link>;
          })()
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
    const label = (
      <>
        {row.photosDone && !row.deskConfirm ? <Tick className="h-4 w-4" /> : <Photo />}
        <span id={actId}>{row.deskConfirm ? t("dash.d.photosN", { n: String(row.deskConfirm) }) : row.photosDone ? t("dash.d.photosDone") : (row.deskTotal ?? 0) > 0 ? t("dash.d.photosPress") : t("dash.d.photos")}</span>
      </>
    );
    // on the first page the desk opens in the line itself (onPhotos); elsewhere the button goes to the desk page
    act = onPhotos
      ? <button type="button" aria-labelledby={`${actId} ${titleId}`} onClick={onPhotos} className={button}>{label}</button>
      : <Link href={`/cases/${row.id}/photos`} aria-labelledby={`${actId} ${titleId}`} className={button}>{label}</Link>;
  }

  // no second box and no second heading: the banner sits right under the case's title
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
