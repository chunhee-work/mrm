"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { useT } from "@/components/lang-provider";
import DropZone, { accepted } from "@/components/app/drop-zone";
import { Crop, Cross, Tick } from "@/components/app/marks";

type Kind = "bundle_zip" | "pdf" | "photo";
function kindOf(f: File): Kind {
  if (/\.zip$/i.test(f.name)) return "bundle_zip";
  if (/\.pdf$/i.test(f.name)) return "pdf";
  return "photo";
}
const keyOf = (f: File) => `${f.name}:${f.size}`;
function sizeOf(n: number) {
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

const TAG: Record<Kind, string> = {
  bundle_zip: "border-ink bg-ink text-white",
  pdf: "border-ink text-ink",
  photo: "border-hair text-mute",
};
const TAIL = 9; // characters of a long file name that always stay visible (the end + extension)

export default function NewCaseForm({ orgId }: { orgId: string }) {
  const { t } = useT();
  const [plate, setPlate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1); // index of the file being uploaded; files.length = all up, creating the case
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const ledger = useRef<HTMLUListElement>(null);

  // keep the file being uploaded in view inside the ledger
  useEffect(() => {
    if (step >= 0) ledger.current?.children[step]?.scrollIntoView({ block: "nearest" });
  }, [step]);

  function addFiles(list: File[]) {
    const ok = list.filter(accepted);
    setSkipped(ok.length < list.length);
    if (!ok.length) return;
    setMsg(""); setFailed(null);
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
    e.preventDefault(); setBusy(true); setMsg(""); setFailed(null); setSkipped(false);
    let at = 0;
    try {
      const plate = String(new FormData(e.currentTarget).get("plate"));
      const batchId = crypto.randomUUID();
      const done = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]; at = i; setStep(i); setPct(0);
        const b = await upload(`${orgId}/${batchId}/${f.name}`, f, {
          access: "private", handleUploadUrl: "/api/upload", multipart: f.size > 20e6,
          onUploadProgress: (p) => setPct(p.percentage),
        });
        done.push({ kind: kindOf(f), url: b.url, name: f.name, size: f.size });
      }
      at = files.length; setStep(files.length);
      const r = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plate, files: done }) });
      if (!r.ok) throw new Error(t("new.fail"));
      const { id } = (await r.json()) as { id: string };
      window.location.href = `/cases/${id}`; // Claude starts reading the files by itself
    } catch {
      const inUpload = at < files.length;
      setMsg(inUpload ? t("new.failUpload") : t("new.fail"));
      setFailed(inUpload ? keyOf(files[at]) : null);
      setStep(-1); setBusy(false);
    }
  }

  const n = files.length;
  const total = files.reduce((s, f) => s + f.size, 0);
  const ready = plate.trim().length > 0 && n > 0;

  return (
    <form onSubmit={onSubmit} aria-busy={busy} className="relative mx-auto w-full max-w-[720px]">
      <Crop />
      <div className="rounded-[4px] border border-hair bg-white">
        <div className="flex h-[60px] items-center border-b border-hair px-5 sm:h-[68px] sm:px-8">
          <h1 className="display-2 text-[24px] text-ink sm:text-[28px]">{t("new.title")}</h1>
        </div>

        <div className="grid gap-7 px-5 py-6 sm:px-8 sm:py-8">
          <div className="field sm:max-w-[300px]">
            <label className="label" htmlFor="plate">{t("new.plate")}</label>
            <input
              id="plate"
              name="plate"
              required
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              readOnly={busy}
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className="input font-mono font-medium tracking-[0.02em] read-only:bg-paper read-only:text-mute"
            />
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
            {skipped && <p className="hint" role="status">{t("new.onlyTypes")}</p>}

            {n > 0 && (
              <ul ref={ledger} tabIndex={0} aria-label={t("new.files")} className="app-scroll mt-1 max-h-[218px] sm:max-h-[266px] overflow-y-auto overscroll-contain rounded-[4px] border border-hair focus-visible:outline-offset-[-2px]">
                {files.map((f, i) => {
                  const k = keyOf(f);
                  const kind = kindOf(f);
                  const cut = f.name.length > TAIL + 8 ? f.name.length - TAIL : f.name.length;
                  const state = failed === k ? "failed" : !busy ? "idle" : i < step ? "done" : i === step ? "up" : "wait";
                  return (
                    <li key={k} className={`relative flex h-12 items-center gap-3 border-b border-hair pl-3 last:border-b-0 sm:pl-4 ${state === "failed" ? "bg-signaltint" : ""}`}>
                      <span className={`note flex h-[22px] w-[58px] shrink-0 items-center justify-center rounded-[2px] border !text-[11.5px] font-medium ${TAG[kind]}`}>
                        {t(`new.kind.${kind}`)}
                      </span>
                      <span className={`flex min-w-0 flex-1 text-[15px] ${state === "wait" ? "text-mute" : "text-deep"}`} title={f.name}>
                        <span className="truncate whitespace-pre">{f.name.slice(0, cut)}</span>
                        <span className="shrink-0 whitespace-pre">{f.name.slice(cut)}</span>
                      </span>
                      <span className="num note flex shrink-0 items-center gap-2.5 !text-[12.5px] text-mute">
                        {state === "failed" && <span className="h-[9px] w-[9px] rounded-full bg-signal" aria-hidden="true" />}
                        {state === "up" ? `${Math.round(pct)}%` : sizeOf(f.size)}
                      </span>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                        {state === "idle" || state === "failed" ? (
                          <button
                            type="button"
                            onClick={() => remove(f)}
                            aria-label={`${t("new.remove")} ${f.name}`}
                            title={t("new.remove")}
                            className="flex h-11 w-11 items-center justify-center text-mute transition-colors duration-150 hover:text-ink"
                          >
                            <Cross />
                          </button>
                        ) : state === "done" ? (
                          <>
                            <Tick className="h-[15px] w-[15px] text-ink" />
                            <span className="sr-only">{t("status.done")}</span>
                          </>
                        ) : state === "up" ? (
                          <>
                            <span className="h-[9px] w-[9px] rounded-full bg-signal" aria-hidden="true" />
                            <span className="sr-only">{t("new.uploading")}</span>
                          </>
                        ) : (
                          <span className="h-[9px] w-[9px] rounded-full border border-hair" aria-hidden="true" />
                        )}
                      </span>
                      {state === "up" && (
                        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-hairsoft" aria-hidden="true">
                          <span className="block h-full bg-ink transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-hair px-5 py-5 sm:px-8">
          {msg && <p role="alert" className="field-error mb-4">{msg}</p>}
          <div className="flex flex-col gap-x-7 gap-y-1 sm:flex-row sm:items-center">
            <button className={`btn-primary sm:min-w-[184px] ${busy ? "cursor-progress !opacity-100 hover:!bg-ink" : ""}`} disabled={busy || !ready}>
              {busy ? <span className="num">{t("new.uploading")} {Math.min(step + 1, n)}/{n}</span> : t("new.submit")}
            </button>
            {busy ? (
              <span className="btn-quiet justify-center opacity-40 !no-underline" aria-disabled="true">{t("new.cancel")}</span>
            ) : (
              <Link href="/dashboard" className="btn-quiet justify-center">{t("new.cancel")}</Link>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
