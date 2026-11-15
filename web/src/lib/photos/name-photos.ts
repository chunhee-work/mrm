import "server-only";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { claude } from "@/lib/claude";
import { safeError } from "./log";
import { costCapUsd, normalizePick, photoModel, sliceCostUsd, sliceMatches, NEIGHBOURS, NONE, PART_NAMES, type ModelPick } from "./rules";
import { photoBase64 } from "./store";
import { claimSlice, failPending, pendingCount, retryFailed, spentUsd, writeFailed, writeName, type CaseRow, type Claimed } from "./server";

// Naming with Claude (plan #9). One slice = up to 8 photos plus neighbours for sequence context, 900 px copies only.
// Photos go to Anthropic only. Never to TypeSafe.

const MAX_IMAGES = 12;
const MAX_TOKENS = 2000;

const Picks = z.object({
  photos: z.array(z.object({
    n: z.number().describe("The n of the photo, exactly as given"),
    name: z.string().describe(`One name copied exactly from the list, or ${NONE}`),
    confidence: z.number().describe("0 to 1: how sure you are that this is the adjuster's name for the photo"),
    alts: z.array(z.string()).describe("Up to two other names from the list that could also be right, best first"),
  })),
});

// The rules are the owner's naming rules (playbook 03), shortened. This block is identical on every call so it is cached.
export const SYSTEM = `You name the photos of one Malaysian motor-claim case for a loss adjuster. Every photo gets ONE name from the closed list at the end.

How to pick the name
- The name is the part under the centre of the photo (where the vertical and horizontal midlines cross). Things near the edges are context only.
- A hand or finger holding, lifting or pointing at a part: that part is the name. This beats the centre rule.
- A new item starts with a wider shot; the close-ups after it belong to the same part, even if another part looks central. A new part starts when the angle or position changes. Use the photos before and after to decide.
- LH = the car's own left side, RH = the car's own right side (as seen from the driver's seat, looking forward). Work the side out from the picture, do not guess:
  - Looking at the car from the front: its RH is on the left of the photo, its LH on the right.
  - Looking at the car from behind: its LH is on the left of the photo, its RH on the right.
  - Looking at one side of the car: if the front of the car points to the right edge of the photo you are on its RH side; if it points to the left edge you are on its LH side.
  - A close-up of a wheel, suspension, lamp or door has the side of the wider shot just before it. A run of photos normally stays on one side of the car, so keep the side of the neighbouring photos unless the picture clearly shows the other side.
- Decide the area first (front, rear, side, under the car, engine bay, cabin) from the photo and its neighbours, then use names of that area only.
- One photo = one item. Never join two parts.
- Never pick a name containing "General View". A wide shot of the whole front is "Front View", of the whole rear "Rear View", of one side "Side View LH" or "Side View RH".
- The case normally opens with the four corner views (Front View Right, Front View Left, Rear View Right, Rear View Left), then Interior View (shot through the windscreen or of the dashboard) or Road Tax (the paper slip or disc), then Odometer Reading, Chassis Number, Engine Compartment.
- A dashboard photo, or a shot through the windscreen into the cabin, is "Interior View", even when a sticker is on the glass. "Road Tax" is only for a photo whose centre is filled by the road tax slip or the inspection disc itself.
- "Front Bumper" and "Rear Bumper" are one piece each: never add LH or RH to them. The side belongs to the smaller parts on the bumper (bracket, reflector, sensor, moulding).
- Boot Lid names are for 4-door saloons; Tailgate names are for hatchbacks, MPVs and SUVs. Never both on one car.
- One-piece rear lamp = Rear Lamp LH/RH. Split lamp: the piece on the body = Rear Lamp Outer LH/RH, the piece on the boot lid or tailgate = Rear Lamp Inner.
- Marked damage on the painted front bumper skin (around the grille opening or beside the headlamp) is "Front Bumper", not the grille or the fender.
- Only a PERODUA has "Bonnet Latch Stud Plate" and "Fender Inner LH/RH"; other makes use "Front Panel Assembly" for that area. A PERODUA has no "Front Panel Assembly".

Answer
- Give every photo marked NAME exactly one entry, with the same n. Do not answer for photos marked CONTEXT.
- "name" must be copied character for character from the list. If nothing in the list fits, or the photo is not of the car (a document, a person, the floor), use ${NONE}.
- "confidence": 0.9 or more when the part and its side are plain to see, which is the usual case for a clear photo. Below 0.9 only when you are really torn between two names, cannot tell the side, or the photo is too close or too dark to place.
- "alts": up to two other list names that could also be right, best first. Leave it empty when you are sure.

Closed list (one name per line)
${PART_NAMES.join("\n")}`;

type Block = Anthropic.Messages.ContentBlockParam;
type Row = { id: number; origN: number; position: number; thumbPath: string; modelName: string | null; finalName: string | null };

