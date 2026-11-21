"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

export type Shot = { id: string; step: string; at: string; zh: string; en: string };

// Time line of progress screenshots, oldest first. A fixed-height box that scrolls inside. Click opens a larger view.
export default function ShotTimeline({ caseId, shots }: { caseId: string; shots: Shot[] }) {
  const { t } = useT();
  const [open, setOpen] = useState<Shot | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const label = (s: Shot) => { const k = `shots.${s.step}`; const v = t(k); return v === k ? s.en : v; };
  const src = (s: Shot) => `/api/cases/${encodeURIComponent(caseId)}/screenshots/${encodeURIComponent(s.id)}`;
  return (
    <section aria-labelledby="case-shots">
      <h2 id="case-shots" className="label mb-3">{t("shots.title")} <span className="note text-mute">· {shots.length}</span></h2>
      {shots.length === 0 ? (
        <p className="rounded-[4px] border border-hair px-4 py-3 text-[14px] text-mute">{t("shots.empty")}</p>
      ) : (
        <ol className="app-scroll max-h-[320px] overflow-y-auto overscroll-contain rounded-[4px] border border-hair" tabIndex={0}>
          {shots.map((s) => (
            <li key={s.id} className="border-b border-hair last:border-b-0">
              <button type="button" onClick={() => setOpen(s)} aria-label={`${t("shots.open")}: ${label(s)}`} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(s)} alt="" loading="lazy" className="h-[54px] w-[86px] shrink-0 rounded-[3px] border border-hair bg-panel2 object-cover object-top" />
                <span className="min-w-0 flex-1 text-[14px] text-fg [overflow-wrap:anywhere]">{label(s)}</span>
                <time dateTime={s.at} className="num note shrink-0 text-mute" suppressHydrationWarning>
                  {new Date(s.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}
                </time>
              </button>
            </li>
          ))}
        </ol>
      )}
      <dialog ref={dlg} onClose={() => setOpen(null)} onClick={(e) => { if (e.target === dlg.current) setOpen(null); }} className="m-auto max-h-[92vh] w-[min(96vw,1100px)] overflow-hidden rounded-[4px] border border-hair bg-panel p-0">
        {open && (
          <div className="flex max-h-[92vh] flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-hair px-4 py-3">
              <p className="text-[15px] font-medium text-fg">{label(open)} · <time dateTime={open.at} className="num note text-mute" suppressHydrationWarning>{new Date(open.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" })}</time></p>
              <button type="button" onClick={() => setOpen(null)} className="btn-quiet">{t("shots.close")}</button>
            </div>
            <div className="app-scroll overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(open)} alt={label(open)} className="block w-full" />
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
