"use client";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { Tick } from "@/components/app/marks";
import { stepsOf, type StepId } from "@/lib/case-steps";

const HREF = (id: string, step: StepId) => (step === "photos" ? `/cases/${id}/photos` : `/cases/${id}`);

/**
 * The step bar on top of the case flow. A finished step is a link back to look at it; the step you are on is dark; a later step is grey and
 * cannot be opened until the one before it is finished. One line under the bar says what comes next.
 */
export default function CaseSteps({ caseId, status, photos, photosDone, here, hint = true }: { caseId: string; status: string; photos: number; photosDone: boolean; here?: StepId; hint?: boolean }) {
  const { t } = useT();
  const steps = stepsOf({ status, photos, photosDone });
  const current = (steps.find((s) => s.state === "current")?.id ?? "done");
  return (
    <nav aria-label={t("steps.label")} data-testid="case-steps">
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const on = s.id === (here ?? current);
          const failedHere = status === "failed" && s.state === "current";
          const circle = s.state === "complete" ? "bg-go text-bay" : failedHere ? "bg-[#dc2626] text-white" : s.state === "current" ? "bg-amber text-bay" : s.open ? "border border-dashed border-mute bg-transparent text-fg" : "bg-panel2 text-mute";
          const label = on || s.state === "current" ? "font-semibold text-fg" : s.state === "complete" ? "font-medium text-fg" : "text-mute";
          const body = (
            <>
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${circle} ${on ? "ring-2 ring-fg/15 ring-offset-2 ring-offset-panel" : ""}`}>
                {s.state === "complete" ? <Tick className="h-3.5 w-3.5" aria-hidden="true" /> : failedHere ? "!" : i + 1}
              </span>
              <span className={`mt-1.5 max-w-full truncate px-1 text-[13px] leading-tight max-sm:text-[12px] ${label}`}>{t(`steps.${s.id}`)}</span>
              {s.state === "complete" && <span className="sr-only"> ✓</span>}
              {s.state === "locked" && !on && !s.open && <span className="sr-only"> ({t("steps.locked")})</span>}
            </>
          );
          const cls = "flex min-w-0 flex-col items-center rounded-[4px] py-1 outline-offset-2 transition-opacity duration-150 hover:opacity-80";
          return (
            <li key={s.id} className="relative flex min-w-0 flex-1 justify-center">
              {/* the line to the previous and the next step: green once the step it leaves is done */}
              {i > 0 && <span aria-hidden="true" className={`absolute left-0 top-[17px] h-[3px] w-1/2 -translate-y-1/2 ${steps[i - 1].state === "complete" ? "bg-go" : "bg-hair2"}`} />}
              {i < steps.length - 1 && <span aria-hidden="true" className={`absolute right-0 top-[17px] h-[3px] w-1/2 -translate-y-1/2 ${s.state === "complete" ? "bg-go" : "bg-hair2"}`} />}
              {s.open && s.id !== "done" ? (
                <Link href={HREF(caseId, s.id)} aria-current={on ? "step" : undefined} className={cls} data-testid={`step-${s.id}`}>{body}</Link>
              ) : (
                <span aria-current={on ? "step" : undefined} aria-disabled={(!s.open && !on) || undefined} title={s.open || on ? undefined : t("steps.locked")} className={`${cls} ${!s.open && !on ? "cursor-not-allowed" : ""}`} data-testid={`step-${s.id}`}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      {hint && <p className="mt-1.5 text-[13.5px] text-mute" data-testid="steps-next">{t(status === "failed" ? "steps.next.failed" : current === "merimen" && status === "checking" ? "case.pp.next.checking" : `steps.next.${current}`)}</p>}
    </nav>
  );
}
