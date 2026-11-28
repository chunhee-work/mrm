"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

/**
 * The pop-up before a case is deleted: the vehicle no. is in the title. The server decides (a case the worker has just taken answers
 * 409 and stays); on success `onGone` tells the list to drop the row. 404 counts as gone too (deleted in another tab).
 */
export default function ConfirmDelete({ row, onClose, onGone, onStale }: { row: { id: string; plate: string; inMerimen?: boolean } | null; onClose: () => void; onGone: (id: string) => void; onStale: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [late, setLate] = useState(false); // after a 409 the answer cannot change: the button goes away and the list refreshes
  const open = !!row;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) { setErr(""); setLate(false); }
  }, [open]);

  async function go() {
    if (!row || busy) return;
    setBusy(true); setErr("");
    const res = await fetch(`/api/cases/${encodeURIComponent(row.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok || res?.status === 404) { onGone(row.id); onClose(); }
    else if (res?.status === 409 && (await res.json().catch(() => null))?.error === "busy") setErr(t("del.busyNow")); // a read or a job is on it: later
    else { setErr(t(res?.status === 409 ? "del.late" : "del.fail")); if (res?.status === 409) { setLate(true); onStale(); } } // the case moved on: the row shows its new status
  }

  const title = t("del.title", { plate: row?.plate || t("dash.noPlate") });
  return (
    <dialog ref={ref} onClose={() => { if (!busy) onClose(); }} onCancel={(e) => { if (busy) e.preventDefault(); }} onClick={(e) => { if (e.target === ref.current && !busy) onClose(); }}
      aria-label={title} data-testid="del-dialog"
      className="m-auto w-[min(440px,calc(100vw-32px))] max-w-none rounded-[6px] border border-hair bg-white p-0 text-fg shadow-xl backdrop:bg-black/40 max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none">
      <div className="p-5">
        <h3 className="mb-2 text-[20px] font-semibold leading-tight text-fg [overflow-wrap:anywhere]">{title}</h3>
        {open && <p className="mb-5 text-[15px] leading-snug text-mute [text-wrap:pretty]" data-testid="del-body">{t(row?.inMerimen ? "del.bodyMerimen" : "del.body")}</p>}
        {err && <p role="alert" className="mb-4 text-[14px] font-semibold text-amber" data-testid="del-error">{err}</p>}
        <div className="flex flex-wrap gap-3">
          {!late && <button type="button" onClick={go} disabled={busy} className="btn-primary !h-11" data-testid="del-confirm">{busy ? t("del.busy") : t("del.confirm")}</button>}
          <button type="button" onClick={onClose} disabled={busy} className="btn-line !h-11" data-testid="del-keep">{t("del.keep")}</button>
        </div>
      </div>
    </dialog>
  );
}
