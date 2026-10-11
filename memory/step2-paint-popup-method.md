---
name: step2-paint-popup-method
description: "STEP 2 paint (from 2026-10-07): Paintwork Materials → Edit → Manufacturer Other + 'anything', consumables UNticked, Submit→OK→Save. No more RM500 paint."
metadata:
  type: feedback
---

**User rule (2026-10-07, screen recording "Screen Recording 2026-10-07 at 7.36.31 PM.mov" on Desktop; user: "this is how to set the things moving forward … the last message i sent is for step 2").**

In step 2, the Paintwork Materials section is set like this — it REPLACES the old "tick Paint Consumables MPWCB1 + MPWCV1=500" and "misc Paintwork material (Solvent)=500" rules:
1. Miscellaneous tab → Paintwork Materials row → **Edit** (`PWEdit(0,0)`).
2. Popup: **Paint Manufacturer = Other** (`#slePNTMAN` value `-1`) and type **`anything`** in the box beside it (`#sleMANCUSTOM`).
3. Base/Type/Range blank, **Paint Consumables UNTICKED**, no panels.
4. **Submit** → "Unsaved values will be reset. Confirm to proceed?" → **OK** → row shows "Paint Manufacturer: anything", price 0.00 → **Save**.

**Why:** user's own procedure for step 2 going forward.
**How to apply:** do the paint popup FIRST (its confirm resets unsaved values), save, reload, then fill Damage Cond + misc (misc "paintwork" rows skipped). Implemented in `~/mrm-bot/pwset.mjs` (`paintStep`) imported by `estfill.mjs`; spec in `STEP2_SPEC.md` §6. Cases done before 2026-10-07 still carry the old RM500 — only change them if the user asks. Needs parts selected first (no paint row without parts). Related: [[merimen-az-progress]], [[merimen-estimate-formula]].

**Update 2026-10-10 (user screenshot, [PLATE] Rawang):** on estimates whose Paintwork section has the two lines **"Paintwork material (Solvent)" → 500.00** and **"Paintwork material (Water-based)" → 0.00** (leave), fill Solvent = 500 (the popup method applies to the single "Paintwork Materials" Edit row). Also misc **Radiator coolant = 35.00** (our price). Both now in estfill.mjs misc().

**⭐ USER RULE 2026-10-10: "step 2" NOW INCLUDES SELECT PARTS.** When the user says "step 2", I must ALSO select the damaged parts myself (previously the user did this): build the part list from the per-photo item-name labels the user wrote in Merimen (dsp_docview labels; skip view/document labels), add companion parts per [[estimate-companion-parts-rule]], put each in its car section, fill prices (reference data; flag estimates), Save — THEN Damage Cond + misc + paint as before. MRC accounts: tick in Select Parts catalogue (add manually if missing); no-catalogue accounts (Rawang): `addparts.mjs`. Qty field = `PBT<row>`, row comment = `PCM<row>`.

**⭐ Update 2026-10-11 (user screenshot): the "Paintwork Materials" row (after the Edit popup → Manufacturer "anything") must have Price = 500.00, NOT 0.** estfill.mjs now: popup first, then sets that row's MMI = 500 (forces readOnly off). If the estimate instead has the "Paintwork material (Solvent)" line, Solvent = 500 and the generic row is skipped (never 500 twice). Applied retroactively to all popup-method cases (sinar2 batch + [PLATE]) on 2026-10-11.
