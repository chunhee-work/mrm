/**
 * Which sides of the car were hit, read from the part names of a case (photo names and extra parts).
 * LH is left, RH is right (as on the photo desk). A name that says nothing about a side (e.g. "Battery") adds nothing.
 *
 * Position words and body parts:
 *  - Door, fender, quarter, wheel, mirror, pillar, sill, panel with LH/RH: only that lateral side. "RH Rear Door" is the
 *    right side, not right + rear; "LH Front Fender" is the left side.
 *  - Front/rear parts (bumper, bonnet, boot, lamps, windscreen ...) with LH/RH: the end and the lateral side
 *    ("Headlamp LH" is front + left).
 *  - Front/rear word on its own ("Front Bumper", "Rear Fog Lamp"): that end.
 */
export const SIDES = ["front", "rear", "left", "right"] as const;
export type Side = (typeof SIDES)[number];

// Not damage: documents, interior items and whole-car overview shots. Anchored, so real parts such as
// "LH Side View Mirror" or "Rear View Camera" still count.
const SKIP = [
  /\b(odometer|chassis|vin|plate|seat|seatbelt|interior|dashboard|document|licence|license)\b/i,
  /\baccident (damages? )?photo\b/i,
  /\boverview\b|\bwhole car\b/i,
  /^\s*((front|rear|left|right|lh|rh)\s+)*(side\s*)?(view|45\s*(deg|°)?(\s*view)?)\s*$/i,
];
const FRONT = /\b(front|bonnet|hood|grille|grill|headlamp|headlight|head lamp|windscreen|windshield|radiator|depan)\b/i;
const REAR = /\b(rear|tail ?lamp|tail ?light|tail ?gate|boot|trunk|back ?glass|belakang)\b/i;
const LEFT = /\b(lh|left|nearside|kiri)\b/i;
const RIGHT = /\b(rh|right|offside|kanan)\b/i;
// parts that sit on a side of the car: a front/rear word on them is a position (which door), not the hit end
const SIDE_PART = /\b(door|fender|wing|quarter|wheel|tyre|tire|rim|mirror|pillar|sill|rocker|side ?panel|bodyside|pintu)\b/i;

export function sidesOf(names: Iterable<string | null | undefined>): Side[] {
  const hit = new Set<Side>();
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (!n || SKIP.some((r) => r.test(n))) continue;
    const l = LEFT.test(n), r = RIGHT.test(n);
    if (l) hit.add("left");
    if (r) hit.add("right");
    const lateralOnly = (l || r) && SIDE_PART.test(n);
    if (lateralOnly) continue;
    if (FRONT.test(n)) hit.add("front");
    if (REAR.test(n)) hit.add("rear");
  }
  return SIDES.filter((s) => hit.has(s));
}
