import { Tick } from "./marks";

/** The automatic pipeline, in order. `done` follows the last step. */
export const PIPELINE = ["uploaded", "reading", "naming", "phase_a", "waiting_user", "phase_b", "checking"] as const;
const NEEDS = new Set(["waiting_user", "pending_doc", "failed"]);

export type Group = "needs" | "active" | "done";
export function groupOf(status: string): Group {
  if (status === "done") return "done";
  return NEEDS.has(status) ? "needs" : "active";
}

/** Seven segments, one per pipeline step; filled up to the step the case is on. */
function Strip({ status }: { status: string }) {
  const at = PIPELINE.indexOf(status as (typeof PIPELINE)[number]);
  return (
    <span className="inline-flex gap-[2px] align-[-1px]">
      {PIPELINE.map((s, i) => (
        <span key={s} className={`h-[11px] w-[4px] sm:w-[5px] ${i <= at ? "bg-ink" : "bg-hair"}`} />
      ))}
    </span>
  );
}

/**
 * Drawn mark + status text. Needs you: amber dot. In progress: ink strip. Done: ink tick.
 * The mark is inline, so when a long status wraps it stays with the first word.
 * `slot` (from lg) gives the mark a fixed-width slot so both the marks and the texts of a column line up.
 */
export function StatusMark({ status, label, detail, slot = false }: { status: string; label: string; detail?: string | null; slot?: boolean }) {
  const g = groupOf(status);
  const mark =
    g === "needs" ? <span className="inline-block h-[9px] w-[9px] rounded-full bg-signal" /> :
    g === "done" ? <Tick className="inline-block h-[15px] w-[15px] align-[-3px] text-ink" /> :
    <Strip status={status} />;
  return (
    <span
      className={`block font-mono text-[12.5px] leading-[20px] [overflow-wrap:anywhere] [text-wrap:balance] sm:text-[13px] ${g === "done" ? "text-ink" : "text-deep"} ${g === "needs" ? "font-medium" : ""} ${
        slot ? "text-right lg:pl-[55px] lg:-indent-[55px] lg:text-left lg:[text-wrap:wrap]" : ""
      }`}
    >
      <span aria-hidden="true" className={`mr-2 inline-block indent-0 ${slot ? "lg:w-[47px] lg:text-left" : ""}`}>{mark}</span>
      {label}
      {status === "pending_doc" && detail ? `: ${detail}` : ""}
    </span>
  );
}
