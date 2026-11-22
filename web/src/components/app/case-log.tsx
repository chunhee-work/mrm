"use client";
import { useT } from "@/components/lang-provider";
import { docKey, eventKind, eventTr, type EventKind } from "@/lib/case-text";

type Ev = { at: string; message: string };

const clock = (at: string) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

const svg = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true } as const;
const pen = { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * The round status mark: a shape per status (tick, turning ring, ring with a dot, cross, small dot), so colour is never the
 * only sign. One drawing on a 20 × 20 grid, every shape centred on (10, 10), so nothing sits half a pixel off.
 * `now`: this is the newest line, the state the case is in at this moment: its ring turns (`.case-spin`) while it waits.
 */
function Mark({ kind, now }: { kind: EventKind; now: boolean }) {
  if (kind === "ok")
    return (
      <svg {...svg} className="shrink-0 text-go">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M6 10.1l2.7 2.7L14 7.2" className="stroke-white" {...pen} />
      </svg>
    );
  if (kind === "fail")
    return (
      <svg {...svg} className="shrink-0 text-amber">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M7 7l6 6M13 7l-6 6" className="stroke-white" {...pen} />
      </svg>
    );
  if (kind === "work" || (kind === "wait" && now))
    return (
      <svg {...svg} className={`case-spin shrink-0 ${kind === "work" ? "text-scan" : "text-amber"}`} data-turning="">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.28" />
        <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" {...pen} />
        {kind === "wait" && <circle cx="10" cy="10" r="3" fill="currentColor" />}
      </svg>
    );
  if (kind === "wait")
    return (
      <svg {...svg} className="shrink-0 text-amber">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="10" cy="10" r="3" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...svg} className="shrink-0 text-mute">
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

/** The activity of one case as a timeline, newest first: one line down the side, a round status mark per step. `live`: the case is still being read. */
export default function CaseLog({ events, live }: { events: Ev[]; live: boolean }) {
  const { t } = useT();
  const rows = events.map((e, i) => {
    const tr = eventTr(e.message);
    const text = tr.key ? t(tr.key, tr.key === "ev.pending" ? { docs: (tr.vars?.docs ?? "").split("; ").map((d) => t(`doc.${docKey(d)}`)).join("; ") } : tr.vars) : tr.raw ?? e.message;
    const kind = eventKind(e.message, live && i === 0);
    return { ...e, text, kind, word: t(`ev.s.${kind}`) };
  });
  return (
    <ol className="relative" data-testid="log-list">
      {rows.map((r, i) => (
        <li key={i} className="relative flex items-start gap-3 pb-4 last:pb-0" data-kind={r.kind}>
          {i < rows.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[9.5px] top-[22px] w-px bg-hair2" />}
          <Mark kind={r.kind} now={i === 0} />
          <span className="min-w-0 flex-1 text-[14px] leading-[20px] text-fg">
            <span className="sr-only">{r.word}: </span>
            <span className={`[overflow-wrap:anywhere] ${r.kind === "fail" || r.kind === "wait" || r.kind === "work" ? "font-semibold" : ""}`}>{r.text}</span>
          </span>
          <time dateTime={r.at} className="num note shrink-0 leading-[20px] text-mute" suppressHydrationWarning>{clock(r.at)}</time>
        </li>
      ))}
    </ol>
  );
}
