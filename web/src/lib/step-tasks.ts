import { STEP_IDS, currentStepOf, type StepId } from "./case-steps";

/**
 * The jobs inside each of the four steps, for the drop-down under a step on the first page (owner 2026-11-29: the Activity list
 * goes, each step shows its own jobs, done ones green with a tick, the ones not done yet grey).
 * Every job is always listed, done or not, so the user sees the whole road of a case. What counts as done comes from the case
 * itself (status, photo desk) and, for the Merimen jobs, from the worker's lines in the activity (`events`).
 */
export const STEP_TASKS = {
  docs: ["received", "read", "allIn"],
  photos: ["added", "named", "pressed"],
  merimen: ["created", "report", "docsUp", "photosUp", "parts", "estimate"],
  done: ["checked"],
} as const satisfies Record<StepId, readonly string[]>;

export type TaskId = (typeof STEP_TASKS)[StepId][number];
export type CaseForTasks = { status: string; photosDone?: boolean | null; deskTotal?: number; deskConfirm?: number; inMerimen?: boolean };

/** A worker line of a practice run: nothing was saved in Merimen, so it never ticks a job. */
const DRY = /^Phase [AB] dry-run|dry-run only|dry run \(Merimen not changed\)/;

/** The Merimen jobs a worker line says were done (the full sentence, as stored in case_events). */
export function merimenDone(message: string): TaskId[] {
  if (DRY.test(message)) return [];
  const out: TaskId[] = [];
  if (/^(Case created in Merimen|The case already exists in Merimen)\b/.test(message)) out.push("created");
  if (/Adjuster Report saved/.test(message)) out.push("report");
  if (/Documents uploaded: \d+|Documents already in Merimen/.test(message)) out.push("docsUp");
  if (/Photos: upload \d+ · relabel \d+ · reorder \d+/.test(message) && !/photo step failed|Photos not touched/.test(message)) out.push("photosUp");
  if (/(?:Parts and labour[^:]*: |ticked )\d+ parts/.test(message) && !/could not be ticked|Parts and labour not touched/.test(message)) out.push("parts");
  if (/Estimate details (set|saved)/.test(message) && !/Estimate details stopped/.test(message)) out.push("estimate");
  return out;
}

/** Every job of every step, each done or not. `events`: null while the activity is not read yet (the Merimen jobs then come from the case alone). */
export function stepTasks(c: CaseForTasks, events: { message: string }[] | null): Record<StepId, { id: TaskId; done: boolean }[]> {
  const finished = c.status === "done";
  const at = STEP_IDS.indexOf(currentStepOf({ status: c.status, photosDone: !!c.photosDone }));
  const past = (s: StepId) => finished || STEP_IDS.indexOf(s) < at;
  const read = !["uploaded", "reading", "failed"].includes(c.status) || !!events?.some((e) => e.message === "Documents read");
  const total = c.deskTotal ?? 0;
  const pressed = !!c.photosDone || ["checking", "done"].includes(c.status);
  const worker = new Set((events ?? []).flatMap((e) => merimenDone(e.message)));
  const done: Record<TaskId, boolean> = {
    received: true, // a case exists only once files came in
    read,
    allIn: read && c.status !== "pending_doc" && c.status !== "failed",
    added: total > 0 || pressed,
    named: pressed || (total > 0 && (c.deskConfirm ?? 1) === 0),
    pressed,
    created: !!c.inMerimen || worker.has("created"),
    report: worker.has("report"),
    docsUp: worker.has("docsUp"),
    photosUp: worker.has("photosUp"),
    parts: worker.has("parts"),
    estimate: worker.has("estimate"),
    checked: finished,
  };
  const out = {} as Record<StepId, { id: TaskId; done: boolean }[]>;
  for (const s of STEP_IDS) out[s] = STEP_TASKS[s].map((id) => ({ id, done: past(s) || done[id] })); // a step behind the case is all done
  return out;
}
