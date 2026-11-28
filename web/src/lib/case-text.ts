// B09 / U13 / U6: what the case page shows for the text that used to be stored and shown as English sentences.
// Old and new rows both go through here, so a Chinese or Malay page never shows an English event or a long AI sentence.

export type Tr = { key: string; vars?: Record<string, string> };
/** An activity line as the page shows it: a short title (`key`), and under it at most a few short grey facts (`sub`). */
export type EventTr = Tr & { raw?: string; sub?: Tr[] };

/** Activity event (stored as an English sentence) -> i18n key + params. Unknown text is kept as it is (key ""). */
export function eventTr(message: string): EventTr {
  let m: RegExpMatchArray | null;
  if ((m = message.match(/^Received (\d+) more file\(s\)$/))) return { key: "ev.receivedMore", vars: { n: m[1] } };
  if ((m = message.match(/^Received (\d+) file\(s\)$/))) return { key: "ev.received", vars: { n: m[1] } };
  if (message === "Queued again") return { key: "ev.queued" };
  if (message === "Reading documents") return { key: "ev.reading" };
  if (message === "Documents read") return { key: "ev.read" };
  if (message === "Scan failed") return { key: "ev.failed" };
  if ((m = message.match(/^Opened (.+): (\d+) file\(s\)$/))) return { key: "ev.opened", vars: { name: m[1], n: m[2] } };
  if ((m = message.match(/^Pending: (.*)$/))) return { key: "ev.pending", vars: { docs: m[1] } };
  // photos that could not go into the case (photos/import-files.ts): how many, and why
  if ((m = message.match(/^Photos left out: (\d+) \((?:(HEIC)|over (\d+) MB|more than (\d+) photos|(cannot be opened))\)$/))) {
    return m[2] ? { key: "ev.photosHeic", vars: { n: m[1] } } : m[3] ? { key: "ev.photosBig", vars: { n: m[1], mb: m[3] } }
      : m[4] ? { key: "ev.photosLimit", vars: { n: m[1], max: m[4] } } : { key: "ev.photosBad", vars: { n: m[1] } };
  }
  if ((m = message.match(/^Workshop (\d+): (.*)$/))) return { key: "ev.workshop", vars: { n: m[1], name: m[2] } }; // the user moved the case to another workshop
  if ((m = message.match(/^Jev check: (at-fault|client) insurer "(.*)": Jev says (.*), our rules say (.*)$/))) return { key: m[1] === "client" ? "ev.jevCli" : "ev.jevAt", vars: { text: m[2], jev: m[3], mine: m[4] } };
  if ((m = message.match(/^Jev check: Liberty branch for "(.*)": Jev says (.*), our rules say (.*)$/))) return { key: "ev.jevBranch", vars: { place: m[1], jev: m[2], mine: m[3] } };
  const noDoc: Record<string, string> = { "RC": "ev.jevNoRc", "our insurance": "ev.jevNoIns", "I-SEARCH": "ev.jevNoIsearch", "our police report": "ev.jevNoReport", "Keputusan": "ev.jevNoKep" };
  if ((m = message.match(/^Jev check: no (RC|our insurance|I-SEARCH|our police report|Keputusan) page found in the files$/))) return { key: noDoc[m[1]] };
  if ((m = message.match(/^Jev check: RC (model|cc|registration date) "(.*)" not seen on the RC card by Jev$/))) return { key: m[1] === "model" ? "ev.jevRcModel" : m[1] === "cc" ? "ev.jevRcCc" : "ev.jevRcDate", vars: { v: m[2] } };
  const w = workerTr(message);
  if (w) return w;
  // anything else that is long (a new worker sentence nobody mapped yet): its first sentence only, the rest stays in the database
  if (message.length > LONG) return { key: "", raw: firstSentence(message) };
  return { key: "", raw: message };
}

/** How an activity line stands, for its status mark: done, being worked on, waiting on the user, failed, or just a note. */
export type EventKind = "ok" | "work" | "wait" | "fail" | "note";
/**
 * `live` = this is the newest line of a case that is still being read: only then is "Reading documents" still going on.
 * A worker stop says "wait" here; the log keeps that mark only on the newest stop of a case that waits for the user (stopMark).
 */
export function eventKind(message: string, live = false): EventKind {
  const { key } = eventTr(message);
  if (key === "ev.failed") return "fail";
  if (key === "ev.pending") return "wait";
  if (key === "ev.reading" || key === "ev.queued") return live ? "work" : "ok";
  if (key === "ev.received" || key === "ev.receivedMore" || key === "ev.opened" || key === "ev.read") return "ok";
  if (WORKER_KIND[key]) return WORKER_KIND[key];
  return "note";
}

