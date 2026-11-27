"use client";
import WorkshopPicker, { type WorkshopOpt } from "@/components/app/workshop-picker";
import { useEffect, useRef, useState } from "react";
import { uploadGuarded, UploadStalled } from "@/lib/upload-guard";
import { useT } from "@/components/lang-provider";
import DropZone, { accepted } from "@/components/app/drop-zone";
import { Cross, Tick } from "@/components/app/marks";
import ScanEdge from "@/components/scan-edge";
import { kindOf, type FileKind as Kind } from "@/lib/file-kind";
import { MAX_FILE_BYTES, MAX_FILES, MAX_PDF_BYTES, MAX_TOTAL_BYTES } from "@/lib/upload-rules";
import { runPool } from "@/lib/pool";
import { headOf, looksLikePhoto, hasPdfName, MAX_VEHICLES, platesAnywhere, vehicleLayout, zipNames } from "@/lib/peek-files";
import Link from "next/link";
import { zipWhyKey } from "@/lib/case-text";
import { DROPPED_PARAM, takeDropped } from "@/lib/dropped-files";
import { useRouter } from "next/navigation";

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

/**
 * Embedded on the first page (owner 2026-11-27: "all done in the first page, never jump to others pages"): the same form, with
 * the files the user picked or dropped there (`initial`, or "lost" when a hand-off from another page found nothing). When the
 * case is made it says so through `onMade` and the first page lists it; nothing navigates away.
 */
export type Embed = { initial: File[] | "lost"; onMade: (id: string | null) => void; onClose: () => void; onBusy?: (busy: boolean) => void };

