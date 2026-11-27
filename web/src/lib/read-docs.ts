import "server-only";
import { z } from "zod";
import { get } from "@vercel/blob";
import type Anthropic from "@anthropic-ai/sdk";
import { documentRefusal, trackedParse, zodOutputFormat, MODEL, type CallCtx } from "./claude";
import { playbookBlock, playbookTag } from "@/lib/playbook/prompt";
import { costOf, tokensOf } from "./pricing";
import { badFileName } from "./case-text";
import { runPool } from "./pool";

// Step 1 of the workflow (playbook 01): read the case bundle and return the case data.
// Anthropic compiles the output schema and refuses more than 16 nullable/union fields. So plain text fields are
// strings that are "" when the bundle does not have them; only a few whole objects and one enum stay nullable (6 in all).
const Person = z.object({
  name: z.string(), nric: z.string(), address: z.string(), phone: z.string(),
});
const Policy = z.object({
  insurer: z.string(),
  policy_no: z.string().describe("Policy number verbatim, slashes kept; Allianz 'N/A' -> E-Cover Note no.; takaful -> certificate no."),
  cover_note_no: z.string(),
  effective: z.string().describe("YYYY-MM-DD"), expiry: z.string().describe("YYYY-MM-DD"),
  cover_type: z.string(),
});
export const CaseData = z.object({
  plate: z.string().describe("Our client's plate, from the document content (not the file name)"),
  client_vehicle: z.object({
    jpj_log_book_no: z.string(), owner: Person, chassis_no: z.string(), engine_no: z.string(),
    cc: z.string(), model: z.string().describe("JPJ Buatan/Nama Model code, never the chassis prefix"),
    status_asal: z.string(), assembly_type: z.enum(["Locally Assembled", "Reconditioned", "New Import"]).nullable(),
    kelas_kegunaan: z.string(), body_type: z.string(), year_body: z.string(),
    registration_date: z.string().describe("YYYY-MM-DD"),
  }),
  client_policy: Policy.nullable().describe("Null when the bundle has no claimant insurance (not a blocker)"),
  police: z.object({
    report_no: z.string().describe("No spaces, e.g. TRAFIKKUANTAN/008375/26"),
    report_datetime: z.string(), place: z.string(), accident_datetime: z.string(),
    blamed_plate: z.string(), client_report_no: z.string(),
  }),
  client_driver: Person.nullable(),
  at_fault: z.object({
    plate: z.string(), policy: Policy.nullable().describe("Policy whose period covers the accident date"),
    owner: Person.nullable(), driver: Person.nullable(),
  }),
  total_loss: z.boolean(),
  missing: z.array(z.string()).describe("Documents truly missing after reading every page, e.g. 'at-fault I-SEARCH page'"),
  notes: z.string(),
});
export type CaseDataT = z.infer<typeof CaseData>;

// Fields that may stay null; every other leaf is text. "" means "not in the bundle".
const NULLABLE = new Set(["client_policy", "client_driver", "policy", "owner", "driver", "assembly_type"]);
const PLACEHOLDER = /^(?:-+|n\/?a|null|none|nil|unknown|not stated|tiada|tidak ada|undefined)$/i;

/**
 * One way to read stored case data: old rows hold null where new rows hold "". Text leaves become trimmed strings (null or a
 * placeholder like "N/A" or "-" becomes ""), the nullable objects stay as they are. policy_no is kept as written (an Allianz
 * "N/A" has a meaning in the prompt rules). Returns null when the value is not an object.
 */
export function normalizeCaseData(raw: unknown): CaseDataT | null {
  const walk = (v: unknown, key: string): unknown => {
    if (v === null || v === undefined) return NULLABLE.has(key) ? null : key === "missing" ? [] : "";
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "string") { const t = v.trim(); return key !== "policy_no" && PLACEHOLDER.test(t) ? "" : t; }
    return v;
  };
  return raw && typeof raw === "object" ? (walk(raw, "") as CaseDataT) : null;
}

const SYSTEM = `You read a Malaysian motor-claim bundle for an adjuster (third-party property damage, TPPD).
Claimant = OUR client = the not-at-fault party. The claim is against the at-fault party's insurer.
Rules:
- Document content beats file names. Read every page of every file before saying anything is missing.
- The bundle usually holds: our client's JPJ RC (Sijil Pemilikan Kenderaan), our client's insurance schedule, the police investigation result (Keputusan Penyiasatan Kes), both police reports, and a JPJ/I-SEARCH page for the at-fault vehicle. Ignore the sketch (Rajah Kasar).
- Lock the at-fault party: the police result names the "disalahkan" plate; the at-fault insurer is the I-SEARCH page for that exact plate. An insurance page naming a different plate is misfiled: ignore it. In a chain collision, claim against the vehicle that directly hit our client, whose insurance is in the bundle.
- Several policies on the I-SEARCH: pick the one whose period covers the accident date.
- Unclear digit or word that IS in the bundle: zoom mentally and give your best reading.
- When a text field is not in the bundle, return exactly "" (empty text). Never write N/A, -, none, unknown or similar; null only where the field allows it. Dates as YYYY-MM-DD.

${playbookBlock("read_docs")}`;

