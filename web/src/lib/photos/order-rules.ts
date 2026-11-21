// Pure rules about the ORDER and the Merimen side of a case's photos (playbook 03 "Order + opening shots", 06 "Photos").
// No I/O, no React, client-safe: unit-tested in test/photo-order.test.ts. The worker has the same rules in worker/autopilot_worker/photo_rules.py
// (both read playbook/photo-rules.json), and golden vectors keep the two in step.
import { PHOTO_RULES } from "../playbook/photo-rules";
import { inList } from "./rules";

const R = PHOTO_RULES;
type Shown = { id: number; name: string | null };

// ---- the opening block: four corners, Interior View / Road Tax, Odometer, Chassis, Engine ----
const RANK = new Map<string, number>([
  ...R.opening.corners.map((n, i) => [n, i] as [string, number]),
  ...R.opening.idShots.map((n, i) => [n, R.opening.corners.length + i] as [string, number]),
  [R.opening.odometer, R.opening.corners.length + R.opening.idShots.length],
  [R.opening.chassis, R.opening.corners.length + R.opening.idShots.length + 1],
  [R.opening.engine, R.opening.corners.length + R.opening.idShots.length + 2],
]);

/**
 * The photos in the order Merimen wants: first corner view of each kind (FVR, FVL, RVR, RVL), then Interior View / Road Tax,
 * Odometer Reading, Chassis Number, every Engine Compartment shot, then everything else in the order it already had.
 * Searches ALL photos (playbook 03: the owner had to drag them to the front by hand). Never changes names.
 */
export function arrangeOpening<T extends Shown>(photos: T[]): T[] {
  const take = new Set<number>();
  const front: T[] = [];
  const firstOf = new Set<string>();
  const ranked = photos.filter((p) => p.name != null && RANK.has(p.name)).sort((a, b) => RANK.get(a.name!)! - RANK.get(b.name!)!);
  for (const p of ranked) {
    const n = p.name!;
    const many = n === R.opening.engine; // every engine shot goes up front, the others only once
    if (!many && firstOf.has(n)) continue;
    firstOf.add(n);
    take.add(p.id);
    front.push(p);
  }
  return [...front, ...photos.filter((p) => !take.has(p.id))];
}
export const sameOrder = (a: Shown[], b: Shown[]) => a.length === b.length && a.every((p, i) => p.id === b[i].id);

/** Opening shots the case does not have (by shown name). Corner views are listed one by one; "Interior View / Road Tax" counts as one slot. */
export function openingMissing(names: (string | null)[]): string[] {
  const have = new Set(names.filter((n): n is string => !!n));
  const out: string[] = R.opening.corners.filter((n) => !have.has(n));
  if (!R.opening.idShots.some((n) => have.has(n))) out.push(R.opening.idShots.join(" / "));
  for (const n of [R.opening.odometer, R.opening.chassis, R.opening.engine]) if (!have.has(n)) out.push(n);
  return out;
}

// ---- Merimen file type (FTYPE) of each photo (playbook 06) ----
export function fileTypeOf(name: string | null): string {
  if (name && (R.opening.corners as readonly string[]).includes(name)) return R.fileTypes.corner;
  return (name && (R.fileTypes.byName as Record<string, string>)[name]) || R.fileTypes.default;
}

export type PlanRow = { id: number; position: number; srcName: string; name: string; fileType: string };
export type PlanSummary = { photos: number; rows: PlanRow[]; types: Record<string, number> };
/** The case's photo plan: what Merimen will get, in order, each with its file type. Photos without a name are left out (done is blocked while any exist). */
export function photoPlan(photos: { id: number; srcName: string; name: string | null }[]): PlanSummary {
  const rows: PlanRow[] = [];
  photos.forEach((p) => { if (p.name) rows.push({ id: p.id, position: rows.length + 1, srcName: p.srcName, name: p.name, fileType: fileTypeOf(p.name) }); });
  const types: Record<string, number> = {};
  for (const r of rows) types[r.fileType] = (types[r.fileType] ?? 0) + 1;
  return { photos: rows.length, rows, types };
}

// ---- case-level naming rules: badge brand, Rear Lamp Inner/Outer pairing ----
export type RuleRow = { id: number; modelName: string | null; confidence: number | null };
export type RuleChange = { id: number; modelName: string; confidence: number | null; why: "badge" | "rear_lamp" };

/** The make: first word of the vehicle line, or the first two for two-word makes (Land Rover, Great Wall). */
export function brandOf(vehicle: string): string {
  const w = vehicle.toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  const two = w.slice(0, 2).join(" ");
  return (R.badge.twoWordBrands as readonly string[]).includes(two) ? two : w[0];
}
const BADGE = new RegExp(`^(${R.badge.families.join("|")}) \\((.*)\\)$`, "i");
const cap = (s: string) => s.toUpperCase();

/**
 * Playbook 11: the text in a badge bracket is ALWAYS CAPITALS, and a bare logo badge ("LOGO", or one letter) is the car's brand.
 * Returns the name to use, or null when no change is needed. A brand that is not in the name list is not invented (the caller marks it for confirming).
 */
export function badgeName(name: string, vehicle: string): string | null {
  const m = BADGE.exec(name);
  if (!m) return null;
  const family = R.badge.families.find((f) => f.toLowerCase() === m[1].toLowerCase())!;
  const raw = m[2].trim();
  const bare = raw.length === 1 || (R.badge.logoWords as readonly string[]).includes(raw.toUpperCase());
  const brand = brandOf(vehicle);
  const want = `${family} (${cap(bare && brand ? brand : raw)})`;
  if (want === name) return null;
  return inList(want) ? want : null;
}

/**
 * Case-level rules on the MODEL's names (never on a name the adjuster set): Badge (LOGO) becomes Badge (BRAND), and a case with Rear Lamp Inner
 * (or Outer) also has the other one, so a plain "Rear Lamp LH/RH" becomes the missing one and is marked unsure (playbook 03, user 2026-11-03).
 */
export function applyCaseRules(rows: RuleRow[], vehicle: string): RuleChange[] {
  const out: RuleChange[] = [];
  const pair = new RegExp(R.rearLamp.pair);
  const plain = new RegExp(R.rearLamp.plain);
  const have = new Set(rows.map((r) => r.modelName && pair.exec(r.modelName)?.[1]).filter((x): x is string => !!x));
  const to = have.size ? (have.has("Inner") ? "Outer" : "Inner") : null;
  for (const r of rows) {
    if (!r.modelName) continue;
    const b = badgeName(r.modelName, vehicle);
    if (b) { out.push({ id: r.id, modelName: b, confidence: r.confidence, why: "badge" }); continue; }
    const m = plain.exec(r.modelName);
    if (m && to) {
      const next = `Rear Lamp ${to} ${m[1]}`;
      if (inList(next)) out.push({ id: r.id, modelName: next, confidence: Math.min(r.confidence ?? 1, R.rearLamp.unsure), why: "rear_lamp" });
    }
  }
  return out;
}
