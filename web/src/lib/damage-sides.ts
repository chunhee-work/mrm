/**
 * Which sides of the car were hit, read from the part names of a case (photo names and extra parts).
 * LH is left, RH is right (as on the photo desk). A name that says nothing about a side (e.g. "Battery") adds nothing.
 *
 * Position words and body parts:
 *  - Door, fender, quarter, wheel, mirror, pillar, sill, panel: never an end. "RH Rear Door" is the right side, not
 *    right + rear; "Front Door" with no LH/RH adds nothing; "LH Front Fender" is the left side.
 *  - Front/rear parts (bumper, bonnet, boot, lamps, windscreen ...) with LH/RH: the end and the lateral side
 *    ("Headlamp LH" is front + left).
 *  - Front/rear word on its own ("Front Bumper", "Rear Fog Lamp"): that end.
 */
export const SIDES = ["front", "rear", "left", "right"] as const;
export type Side = (typeof SIDES)[number];

// Not damage: documents, interior items and whole-car overview shots. Anchored, so real parts such as
// "LH Side View Mirror" or "Rear View Camera" still count.
const SKIP = [
  // the whole name is a document or plate shot ("Odometer", "Number Plate", "Chassis No"); a part that merely contains
  // such a word ("Front Chassis Rail LH", "Rear Number Plate Garnish") is still a part
  /^\s*(odometer|chassis( no\.?| number)?|vin|(number|registration|licen[cs]e|reg)? ?plate|documents?|licen[cs]e|dashboard|interior)\s*$/i,
  /\b(seat|seatbelt|interior|dashboard)\b/i,
  /\baccident (damages? )?photo\b/i,
  /\boverview\b|\bwhole car\b/i,
  /^\s*((front|rear|left|right|lh|rh)\s+)*(side\s*)?(view|45\s*(deg|°)?(\s*view)?)(\s+(front|rear|left|right|lh|rh))*\s*$/i,
];
const FRONT = /\b(front|bonnet|hood|grille|grill|headlamp|headlight|head lamp|windscreen|windshield|radiator|fog ?lamp|depan)\b/i;
const REAR = /\b(rear|tail ?lamp|tail ?light|tail ?gate|boot|trunk|back ?glass|back ?door|back ?bumper|back ?panel|belakang)\b/i;
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
    // a side part never marks an end (a "Front Door" is on the side), except a tail gate / back door
    if (SIDE_PART.test(n) && !/\b(tail ?gate|back ?door)\b/i.test(n)) continue;
    // "Rear Windscreen" is the rear, not the front
    const rearWord = REAR.test(n);
    // a word that is only a front part when nothing says rear: "Rear Windscreen", "Rear Fog Lamp"
    const rearOnly = rearWord && !/\b(front|bonnet|hood)\b/i.test(n) && /\b(windscreen|windshield|fog ?lamp)\b/i.test(n);
    if (FRONT.test(n) && !rearOnly) hit.add("front");
    if (rearWord) hit.add("rear");
  }
  return SIDES.filter((s) => hit.has(s));
}
