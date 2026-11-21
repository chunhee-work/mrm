/**
 * Which sides of the car were hit, read from the part names of a case (photo names and extra parts).
 * "Front Bumper" → front, "RH Rear Door" → right + rear, "Bonnet" → front. LH is left, RH is right (Malaysian right-hand-drive
 * naming, as on the photo desk). A name that says nothing about a side (e.g. "Battery") adds nothing.
 */
export const SIDES = ["front", "rear", "left", "right"] as const;
export type Side = (typeof SIDES)[number];

// not damage: documents and interior items that may carry a side word
const SKIP = /\b(odometer|chassis|vin|plate|seat|seatbelt|interior|dashboard|accident|document|ic|licence|license)\b/i;
const FRONT = /\b(front|bonnet|hood|grille|grill|headlamp|headlight|head lamp|windscreen|windshield|radiator|fog ?lamp)\b/i;
const REAR = /\b(rear|tail ?lamp|tail ?light|tail ?gate|boot|trunk|back ?glass|back ?door)\b/i;
const LEFT = /\b(lh|left|nearside)\b/i;
const RIGHT = /\b(rh|right|offside)\b/i;

export function sidesOf(names: Iterable<string | null | undefined>): Side[] {
  const hit = new Set<Side>();
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (!n || SKIP.test(n)) continue;
    if (FRONT.test(n)) hit.add("front");
    if (REAR.test(n)) hit.add("rear");
    if (LEFT.test(n)) hit.add("left");
    if (RIGHT.test(n)) hit.add("right");
  }
  return SIDES.filter((s) => hit.has(s));
}
