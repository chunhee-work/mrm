import "server-only";
import type { CaseDataT } from "@/lib/read-docs";
import { askJev } from "@/lib/typesafe";

// Jev (TypeSafe System One) second vote on the insurer and the Liberty branch, right after the documents are read (playbook 02, owner 2026-11-10).
// Rules: text only (no image ever leaves here); Jev only WARNS, it never changes the case, never sets "pending" and never blocks. Any error or
// timeout = no warning. The two numbers below come from the owner's own tests: insurer 94.5% (43/43 at confidence >= 0.9), branch 98%.
export const MERIMEN_INSURERS = [
  "Allianz", "Etiqa General Insurance", "Etiqa General Takaful", "Liberty", "Syarikat Takaful Malaysia Am", "Takaful Ikhlas", "Zurich General Insurance",
  "Zurich General Takaful", "Generali", "Berjaya Sompo", "MSIG", "RHB", "Tokio Marine", "AIG", "Pacific & Orient", "The Pacific",
] as const;

// The code's own reading of an insurer name (most specific first). null = not one of the 16 Merimen insurers we know.
const INSURER_RULES: [RegExp, (typeof MERIMEN_INSURERS)[number]][] = [
  [/etiqa.*takaful|takaful.*etiqa|maybank.*takaful/i, "Etiqa General Takaful"],
  [/etiqa|maybank.*general/i, "Etiqa General Insurance"],
  [/zurich.*takaful|takaful.*zurich/i, "Zurich General Takaful"],
  [/zurich/i, "Zurich General Insurance"],
  [/allianz/i, "Allianz"],
  [/liberty/i, "Liberty"],
  [/ikhlas/i, "Takaful Ikhlas"],
  [/takaful\s+malaysia|syarikat\s+takaful/i, "Syarikat Takaful Malaysia Am"],
  [/generali/i, "Generali"],
  [/sompo/i, "Berjaya Sompo"],
  [/msig/i, "MSIG"],
  [/\brhb\b/i, "RHB"],
  [/tokio/i, "Tokio Marine"],
  [/\baig\b/i, "AIG"],
  [/pacific\s*(?:&|and)\s*orient|\bp\s*&\s*o\b/i, "Pacific & Orient"],
  [/the\s+pacific|pacific\s+insurance/i, "The Pacific"],
];
export function localInsurer(text: string): string | null {
  for (const [re, name] of INSURER_RULES) if (re.test(text)) return name;
  return null;
}

// Liberty files by region, chosen from the accident place (a branch "HQ" fails the create with VDV9302).
const REGIONS: Record<string, { states: RegExp; note: string }> = {
  "East Coast": { states: /terengganu|pahang|kelantan|kuantan|kuala\s+terengganu|kota\s+bharu/i, note: "Terengganu, Pahang, Kelantan" },
  "East Malaysia": { states: /sabah|sarawak|labuan|kuching|kota\s+kinabalu|\bmiri\b|\bsibu\b/i, note: "Sabah, Sarawak, Labuan" },
  "Klang Valley": { states: /selangor|kuala\s+lumpur|\bkl\b|putrajaya|petaling|shah\s+alam|\bklang\b|subang|cheras|kajang|gombak/i, note: "Selangor, Kuala Lumpur, Putrajaya" },
  "Northern": { states: /penang|pulau\s+pinang|kedah|perlis|\bperak\b|ipoh|alor\s+setar|butterworth|georgetown/i, note: "Penang, Kedah, Perlis, Perak" },
  "Southern": { states: /johor|melaka|malacca|negeri\s+sembilan|seremban|johor\s+bahru|\bjb\b/i, note: "Johor, Melaka, Negeri Sembilan" },
};
export function localRegion(place: string): string | null {
  const hit = Object.entries(REGIONS).filter(([, r]) => r.states.test(place)).map(([k]) => k);
  return hit.length === 1 ? hit[0] : null;
}

