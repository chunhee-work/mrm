import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { sidesOf, type Side } from "./damage-sides";

/** Hit sides for each case: from the final photo names (the adjuster's name wins over the model's) and the extra parts. */
export async function sidesForCases(caseIds: string[]): Promise<Map<string, Side[]>> {
  const out = new Map<string, Side[]>();
  if (!caseIds.length) return out;
  const [photos, extras] = await Promise.all([
    db.select({ caseId: schema.casePhotos.caseId, final: schema.casePhotos.finalName, model: schema.casePhotos.modelName }).from(schema.casePhotos).where(inArray(schema.casePhotos.caseId, caseIds)),
    db.select({ caseId: schema.caseExtras.caseId, name: schema.caseExtras.name }).from(schema.caseExtras).where(inArray(schema.caseExtras.caseId, caseIds)),
  ]);
  const names = new Map<string, string[]>();
  const add = (id: string, n: string | null) => { if (n) (names.get(id) ?? names.set(id, []).get(id)!).push(n); };
  for (const p of photos) add(p.caseId, p.final ?? p.model);
  for (const e of extras) add(e.caseId, e.name);
  for (const [id, list] of names) out.set(id, sidesOf(list));
  return out;
}