export const DOC_KEYS = ["police_result", "atfault_report", "isearch", "insurance", "jpj_rc", "client_report", "other"] as const;
export type DocKey = (typeof DOC_KEYS)[number];

/** A missing-document sentence written by the reader (English, often long) -> one of a fixed list. */
export function docKey(text: string): DocKey {
  const s = text.toLowerCase();
  if (/keputusan|investigation result|penyiasatan/.test(s)) return "police_result";
  if (/i-?search/.test(s)) return "isearch";
  if (/jpj|rc\b|sijil pemilikan|log ?book|chassis|registration/.test(s)) return "jpj_rc";
  if (/insurance|schedule|policy|cover note|polisi/.test(s)) return "insurance";
  if (/at-?fault.*(police|report)|(police|report).*at-?fault|disalahkan/.test(s)) return "atfault_report";
  if (/police|polis/.test(s)) return "client_report";
  return "other";
}

/** `cases.error` -> a reason in plain words. "bad_file:<name>" is written by the reader for an empty, corrupt or too large PDF. */
export function failTr(error: string | null): Tr {
  const e = (error ?? "").trim();
  let m: RegExpMatchArray | null;
  if (/^bad_file:\|too_long/.test(e)) return { key: "case.err.tooManyPages" }; // the PDFs open, but have too many pages for one read
  if (/^bad_file:\|/.test(e)) return { key: "case.err.corruptSome" }; // a PDF we cannot name (refused together, or a name two files share)
  if ((m = e.match(/^bad_file:([^|]+)\|(empty|corrupt|too_big)/))) return { key: `case.err.${m[2]}`, vars: { name: badFileNames(e).join("; ") || m[1] } };
  if ((m = e.match(ZIP_REJECTED))) return { key: zipWhyKey(m[1]) };
  if (/no PDF/i.test(e)) return { key: "case.err.noPdf" };
  if (/timed out/i.test(e)) return { key: "case.err.timeout" };
  if (/request_too_large|too large|exceeds? (the )?(maximum|limit)|32 ?MB|too many (pages|tokens)/i.test(e)) return { key: "case.err.tooBigAny" }; // cases failed before the size check existed
  return { key: "case.err.other" };
}

/**
 * Why unzip-bundle.ts refuses a customer's zip (the ZipRejected messages); expandBundles stores them as `<zip name>: <why>`.
 * They live here, not in the unzip code, because this file also runs in the browser.
 */
export const ZIP_WHY = {
  corrupt: "the zip cannot be opened",
  multi: "the zip holds more than one vehicle",
  too_many_cars: "the zip holds too many vehicles",
  pdf_big: "a PDF in the zip is larger than 25 MB",
  mixed: "the zip holds car folders and other files beside them",
  car_no_pdf: "a car folder in the zip has no readable PDF",
  name_long: "a file name in the zip is too long",
  too_many: "too many files in the zip",
  too_many_files: "the zip holds too many files to split at once",
  entry_big: "a file in the zip is too large",
  too_big: "the zip is too large once opened",
  car_big: "one car in the zip is too large once opened",
  dup_plate: "two car folders in the zip have the same plate",
  layout: "the car folders in the zip are at different levels",
  bomb: "the zip is suspiciously compressed",
  empty: "no PDF or photo inside the zip",
} as const;
/** The message key for one zip refusal reason: each reason says what is wrong, not one generic "could not be opened". */
export const zipWhyKey = (why: string) => {
  const code = (Object.keys(ZIP_WHY) as (keyof typeof ZIP_WHY)[]).find((k) => ZIP_WHY[k] === why);
  return code === "multi" ? "case.err.zipMulti" : code && code !== "corrupt" ? `case.err.zip_${code}` : "case.err.zip";
};

/**
 * A one-case read refused because the zip holds several cars (or cars at different levels) is not the customer's fault: its credit
 * goes back, and new files for that case take a credit again. Only for a case never read before: a case that was read already
 * keeps its result on the page, so its read stays paid for (and new files for it are free, as for any case waiting for files).
 */
export const zipRefunded = (error: string | null | undefined, readBefore: boolean) =>
  !readBefore && !!error && (error.endsWith(`: ${ZIP_WHY.multi}`) || error.endsWith(`: ${ZIP_WHY.layout}`));
const ZIP_REJECTED = new RegExp(`: (${Object.values(ZIP_WHY).join("|")})$`);
/** The zip a `<zip name>: <why>` error is about, so "Replace files" can take it out of the case. */
export const zipRejectedName = (error: string | null) => (error ?? "").match(new RegExp(`^(.+): (${Object.values(ZIP_WHY).join("|")})$`))?.[1] ?? null;

/**
 * A failure the user can fix by sending other files (so "Replace files" is the action), as against one on our side ("Read again").
 * Only the zip's own refusals count: "cannot download x.zip" or a blob path with /unzipped-/ in it is ours, and the credit goes back.
 */