const CONF = 0.9; // a disagreement is shown only when Jev is this sure (owner's test: 43/43 right at confidence >= 0.9; nothing measured below)
type Choice = { choice?: unknown; confidence?: unknown };
type Reply = { answers?: Record<string, Choice | undefined> };
export type JevCtx = { purpose: string; userId?: string; caseId?: string };
export type Ask = (input: { state: unknown; questions: Record<string, unknown> }, ctx: JevCtx) => Promise<unknown>;

const defaultAsk: Ask = (input, ctx) => askJev(input as never, ctx); // askJev with a ctx logs one llm_calls row (jev-ledger.ts)

const pick = (r: Reply, id: string): { v: string; c: number } | null => {
  const a = r.answers?.[id];
  return a && typeof a.choice === "string" && typeof a.confidence === "number" ? { v: a.choice, c: a.confidence } : null;
};
const closed = (names: readonly string[], none: string) => Object.fromEntries([...names.map((n) => [n, null]), ["__none__", none]]);

/**
 * Event lines (stored in English, shown translated: see eventTr in case-text.ts) when Jev confidently disagrees with the code about the at-fault insurer, our client's insurer or the Liberty branch.
 * An empty list means "nothing to say". Never throws, never takes more than `ms`.
 */
export async function jevInsurerWarnings(data: CaseDataT, ctx: Omit<JevCtx, "purpose">, ask: Ask = defaultAsk, ms = 6_000): Promise<string[]> {
  if (process.env.JEV === "0") return []; // kill switch, same name as the worker's
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 160) : "");
  const targets: { key: "ins" | "cli"; label: string; text: string }[] = [];
  const atFault = str(data.at_fault?.policy?.insurer);
  const client = str(data.client_policy?.insurer);
  if (atFault) targets.push({ key: "ins", label: "at-fault", text: atFault });
  if (client) targets.push({ key: "cli", label: "client", text: client });
  const place = str(data.police?.place);
  const liberty = localInsurer(atFault ?? "") === "Liberty";
  const questions: Record<string, unknown> = {};
  for (const t of targets) questions[t.key] = { type: "choice", instructions: `Which Merimen insurer is \`${t.key}\`?`, criteria: closed(MERIMEN_INSURERS, "None of these insurers.") };
  if (liberty && place) {
    questions.br = { type: "choice", instructions: "This claim is against Liberty General Insurance. Which Liberty branch handles an accident at `place`?",
      criteria: { ...Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, "Liberty branch for " + r.note])), __none__: "Cannot tell from the place." } };
  }
  if (!Object.keys(questions).length) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("jev timeout")), ms); });
    const r = (await Promise.race([ask({ state: { ins: atFault ?? "", cli: client ?? "", place }, questions }, { ...ctx, purpose: "insurer" }), timeout])) as Reply;
    const out: string[] = [];
    for (const t of targets) {
      const j = pick(r, t.key);
      if (!j || j.c < CONF) continue;
      const mine = localInsurer(t.text);
      if (mine === null) continue; // our rules do not know this insurer (Maybank, Lonpac...): not a disagreement, nothing to say
      if (j.v !== "__none__" && !(MERIMEN_INSURERS as readonly string[]).includes(j.v)) continue; // an answer off the closed list is noise
      const jev = j.v === "__none__" ? null : j.v;
      if (jev !== mine) out.push(`Jev check: ${t.label} insurer "${t.text}": Jev says ${jev ?? "-"}, our rules say ${mine}`);
    }
    if (questions.br) {
      const j = pick(r, "br");
      const mine = localRegion(place);
      if (j && j.c >= CONF && j.v !== "__none__" && j.v in REGIONS && mine !== null && j.v !== mine) out.push(`Jev check: Liberty branch for "${place}": Jev says ${j.v}, our rules say ${mine}`);
    }
    return out;
  } catch {
    return []; // Jev off, slow or failing: no warning, the case goes on as before
  } finally {
    clearTimeout(timer);
  }
}
