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
- **Boot Lid / Tailgate** → must also have **Boot Lid (Tailgate) Hinge** (qty 2, "LH & RH"), **Support Strut** (qty 2, "LH & RH"), and **Rear Number Plate** (use misc "Number plate, rear" if that misc row exists, else add as part).
