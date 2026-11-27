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
      <ol className="flex items-stretch gap-1.5 max-sm:gap-1">
        {steps.map((s, i) => {
          const on = s.id === (here ?? current);
          const body = (
            <>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold ${s.state === "complete" ? "bg-go text-bay" : on ? "bg-bay/20 text-bay" : "bg-panel2 text-mute"}`}>
                {s.state === "complete" ? <Tick className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0 truncate max-sm:text-[12.5px]">{t(`steps.${s.id}`)}</span>
            </>
          );
          const cls = `flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 text-[13.5px] font-semibold transition-colors duration-150 max-sm:flex-col max-sm:gap-0.5 max-sm:h-12 max-sm:px-1 ${
            on ? "bg-ice text-bay" : s.open && s.id !== "done" ? "bg-panel2 text-fg hover:bg-hair" : s.open ? "bg-panel2 text-fg" : "cursor-not-allowed bg-panel2/60 text-mute"
          }`;
          return (
            <li key={s.id} className="flex min-w-0 flex-1">
              {s.open && s.id !== "done" ? (
                <Link href={HREF(caseId, s.id)} aria-current={on ? "step" : undefined} className={cls} data-testid={`step-${s.id}`}>{body}</Link>
              ) : (
                <span aria-current={on ? "step" : undefined} aria-disabled={!s.open || undefined} title={s.open ? undefined : t("steps.locked")} className={cls} data-testid={`step-${s.id}`}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      {hint && <p className="mt-1.5 text-[13.5px] text-mute" data-testid="steps-next">{t(current === "merimen" && status === "checking" ? "case.pp.next.checking" : `steps.next.${current}`)}</p>}
    </nav>
  );
}
