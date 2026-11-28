"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { docKey, eventKind, eventTr, isWorkerStop, type EventKind } from "@/lib/case-text";
import { logWhen } from "@/lib/fmt-when";

type Ev = { id?: number; at: string; message: string };

const svg = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true } as const;
const pen = { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * The round status mark: a shape per status (tick, turning ring, question mark, cross, small dot), so colour is never the
 * only sign. One drawing on a 20 × 20 grid, every shape centred on (10, 10), so nothing sits half a pixel off.
 * Only work in progress turns (`.case-spin`). A case that waits for the user is not loading: it asks for something, so
 * its mark is a question mark (owner 2026-11-22: "this replace with ?").
 */
function Mark({ kind }: { kind: EventKind }) {
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
  if (kind === "wait")
    return (
      <svg {...svg} className="shrink-0 text-amber" data-mark="ask">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M7.6 7.7a2.4 2.4 0 1 1 3.7 2c-.8.5-1.3 1-1.3 1.9" className="stroke-white" {...pen} />
        <circle cx="10" cy="14.5" r="1.15" className="fill-white" />
      </svg>
    );
  if (kind === "work")
    return (
      <svg {...svg} className="case-spin shrink-0 text-scan" data-turning="">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.28" />
        <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" {...pen} />
      </svg>
    );
  return (
    <svg {...svg} className="shrink-0 text-mute">
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

/** A small grey bin: removes the line from the list (plan #148). */
function Bin() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  events: Ev[];
  live: boolean;
  waiting?: boolean;
  /** With a case id, every line with an id gets a bin, except while the case is working (the turning mark must stay on the real newest line). */
  caseId?: string;
  /** Tells the page how many of `events` the user removed here, for the count after "Activity". */
  onRemoved?: (n: number) => void;
  /** Show only the first `max` lines that are left (the page passes every line, so removing one lets the next move up). */
  max?: number;
};

/** The activity of one case as a timeline, newest first: one line down the side, a round status mark per step. `live`: the case is still being read. */
/** `waiting`: the case waits for the user; then its newest worker stop keeps the amber question mark, every older stop is a plain note. */
export default function CaseLog({ events, live, waiting = false, caseId, onRemoved, max }: Props) {
  const { t, lang } = useT();
  const [gone, setGone] = useState<number[]>([]);
  const [ask, setAsk] = useState<number | null>(null);
  const [undo, setUndo] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const [undoErr, setUndoErr] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // only lines still in `events` count: after a reload the server already leaves the removed ones out
  const goneHere = events.filter((e) => e.id !== undefined && gone.includes(e.id)).length;
  useEffect(() => { onRemoved?.(goneHere); }, [goneHere, onRemoved]);
  const removable = !!caseId && !live;
  useEffect(() => { if (live) setAsk(null); }, [live]); // a case that starts working again: no question left open

  async function post(id: number, hide: boolean) {
    setErr(false);
    try {
      const r = await fetch(`/api/cases/${caseId}/events/${id}/${hide ? "hide" : "unhide"}`, { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      return true;
    } catch { setErr(true); return false; }
  }
  async function remove(id: number) {
    setAsk(null);
    if (!(await post(id, true))) return;
    setGone((g) => [...g, id]);
    setUndoErr(false);
    setUndo(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), 6000);
  }
  async function bringBack(id: number) {
    window.clearTimeout(timer.current);
    setUndoErr(false);
    // the bar stays until the line is really back, so a failed Undo can be pressed again
    const ok = await fetch(`/api/cases/${caseId}/events/${id}/unhide`, { method: "POST" }).then((r) => r.ok, () => false);
    if (!ok) { setUndoErr(true); return; }
    setUndo(null);
    setGone((g) => g.filter((x) => x !== id));
  }

  let stopSeen = false;
  const rows = events.filter((e) => e.id === undefined || !gone.includes(e.id)).slice(0, max).map((e, i) => {
    const tr = eventTr(e.message);
    const head = tr.key ? t(tr.key, tr.key === "ev.pending" ? { docs: (tr.vars?.docs ?? "").split("; ").map((d) => t(`doc.${docKey(d)}`)).join("; ") } : tr.vars) : tr.raw ?? e.message;
    const sub = (tr.sub ?? []).map((f) => t(f.key, f.vars)).filter(Boolean).join(" · ");
    let kind = eventKind(e.message, live && i === 0);
    if (isWorkerStop(e.message)) { kind = waiting && !stopSeen ? "wait" : "note"; stopSeen = true; }
    // while the case waits, its current question (the amber stop) keeps no bin: removing it would pass the mark to an older stop
    return { ...e, head, sub, kind, word: t(`ev.s.${kind}`), keep: kind === "wait" };
  });
  return (
    <div>
      <ol className="relative" data-testid="log-list">
        {rows.map((r, i) => (
          <li key={r.id ?? `i${i}`} className="group relative flex items-start gap-3 pb-4 last:pb-0" data-kind={r.kind}>
            {i < rows.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[9.5px] top-[22px] w-px bg-hair2" />}
            <Mark kind={r.kind} />
            {removable && ask !== null && ask === r.id ? (
              // asked inline, no browser dialog: the line itself turns into the question
              <span className="min-w-0 flex-1 text-[14px] leading-[20px] text-fg" data-testid="log-ask">
                <span className="block font-semibold">{t("ev.rm.ask")}</span>
                <span className="mt-1.5 flex flex-wrap gap-2">
                  <button type="button" autoFocus className="btn-primary !h-11 !min-h-0 !px-4 text-[14px] sm:!h-9" data-testid="log-rm-yes" onClick={() => void remove(r.id!)}>{t("ev.rm.yes")}</button>
                  <button type="button" className="btn-line !h-11 !min-h-0 !px-4 text-[14px] sm:!h-9" onClick={() => { const id = r.id; setAsk(null); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-rm="${id}"]`)?.focus()); }}>{t("ev.rm.no")}</button>
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-[14px] leading-[20px] text-fg">
                <span className="sr-only">{r.word}: </span>
                {/* a worker line: a short title, and under it its few facts, small and grey (the full sentence stays in the database) */}
                <span className={`[overflow-wrap:anywhere] ${r.kind === "fail" || r.kind === "wait" || r.kind === "work" ? "font-semibold" : ""}`}>{r.head}</span>
                {r.sub && <span className="block text-[13px] leading-[18px] text-mute [overflow-wrap:anywhere]" data-testid="log-sub">{r.sub}</span>}
              </span>
            )}
            <time dateTime={r.at} className="num note shrink-0 leading-[20px] text-mute" suppressHydrationWarning>{logWhen(r.at, lang)}</time>
            {removable && r.id !== undefined && ask !== r.id && !r.keep && (
              // 44 px to tap on a phone, drawn small; the negative margins keep the line as tall as before
              <button type="button" aria-label={t("ev.rm.label")} title={t("ev.rm.label")} data-testid="log-rm" data-rm={r.id}
                className="-my-3 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] text-mute/70 transition-colors hover:text-fg focus-visible:text-fg"
                onClick={() => { setErr(false); setAsk(r.id!); }}><Bin /></button>
            )}
            {/* a line without a bin keeps the same space, so every time stays in one column */}
            {removable && (r.id === undefined || r.keep || ask === r.id) && <span aria-hidden="true" className="-my-3 -mr-3 h-11 w-11 shrink-0" />}
          </li>
        ))}
      </ol>
      {undo !== null && (
        <p role="status" className="mt-3 flex items-center gap-3 rounded-[3px] border border-hair bg-panel px-3 py-1.5 text-[14px] text-fg" data-testid="log-undo">
          <span className="flex-1">{t("ev.rm.done")}</span>
          <button type="button" autoFocus className="btn-quiet !min-h-11 !font-semibold" onClick={() => void bringBack(undo)}>{t("ev.rm.undo")}</button>
        </p>
      )}
      {err && <p role="alert" className="field-error mt-2">{t("ev.rm.fail")}</p>}
      {undoErr && <p role="alert" className="field-error mt-2">{t("ev.rm.undoFail")}</p>}
    </div>
  );
}
