"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

export type CaseFile = { id: number; name: string; size: number };

const ext = (n: string) => n.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const kindOf = (n: string): "img" | "pdf" | "other" => {
  const e = ext(n);
  return ["jpg", "jpeg", "png", "webp"].includes(e) ? "img" : e === "pdf" ? "pdf" : "other";
};
/** A chevron drawn as a shape, so it sits on the middle of the words next to it (a typed ‹ sits low). */
const Chev = ({ left }: { left?: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={left ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
  </svg>
);
const Doc = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M4 1.75h5.5L12.5 4.75v9.5h-8.5z" /><path d="M9.25 1.75v3.25h3.25" />
  </svg>
);
export const sizeOf = (s: number) => (s < 1e6 ? `${Math.max(1, Math.round(s / 1e3))} KB` : `${(s / 1e6).toFixed(1)} MB`);

/** A small square: the photo itself, or the file's type in letters (PDF, ZIP). */
function Tile({ href, name, big }: { href: string; name: string; big?: boolean }) {
  const k = kindOf(name);
  const box = big ? "aspect-[4/3] w-full" : "h-10 w-10";
  if (k === "img") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={href} alt="" loading="lazy" decoding="async" className={`${box} shrink-0 rounded-[3px] border border-hair bg-panel2 object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} grid shrink-0 place-items-center rounded-[3px] border border-hair bg-panel2 font-mono text-[11px] font-semibold uppercase tracking-wide ${k === "pdf" ? "text-ice" : "text-mute"}`}>
      {ext(name) || "file"}
    </span>
  );
}

/**
 * "Files · N" on the first page and on the case page. A press opens a window over the page with the list;
 * a press on a file opens it inside the same window, with Back at the top left to return to the list.
 */