export const userFixable = (error: string | null) =>
  /^bad_file:/.test(error ?? "") || // first: the rest of a bad_file error is a file name, and a name may say anything ("timed out.pdf")
  ((/no PDF|request_too_large|too large|exceeds? (the )?(maximum|limit)|32 ?MB|too many (pages|tokens)/i.test(error ?? "") || ZIP_REJECTED.test(error ?? "")) && !/timed out/i.test(error ?? ""));

/** A file name as written into a `bad_file:` error: the characters the format uses are %-escaped and nothing is cut, so it still matches the stored name. */
export const badFileName = (name: string) => name.replace(/[%|;\r\n]/g, (c) => encodeURIComponent(c));
const unescapeName = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } }; // rows written before the escaping

/** The files named in a `bad_file:<names>|<why>` error (old rows join several names with "; "; an empty name means "one of the PDFs"). */
export function badFileNames(error: string | null): string[] {
  const m = (error ?? "").match(/^bad_file:([^|]*)\|/);
  return m ? m[1].split("; ").map((x) => unescapeName(x.trim())).filter(Boolean) : [];
}

/* ---- Worker lines (worker/autopilot_worker pipeline.py, loop.py, login_page.py) ----
 * The worker writes one long English sentence per Merimen step, with field names, codes and "check by hand" lists, for us.
 * The page shows a short title and at most three short facts under it (owner 2026-11-28: "massive ... make it short").
 * The full sentence stays in case_events.
 */
const LONG = 120;
const MAX_FACTS = 3;

/** The first sentence of a long text, never longer than 100 characters. */
export function firstSentence(s: string): string {
  const one = s.split(/(?<=[.!?。])\s/)[0];
  return one.length <= 100 ? one : `${one.slice(0, 99).trimEnd()}…`;
}

/** Title key of each worker line -> its status mark. Lines that wait for a person get the question mark. */
const WORKER_KIND: Record<string, EventKind> = {
  "ev.w.dryA": "ok", "ev.w.dryB": "ok", "ev.w.created": "ok", "ev.w.exists": "ok", "ev.w.saved": "ok", "ev.w.checking": "ok",
  "ev.w.checked": "ok", "ev.w.namesChanged": "wait", "ev.w.notSaved": "wait", "ev.w.stopped": "wait", "ev.w.dryFailed": "wait",
  "ev.w.blocked": "fail", "ev.w.logoutStop": "wait", "ev.w.relogin": "note", "ev.w.error": "note", "ev.w.toFix": "wait",
  "ev.w.gaveUp": "wait", "ev.w.checkedPhotos": "ok",
};

const TITLES: [RegExp, string][] = [
  [/^Phase A dry-run only\b/, "ev.w.dryA"],
  [/^Phase B dry-run only\b/, "ev.w.dryB"],
  [/^Case created in Merimen\b/, "ev.w.created"],
  [/^The case already exists in Merimen\b/, "ev.w.exists"],
  [/^Phase B saved, but the names changed/, "ev.w.namesChanged"],
  [/^Phase [AB]: .*\b(Not submitted, \d+ to fix|Check before submit \(\d+\))/, "ev.w.toFix"],
  [/^(Phase A saved|Phase [AB]: )/, "ev.w.saved"],
  [/^Checking\b/, "ev.w.checking"],
  [/^Phase [AB] not saved\b/, "ev.w.notSaved"],
  [/^Phase [AB] stopped\b/, "ev.w.stopped"],
  [/^Phase [AB] dry-run failed\b/, "ev.w.dryFailed"],
  [/^Phase [AB] blocked\b/, "ev.w.blocked"],
  [/^Phase [AB] checked\. Merimen was not saved \(photos were relabelled\)/, "ev.w.checkedPhotos"],
  [/^Phase [AB] checked\b/, "ev.w.checked"],
  [/^Stopped after \d+ tries\b/, "ev.w.gaveUp"],
  [/^Merimen logged out during\b/, "ev.w.relogin"],
  [/^Merimen logged out \d+ times\b/, "ev.w.logoutStop"],
  [/^Worker error$/, "ev.w.error"],
];