type Block = Anthropic.Messages.ContentBlockParam;

/**
 * An empty, corrupt or oversize PDF: the user fixes it by sending another file. The message is `bad_file:<name>|<why>` (see case-text.ts).
 * The name is escaped, not cut, so "Replace files" finds the very row. "" = we cannot name one PDF (refused together, a name two
 * files share, or too long together): "Replace files" then takes every PDF out and the customer sends them again.
 */
export class BadFile extends Error {
  constructor(name: string, readonly why: "empty" | "corrupt" | "too_big" | "too_long") { super(`bad_file:${badFileName(name)}|${why}`); this.name = "BadFile"; }
}
const unique = (names: string[], name: string) => names.filter((x) => x === name).length === 1;
// The model's limits on one request: PDF pages ("A maximum of 100 PDF pages may be provided") and length ("prompt is too long")
const TOO_MANY_PAGES = /maximum of \d+ (pdf )?pages|pages? (limit|exceed)|too many (pdf )?pages|exceeds? .*\bpages?\b|prompt is too long|tokens? > \d+ maximum/i; // pages, or more text than the model reads at once
const MAX_PDF = 25 * 1024 * 1024;
/** Checks the bytes of one PDF before it is sent to the model (B06/B07). */
export function checkPdf(name: string, buf: Uint8Array) {
  if (!buf.length) throw new BadFile(name, "empty");
  if (buf.length > MAX_PDF) throw new BadFile(name, "too_big");
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) throw new BadFile(name, "corrupt");
  // R2-B03: a real header followed by garbage. A PDF always has objects and a cross-reference table or trailer.
  const all = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString("latin1");
  if (!all.includes("endobj") && !all.includes("startxref")) throw new BadFile(name, "corrupt");
}

/** The API's own words for a 400 (the body's error.message), not the whole SDK text with its request id. */
function apiMessage(e: unknown): string {
  const err = e as { message?: string; error?: { error?: { message?: unknown } } } | null;
  const inner = err?.error?.error?.message;
  if (typeof inner === "string") return inner;
  const raw = err?.message ?? "";
  return /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1] ?? raw;
}
// "document" as a word, not inside a field path of our own request (messages.0.content.1.document.source: …)
const ABOUT_FILE = /pdf|(?<![.\w])document(?![.\w])/i;

/** R2-B03: the model refused the PDF itself (HTTP 400 "could not process PDF" and the like): that is the customer's file, not our fault. */
export function asBadFile(e: unknown, names: string[]): BadFile | null {
  const err = e as { status?: number; message?: string } | null;
  if (!err || err.status !== 400 || !names.length) return null;
  // every 400 says "invalid_request_error" and our own request can be "invalid" or "could not process" too: only a refusal that
  // speaks of the PDF/document counts, else a good PDF would be blamed and removed and the credit kept (also with one PDF, which
  // gets no per-PDF check)
  if (!ABOUT_FILE.test(apiMessage(e))) return null;
  // The refusal does not say which PDF it was. Naming them all would make "Replace files" delete the good ones too.
  return new BadFile(names.length === 1 ? names[0] : "", "corrupt");
}

type Verdict = "refused" | "long" | "accepted" | "unknown";
const tooLong = () => new BadFile("", "too_long");

// U5: one request to the model may weigh 32 MB, and a PDF travels as base64 (4 bytes for every 3). Every PDF of a case goes
// in the same request (the reader needs them side by side), so PDFs that pass the per-file limit can still be too much together.
const MAX_REQUEST = 32 * 1024 * 1024;
/**
 * Called as each PDF is loaded, with the base64 lengths so far (in `names` order): throws the customer's-file refusal as soon as
 * the PDFs no longer fit one request, before the rest is downloaded or anything is sent. One PDF that is too much alone is named
 * ("send a smaller PDF"); several that are too much together are "too long for one case" (the same answer the model's own
 * "request too large" gets). A set this check lets through and the model still refuses is handled by refusalOf.
 */
export function checkFits(names: string[], sizes: number[]): void {
  const last = sizes.length - 1;
  if (sizes[last] > MAX_REQUEST) throw unique(names, names[last]) ? new BadFile(names[last], "too_big") : tooLong();
  if (sizes.reduce((a, b) => a + b, 0) > MAX_REQUEST) throw tooLong();
}

/** What the case shows when a read ran out of time ("Reading took too long. Press Read again."; our failure, the credit goes back). */
export const TIMED_OUT = "Reading timed out";
const READ_MS = 240_000; // when the caller gives no deadline: well under the 300 s a function may run
/**
 * What a refused read becomes, or null when it is not about the PDFs (then the error stays as it is). `verdicts` are the token
 * counter's answers for each PDF alone, in `names` order.
 */
