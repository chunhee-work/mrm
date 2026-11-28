"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";

export type WorkshopOpt = { slot: number; name: string };

/** Which of the account's workshops a case belongs to. Shown only when there are two or more. */
export default function WorkshopPicker({ workshops, value, onChange, disabled = false, testid = "ws-picker", always = false }: {
  workshops: WorkshopOpt[]; value: number; onChange: (slot: number) => void; disabled?: boolean; testid?: string; always?: boolean;
}) {
  const { t } = useT();
  if (workshops.length < 2 && !always) return null;
  return (
    <div role="radiogroup" aria-label={t("pf.caseWs")} className="flex flex-wrap gap-2" data-testid={testid}>
      {workshops.map((w) => {
        const on = w.slot === value;
        return (
          <button key={w.slot} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => { if (!on) onChange(w.slot); }}
            data-slot={w.slot}
            className={`min-h-[44px] max-w-full rounded-[4px] border px-4 py-2 text-left text-[15px] leading-snug transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-fg bg-fg text-white" : "border-hair bg-panel text-fg hover:bg-panel2"}`}>
            <span className="note block opacity-70">{t("pf.wsN", { n: String(w.slot) })}</span>
            <span className="block [overflow-wrap:anywhere]">{w.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export type WorkshopState = { slot: number; shown: boolean; locked: boolean; confirmed: boolean; needsConfirm: boolean };

/**
 * The workshop block of a case (case page and the open line on the first page). Owner 2026-11-29: the workshop is picked once
 * and confirmed with one press; the case is started in Merimen only after that, and the workshop cannot be changed any more.
 * `onSaved` re-reads the case so the block follows what the server holds.
 */
export function WorkshopChoice({ caseId, workshops, state, onSaved, testid }: {
  caseId: string; workshops: WorkshopOpt[]; state: WorkshopState; onSaved: () => void; testid: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  // the workshop the server last said it saved: shown and confirmed at once, so a slow or failed re-read can never make
  // Confirm send the workshop the case had before the last press
  const [slot, setSlot] = useState(state.slot);
  useEffect(() => { setSlot(state.slot); }, [state.slot]);
  async function send(to: number, confirm: boolean) {
    setBusy(true); setErr(false);
    try {
      const r = await fetch(`/api/cases/${caseId}/workshop`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(confirm ? { workshop: to, confirm } : { workshop: to }) });
      if (r.ok) setSlot(to);
      else if (r.status !== 409) setErr(true); // 409 = too late: the re-read shows it fixed
    } catch { setErr(true); }
    setBusy(false);
    onSaved();
  }
  const ask = state.needsConfirm;
  return (
    <div className={`grid gap-2 ${ask ? "rounded-[4px] border border-amber/40 bg-ambertint p-3 sm:p-4" : ""}`} data-testid={testid} data-confirmed={state.confirmed ? "1" : "0"}>
      <span className="label">{t("pf.caseWs")}</span>
      <WorkshopPicker workshops={workshops} value={slot} onChange={(n) => void send(n, false)} disabled={busy || state.locked} testid={`${testid}-picker`} always />
      {ask ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <button type="button" className="btn-primary !min-h-[44px] !px-5 text-[15px]" disabled={busy || !workshops.some((w) => w.slot === slot)}
            onClick={() => void send(slot, true)} data-testid={`${testid}-confirm`}>{t("pf.caseWsConfirm")}</button>
          <p className="min-w-0 flex-1 basis-[240px] text-[13.5px] text-fg">{t("pf.caseWsAsk")}</p>
        </div>
      ) : state.locked && (
        <p className="text-[13.5px] text-mute">{t(state.confirmed ? "pf.caseWsConfirmed" : "pf.caseWsLocked")}</p>
      )}
      {err && <p role="alert" className="field-error">{t("pf.caseWsFail")}</p>}
    </div>
  );
}