/** The short facts found in a worker sentence, most useful first. */
function facts(m: string): Tr[] {
  const out: Tr[] = [];
  const dry = /dry-run only|dry run \(Merimen not changed\)/.test(m); // a practice run: nothing was ticked, set or uploaded
  let x: RegExpMatchArray | null;
  // the Adjuster Report
  if (/labour_type_unknown/.test(m)) out.push({ key: "ev.f.repBodyType" });
  else if ((x = m.match(/Adjuster Report not filled: missing_data \(([^)]{1,40})\)/))) out.push({ key: "ev.f.repMissing", vars: { what: x[1] } });
  else if (/report_rejected|empty required boxes/.test(m)) out.push({ key: "ev.f.repRejected" });
  else if (/Adjuster Report not (filled|saved)/.test(m)) out.push({ key: "ev.f.repNot" });
  else if (/Adjuster Report saved/.test(m)) out.push({ key: "ev.f.repSaved" });
  // the create form (practice run)
  if (/Create form filled and checked/.test(m)) out.push({ key: "ev.f.formChecked" });
  // documents
  if ((x = m.match(/Documents uploaded: (\d+)/))) out.push({ key: "ev.f.docsUp", vars: { n: x[1] } });
  else if (/Documents already in Merimen/.test(m)) out.push({ key: "ev.f.docsThere" });
  else if (/Documents not uploaded/.test(m)) out.push({ key: "ev.f.docsNot" });
  // photos
  if ((x = m.match(/Merimen has (\d+) photos and (\d+) mismatch/))) out.push({ key: "ev.f.photosMismatch", vars: { have: x[1], bad: x[2] } });
  else if (/photo step failed|Photos not touched/.test(m)) out.push({ key: "ev.f.photosNot" });
  else if ((x = m.match(/Photos[^:]*: would upload (\d+)/))) { if (x[1] !== "0") out.push({ key: "ev.f.photosReady", vars: { n: x[1] } }); }
  else if ((x = m.match(/Photos: upload (\d+) · relabel (\d+) · reorder (\d+)/))) {
    const [up, rel, ord] = [x[1], x[2], x[3]].map(Number);
    out.push(up ? { key: "ev.f.photosUp", vars: { n: String(up) } } : rel || ord ? { key: "ev.f.photosFixed", vars: { n: String(rel + ord) } } : { key: "ev.f.photosSame" });
  }
  // parts and labour, estimate details
  if (/could not be ticked|Parts and labour not touched|logged out on the Select Parts page/.test(m)) out.push({ key: "ev.f.partsNot" });
  else if ((x = m.match(/(?:Parts and labour[^:]*: (?:would )?|ticked )(\d+) parts/))) out.push({ key: dry ? "ev.f.partsPlan" : "ev.f.parts", vars: { n: x[1] } });
  if (/Estimate details stopped/.test(m)) out.push({ key: "ev.f.estStopped" });
  else if ((x = m.match(/Not submitted, (\d+) to fix|Check before submit \((\d+)\)/))) out.push({ key: "ev.f.toFix", vars: { n: x[1] ?? x[2] } });
  else if (!dry && /Estimate details (set|saved)/.test(m)) out.push({ key: "ev.f.estSet" });
  if ((x = m.match(/^Stopped after (\d+) tries/))) out.push({ key: "ev.f.tries", vars: { n: x[1] } });
  if (/names changed meanwhile/.test(m)) out.push({ key: "ev.f.pressDone" });
  // what is missing for a blocked phase
  if (/^Phase [AB] blocked\b/.test(m)) out.push({ key: "ev.f.missingData" });
  // fields to look at in Merimen: one short line, never the list
  // kept even when there are more facts: it is the one that asks the user to do something
  const hand = /check by hand|Check the photo list|Check the Select Parts page/i.test(m) ? [{ key: "ev.f.checkHand" }] : [];
  return [...out.slice(0, MAX_FACTS - hand.length), ...hand];
}

/** A worker sentence -> a short title and short facts, or null when it is not one. */
export function workerTr(message: string): EventTr | null {
  // the login lines are written in two languages at once ("中文 / English"): each page shows its own half, title + one grey line
  const bi = message.match(/^([^/]*[\u3400-\u9fff][^/]*?) \/ ([^\u3400-\u9fff]+)$/);
  if (bi) {
    const [zh, en] = [bi[1].trim(), bi[2].trim()];
    const zhHead = zh.split(/(?<=。)/)[0], enHead = en.split(/(?<=\.)\s/)[0];
    const zhSub = firstSentence(zh.slice(zhHead.length).trim()), enSub = firstSentence(en.slice(enHead.length).trim());
    return { key: "ev.w.bi", vars: { zh: zhHead, en: enHead }, sub: zhSub || enSub ? [{ key: "ev.w.bi", vars: { zh: zhSub, en: enSub } }] : [] };
  }
  const hit = TITLES.find(([re]) => re.test(message));
  if (!hit) return null;
  return { key: hit[1], sub: facts(message) };
}

/** A worker stop that still waits: only the newest stop of a case that waits for the user keeps its mark, older ones were followed by more work. */
export function isWorkerStop(message: string): boolean {
  const k = WORKER_KIND[eventTr(message).key];
  return k === "wait";
}
