"use client";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { Tick } from "@/components/app/marks";
import { stepsOf, type StepId, type StepState } from "@/lib/case-steps";

/** One colour rule for every step circle: green done, amber the step a case waits at, red a step that failed, grey later. */
export const circleOf = (s: { state: StepState; open: boolean }, failedHere: boolean) =>
  s.state === "complete" ? "bg-go text-bay" : failedHere ? "bg-[#dc2626] text-white" : s.state === "current" ? "bg-amber text-bay" : s.open ? "border border-dashed border-mute bg-panel text-fg" : "bg-panel2 text-mute";

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
          const circle = circleOf(s, failedHere);
          const label = on || s.state === "current" ? "font-semibold text-fg" : s.state === "complete" ? "font-medium text-fg" : "text-mute";
          const body = (
            <>
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${circle} ${on ? "ring-2 ring-fg/15 ring-offset-2 ring-offset-panel" : ""}`}>
                {s.state === "complete" ? <Tick className="h-3.5 w-3.5" aria-hidden="true" /> : failedHere ? <span aria-hidden="true">!</span> : i + 1}
              </span>
              <span className={`mt-1.5 max-w-full truncate px-1 text-[13px] leading-tight max-sm:text-[12px] ${label}`}>{t(`steps.${s.id}`)}</span>
              {s.state === "complete" && <span className="sr-only"> ✓</span>}
              {failedHere && <span className="sr-only"> ({t("steps.failed")})</span>}
              {s.state === "locked" && !on && !s.open && <span className="sr-only"> ({t("steps.locked")})</span>}
            </>
          );
          const cls = "flex min-w-0 flex-col items-center rounded-[4px] py-1 outline-offset-2 ";
          return (
            <li key={s.id} className="relative flex min-w-0 flex-1 justify-center">
              {/* the line to the previous and the next step: green once the step it leaves is done */}
              {i > 0 && <span aria-hidden="true" className={`absolute left-0 top-[18px] h-[3px] w-1/2 -translate-y-1/2 ${steps[i - 1].state === "complete" ? "bg-go" : "bg-hair2"}`} />}
              {i < steps.length - 1 && <span aria-hidden="true" className={`absolute right-0 top-[18px] h-[3px] w-1/2 -translate-y-1/2 ${s.state === "complete" ? "bg-go" : "bg-hair2"}`} />}
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

/**
 * The same step bar, small and without words, for one case on the first page. The step names are written once, above the list,
 * so they are not repeated on every case. Read out loud it still says which step the case is on.
 */
export function StepDots({ status, photos, photosDone, busy = false, className = "" }: { status: string; photos: number; photosDone: boolean; busy?: boolean; className?: string }) {
  const { t } = useT();
  const steps = stepsOf({ status, photos, photosDone });
  const cur = steps.find((s) => s.state === "current");
  const say = status === "done" ? t("steps.done") : cur ? `${t(`steps.${cur.id}`)}${status === "failed" ? ` (${t("steps.failed")})` : ""}` : "";
  return (
    <ol className={`flex items-center ${className}`} aria-label={`${t("steps.label")}: ${say}`} data-testid="step-dots">
      {steps.map((s, i) => {
        const failedHere = status === "failed" && s.state === "current";
        return (
          <li key={s.id} aria-hidden="true" className="relative flex min-w-0 flex-1 justify-center" data-state={failedHere ? "failed" : s.state}>
            {i > 0 && <span className={`absolute left-0 top-1/2 h-[3px] w-1/2 -translate-y-1/2 ${steps[i - 1].state === "complete" ? "bg-go" : "bg-hair2"}`} />}
            {i < steps.length - 1 && (
              <span className={`absolute right-0 top-1/2 h-[3px] w-1/2 -translate-y-1/2 overflow-hidden ${s.state === "complete" ? "bg-go" : "bg-hair2"}`}>
                {/* the system is working on this step: a light runs along the line towards the next step */}
                {busy && s.state === "current" && <span className="step-flow absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-amber to-transparent" />}
              </span>
            )}
            <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${circleOf(s, failedHere)} ${busy && s.state === "current" ? "step-breathe" : ""}`}>
              {s.state === "complete" ? <Tick className="h-3 w-3" /> : failedHere ? "!" : i + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The step names once, lined up over a column of StepDots. */
export function StepHeads({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <div aria-hidden="true" className={`flex ${className}`}>
      {(["docs", "photos", "merimen", "done"] as const).map((id) => <span key={id} className="min-w-0 flex-1 px-0.5 text-center leading-tight [overflow-wrap:anywhere]">{t(`steps.${id}`)}</span>)}
    </div>
  );
}
