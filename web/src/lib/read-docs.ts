import "server-only";
import { z } from "zod";
import { get } from "@vercel/blob";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL, costUsd } from "./claude";

// Step 1 of the workflow (playbook 01): read the case bundle and return the case data.
const Person = z.object({
  name: z.string(), nric: z.string().nullable(), address: z.string().nullable(), phone: z.string().nullable(),
});
const Policy = z.object({
  insurer: z.string().nullable(),
  policy_no: z.string().nullable().describe("Policy number verbatim, slashes kept; Allianz 'N/A' -> E-Cover Note no.; takaful -> certificate no."),
  cover_note_no: z.string().nullable(),
  effective: z.string().nullable().describe("YYYY-MM-DD"), expiry: z.string().nullable().describe("YYYY-MM-DD"),
  cover_type: z.string().nullable(),
});
export const CaseData = z.object({
  plate: z.string().describe("Our client's plate, from the document content (not the file name)"),
  client_vehicle: z.object({
    jpj_log_book_no: z.string().nullable(), owner: Person, chassis_no: z.string().nullable(), engine_no: z.string().nullable(),
    cc: z.string().nullable(), model: z.string().nullable().describe("JPJ Buatan/Nama Model code, never the chassis prefix"),
    status_asal: z.string().nullable(), assembly_type: z.enum(["Locally Assembled", "Reconditioned", "New Import"]).nullable(),
    kelas_kegunaan: z.string().nullable(), body_type: z.string().nullable(), year_body: z.string().nullable(),
    registration_date: z.string().nullable().describe("YYYY-MM-DD"),
  }),
  client_policy: Policy.nullable().describe("Null when the bundle has no claimant insurance (not a blocker)"),
  police: z.object({
    report_no: z.string().nullable().describe("No spaces, e.g. TRAFIKKUANTAN/008375/26"),
    report_datetime: z.string().nullable(), place: z.string().nullable(), accident_datetime: z.string().nullable(),
    blamed_plate: z.string().nullable(), client_report_no: z.string().nullable(),
  }),
  client_driver: Person.nullable(),
  at_fault: z.object({
    plate: z.string().nullable(), policy: Policy.nullable().describe("Policy whose period covers the accident date"),
    owner: Person.nullable(), driver: Person.nullable(),
  }),
  total_loss: z.boolean(),
  missing: z.array(z.string()).describe("Documents truly missing after reading every page, e.g. 'at-fault I-SEARCH page'"),
  notes: z.string().nullable(),
});
export type CaseDataT = z.infer<typeof CaseData>;

const SYSTEM = `You read a Malaysian motor-claim bundle for an adjuster (third-party property damage, TPPD).
Claimant = OUR client = the not-at-fault party. The claim is against the at-fault party's insurer.
Rules:
- Document content beats file names. Read every page of every file before saying anything is missing.
- The bundle usually holds: our client's JPJ RC (Sijil Pemilikan Kenderaan), our client's insurance schedule, the police investigation result (Keputusan Penyiasatan Kes), both police reports, and a JPJ/I-SEARCH page for the at-fault vehicle. Ignore the sketch (Rajah Kasar).
- Lock the at-fault party: the police result names the "disalahkan" plate; the at-fault insurer is the I-SEARCH page for that exact plate. An insurance page naming a different plate is misfiled: ignore it. In a chain collision, claim against the vehicle that directly hit our client, whose insurance is in the bundle.
- Several policies on the I-SEARCH: pick the one whose period covers the accident date.
- Unclear digit or word: zoom mentally and give your best reading; do not leave it blank.
- Use null only when the information is not in the bundle. Dates as YYYY-MM-DD.`;

type Block = Anthropic.Messages.ContentBlockParam;

async function blobBase64(url: string): Promise<string> {
  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error("blob not found");
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  return buf.toString("base64");
}

export async function readCaseDocs(files: { kind: string; blobUrl: string; originalName: string }[]) {
  const pdfs = files.filter((f) => f.kind === "pdf");
  if (!pdfs.length) throw new Error("no PDF in this case");
  const content: Block[] = [];
  for (const f of pdfs) {
    content.push({ type: "text", text: `File: ${f.originalName}` });
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await blobBase64(f.blobUrl) } });
  }
  content.push({ type: "text", text: "Extract the case data from the files above." });

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(CaseData) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined this request");
  if (!res.parsed_output) throw new Error("no structured output (stop_reason: " + res.stop_reason + ")");
  return { data: res.parsed_output, usage: res.usage, costUsd: costUsd(res.usage) };
}