export default function NewCaseForm({ orgId, workshops = [], embed }: { orgId: string; workshops?: WorkshopOpt[]; embed?: Embed }) {
  const router = useRouter();
  const [ws, setWs] = useState(1); // which workshop the case belongs to (only asked when the account has two or more)
  const wsBody = workshops.length >= 2 && ws !== 1 ? { workshop: ws } : {};
  const { t } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1); // index of the file being uploaded; files.length = all up, creating the case
  const [msg, setMsg] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]); // names of chosen files left out (wrong type)
  const [showPhotos, setShowPhotos] = useState(false); // many photos fold into one row (R2-U07)
  const [notes, setNotes] = useState<string[]>([]); // why some chosen files were left out (empty, too large)
  const [noCredit, setNoCredit] = useState(false);
  const [ups, setUps] = useState<Record<number, number>>({}); // per-file progress while several upload at once
  const ledger = useRef<HTMLUListElement>(null);
  const zipPdf = useRef<Map<string, boolean | null>>(new Map()); // R2-B10: does each chosen zip hold a PDF (null: cannot tell)
  const zipMixed = useRef<Map<string, boolean>>(new Map()); // several cars and other files beside them: refused before upload
  const zipLayout = useRef<Map<string, boolean>>(new Map()); // car folders at different levels: refused before upload
  const zipCars = useRef<Map<string, string[] | null>>(new Map()); // vehicle folders of each chosen zip (null: its file list could not be read)
  const leaving = useRef(false); // R2-B01: set once the case exists, so our own redirect never trips the leave guard
  const carsOf = (f: File) => (kindOf(f) === "bundle_zip" ? zipCars.current.get(keyOf(f))?.length ?? 0 : 0); // vehicles in a zip, 0 if none or unknown
  // false once the page is gone (Back during a send): the files already up stay, but no case is made and no credit spent
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // keep the file being uploaded in view inside the ledger


  // files dropped on the first page arrive here, are checked like any chosen file, and go up at once (owner 2026-11-27:
  // the drop was the decision, no second press of Upload). Only the visit the first page sent here (?dropped=1) takes them.
  const started = useRef(false); // the files the first page handed over are taken once (React may run this effect twice)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let f: File[];
    if (embed) {
      if (embed.initial === "lost") { setMsg(t("new.dropLost")); return; }
      f = embed.initial;
    } else {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(DROPPED_PARAM)) return;
      url.searchParams.delete(DROPPED_PARAM);
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
      f = takeDropped();
    }
    if (!f.length) { setMsg(t("new.dropLost")); return; }
    // the send waits for a press of Upload when the user has something to read first: a file was left out (wrong type,
    // empty, too big), or a zip holds several cars and will make several cases. Until then the drop zone is closed (busy),
    // so nothing dropped meanwhile is listed but left out of the send.
    setBusy(true);
    void addFiles(f).then(({ ok, leftOut }) => {
      setBusy(false);
      // a zip whose list could not be read may still hold several cars, so it waits too
      const unsure = ok.some((x) => carsOf(x) > 1 || (kindOf(x) === "bundle_zip" && zipCars.current.get(keyOf(x)) === null));
      if (ok.length && !leftOut && !unsure) void send(ok);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the first page turns its own drop and New case off while this form uploads
  const onBusy = embed?.onBusy;
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);

  // B11: leaving or reloading while files go up throws the upload away, so ask first (links inside the app too)
  useEffect(() => {
    if (!busy) return;
    const stop = (e: BeforeUnloadEvent) => { if (leaving.current) return; e.preventDefault(); e.returnValue = ""; };
    const click = (e: MouseEvent) => {
      if (leaving.current) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && a.target !== "_blank" && !a.href.startsWith("javascript:") && a.origin === location.origin && a.pathname + a.search !== location.pathname + location.search && !window.confirm(t("new.leave"))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", stop);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", stop); document.removeEventListener("click", click, true); };
  }, [busy, t]);

  // returns the files that passed (so a drop can send exactly those) and whether a "left out" note is now shown
  async function addFiles(list: File[]): Promise<{ ok: File[]; leftOut: boolean }> {
    const typed = list.filter(accepted);
    const why: string[] = [];
    // R2-B10: what is inside counts, not the name: a text file called .jpg is left out, and a zip is looked into
    const fake = new Set<File>();
    await Promise.all(typed.map(async (f) => {
      const k = kindOf(f);
      if (k === "photo" && f.size > 0 && !looksLikePhoto(await headOf(f))) fake.add(f);
      if (k === "bundle_zip" && f.size > 0) {
        const names = await zipNames(f);
        zipPdf.current.set(keyOf(f), names ? hasPdfName(names) : null);
        if (names) { const l = vehicleLayout(names); zipCars.current.set(keyOf(f), l.cars.map((p) => p.slice(0, -1).split("/").pop() as string)); zipMixed.current.set(keyOf(f), l.cars.length > 1 && l.extras.length > 0); zipLayout.current.set(keyOf(f), l.cars.length < 2 && platesAnywhere(names) > 1); }
        else zipCars.current.set(keyOf(f), null);
      }
    }));
    const ok = typed.filter((f) => {
      if (fake.has(f)) { why.push(t("new.notPhoto", { name: f.name })); return false; }
      if (f.size === 0) { why.push(t("new.empty", { name: f.name })); return false; }
      if (f.size > MAX_FILE_BYTES || (kindOf(f) === "pdf" && f.size > MAX_PDF_BYTES)) { why.push(t("new.tooBig", { name: f.name, mb: String(MAX_FILE_BYTES / 1048576), pdf: String(MAX_PDF_BYTES / 1048576) })); return false; }
      return true;
    });
    setNotes(why.slice(0, 5));
    const skip = list.filter((f) => !accepted(f)).map((f) => f.name);
    setSkipped(skip);
    const leftOut = why.length > 0 || skip.length > 0;
    if (!ok.length) return { ok: [], leftOut };
    setMsg(""); setFailed(null); setNoCredit(false);
    setFiles((cur) => {
      const seen = new Set(cur.map(keyOf));
      const next = [...cur];
      for (const f of ok) if (!seen.has(keyOf(f))) { seen.add(keyOf(f)); next.push(f); }
      return next;
    });
    return { ok: ok.filter((f, i) => ok.findIndex((g) => keyOf(g) === keyOf(f)) === i), leftOut };
  }
  function remove(f: File) {
    setFiles((cur) => cur.filter((x) => keyOf(x) !== keyOf(f)));
    if (failed === keyOf(f)) { setFailed(null); setMsg(""); }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(files);
  }

  // the list is passed in (not read from state) so a drop can send right after addFiles, before React re-renders
  async function send(files: File[]) {
    if (busy) return; // a second click while uploading does nothing
    if (!files.some((f) => kindOf(f) === "pdf" || (kindOf(f) === "bundle_zip" && zipPdf.current.get(keyOf(f)) !== false))) {
      const photoZip = files.find((f) => kindOf(f) === "bundle_zip");
      setMsg(photoZip ? t("new.zipNoPdf", { name: photoZip.name }) : t("new.noDocs")); return;
    }
    const multi = files.find((f) => carsOf(f) > 1);
    if (multi && files.length > 1) { setMsg(t("new.zipMultiAlone", { name: multi.name })); return; }
    if (multi && zipCars.current.get(keyOf(multi))!.length > MAX_VEHICLES) { setMsg(t("case.err.zip_too_many_cars")); return; }
    if (multi && zipMixed.current.get(keyOf(multi))) { setMsg(t("case.err.zip_mixed")); return; } // a split would leave those files out
    { const lay = files.find((f) => zipLayout.current.get(keyOf(f))); if (lay) { setMsg(t("case.err.zip_layout")); return; } } // never one case of several cars
    // a zip alone whose file list the browser could not read (zip64, a damaged list) may still hold several cars: the server
    // looks first, and when it is not a multi-car zip it becomes one ordinary case below
    const unknown = !multi && files.length === 1 && kindOf(files[0]) === "bundle_zip" && zipCars.current.get(keyOf(files[0])) === null;
    // the server refuses more files or more bytes than this; say so now instead of after everything went up
    if (files.length > MAX_FILES) { setMsg(t("new.tooMany", { max: String(MAX_FILES), n: String(files.length) })); return; }
    const bytes = files.reduce((s, f) => s + f.size, 0);
    if (bytes > MAX_TOTAL_BYTES) { setMsg(t("new.tooMuch", { gb: String(MAX_TOTAL_BYTES / 1024 ** 3), size: sizeOf(bytes) })); return; }
    setBusy(true); setMsg(""); setFailed(null); setSkipped([]); setNotes([]); setNoCredit(false); setUps({});
    let uploading = true;
    let bad = -1; // the file whose upload failed (three go up at once, so it is caught per file, not "the last one started")
    try {
      // check the balance before a single byte goes up
      const pre = await fetch(`/api/cases/credit${multi ? `?n=${zipCars.current.get(keyOf(multi))!.length}&zip=${encodeURIComponent(multi.name)}&size=${multi.size}` : ""}`);
      if (pre.status === 403) { if (embed) { setBusy(false); setStep(-1); router.refresh(); embed.onClose(); return; } leaving.current = true; window.location.assign("/dashboard"); return; } // details not filled in: the front page asks for them
      if (pre.status === 402) { setNoCredit(true); setStep(-1); setBusy(false); return; }
      // a split needs the count of cars still to make: when the check itself failed, do not send a large zip up for nothing
      if (multi && !pre.ok) { setMsg(t("new.fail")); setStep(-1); setBusy(false); return; }
      if (!alive.current) return;
      const batchId = crypto.randomUUID();
      const done: { kind: Kind; url: string; name: string; size: number }[] = new Array(files.length);
      let finished = 0;
      setStep(0);
      await runPool(files.length, 3, async (i) => {
        const f = files[i];
        if (!alive.current) throw new Error("left"); // the page is gone: start no more uploads
        try {
          const b = await uploadGuarded(`${orgId}/${batchId}/${f.name}`, f, (p) => setUps((u) => ({ ...u, [i]: p })));
          done[i] = { kind: kindOf(f), url: b.url, name: f.name, size: f.size };
        } catch (e) { if (bad < 0) bad = i; throw e; }
        setUps((u) => ({ ...u, [i]: 100 })); finished++; setStep(finished);
      });
      uploading = false; setStep(files.length);
      if (!alive.current) return; // the user left while the files went up
      if (multi || unknown) { // one zip, several vehicles: the server makes one case per vehicle
        // a lost connection does not stop the server: cars may be made, so the message is the split one, not "nothing happened"
        const sp = await fetch("/api/cases/split", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...done[0], fallback: unknown, ...wsBody }) })
          .catch(() => null);
        if (!sp) { setMsg(t("new.splitFail")); setStep(-1); setBusy(false); return; }
        const j = sp.ok ? null : ((await sp.json().catch(() => ({}))) as { error?: string; why?: string });
        // several cars in a zip the browser could not read: nothing made or charged; the cars are now known, so the page shows
        // them with their price and the next press of Upload sends it as a multi-car zip
        const found = (j as { cars?: unknown } | null)?.cars;
        if (unknown && sp.status === 409 && j?.error === "cars" && Array.isArray(found) && found.length > 1) {
          zipCars.current.set(keyOf(files[0]), found.map(String)); zipPdf.current.set(keyOf(files[0]), true);
          setMsg(t("new.zipCarsFound")); setStep(-1); setBusy(false); return;
        }
        if (!(unknown && sp.status === 422 && j?.error === "empty")) { // "empty": not a multi-car zip, so it is one ordinary case
          // cases the rollback could not undo are in the case list: say so, whatever else went wrong
          if (!sp.ok && (j as { kept?: number } | null)?.kept) {
            const why = j?.why ? t(zipWhyKey(j.why)) : sp.status === 402 ? t("new.noCredits") : ""; // the reason first, then what was kept
            setMsg(why ? `${why} ${t("new.splitFail")}` : t("new.splitFail")); setStep(-1); setBusy(false); return;
          }
          if (sp.status === 402) { setNoCredit(true); setStep(-1); setBusy(false); return; }
          if (sp.status === 403) { if (embed) { setBusy(false); setStep(-1); router.refresh(); embed.onClose(); return; } leaving.current = true; window.location.assign("/dashboard"); return; } // details not filled in: nothing was made
          if (sp.status === 409) { setMsg(t("new.splitBusy")); setStep(-1); setBusy(false); return; }
          // 400/401/502: no case was made; 500 with nothing kept: all were rolled back; else (time-out, kept cases) some cars may be made
          const undone = sp.status === 400 || sp.status === 401 || sp.status === 502 || (sp.status === 500 && j?.error === "failed" && !(j as { kept?: number }).kept);
          if (!sp.ok) { setMsg(j?.why ? t(zipWhyKey(j.why)) : undone ? t(sp.status === 500 ? "new.splitUndone" : "new.fail") : t("new.splitFail")); setStep(-1); setBusy(false); return; }
          if (!alive.current) return; // left meanwhile: the cases exist, but the user is not pulled back
          leaving.current = true;
          if (embed) { setBusy(false); embed.onMade(null); return; } // already on the first page: it lists the new cases
          window.location.href = "/dashboard"; // the new cases are listed there and start reading by themselves
          return;
        }
      }
      if (!alive.current) return; // left while the split looked at a zip it then handed back (`empty`): no case, no credit
      const r = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: done, ...wsBody }) });
      if (r.status === 402) { setNoCredit(true); setStep(-1); setBusy(false); return; }
      if (!r.ok) throw new Error(t("new.fail"));
      const { id } = (await r.json()) as { id: string };
      if (!alive.current) return; // left meanwhile: the case exists, but the user is not pulled back
      leaving.current = true;
      if (embed) { setBusy(false); embed.onMade(id); return; } // the first page lists it; nothing navigates away
      window.location.href = `/cases/${id}`; // Claude starts reading the files by itself
    } catch (e) {
      setMsg(e instanceof UploadStalled ? t("new.stalled") : uploading ? t("new.failUpload") : t("new.fail"));
      setFailed(bad >= 0 ? keyOf(files[bad]) : null);
      setStep(-1); setBusy(false);
    }
  }

  const n = files.length;
  const total = files.reduce((s, f) => s + f.size, 0);
  const nZip = files.filter((f) => kindOf(f) === "bundle_zip").length;
  const nPdf = files.filter((f) => kindOf(f) === "pdf").length;
  const nPhoto = files.filter((f) => kindOf(f) === "photo").length;
  const fold = nPhoto > 5 && !showPhotos; // many photos: one row "60 photos" instead of 60 rows
  const sent = files.reduce((sum, f, i) => sum + (f.size * Math.min(100, ups[i] ?? 0)) / 100, 0);

  return (
    <form onSubmit={onSubmit} aria-busy={busy} className={`relative w-full max-w-[720px] ${embed ? "" : "mx-auto"}`} data-testid={embed ? "home-upload" : undefined}>
      {!embed && <ScanEdge />}
      <div className="sheet rounded-[3px] border border-hair bg-panel">
        <div className="flex h-[60px] items-center border-b border-hair px-5 sm:h-[68px] sm:px-8">
          {embed
            ? <h2 className="display-3 text-[20px] text-fg sm:text-[22px]">{t("new.title")}</h2>
            : <h1 className="display-2 text-[24px] text-fg sm:text-[28px]">{t("new.title")}</h1>}
          {embed && !busy && (
            <button type="button" onClick={embed.onClose} aria-label={t("new.close")} title={t("new.close")} data-testid="home-upload-close"
              className="ml-auto flex h-11 w-11 items-center justify-center text-mute transition-colors duration-150 hover:text-fg"><Cross /></button>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-7 px-5 py-6 sm:px-8 sm:py-8">
          {workshops.length >= 2 && (
            <div className="field min-w-0"><span className="label">{t("pf.caseWs")}</span><WorkshopPicker workshops={workshops} value={ws} onChange={setWs} disabled={busy} testid="new-ws" /></div>
          )}
          <div className="field min-w-0 grid-cols-[minmax(0,1fr)]">
            {/* the page has one job, so the place to put the files comes first; its name is the page title */}
            <label className="sr-only" htmlFor="case-files">{t("new.files")}</label>

            <DropZone
              inputId="case-files"
              compact={n > 0}
              disabled={busy}
              onFiles={(l) => void addFiles(l)}
              title={t("new.drop")}
              hint={t("new.dropHint")}
              browse={t("new.browse")}
              addMore={t("new.addMore")}
            />
            <p className="hint">{t("new.limit", { mb: String(MAX_FILE_BYTES / 1048576), pdf: String(MAX_PDF_BYTES / 1048576) })}</p>
            {/* what to put in (owner 2026-11-22): the box with its title and a dotted list, as it was. On a phone one item per
                line; on a wider screen the items run on after each other (each still with its dot), so the box is 2 or 3 lines
                tall, not 5. It sits under the drop zone, which comes first. */}
            {n === 0 && (
              <div className="mt-1 rounded-[3px] border border-hair bg-panel2 px-4 py-3" data-testid="new-check">
                <p className="label">{t("new.checkTitle")}</p>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-[14px] text-mute sm:flex sm:flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => <li key={i} className="flex min-w-0 gap-2"><span aria-hidden="true">•</span><span className="min-w-0 [overflow-wrap:anywhere]">{t(`new.check${i}`)}</span></li>)}
                </ul>
              </div>
            )}
            {(notes.length > 0 || skipped.length > 0) && (
              <div role="status" className="rounded-[3px] border border-hair bg-ambertint px-4 py-3 text-[14px] text-fg">
                <p className="font-semibold">{t("new.leftOutTitle")}</p>
                <ul className="mt-1 grid gap-1">
                  {notes.map((x) => <li key={x}>{x}</li>)}
                  {skipped.slice(0, 8).map((x) => <li key={x}>{t("new.wrongType", { name: x })}</li>)}
                  {skipped.length > 8 && <li>{t("new.skippedMany", { n: String(skipped.length - 8) })}</li>}
                </ul>
              </div>
            )}

            {n > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] text-mute">
                <p className="num" aria-live="polite">{[nZip ? `${nZip} zip` : "", nPdf ? `${nPdf} PDF` : "", nPhoto ? t(nPhoto === 1 ? "new.photosOne" : "new.photosN", { n: String(nPhoto) }) : "", sizeOf(total)].filter(Boolean).join(" · ")}</p>
                {!busy && <button type="button" className="btn-quiet" onClick={() => { setFiles([]); setNotes([]); setMsg(""); setFailed(null); }}>{t("new.removeAll")}</button>}
              </div>
            )}

            {n === 1 && (zipCars.current.get(keyOf(files[0]))?.length ?? 0) > 1 && (
              <p role="status" className="text-[14px] text-fg">{t("new.zipSplit", { name: files[0].name, n: String(zipCars.current.get(keyOf(files[0]))!.length), list: zipCars.current.get(keyOf(files[0]))!.slice(0, 4).join(", ") + (zipCars.current.get(keyOf(files[0]))!.length > 4 ? "…" : "") })}</p>
            )}

            {n > 0 && busy && (
              <div aria-live="polite">
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-hairsoft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((sent / Math.max(total, 1)) * 100)}>
                  <div className="h-full bg-scan transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(sent / Math.max(total, 1)) * 100}%` }} />
                </div>
                <p className="num mt-1 text-[13px] text-mute">{sizeOf(sent)} / {sizeOf(total)} · {Math.max(step, 0)}/{n}</p>
              </div>
            )}

            {n > 0 && (
              <ul ref={ledger} aria-label={t("new.files")} className="mt-1 rounded-[3px] border border-hair">
                {fold && (
                  <li className="flex h-12 items-center gap-3 border-b border-hair pl-3 sm:pl-4">
                    <button type="button" className="btn-quiet !h-11" aria-expanded={false} onClick={() => setShowPhotos(true)}>▸ {t("new.photosN", { n: String(nPhoto) })}</button>
                  </li>
                )}
                {files.map((f, i) => {
                  if (fold && kindOf(f) === "photo") return null;
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
