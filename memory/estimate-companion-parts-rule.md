---
name: estimate-companion-parts-rule
description: "When building an estimate: Bumper→Bumper Clips x15, Grille→Grille Clips x9, Bonnet→Bonnet Hinge x2, Rear Suspension Crossmember→Rear Wheel Hub, Door→8 door items; add manually if not in catalogue"
metadata:
  type: feedback
---

User rule (2026-10-10, shown on [PLATE] where the user added these rows himself): whenever I build an estimate's parts list, ALWAYS add the companion items:
- any **Bumper** (front or rear) → **Bumper Clips, qty 15** (same section as the bumper)
- any **Grille** → **Grille Clips, qty 9**
- **Bonnet** → **Bonnet Hinge, qty 2** (one row, qty 2)
- **Rear Suspension Crossmember** → **Rear Wheel Hub** (qty 1, in the rear quarter & susp. section of the damaged side)
- any **Door** (e.g. Door Rear RH) → in that door's section add: **Door <Front/Rear> Hinge, Door <..> Lock, Door <..> Striker, Door <..> Trimboard, Door <..> Weatherstrip Sheeting, Door <..> Regulator Motor, Door <..> Aperture Weatherstrip, Door <..> Handle Outer Release** (qty 1 each)
- If the Select Parts catalogue doesn't have the item → **add it manually** ("Add New Replacement Part to [section]").
Also fill a price for every row (reference prices; flag estimates) and run step 2 so every row gets a damage condition.

**Why:** user's standard connected-parts set. **How to apply:** generate these rows automatically from the main part list before adding parts (Rawang: `addparts.mjs`; MRC accounts: tick in Select Parts or add manually). Related: [[merimen-precase-checklist]], [[merimen-rawang-account]], [[merimen-estimate-select-parts]].

**Bonnet Hinge detail (user screenshot 2026-10-10):** qty **2** with the row comment **"Front LH & Front RH"** (set via the qty/blue-number menu → Add/Edit Comment).

**More rules (user 2026-10-10, during [PLATE]):**
- **Bumper Sensor** → qty **2**, comment **"Rear LH & Rear RH"** (or "Front LH & Front RH" for front sensors) — one row.
- **Bumper Bracket** → same: qty **2**, comment "Rear LH & Rear RH" / "Front LH & Front RH".
- **Boot Lid** (sedan) → **Boot Lid Hinge** (qty 2, "LH & RH") + **Rear Number Plate** — **NO Support Strut** (user correction: boot lid has no strut). **Tailgate** (hatch/MPV) → **Tailgate Hinge** (qty 2) + **Tailgate Support Strut** (qty 2, "LH & RH") + **Rear Number Plate** (use misc "Number plate, rear" if that misc row exists, else add as part).

- **Door Hinge** → ONE row, qty **2**, comment **"Upper LH & Lower LH"** / **"Upper RH & Lower RH"** (side of the door) — user 2026-10-10.
- **Clarification (user 2026-10-10):** the "qty 2 + comment (Upper/Lower, LH & RH)" form is ONLY for a single manually-added row. If the model's Select Parts catalogue already has the separate parts (e.g. Door Front Hinge Upper LH + Door Front Hinge Lower LH, Sensor LH + Sensor RH), tick each separately — **no comment needed**.
- **Rear suspension → crossmember (user 2026-10-10):** if ANY of **Rear Shock Absorber (LH/RH), Rear Suspension Spring, Rear Suspension Upper Arm, Rear Suspension Lower Arm** is selected → MUST also select **Rear Suspension Crossmember** (which in turn brings **Rear Wheel Hub**).
- **Boot Lid Hinge (user 2026-10-10, [PLATE]):** if the Boot Lid section of the catalogue lists only ONE side (e.g. only "Boot Lid Hinge RH"), select that one row, qty **2**, comment **"Rear LH & Rear RH"**. Do NOT go hunting for the other side in another group ([PLATE]'s "Boot Lid Hinge LH" sat under group 100 Front Door RH — wrong to use). Don't strip a comment the user already put on a row.

## ⭐ MUST-CHOOSE when the part is in the photos (user 2026-10-10)
- **Fender** (LH/RH) → **Fender Liner** (same side)
- **Bonnet** → **Bonnet Hinge** (LH+RH; catalogue separate → tick both, else 1 row x2 "Front LH & Front RH")
- **Bumper** (front/rear) → **Bumper Sensor LH & RH** + **Bumper Bracket (LH & RH)** (+ Bumper Clips x15)
- **Quarter Panel** (LH/RH) → **Quarter Panel Liner** (LH & RH per user wording — same side as the quarter panel; both if both quarters)
- **Boot Lid** → **Boot Lid Lock + Boot Lid Striker + Boot Lid Hinge + Boot Lid Aperture Weatherstrip** (+ Rear Number Plate misc)
- **Tailgate** → same set: **Tailgate Lock + Striker + Hinge + Aperture Weatherstrip** (+ Tailgate Support Strut LH&RH + Rear Number Plate)
