// B09 / U13 / U6: what the case page shows for the text that used to be stored and shown as English sentences.
// Old and new rows both go through here, so a Chinese or Malay page never shows an English event or a long AI sentence.

export type Tr = { key: string; vars?: Record<string, string> };

/** Activity event (stored as an English sentence) -> i18n key + params. Unknown text is kept as it is (key ""). */
export function eventTr(message: string): Tr & { raw?: string } {
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
  // The worker's practice-run summary (worker pipeline.py) lists every Merimen field it filled: the page says it in plain words.
  // The full sentence stays in the database for us; the user sees what happened, how many photos are ready, and that nothing was saved.
  if ((m = message.match(/^Phase ([AB]) dry-run only\. Merimen was not changed\.([\s\S]*)$/))) {
    const photos = m[2].match(/Photos[^:]*: would upload (\d+)/)?.[1];
    if (m[1] === "B") return { key: "ev.dryB" };
    return photos && photos !== "0" ? { key: "ev.dryAPhotos", vars: { n: photos } } : { key: "ev.dryA" };
  }
  return { key: "", raw: message };
}

/** How an activity line stands, for its status mark: done, being worked on, waiting on the user, failed, or just a note. */
export type EventKind = "ok" | "work" | "wait" | "fail" | "note";
/** `live` = this is the newest line of a case that is still being read: only then is "Reading documents" still going on. */
export function eventKind(message: string, live = false): EventKind {
  const { key } = eventTr(message);
  if (key === "ev.failed") return "fail";
  if (key === "ev.pending") return "wait";
  if (key === "ev.reading" || key === "ev.queued") return live ? "work" : "ok";
  if (key === "ev.received" || key === "ev.receivedMore" || key === "ev.opened" || key === "ev.read" || key.startsWith("ev.dry")) return "ok";
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
