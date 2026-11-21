"use client";
import { useEffect, useRef, useState } from "react";
import { uploadGuarded, UploadStalled } from "@/lib/upload-guard";
import { useT } from "@/components/lang-provider";
import DropZone, { accepted } from "@/components/app/drop-zone";
import { Cross, Tick } from "@/components/app/marks";
import ScanEdge from "@/components/scan-edge";
import { kindOf, type FileKind as Kind } from "@/lib/file-kind";
import { MAX_FILE_BYTES, MAX_PDF_BYTES } from "@/lib/upload-rules";
import { runPool } from "@/lib/pool";
import Link from "next/link";

const keyOf = (f: File) => `${f.name}:${f.size}`;
function sizeOf(n: number) {
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

const TAG: Record<Kind, string> = {
  bundle_zip: "border-ice bg-ice text-bay",
  pdf: "border-ice text-ice",
  photo: "border-hair text-mute",
};
const TAIL = 9; // characters of a long file name that always stay visible (the end + extension)

export default function NewCaseForm({ orgId }: { orgId: string }) {
  const { t } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1); // index of the file being uploaded; files.length = all up, creating the case
  const [msg, setMsg] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0); // how many chosen files were left out (wrong type)
  const [notes, setNotes] = useState<string[]>([]); // why some chosen files were left out (empty, too large)
  const [noCredit, setNoCredit] = useState(false);
  const [ups, setUps] = useState<Record<number, number>>({}); // per-file progress while several upload at once
  const ledger = useRef<HTMLUListElement>(null);

  // keep the file being uploaded in view inside the ledger


  // B11: leaving or reloading while files go up throws the upload away, so ask first (links inside the app too)
  useEffect(() => {
    if (!busy) return;
    const stop = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && a.target !== "_blank" && !a.href.startsWith("javascript:") && a.origin === location.origin && a.pathname !== location.pathname && !window.confirm(t("new.leave"))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", stop);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", stop); document.removeEventListener("click", click, true); };
  }, [busy, t]);

  function addFiles(list: File[]) {
    const typed = list.filter(accepted);
    const why: string[] = [];
    const ok = typed.filter((f) => {
      if (f.size === 0) { why.push(t("new.empty", { name: f.name })); return false; }
      if (f.size > MAX_FILE_BYTES || (kindOf(f) === "pdf" && f.size > MAX_PDF_BYTES)) { why.push(t("new.tooBig", { name: f.name, mb: String(MAX_FILE_BYTES / 1048576), pdf: String(MAX_PDF_BYTES / 1048576) })); return false; }
      return true;
    });
    setNotes(why.slice(0, 5));
    setSkipped(list.length - typed.length);
    if (!ok.length) return;
    setMsg(""); setFailed(null); setNoCredit(false);
    setFiles((cur) => {
      const seen = new Set(cur.map(keyOf));
      const next = [...cur];
      for (const f of ok) if (!seen.has(keyOf(f))) { seen.add(keyOf(f)); next.push(f); }
      return next;
    });
  }
  function remove(f: File) {
    setFiles((cur) => cur.filter((x) => keyOf(x) !== keyOf(f)));
    if (failed === keyOf(f)) { setFailed(null); setMsg(""); }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // a second click while uploading does nothing
    if (!files.some((f) => kindOf(f) !== "photo")) { setMsg(t("new.noDocs")); return; }
    setBusy(true); setMsg(""); setFailed(null); setSkipped(0); setNotes([]); setNoCredit(false); setUps({});
    let at = 0;
    try {
      // check the balance before a single byte goes up
      const pre = await fetch("/api/cases/credit");
      if (pre.status === 402) { setNoCredit(true); setStep(-1); setBusy(false); return; }
      const batchId = crypto.randomUUID();
      const done: { kind: Kind; url: string; name: string; size: number }[] = new Array(files.length);
      let finished = 0;
      setStep(0);
      await runPool(files.length, 3, async (i) => {
        const f = files[i]; at = i;
        const b = await uploadGuarded(`${orgId}/${batchId}/${f.name}`, f, (p) => setUps((u) => ({ ...u, [i]: p })));
        done[i] = { kind: kindOf(f), url: b.url, name: f.name, size: f.size };
        setUps((u) => ({ ...u, [i]: 100 })); finished++; setStep(finished);
      });
      at = files.length; setStep(files.length);
      const r = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: done }) });
      if (r.status === 402) { setNoCredit(true); setStep(-1); setBusy(false); return; }
      if (!r.ok) throw new Error(t("new.fail"));
      const { id } = (await r.json()) as { id: string };
      window.location.href = `/cases/${id}`; // Claude starts reading the files by itself
    } catch (e) {
      const inUpload = at < files.length;
      setMsg(e instanceof UploadStalled ? t("new.stalled") : inUpload ? t("new.failUpload") : t("new.fail"));
      setFailed(inUpload ? keyOf(files[at]) : null);
      setStep(-1); setBusy(false);
    }
  }

  const n = files.length;
  const total = files.reduce((s, f) => s + f.size, 0);

  return (
    <form onSubmit={onSubmit} aria-busy={busy} className="relative mx-auto w-full max-w-[720px]">
      <ScanEdge />
      <div className="sheet rounded-[3px] border border-hair bg-panel">
        <div className="flex h-[60px] items-center border-b border-hair px-5 sm:h-[68px] sm:px-8">
          <h1 className="display-2 text-[24px] text-fg sm:text-[28px]">{t("new.title")}</h1>
        </div>

        <div className="grid gap-7 px-5 py-6 sm:px-8 sm:py-8">
          <div className="rounded-[3px] border border-hair bg-panel2 px-4 py-3">
            <p className="label">{t("new.checkTitle")}</p>
            <ul className="mt-2 grid gap-1 text-[14px] text-mute sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => <li key={i} className="flex gap-2"><span aria-hidden="true">•</span>{t(`new.check${i}`)}</li>)}
            </ul>
          </div>
          <div className="field">
            <div className="flex items-baseline justify-between gap-4">
              <label className="label" htmlFor="case-files">{t("new.files")}</label>
              {n > 0 && (
                <p className="num text-[14px] leading-none text-mute" aria-live="polite">
                  {n} {t(n === 1 ? "new.selectedOne" : "new.selected")} · {sizeOf(total)}
                </p>
              )}
            </div>

            <DropZone
              inputId="case-files"
              compact={n > 0}
              disabled={busy}
              onFiles={addFiles}
              title={t("new.drop")}
              hint={t("new.dropHint")}
              browse={t("new.browse")}
              addMore={t("new.addMore")}
            />
            <p className="hint">{t("new.limit", { mb: String(MAX_FILE_BYTES / 1048576), pdf: String(MAX_PDF_BYTES / 1048576) })}</p>
            {notes.map((x) => <p key={x} className="hint" role="status">{x}</p>)}
            {skipped > 0 && <p className="hint" role="status">{skipped === 1 ? t("new.skippedOne") : t("new.skippedMany", { n: String(skipped) })}</p>}

            {n > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] text-mute">
                <p className="num">{[`${files.filter((f) => kindOf(f) === "bundle_zip").length ? files.filter((f) => kindOf(f) === "bundle_zip").length + " zip" : ""}`, `${files.filter((f) => kindOf(f) === "pdf").length ? files.filter((f) => kindOf(f) === "pdf").length + " PDF" : ""}`, `${files.filter((f) => kindOf(f) === "photo").length ? files.filter((f) => kindOf(f) === "photo").length + " " + t("new.kind.photo") : ""}`].filter(Boolean).join(" · ")}</p>
                {!busy && <button type="button" className="btn-quiet" onClick={() => { setFiles([]); setNotes([]); setMsg(""); setFailed(null); }}>{t("new.removeAll")}</button>}
              </div>
            )}

            {n > 0 && (
              <ul ref={ledger} tabIndex={0} aria-label={t("new.files")} className="app-scroll mt-1 max-h-[218px] sm:max-h-[266px] overflow-y-auto overscroll-contain rounded-[3px] border border-hair focus-visible:outline-offset-[-2px]">
                {files.map((f, i) => {
                  const k = keyOf(f);
                  const kind = kindOf(f);
                  const cut = f.name.length > TAIL + 8 ? f.name.length - TAIL : f.name.length;
                  const pi = ups[i]; const state = failed === k ? "failed" : !busy ? "idle" : pi === 100 ? "done" : pi != null ? "up" : "wait";
                  return (
                    <li key={k} className={`relative flex h-12 items-center gap-3 border-b border-hair pl-3 last:border-b-0 sm:pl-4 ${state === "failed" ? "bg-ambertint" : ""}`}>
                      <span className={`note flex h-[22px] w-[58px] shrink-0 items-center justify-center rounded-[2px] border !text-[11.5px] font-medium ${TAG[kind]}`}>
                        {t(`new.kind.${kind}`)}
                      </span>
                      <span className={`flex min-w-0 flex-1 text-[15px] ${state === "wait" ? "text-mute" : "text-fg"}`} title={f.name}>
                        <span className="truncate whitespace-pre">{f.name.slice(0, cut)}</span>
                        <span className="shrink-0 whitespace-pre">{f.name.slice(cut)}</span>
                      </span>
                      <span className="num note flex shrink-0 items-center gap-2.5 !text-[12.5px] text-mute">
                        {state === "failed" && <span className="h-[9px] w-[9px] rounded-full bg-amber" aria-hidden="true" />}
                        {state === "up" ? `${Math.round(pi ?? 0)}%` : sizeOf(f.size)}
                      </span>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                        {state === "idle" || state === "failed" ? (
                          <button
                            type="button"
                            onClick={() => remove(f)}
                            aria-label={`${t("new.remove")} ${f.name}`}
                            title={t("new.remove")}
                            className="flex h-11 w-11 items-center justify-center text-mute transition-colors duration-150 hover:text-ice"
                          >
                            <Cross />
                          </button>
                        ) : state === "done" ? (
                          <>
                            <Tick className="h-[15px] w-[15px] text-ice" />
                            <span className="sr-only">{t("status.done")}</span>
                          </>
                        ) : state === "up" ? (
                          <>
                            <span className="h-[9px] w-[9px] rounded-full bg-amber" aria-hidden="true" />
                            <span className="sr-only">{t("new.uploading")}</span>
                          </>
                        ) : (
                          <span className="h-[9px] w-[9px] rounded-full border border-hair" aria-hidden="true" />
                        )}
                      </span>
                      {state === "up" && (
                        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-hairsoft" aria-hidden="true">
                          <span className="block h-full bg-scan transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pi ?? 0}%` }} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* one button at a time: "Choose files" in the empty drop zone, then "Upload case" once there is something to upload */}
        {noCredit && (
          <div role="alert" className="border-t border-hair bg-ambertint px-5 py-4 text-[15px] text-fg sm:px-8">
            <p>{t("new.noCredits")}</p>
            <Link href="/billing" className="mt-1 inline-block font-semibold underline">{t("new.noCreditsBuy")}</Link>
          </div>
        )}
        {(n > 0 || msg) && (
          <div className="border-t border-hair px-5 py-5 sm:px-8">
            {msg && <p role="alert" className="field-error mb-4">{msg}</p>}
            {n > 0 && (
              <div className="flex justify-end">
                <button className={`btn-primary w-full sm:w-auto sm:min-w-[184px] ${busy ? "cursor-progress !opacity-100 hover:!bg-ice" : ""}`} disabled={busy}>
                  {busy ? <span className="num">{t("new.uploading")} {Math.max(step, 0)}/{n}</span> : t("new.submit")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