export default function CaseFiles({ caseId, files: all, testid, only, look = "label" }: { caseId: string; files: CaseFile[]; testid: string; only?: "docs"; look?: "label" | "chip" }) {
  // inside the photo desk the photos are already on screen two in a line: the window there lists the documents only (owner 2026-11-29)
  // documents first (short cards), then the photos (two in a line, like the photo desk); Previous / Next follow the same order
  const docs = all.filter((f) => kindOf(f.name) !== "img");
  const files = only === "docs" ? docs : [...docs, ...all.filter((f) => kindOf(f.name) === "img")];
  const nDocs = docs.length;
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<number | null>(null); // index of the file shown, null = the list
  const dlg = useRef<HTMLDialogElement>(null);
  const listTop = useRef(0);
  // a browser without its own PDF viewer (most phones) cannot show a PDF inside the window: it gets a button to open it instead
  const [pdfIn, setPdfIn] = useState(true);
  useEffect(() => { setPdfIn((navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false); }, []);
  const scroller = useRef<HTMLDivElement>(null);
  const href = (f: CaseFile) => `/api/cases/${encodeURIComponent(caseId)}/files/${f.id}`;

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // back on the list: the same place in it as before the file was opened
  useEffect(() => { if (at === null && scroller.current) scroller.current.scrollTop = listTop.current; }, [at]);

  const show = (i: number) => { if (at === null && scroller.current) listTop.current = scroller.current.scrollTop; setAt(i); };
  const close = () => { setOpen(false); setAt(null); listTop.current = 0; };
  const cur = at !== null ? files[at] ?? null : null;
  // the list was read again while a file is shown and that file is gone: back to the list
  useEffect(() => { if (at !== null && !files[at]) setAt(null); }, [at, files]);
  // a file shown: the keyboard starts on Back (the pressed tile is gone, focus must not fall to the page)
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (at !== null) backRef.current?.focus({ preventScroll: true }); }, [at]);
  // keys pressed in the window stay in it: the photo desk behind it has shortcuts of its own (arrows, Space, Enter)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") e.stopPropagation();
    if (at === null) return;
    if (e.key === "ArrowLeft" && at > 0) setAt(at - 1);
    if (e.key === "ArrowRight" && at < files.length - 1) setAt(at + 1);
  };

  // a large window over the page on a computer, the whole screen on a phone
  // (a short list of documents only: as tall as the list, until a file opens)
  const tall = cur || only !== "docs";
  const frame = `m-auto ${tall ? "h-[min(88dvh,860px)]" : "h-fit max-h-[min(88dvh,860px)]"} w-[min(96vw,1100px)] rounded-[4px] border border-hair max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-full max-sm:rounded-none`;

  return (
    <>
      {look === "chip" ? (
        // in the photo desk's bar, beside 全部: the same quiet grey look as that filter
        <button type="button" onClick={() => setOpen(true)} data-testid={testid} aria-haspopup="dialog"
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] bg-panel2 px-3 text-[13px] font-semibold text-fg transition-colors duration-150 hover:bg-hair">
          <Doc />{t("case.files")}<span className="font-mono text-[12px] font-normal text-mute">{files.length}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid={testid} aria-haspopup="dialog"
          className="label flex min-h-11 items-center gap-2 rounded-[3px] text-left transition-colors hover:text-ice">
          {t("case.files")}<span className="note text-mute">· {files.length}</span>
          <span className="note ml-1 text-ice underline decoration-hair underline-offset-4">{t("files.view")}</span>
        </button>
      )}
      <dialog ref={dlg} aria-label={t("case.files")} data-testid="files-window"
        onClose={close} onKeyDown={onKey}
        onCancel={(e) => { if (at !== null) { e.preventDefault(); setAt(null); } }}
        onClick={(e) => { if (e.target === dlg.current) close(); }}
        className={`overflow-hidden bg-panel p-0 text-fg backdrop:bg-black/60 ${frame}`}>
        {open && (
          <div className={`flex flex-col ${tall ? "h-full" : "max-h-[min(88dvh,860px)] max-sm:h-full"}`}>
            {/* top bar: Back on the left once a file is open, the title in the middle, Close on the right */}
            <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-hair px-3 sm:px-4">
              {cur ? (
                <button ref={backRef} type="button" onClick={() => setAt(null)} data-testid="files-back" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[3px] pr-2 text-[15px] font-semibold text-ice hover:text-fg">
                  <Chev left />{t("files.back")}
                </button>
              ) : null}
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold" title={cur?.name}>
                {cur ? cur.name : <>{t("case.files")} <span className="note font-normal text-mute">· {files.length}</span></>}
              </p>
              {cur && <span className="num note shrink-0 text-mute max-sm:hidden">{at! + 1} / {files.length}</span>}
              <button type="button" onClick={close} aria-label={t("shots.close")} data-testid="files-close" className="grid h-11 w-11 shrink-0 place-items-center rounded-[3px] text-[22px] leading-none text-mute hover:bg-panel2 hover:text-fg">×</button>
            </div>

            {cur ? (
              <>
                <div className="relative min-h-0 flex-1 bg-panel2">
                  {kindOf(cur.name) === "img" ? (
                    <div className="app-scroll grid h-full place-items-center overflow-auto p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img key={cur.id} src={href(cur)} alt={cur.name} className="max-h-full max-w-full object-contain" data-testid="files-image" />
                    </div>
                  ) : kindOf(cur.name) === "pdf" && pdfIn ? (
                    <iframe key={cur.id} src={href(cur)} title={cur.name} className="h-full w-full border-0 bg-white" data-testid="files-pdf" />
                  ) : (
                    <div className="grid h-full place-items-center p-6 text-center">
                      <div className="grid w-[160px] justify-items-center gap-4 [&>*:first-child]:w-[120px]">
                        <Tile href={href(cur)} name={cur.name} big />
                        {kindOf(cur.name) === "pdf" ? (<>
                          <p className="max-w-[34ch] text-[14.5px] text-mute">{t("files.pdfHere")}</p>
                          <a href={href(cur)} target="_blank" rel="noopener" className="btn-primary" data-testid="files-open-pdf">{t("files.openPdf")}</a>
                        </>) : (<>
                          <p className="max-w-[34ch] text-[14.5px] text-mute">{t("files.noPreview")}</p>
                          <a href={href(cur)} download className="btn-primary" data-testid="files-download">{t("files.download")}</a>
                        </>)}
                      </div>
                    </div>
                  )}
                </div>
                {/* bottom bar: previous / next, and the file in a tab of its own */}
                <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-t border-hair px-2 sm:px-3">
                  <button type="button" disabled={at === 0} onClick={() => setAt(at! - 1)} data-testid="files-prev" className="inline-flex h-11 items-center gap-1 rounded-[3px] px-3 text-[14.5px] font-semibold text-fg hover:bg-panel2 disabled:opacity-35"><Chev left />{t("files.prev")}</button>
                  <span className="num note text-mute sm:hidden">{at! + 1} / {files.length}</span>
                  <a href={href(cur)} target="_blank" rel="noopener" className="note text-mute underline decoration-hair underline-offset-4 hover:text-fg max-sm:hidden">{t("files.newTab")} ↗</a>
                  <button type="button" disabled={at === files.length - 1} onClick={() => setAt(at! + 1)} data-testid="files-next" className="inline-flex h-11 items-center gap-1 rounded-[3px] px-3 text-[14.5px] font-semibold text-fg hover:bg-panel2 disabled:opacity-35">{t("files.next")}<Chev /></button>
                </div>
              </>
            ) : (
              <div ref={scroller} className="app-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="grid gap-4 p-3 sm:p-4">
                  {nDocs > 0 && (
                    <ul className="grid grid-cols-2 gap-2 sm:gap-3" data-testid="files-docs">
                      {files.slice(0, nDocs).map((f, i) => (
                        <li key={f.id} className="min-w-0">
                          <button type="button" onClick={() => show(i)} data-testid="files-item" className="flex min-h-16 w-full items-center gap-3 rounded-[4px] border border-hair bg-panel px-3 py-2 text-left transition-colors hover:border-mute hover:bg-panel2">
                            <Tile href={href(f)} name={f.name} />
                            <span className="grid min-w-0 flex-1">
                              <span className="text-[14px] font-medium leading-snug [overflow-wrap:anywhere]">{f.name}</span>
                              <span className="num note text-mute">{sizeOf(f.size)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {files.length > nDocs && (
                    <ul className="grid grid-cols-2 gap-3 sm:gap-4" data-testid="files-photos">
                      {files.slice(nDocs).map((f, j) => (
                        <li key={f.id} className="min-w-0">
                          <button type="button" onClick={() => show(nDocs + j)} data-testid="files-item" className="grid w-full gap-1.5 rounded-[4px] p-1 text-left hover:bg-panel2">
                            <Tile href={href(f)} name={f.name} big />
                            <span className="truncate text-[13.5px] font-medium" title={f.name}>{f.name}</span>
                            <span className="num note -mt-1 text-mute">{sizeOf(f.size)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