export function refusalOf(e: unknown, names: string[], verdicts?: Verdict[]): Error | null {
  const msg = (e as { message?: string } | null)?.message ?? "";
  // a limit on the whole request (the PDFs' pages together) is not a broken file. Which PDF to shorten is the customer's
  // choice, so none is named: "Replace files" takes every PDF out and the customer sends shorter ones, in the same case.
  // A request too large in bytes (413) is the same: the PDFs are too much for one read, none of them is broken.
  const status = (e as { status?: number } | null)?.status;
  if ((status === 400 && TOO_MANY_PAGES.test(msg)) || status === 413) return tooLong();
  const bad = asBadFile(e, names);
  if (!bad || !verdicts) return bad;
  // only a name no other file of the case has ("Replace files" removes by name); more than one: the next read names the next
  const refused = names.filter((n, i) => verdicts[i] === "refused" && unique(names, n));
  if (refused.length) return new BadFile(refused[0], "corrupt");
  // one PDF is over the page limit alone, or every PDF opens alone (the set is too much): sending the same PDFs again would
  // fail the same way, so the customer sends shorter ones. (A refusal that does not speak of the file never gets here: asBadFile.)
  const allOpen = verdicts.length === names.length && verdicts.every((v) => v === "accepted");
  if (verdicts.includes("long") || allOpen) return tooLong();
  return bad;
}

async function blobBase64(url: string, name = "file.pdf"): Promise<string> {
  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error("blob not found");
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  checkPdf(name, buf);
  return buf.toString("base64");
}

/**
 * `deadline` (a time in ms): the model call, with its retries, is ended at that time and the read fails as TIMED_OUT. Without
 * it a hung call held the function until the platform killed it and the case stayed on "Reading documents" (U10).
 * `load` and `parse` are replaced in tests only.
 */
type ReadOpts = { deadline?: number; load?: typeof blobBase64; parse?: typeof trackedParse };

export async function readCaseDocs(files: { kind: string; blobUrl: string; originalName: string }[], ctx: Omit<CallCtx, "purpose">, opts: ReadOpts = {}) {
  const pdfs = files.filter((f) => f.kind === "pdf");
  if (!pdfs.length) throw new Error("no PDF in this case");
  const deadline = opts.deadline ?? Date.now() + READ_MS;
  const load = opts.load ?? blobBase64;
  const content: Block[] = [];
  const docs: { name: string; block: Block }[] = [];
  const all = pdfs.map((x) => x.originalName);
  const sizes: number[] = [];
  for (const f of pdfs) {
    // a file two PDFs share the name of is not named ("Replace files" would take both out): it is "one of the PDFs" then
    const data = await load(f.blobUrl, f.originalName).catch((e) => {
      throw e instanceof BadFile && !unique(all, f.originalName) ? new BadFile("", e.why) : e;
    });
    sizes.push(data.length);
    checkFits(all, sizes);
    const block: Block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    docs.push({ name: f.originalName, block });
    content.push({ type: "text", text: `File: ${f.originalName}` }, block);
  }
  content.push({ type: "text", text: "Extract the case data from the files above." });

  const left = deadline - Date.now();
  if (left < 1000) throw new Error(TIMED_OUT); // opening the files used up the time: no call is started that cannot finish
  const signal = AbortSignal.timeout(left); // wall-clock limit over every try (the SDK's own timeout is per try)
  const res = await (opts.parse ?? trackedParse)({ ...ctx, purpose: "read_docs", playbook: playbookTag() }, {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(CaseData) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  }, { request: { signal, timeout: left } }).catch(async (e) => {
    if (signal.aborted) throw new Error(TIMED_OUT);
    const names = docs.map((d) => d.name);
    if (!refusalOf(e, names)) throw e;
    if (docs.length < 2 || !/^bad_file:\|corrupt$/.test(refusalOf(e, names)!.message)) throw refusalOf(e, names)!; // already decided
    // several PDFs and the refusal does not say which: ask the free token counter about each one alone, so "Replace files"
    // can take out exactly that file (without it the same bad PDF would stay in the case and fail every read)
    const verdicts: Verdict[] = docs.map(() => "unknown");
    const until = Math.min(Date.now() + 60_000, deadline); // no check starts after 60 s or past the read's deadline (one started just before may run 30 s more), so the read ends in time
    await runPool(docs.length, 4, async (i) => {
      if (Date.now() > until) return; // left "unknown"
      const v = await documentRefusal([docs[i].block]).catch(() => undefined); // undefined: the check itself failed (rate limit, network)
      const m = (v as { message?: string } | null | undefined)?.message ?? "";
      verdicts[i] = v === undefined ? "unknown" : v === null ? "accepted" : TOO_MANY_PAGES.test(m) ? "long" : asBadFile(v, [docs[i].name]) ? "refused" : "unknown";
    });
    throw refusalOf(e, names, verdicts) ?? e;
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (!res.parsed_output) throw new Error("no structured output (stop_reason: " + res.stop_reason + ")");
  return { data: normalizeCaseData(res.parsed_output) as CaseDataT, usage: res.usage, costUsd: costOf(String(res.model || MODEL), tokensOf(res.usage as never)) ?? 0 };
}
