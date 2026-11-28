"use client";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { Tick } from "@/components/app/marks";
import { STEP_IDS, stepsOf, type StepId, type StepState } from "@/lib/case-steps";
import { stepTasks, type CaseForTasks } from "@/lib/step-tasks";

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

/** The step names once, lined up over a column of StepTrack. */
export function StepHeads({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <div aria-hidden="true" className={`flex ${className}`}>
      {STEP_IDS.map((id) => <span key={id} className="min-w-0 flex-1 px-0.5 text-center leading-tight [overflow-wrap:anywhere]">{t(`steps.${id}`)}</span>)}
    </div>
  );
}

const ONE_WINDOW = true; // owner 2026-11-29: one window for the four steps; false = a drop-down per step (version A of the review)

/** What the drop-down of a step needs to know of one case (a line of the first page). */
export type TrackCase = CaseForTasks & { id: string; deskTotal?: number };

// the activity of a case, read once per case and status when a step is first pointed at (the list itself does not carry it)
const evCache = new Map<string, { message: string }[]>();
const evKey = (c: TrackCase) => `${c.id}|${c.status}|${c.photosDone ? 1 : 0}`;

/**
 * StepDots for one line of the first page, where each step opens a drop-down of its jobs (owner 2026-11-29): pointed at with the
 * mouse, or tapped on a phone. Every job of the step is listed: done ones green with a tick, the ones not done yet grey. It
 * replaces the Activity list of the open line, so the line stays clean.
 * The drop-down is drawn on top of the page (a portal), so the list's own scroll box never cuts it.
 */