/** The claimed photos plus up to NEIGHBOURS photos on each side of each, capped, in display order. Frozen at claim time. */
export function pickContext(all: { id: number }[], claimedIds: Set<number>, max = MAX_IMAGES): number[] {
  const idx = all.map((r, i) => (claimedIds.has(r.id) ? i : -1)).filter((i) => i >= 0);
  const chosen = new Set(idx);
  for (let d = 1; d <= NEIGHBOURS; d++) {
    for (const i of idx) {
      for (const j of [i - d, i + d]) {
        if (chosen.size >= max) break;
        if (j >= 0 && j < all.length) chosen.add(j);
      }
    }
  }
  return [...chosen].sort((a, b) => a - b).map((i) => all[i].id);
}

function vehicleOf(c: CaseRow): string {
  const fromDocs = (c.caseData as { client_vehicle?: { model?: string | null } } | null)?.client_vehicle?.model;
  return (c.carModel || fromDocs || "").slice(0, 120);
}

export type CallResult = { picks: ModelPick[]; usage: Anthropic.Messages.Usage; model: string };

/** One Claude call. Any failure leaves as a short error with no request or response content attached. */
export async function callModel(vehicle: string, shots: { n: number; name: boolean; known: string | null; jpegBase64: string }[], modelEnv = process.env.CLAUDE_MODEL_PHOTOS): Promise<CallResult> {
  const model = photoModel(modelEnv);
  const content: Block[] = [{
    type: "text",
    text: `Vehicle: ${vehicle || "not known"}.\nThe photos follow in the order they were taken. Name the ${shots.filter((s) => s.name).length} photos marked NAME. Photos marked CONTEXT are neighbours, there for the sequence only.`,
  }];
  for (const s of shots) {
    content.push({ type: "text", text: s.name ? `Photo n=${s.n} · NAME` : `Photo n=${s.n} · CONTEXT${s.known ? ` (already named: ${s.known})` : ""}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.jpegBase64 } });
  }
  try {
    const res = await claude().messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(Picks) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw Object.assign(new Error("refusal"), { name: "Refusal" });
    if (!res.parsed_output) throw Object.assign(new Error("no output"), { name: res.stop_reason === "max_tokens" ? "OutputTooLong" : "NoOutput" });
    return { picks: res.parsed_output.photos as ModelPick[], usage: res.usage, model };
  } catch (e) {
    throw safeError("name-photos", e);
  }
}

export type SliceOutcome = { claimed: number; named: number; failed: number; remaining: number; capped: boolean };

/** Runs one naming slice for a case the caller already checked. */
export async function runSlice(c: CaseRow, opts: { retryFailed?: boolean } = {}): Promise<SliceOutcome> {
  if (opts.retryFailed) await retryFailed(c.id);

  if ((await spentUsd(c.id)) >= costCapUsd(process.env.PHOTO_COST_CAP_USD)) {
    const n = await failPending(c.id, "cost limit reached");
    return { claimed: 0, named: 0, failed: n, remaining: await pendingCount(c.id), capped: true };
  }

  const claimed = await claimSlice(c.id);
  if (!claimed.length) return { claimed: 0, named: 0, failed: 0, remaining: await pendingCount(c.id), capped: false };
  const byId = new Map<number, Claimed>(claimed.map((x) => [x.id, x]));

  let named = 0;
  try {
    const all: Row[] = await db.select({
      id: schema.casePhotos.id, origN: schema.casePhotos.origN, position: schema.casePhotos.position,
      thumbPath: schema.casePhotos.thumbPath, modelName: schema.casePhotos.modelName, finalName: schema.casePhotos.finalName,
    }).from(schema.casePhotos).where(eq(schema.casePhotos.caseId, c.id)).orderBy(asc(schema.casePhotos.position), asc(schema.casePhotos.id));
    const rowOf = new Map(all.map((r) => [r.id, r]));
    const ids = pickContext(all, new Set(byId.keys()));
    const shots = await Promise.all(ids.map(async (id) => {
      const r = rowOf.get(id)!;
      return { n: id, name: byId.has(id), known: byId.has(id) ? null : r.finalName ?? r.modelName, jpegBase64: await photoBase64(r.thumbPath) };
    }));

    const vehicle = vehicleOf(c);
    const out = await callModel(vehicle, shots);
    try {
      await db.insert(schema.usage).values({
        caseId: c.id, inputTokens: out.usage.input_tokens, outputTokens: out.usage.output_tokens,
        cacheTokens: out.usage.cache_read_input_tokens ?? 0, costUsd: sliceCostUsd(out.model, out.usage).toFixed(4),
      });
    } catch { /* a failed ledger write never fails naming */ }

    if (!sliceMatches([...byId.keys()], out.picks)) throw Object.assign(new Error("mismatch"), { name: "AnswerMismatch" });
    for (const p of out.picks) {
      const cl = byId.get(p.n)!;
      if (await writeName(cl, normalizePick(p, vehicle, rowOf.get(p.n)?.origN ?? 0))) named++;
      byId.delete(p.n);
    }
  } catch (e) {
    const msg = e instanceof Error && e.name === "PhotoError" ? e.message : safeError("name-photos", e).message;
    await writeFailed([...byId.values()], msg);
    return { claimed: claimed.length, named, failed: byId.size, remaining: await pendingCount(c.id), capped: false };
  }
  return { claimed: claimed.length, named, failed: 0, remaining: await pendingCount(c.id), capped: false };
}
