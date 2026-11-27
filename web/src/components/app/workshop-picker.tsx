"use client";
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