export function StepTrack({ c, busy = false, className = "", one = ONE_WINDOW }: { c: TrackCase; busy?: boolean; className?: string; one?: boolean }) {
  const { t } = useT();
  const steps = stepsOf({ status: c.status, photos: c.deskTotal ?? 0, photosDone: !!c.photosDone });
  const cur = steps.find((s) => s.state === "current");
  const say = c.status === "done" ? t("steps.done") : cur ? `${t(`steps.${cur.id}`)}${c.status === "failed" ? ` (${t("steps.failed")})` : ""}` : "";
  const [open, setOpen] = useState<{ step: StepId; pinned: boolean } | null>(null);
  const [events, setEvents] = useState<{ message: string }[] | null>(() => evCache.get(evKey(c)) ?? null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const pop = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const leave = useRef<number | undefined>(undefined);
  const key = evKey(c);
  useEffect(() => { setEvents(evCache.get(key) ?? null); }, [key]);
  const load = () => {
    if (evCache.has(key)) return;
    fetch(`/api/cases/${c.id}/brief`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((j: { events?: { message: string }[] } | null) => {
      if (!j?.events) return;
      evCache.set(key, j.events);
      setEvents(j.events);
    }, () => {});
  };
  const show = (step: StepId, pinned: boolean) => { window.clearTimeout(leave.current); load(); setOpen({ step, pinned }); };
  const hide = () => { window.clearTimeout(leave.current); leave.current = window.setTimeout(() => setOpen((o) => (o?.pinned ? o : null)), 140); };
  // a tap outside, Esc, or a scroll closes it (the drop-down is placed once, where the step is)
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!pop.current?.contains(e.target as Node) && !btns.current.some((b) => b?.contains(e.target as Node))) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); btns.current[STEP_IDS.indexOf(open.step)]?.focus(); } };
    const gone = () => setOpen(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", gone, true); window.removeEventListener("resize", gone); };
  }, [open]);
  const tasks = stepTasks(c, events);
  return (
    <>
      <ol ref={list} className={`flex items-center ${className}`} aria-label={`${t("steps.label")}: ${say}`} data-testid="step-dots">
        {steps.map((s, i) => {
          const failedHere = c.status === "failed" && s.state === "current";
          const on = open?.step === s.id;
          return (
            <li key={s.id} className="relative flex min-w-0 flex-1 justify-center" data-state={failedHere ? "failed" : s.state}>
              {i > 0 && <span aria-hidden="true" className={`absolute left-0 top-1/2 h-[3px] w-1/2 -translate-y-1/2 ${steps[i - 1].state === "complete" ? "bg-go" : "bg-hair2"}`} />}
              {i < steps.length - 1 && (
                <span aria-hidden="true" className={`absolute right-0 top-1/2 h-[3px] w-1/2 -translate-y-1/2 overflow-hidden ${s.state === "complete" ? "bg-go" : "bg-hair2"}`}>
                  {busy && s.state === "current" && <span className="step-flow absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-amber to-transparent" />}
                </span>
              )}
              {/* the step itself is the button: 40 px to tap, the circle stays 24 px */}
              <button
                type="button" ref={(el) => { btns.current[i] = el; }}
                aria-expanded={on} aria-controls={on ? `tasks-${c.id}` : undefined}
                aria-label={`${i + 1}. ${t(`steps.${s.id}`)}: ${t("steps.tasks", { done: String(tasks[s.id].filter((x) => x.done).length), n: String(tasks[s.id].length) })}`}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") show(s.id, false); }}
                onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(); }}
                onFocus={() => show(s.id, false)}
                onBlur={hide}
                onClick={(e) => { e.stopPropagation(); if (on && open?.pinned) setOpen(null); else show(s.id, true); }}
                className="pointer-events-auto relative z-10 -my-2 flex h-10 w-10 items-center justify-center rounded-full outline-offset-0"
                data-testid={`dot-${s.id}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold transition-shadow duration-150 ${circleOf(s, failedHere)} ${busy && s.state === "current" ? "step-breathe" : ""} ${on ? "ring-2 ring-fg/20 ring-offset-2 ring-offset-panel" : ""}`}>
                  {s.state === "complete" ? <Tick className="h-3 w-3" /> : failedHere ? "!" : i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {open && (one ? (
        <Float
          ref={pop} id={`tasks-${c.id}`} label={t("steps.label")} anchor={list.current} width={740} onEnter={() => window.clearTimeout(leave.current)} onLeave={hide}
          point={(() => { const b = btns.current[STEP_IDS.indexOf(open.step)]?.getBoundingClientRect(); return b ? b.left + b.width / 2 : null; })()}
        >
          {/* one window for the four steps: a column per step, under its dot (two by two on a phone) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {STEP_IDS.map((id, i) => (
              <div key={id} className={`min-w-0 rounded-[6px] p-2 ${id === open.step ? "bg-panel2" : ""}`} data-step={id}>
                <StepHead n={i + 1} id={id} tasks={tasks[id]} here={id === open.step} stack />
                <TaskList tasks={tasks[id]} loading={id === "merimen" && events === null} />
              </div>
            ))}
          </div>
        </Float>
      ) : (
        <Float ref={pop} id={`tasks-${c.id}`} label={`${STEP_IDS.indexOf(open.step) + 1}. ${t(`steps.${open.step}`)}`} anchor={btns.current[STEP_IDS.indexOf(open.step)]} point={null} width={MENU_W} onEnter={() => window.clearTimeout(leave.current)} onLeave={hide}>
          <StepHead n={STEP_IDS.indexOf(open.step) + 1} id={open.step} tasks={tasks[open.step]} here />
          <TaskList tasks={tasks[open.step]} loading={open.step === "merimen" && events === null} />
        </Float>
      ))}
    </>
  );
}

const MENU_W = 264;

/**
 * A floating box under (or, with no room below, over) `anchor`, never past the screen edge, with a small arrow at `point`
 * (the x of the step it belongs to). `width`: wanted width, cut to the screen.
 */
const Float = forwardRef<HTMLDivElement, { id: string; label: string; anchor: HTMLElement | null | undefined; point: number | null; width: number; onEnter: () => void; onLeave: () => void; children: React.ReactNode }>(
  function Float({ id, label, anchor, point, width, onEnter, onLeave, children }, ref) {
    const box = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number; w: number; arrow: number; up: boolean; maxH?: number } | null>(null);
    useLayoutEffect(() => {
      if (!anchor || !box.current) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - 24);
      const mid = point ?? r.left + r.width / 2;
      const left = Math.max(12, Math.min(mid - w / 2, window.innerWidth - w - 12));
      const h = box.current.scrollHeight + 2;
      // below the steps when it fits, else on the side with more room; too tall for either: it scrolls inside its own box
      const below = window.innerHeight - r.bottom - 16, above = r.top - 16;
      const up = h > below && above > below;
      const room = up ? above : below;
      const hh = Math.min(h, room);
      setPos({ left, top: up ? r.top - 8 - hh : r.bottom + 8, w, arrow: Math.max(14, Math.min(mid - left, w - 14)), up, maxH: h > room ? room : undefined });
    }, [anchor, point, width, children]);
    if (typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={(el) => { box.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
        id={id} role="region" aria-label={label} onPointerEnter={onEnter} onPointerLeave={onLeave}
        style={pos ? { left: pos.left, top: pos.top, width: pos.w, maxHeight: pos.maxH, overflowY: pos.maxH ? "auto" : undefined } : { left: 0, top: 0, width: Math.min(width, 9999), visibility: "hidden" }}
        className="fixed z-50 rounded-[8px] border border-hair bg-panel p-3 text-left shadow-[0_14px_36px_-12px_rgba(15,23,42,0.35)]"
        data-testid="step-menu"
      >
        {pos && <span aria-hidden="true" style={{ left: pos.arrow - 6 }} className={`absolute h-3 w-3 rotate-45 bg-panel ${pos.up ? "-bottom-[7px] border-b border-r border-hair" : "-top-[7px] border-l border-t border-hair"}`} />}
        {children}
      </div>,
      document.body,
    );
  },
);

/** One job: a green tick and green words once done, a grey ring and grey words before. */
function TaskList({ tasks, loading }: { tasks: { id: string; done: boolean }[]; loading: boolean }) {
  const { t } = useT();
  return (
    <ul className="space-y-1.5" data-testid="step-tasks">
      {tasks.map((x) => (
        <li key={x.id} className="flex items-start gap-2.5 text-[13.5px] leading-[20px]" data-done={x.done || undefined}>
          {x.done ? (
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-go text-white"><Tick className="h-2.5 w-2.5" /></span>
          ) : (
            <span aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-[1.5px] border-hair2 ${loading ? "animate-pulse" : ""}`} />
          )}
          <span className={x.done ? "font-medium text-go" : "text-mute"}>
            <span className="sr-only">{t(x.done ? "ev.s.ok" : "steps.notYet")}: </span>{t(`task.${x.id}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A step's name and how many of its jobs are done, over its list. */
function StepHead({ n, id, tasks, here = false, stack = false }: { n: number; id: StepId; tasks: { done: boolean }[]; here?: boolean; stack?: boolean }) {
  const { t } = useT();
  const done = tasks.filter((x) => x.done).length;
  return (
    <div className={`mb-2 border-b border-hairsoft pb-2 ${stack ? "" : "flex items-baseline justify-between gap-3"}`}>
      <p className={`text-[14px] font-semibold ${here ? "text-fg" : "text-fg/80"}`}><span className="num mr-1.5 font-mono text-mute">{n}</span>{t(`steps.${id}`)}</p>
      <p className={`num shrink-0 text-[12.5px] ${done === tasks.length ? "text-go" : "text-mute"}`}>{t("steps.tasks", { done: String(done), n: String(tasks.length) })}</p>
    </div>
  );
}
