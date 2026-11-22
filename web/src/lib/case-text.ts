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
  if (key === "ev.received" || key === "ev.receivedMore" || key === "ev.opened" || key === "ev.read") return "ok";
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
  if ((m = e.match(/^bad_file:([^|]+)\|(empty|corrupt|too_big)/))) return { key: `case.err.${m[2]}`, vars: { name: m[1] } };
  if (/no PDF/i.test(e)) return { key: "case.err.noPdf" };
  if (/zip/i.test(e) && /(cannot|corrupt|empty|too|suspicious|many)/i.test(e)) return { key: "case.err.zip" };
  if (/timed out/i.test(e)) return { key: "case.err.timeout" };
  if (/request_too_large|too large|exceeds? (the )?(maximum|limit)|32 ?MB|too many (pages|tokens)/i.test(e)) return { key: "case.err.tooBigAny" }; // cases failed before the size check existed
  return { key: "case.err.other" };
}

/** A failure the user can fix by sending other files (so "Replace files" is the action), as against one on our side ("Read again"). */
export const userFixable = (error: string | null) => /^bad_file:|no PDF|zip|request_too_large|too large|exceeds? (the )?(maximum|limit)|32 ?MB|too many (pages|tokens)/i.test(error ?? "") && !/timed out/i.test(error ?? "");

/** The files named in a `bad_file:<names>|<why>` error (several names are joined with "; "). */
export function badFileNames(error: string | null): string[] {
  const m = (error ?? "").match(/^bad_file:([^|]+)\|/);
  return m ? m[1].split("; ").map((x) => x.trim()).filter(Boolean) : [];
}
