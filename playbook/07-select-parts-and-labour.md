# 07 · Step 2: Select Parts + Labour (dsp_selection, step 9)

The most error-prone step. Read this whole file before every case. Step 2 = select the parts AND tick Labour N/R + Misc, all from the photos; then conditions/prices/paint (08). [step2-paint-popup-method] [labour-n-r-selection] [merimen-batch-workflow]

## Before you start
- ⭐⭐ **Step 2 head start + one-shot finish (user 2026-11-04, "make the workflow faster"):**
  1. Phase A step 12 (`phase_a.py`) dumps every catalogue READ-ONLY (nothing ticked) and drafts `tick/miss/plan_<P>` from the MODEL's names.
  2. Right after `照片命名台 ready`, launch the planning agents (`tools/step2/brief.md`) on the model names, while the user is still naming.
  3. After the user's "done": dump db, `naming.py final` (prints the edits) → planning agents in **REVISE mode** with only the changed names (cases with no change: nothing) → relabel/reorder photos at the same time.
  4. `BATCH_DIR=$B NAMES_DIR=<dump>/names WORKSHOP="<sheet name>" PAR=6 python3 tools/step2/apply_plan.py <ALL PLATES>` in ONE run (never two runs at once). It ends with `tools/step2/finish.py`: plan "delete" rows (Thatcham Door Rear…), N/A prices, qty-2 comments, checkall, sync_check, and the sheet rows. Fix only what it still lists.
- ⭐ **Do Step 2 in parallel** (user 2026-10-29, "step 2 quite slow"): dump all catalogues at once (`selcat2.mjs` in parallel), run `step2_plan.py` for every case, then launch planning agents (2–3 cases each, `tools/step2/brief.md`) in one message, and apply with `tools/step2/apply_plan.py` (runs PAR=3 cases at once; parts + labour + misc are ticked in ONE save per case — `tickall.mjs` now takes `CM` too). See 00.
- ⭐⭐ **Gate: start only after the user has said the 照片命名台 is finished** (user 2026-10-23). Build parts, labour and misc from the user's FINAL names, never from the model's first guesses. After ticking, run `tools/naming-desk/sync_check.py` and fix everything until all cases print OK.
- Re-read the artifact's db `names`/`orders` (03): the user may have edited them. [merimen-batch-workflow]
- Look at the PHOTOS themselves, not just the name text: what each photo shows decides parts, companions, quantities and labour ("only u got the image then u know what to choose"). [merimen-batch-workflow]
- Re-read dsp_selection + dsp_details first; never duplicate rows/ticks the user already added; don't overwrite labour the user already ticked. [mistakes-log-sinar-batch2] [labour-n-r-selection]
- Skip view/document names (Front View, Odometer Reading, Road Tax…) when building the parts list. [step2-paint-popup-method]

## Tools + commands
- Dump the catalogue: `node selcat2.mjs <cid> <ext> session_base.txt <out.json>`; match names with `typesafe/partmatch.py` (plan builder `typesafe/step2_plan.py`: exact-name first, group-aware, clips per bumper, crossmember companions). [merimen-batch-workflow]
- Tick: `node tickall.mjs <cid> <ext> session_base.txt tick.json` with `{"CP":[catalogue values],"N":[labour labels],"R":[labour labels]}`; it saves and clicks Thatcham "Apply & Submit". Redirect output to a log, never `| head`. [merimen-batch-workflow] [mistakes-log-sinar-batch2]
- Verify: `node selstate.mjs <cid> <ext> session_base.txt`. Remove wrong ticks: `node untick.mjs <cid> <ext> session_base.txt '<json>'`. [merimen-batch-workflow]
- Then `node gonext.mjs <cid> <ext> session_base.txt` → dsp_details. [merimen-batch-workflow]
- Thatcham Advisory modal ("Thatcham require you to also select…") after Save: nothing is saved until "Apply & Submit" is clicked; keep the R&R items Thatcham adds.
- ⭐⭐ **PROTON SAGA and PERODUA MYVI: Thatcham auto-adds "Door Rear LH/RH" (part + labour N) whenever Quarter Panel Outer is selected** ("Door Rear LH — related to Quarter Panel Outer LH"). Unticking on dsp_selection does not stick (Apply & Submit adds it back). After Select Parts, check the parts page: a Door Rear with NO Door Rear photo → delete it on the parts page (`node delrow.mjs <cid> <ext> session_base.txt "Door Rear LH"`, sets qty 0). KER815 / TCH9615 had this (user 2026-10-24). [merimen-step2-estimate-detail-fill]
- Catalogue accounts (Autoris/Newvest, MRC): tick in the catalogue, add manual rows for misses; no-catalogue accounts (Rawang): everything via `addparts.mjs`. Qty field `PBT<row>`, row comment `PCM<row>`. [step2-paint-popup-method] [estimate-companion-parts-rule]

## Rule 1 — every photographed item goes in
- ⭐⭐ **(user 2026-10-23, MUST): every item that has a photo is selected in Select Parts, NO MATTER whether it looks broken or not.** Never drop a photographed item because it "looks intact", "damage not clear" or "probably no sensor". The photo name decides; if you think the name is wrong, the user fixes the name in the 照片命名台 — you still select the named item. After ticking, run the photo-vs-selection check (every non-view photo name must match a selected catalogue item or a manual row) and fix every gap before reporting. [mistakes-log-sinar-batch2]
- ⭐⭐ **The estimate row must carry THE PHOTO'S NAME (user 2026-10-30, batch 5: "all item in the 照片命名台 must be choose"). A closest catalogue item is allowed ONLY when it is the SAME part under another name** (user 2026-10-30: Bonnet Lock = Bonnet Latch RH; Bumper Front Moulding = Bumper Front Finisher/s; Fender Inner Wheelhouse RH = Fender Front Inner Support Panel RH). Never a different kind of part: Bumper ≠ Bumper Spoiler; Front/Rear Bumper Spoiler ≠ Body Kit [Bumper Frt/Rear Skirt]; Runningboard Spoiler LH ≠ Body Kit [Side Skirt LH] / Runningboard Panel; Moulding Fender Front ≠ Fender Signal Lamp. Same part → tick it and add the pair to ALIAS in sync_check.py; different part / not in the catalogue → manual row with the photo's name. Every `SYNC ADD?` from checkall is a MISS to fix, never something to explain away.
- Every item named in the artifact / seen in the photos must be in the estimate. A catalogue miss becomes a MANUAL row (08), never a drop. [estimate-select-parts-rules-2026-10-17] [mistakes-log-sinar-batch2]
- Missed before: BRS8642 front + rear Wheel Rim RH, Runningboard Spoiler RH, Door Mirror RH; VDD414 Spare Wheel Well; FB438 Bumper Front Fog Lamp LH (user added at 763.00). [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Case note: TCP4539 also needed Fender Front Inner Wheel House RH.
- ⭐⭐⭐ **The PART NUMBER decides (user 2026-11-04: "moving forward the part number always the right one").** When the photo name is not the catalogue name, compare the part number in the catalogue label `(…)` with the maker's name for that number (maker parts sites / EPC; Mazda: the middle+last code, e.g. `-70-15X` = Panel(R) Wheel House = inner wheelhouse RH, `-71-15X` = LH, `-71-11Y` = outer wheelhouse). Same part → tick the catalogue item (it carries the right part number). Different or not found → manual row with the photo name + a flag. Never decide by the name alone, either way. PRM7898 (Mazda 3 2022): photo "Rear Wheelhouse RH" = catalogue **Wheel Arch Inner Rear RH (BEYN7015X)** — correct; I first wrongly swapped it to a manual row by name.
- ✅ User-confirmed pair: **Bumper Front Lower Grille = Grille Front Lower** (user 2026-11-04, JSF901 Bezza).
- ✅ User-confirmed pair: **Firewall Panel = Engine Partition Panel** (user 2026-11-04, VAW8266 Vios, part 551010D610) → tick the catalogue Engine Partition Panel. [photo-center-crosshair-rule]

## Rule 2 — pick the right catalogue item
- Exact name first; never a loose match ("Door Mirror Cover RH" ≠ Door Mirror RH; "Door Lock Central Locking Switch" / "Vehicle Lock Cylinder Set" ≠ Door Lock). [mistakes-log-sinar-batch2]
- Same side as the photo (RH damage → RH item). [estimate-select-parts-rules-2026-10-17]
- Use the item in the photo's own group; when the same text exists in two groups, take the right group (TCP4539 rim: 110@ RH, not 30@ LH). [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Rear lamps from the Rear Panel group 70@, not 60@. [mistakes-log-sinar-batch2]
- Same text in two groups and both axles hit → qty 2 (BRS8642 rims). [mistakes-log-sinar-batch2]
- Don't go hunting for the other side in an unrelated group (Boot Lid Hinge LH under 100 Front Door RH is wrong). [estimate-companion-parts-rule]
- PERODUA: never Front Panel Assembly → Front Panel Upper / Fender Inner LH/RH / Front Crossmember / Front Panel Lower. Other makes: Front Panel Assembly. [perodua-front-panel-rule] [mistakes-log-sinar-batch2]
- ⭐ **Front Chassis Member on a side → also tick that side's Chassis Member Front End Plate, … Front Section and … Rear Section whenever the catalogue has them** (user 2026-10-30, WUE6407 Viva: End Plate RH + RH Front Section + RH Rear Section). checkall flags `CHASSIS SET missing`.
- LORRY: "Front Chassis Member" with no side. [lorry-front-chassis-member]
- Photo **Door Front/Rear Window LH/RH** = catalogue **Door Glass Front/Rear Window LH/RH** as a PART (not only R labour). KCM8604 missed both (user 2026-10-23).
- Photo **Rear Bumper Spoiler** on a car whose catalogue has one side-less "Spoiler Bumper Rear" (Corolla Altis BMN7769) → that item, qty 1, no comment (user 2026-10-23).
- ⭐ **Photo Front/Rear Chassis Member LH/RH and the catalogue has BOTH an "Extension" and a "Section" item for that axle + side (e.g. Chassis Member Rear Extension RH + Chassis Member Rear Section Rear RH; front: Chassis Member Front … Extension + … Section) → select BOTH parts, labour N on both** (user 2026-10-29, JJL6007 Wira; "not just rear, front as well"). Same when the second item is "Chassis Member Rear Section Rear" next to an Assembly / [Rear Section] item (QS6559M, TCB9624). **Only items the Select Parts catalogue has — if it is not there, do NOT add a manual row** (user 2026-10-29).
- ⭐ **Every photographed panel with no catalogue part gets a MANUAL row, never "labour only"** — e.g. TCB9624 City Rear Lamp Panel LH/RH (user 2026-10-29; was: "Rear Lamp Panel: no catalogue part → labour only").
- **Front Pillar Outer** (LH/RH) seen in the photos → select it as a part (user 2026-10-20).
- **Blind Sport ECU LH/RH** (photo REAR RADAR DISTANCE SENSOR): select ONLY the side that has a photo — only LH photographed → LH only, never add RH (user 2026-10-23, CCQ6119; was: "both LH and RH"). No catalogue item on Vios → manual row.
- **Rear Bumper Spoiler = Bumper Rear Lower Cover** when the catalogue has no spoiler item (Vios 2023 To 2026 / CCQ6119; user 2026-10-23). step2_plan.py maps it automatically.
- "Bumper Rear Shock Absorber" is a bumper part, not suspension. [estimate-select-parts-rules-2026-10-17]

- ⭐ **Never map a photo to a different kind of part just because the catalogue lacks the exact item** (user 2026-10-30, PRY826): Moulding Fender Front RH ≠ Fender Signal Lamp Front RH (a trim is never a lamp). No catalogue item with the photo's name → manual row with that exact name (PRY826: Moulding Fender Front RH 454.00, group 110).

## Group codes (value prefix `NN@`)
- 10 Front Panel (front bumper, grille, headlamps, fog lamps, front number plate) · 20 Bonnet & Engine · 30 / 110 Front Fender & Susp. LH / RH · 40 / 100 Front Door LH / RH · 50 / 90 Rear Door LH / RH · 60 / 80 Rear Quarter & Susp. LH / RH · 70 Rear Panel (rear bumper, rear lamps, boot lid/tailgate) · 75 Rear Compartment · 130 Undercarriage. [mistakes-log-sinar-batch2] [typesafe/step2_plan.py]
- 45, 95, 120, 140: not described in memory — read the group title in the `selcat2` dump before using. [typesafe/step2_plan.py]

## Quantity + comments
- ⭐⭐ **Same catalogue item needed twice collapses to ONE row (user 2026-10-23).** Merimen keeps one copy when the same catalogue item is ticked in two groups (e.g. `Bumper Clips [FRT/RR]` under Front Panel and Rear Panel, `Door Striker [All Doors]` under Front Door and Rear Door). After Select Parts, open the parts page (dsp_details) and add a MANUAL row for every missing copy, same price, with a comment saying which one ("Front Bumper", "Front RH"…), and comment the catalogue row too ("Rear RH"). Check every case with 2 bumpers or 2+ doors: Bumper Clips, Door Striker, Door Check Strap, Door Outer Release Handle, Weather Sheeting, shared hinges. CBL8902 missed front Bumper Clips + front-door Striker / Check Strap / Handle.
- ⭐⭐ **Every qty-2 row gets a comment, always** (user 2026-10-23): front pair "Front LH & Front RH", rear pair "Rear LH & Rear RH" (Front Bumper Sensor ×2, Front Bumper Bracket ×2…).
- ⭐⭐ **Every door hinge row whose NAME does not already say Upper/Lower + LH/RH gets a comment "Upper RH" / "Lower LH"** (e.g. `Door Hinge [Upr. RH,Lwr. LH]` used on the RH front door upper → "Upper RH") (user 2026-10-23).
- `setcmt.mjs` matches the row's display name; for two rows with the same name use `"<name>#1"` / `"<name>#2"` (page order).
- Qty = the blue number button at the row's left (click to change 1 → 2). Check qty on every case ("u missed all"). [estimate-select-parts-rules-2026-10-17]
- Catalogue clips come in at qty 1 → fix to 15 in 08 with `setqty.mjs`. [merimen-batch-workflow]
- Paired items as ONE row (qty 2 + comment) only when the catalogue has a single side-less/one-side item or it is a manual row. If the catalogue has separate LH/RH (or Upper/Lower) items, tick each, no comment. [estimate-companion-parts-rule]
- Comments: rear pair "Rear LH & Rear RH"; front pair "Front LH & Front RH"; door hinge pair "Upper LH & Lower LH" / "Upper RH & Lower RH". [estimate-companion-parts-rule]
- Never strip a comment the user already put on a row. [estimate-companion-parts-rule]

## Sensors
- Merimen part = "Rear/Front Bumper Sensor LH/RH"; write the position (Inner / Outer / Centre) in the row COMMENT for 4- or 6-sensor cars; not needed for 2-sensor cars. [merimen-step2-estimate-detail-fill] [photo-center-crosshair-rule]
- Bumper Rear Sensor always needs Comment "Rear LH & Rear RH" when it is one row for both sides, manual rows included (JNC9717 manual row had none); qty 2. Front: "Front LH & Front RH". [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- Bumper Bracket: same as sensors — qty 2 + "Rear LH & Rear RH" / "Front LH & Front RH" on one row; separate catalogue items → tick both. [estimate-companion-parts-rule]

## Companion parts (add automatically from the main part list)
- **Bumper Clips** for EVERY bumper in the photos: front bumper → front clips, rear bumper (incl. a rear bumper spoiler) → rear clips, both → both. Take the clips item from that bumper's own group (10@ front, 70@ rear); qty 15. Group has none → manual row "Bumper Clips" 15 × 10.00 (was: "search the catalogue for clip/fastener items"). Never an interior "Clips" item. [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- **Bumper Spoiler** (front/rear) → also the matching Bumper. [estimate-companion-parts-rule]
- ⭐⭐ **Front/Rear Bumper selected → its Bumper Bracket MUST be there** (user 2026-10-30, repeated; `checkall.py` now flags a bumper without a bracket/retainer).
- **Bumper → ALWAYS Bumper Sensor LH & RH + Bumper Bracket LH & RH**, front or rear to match the bumper (confirmed (user 2026-10-20)). [estimate-companion-parts-rule]
- **Grille** → Grille Clips, qty 9. [estimate-companion-parts-rule]
- ⭐ **Front Bumper Fog Lamp (LH/RH) → ALWAYS also Front Bumper Fog Lamp Finisher (same side)** (user 2026-11-04, WQR9733). Catalogue "Fog Lamp Finisher" / "Bumper Front Fog Lamp Cover" item by part number; none → manual row "Front Bumper Fog Lamp Finisher LH/RH".
- **Bonnet** → Bonnet Hinge LH + RH (separate items → tick both; else one row qty 2, comment "Front LH & Front RH"). [estimate-companion-parts-rule]
- **Fender** LH/RH → Fender Liner, same side. [estimate-companion-parts-rule]
- **Quarter Panel (Outer)** LH/RH → the quarter liner, same side — EXCEPT Perodua Viva, which has no quarter liner (user 2026-10-29) (both if both quarters). Tick the catalogue item as Merimen writes it (e.g. "Quarter Panel Liner Rear LH"); a manual row is named **Quarter Liner LH/RH**, never "Quarter Panel Liner" (user 2026-10-20). [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- **Boot Lid** (sedan) → Boot Lid Lock + Boot Lid Striker + Boot Lid Hinge + Boot Lid Aperture Weatherstrip + Rear Number Plate (misc "Number plate, rear" if that misc row exists, else a part). NO Support Strut on a boot lid. [estimate-companion-parts-rule]
- **Tailgate** (hatch/MPV) → Tailgate Lock + Striker + Hinge + Aperture Weatherstrip + Tailgate Support Strut LH & RH (separate items → both; else qty 2 "LH & RH") + Rear Number Plate. [estimate-companion-parts-rule]
- ⭐⭐ **Boot Lid / Tailgate Hinge row ALWAYS qty 2 + comment "Rear LH & Rear RH"** when only one hinge row is in the estimate, even if its name says LH or RH (e.g. "Tailgate Hinge LH" qty 1 was wrong, user 2026-10-29).
- **Boot Lid / Tailgate Hinge**: only one side or a side-less item in the catalogue → that one row, qty 2, Comment "Rear LH & Rear RH" (was: comment "LH & RH"). [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- **Door replaced** → select ALL of that door's items. Saga 2022 Door Rear RH set: Door Check Strap Rear RH, Door Glass Weatherstrip Outer Rear RH, Door Lock Rear RH, Door Rear Aperture Weatherstrip, Door Rear Hinge Lower RH, Door Rear Hinge Upper RH, Door Rear RH, Door Striker, Door Trim Board Finisher Rear RH, Door Window Regulator Rear RH, Weather Sheeting Door. Same idea for Door Front. [estimate-select-parts-rules-2026-10-17]
- Also part of every door set (user 2026-10-20): Hinge, Lock, Striker, Trimboard, Weatherstrip Sheeting, **Regulator Motor**, Aperture Weatherstrip, **Handle Outer Release** (qty 1 each). Add each one the catalogue has for that door; if one is missing, add a manual row. [estimate-companion-parts-rule]
- Door hinge as one manual row: qty 2, comment "Upper LH & Lower LH" / "Upper RH & Lower RH". [estimate-companion-parts-rule]
- **Door Front** → also Door Mirror (same side). **Door Rear only → no mirror.** [estimate-select-parts-rules-2026-10-17]
- ⭐⭐ **SUSPENSION SET (user 2026-10-23, MUST):** if ANY ONE of these is in the photos for a corner, select ALL of that corner's set in Select Parts, front or rear, LH or RH:
  - **Front corner:** Shock Absorber, Suspension Spring, Steering Tie Rod, Suspension Lower Arm, Suspension Crossmember, Knuckle Arm, Driveshaft, Stabiliser Bar Front Link.
  - **Rear corner:** Shock Absorber, Suspension Spring, Suspension Lower Arm, Suspension Crossmember (rear has no Tie Rod, Knuckle Arm, Driveshaft or Stabiliser Link).
  - Same axle and same side as the photographed item (Front LH photo → the Front LH set). Catalogue names differ (Wishbone Lower = Suspension Lower Arm; Suspension Arm Front = lower arm). Not in the catalogue → manual row with a price. step2_plan.py adds the set automatically.
  - ⭐⭐ **Suspension Crossmember Front AND Rear always go in group 130 Undercarriage** (user 2026-11-04) — catalogue tick or manual row; apply_plan.py / add_missing.py force group 130 for manual rows.
  - **Suspension Crossmember Front/Rear is its own item: "Subframe Front" is NOT the crossmember.** Catalogue has no "Suspension Crossmember" → manual row "Suspension Crossmember Front" / "Rear" (user 2026-10-23, CBL8902 Kenari).
- **Shock Absorber Front → Suspension Crossmember Front; Shock Absorber Rear → Suspension Crossmember Rear** (same axle). [estimate-select-parts-rules-2026-10-17]
- **Rear suspension** — any of Rear Shock Absorber LH/RH, Rear Suspension Spring, Rear Suspension Upper Arm, Rear Suspension Lower Arm → Rear Suspension Crossmember. [estimate-companion-parts-rule]
- **Suspension Crossmember → Wheel Centre + Wheel Hub** (same side and axle). Rear crossmember → Rear Wheel Hub, qty 1, in the rear quarter & susp. group of the damaged side. [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- ⭐⭐⭐ **Photo items never selected (user audit 2026-11-04: 45 cases checked, many misses).** Causes found: (1) only one side picked, the other side's photo ignored; (2) photo wording ≠ catalogue wording (Front Pillar → Front Pillar Outer, Rear Chassis Member → Chassis Member Rear Assembly, Fender → Fender Front); (3) pair/companion rules skipped (Fender Inner, fog lamp finisher, chassis member section sets); (4) the word check matched a DIFFERENT part (Quarter Panel ↔ Quarter Panel Liner, Front Crossmember ↔ Suspension Crossmember Rear) and hid the miss; (5) rows dropped after a re-save. Fixes: `finish.py` now re-reads the rows and runs `sync_check.py` with FULL=1 (every photo name, not only edits) after every apply; a row with an extra part word (Liner, Bracket, Inner, Upper, Section, Panel…) no longer counts as a match; every `ADD?` line must be resolved (tick / manual row / named covering row) before a case is reported done. qty-2 rows with "LH & RH" comments cover both sides.
- ⭐⭐ **Headlamp Panel ↔ Fender Inner go together (user 2026-11-04):** either one picked → pick the other too, SAME side (RH → both RH, LH → both LH). Fender Inner in the catalogue = Fender Front Inner / Fender Front Inner Upper / Fender Front Inner Reinforcement (first that exists). `apply_plan.py` adds it by itself (Perodua). Batch 9 WQR9733 RH was missing Fender Front Inner Upper RH.
- **PERODUA Headlamp Panel** hit → also Front Panel Upper. [estimate-select-parts-rules-2026-10-17]
- Companion missing from the catalogue → manual row ("Add New Replacement Part to [section]") with a price (08). [estimate-companion-parts-rule]

## Labour N / R (Labour tab → "Labour Panels")
- LEFT box `CL` (value `0/1@<code>`) = N (New: panel replaced + R&R removal jobs); RIGHT box `CLR` (value `2/1@<code>`) = R (Repair 修理: neighbouring/inner/structural panels, glass to remove/refit). Never tick both on one panel. [labour-n-r-selection]
- Sources: `tools/damage_to_ticks.md` (damaged part → N/R/Misc %, 217 cases; `labour_rules.json`) + the 5 answer-key cases in labour-reference-sinar-batch. Filter to the impact AREA and SIDE (a Quarter Panel rule pulls in rear items: Boot Floor, Rear Panel, Fuel Tank…). [merimen-batch-workflow] [merimen-step2-estimate-detail-fill]
- **N ticks pull in parts.** Ticking N on a part label (Bonnet, Quarter Panel, Lamp RH, Crossmember Front, Door Mirror RH (tts)…) adds that PART. Only tick N for parts actually damaged; snapshot after ticking and untick any part not in the photos. [mistakes-log-sinar-batch2] [merimen-step2-estimate-detail-fill]
- R&R jobs (N): Bumper Rear/Front R&R, Fuel Tank R&R, Suspension Rear R&R, Engine and Suspension R&R, Rooflining R&R, Boot Lid/Tailgate R&R, Windscreen Rear R&R, Door Front R&R, Dashboard Panel R&R. Rear lamps replaced → "Lamp Assembly Rear LH/RH (tts)" N. [labour-n-r-selection]
- **Door Back = Boot Lid & Tailgate**: tick Door Back (N) when the boot lid/tailgate is replaced. [estimate-select-parts-rules-2026-10-17]
- **REAR hit** — N: Bumper Rear + Bumper Rear R&R, Lamp Assembly Rear LH + RH (tts), Fuel Tank R&R + Suspension Rear R&R (whenever Boot Floor / Rear Panel / Rear Chassis Member is replaced), Boot Floor, Rear Panel (Assembly), Boot Lid (or Door Back + Tailgate on 5-door), Quarter Panel on hit sides, Rear Lamp Panel. R: Chassis Member Rear Section Rear LH + RH, Rear Lamp Panel (LH+RH), Rear Lamp Panel Inner LH + RH, Quarter Panel Inner LH/RH, Quarter (Panel) Inner Reinforcement (Upper/Lower) on hit sides, Quarter Panel (B), Quarter Pnl Lower Extension, Rear Panel Reinforcement, Spoiler Rear when there is one; tailgate cars also Windscreen Rear + Quarter Glass Rear (tts). [labour-n-r-selection] [labour-reference-sinar-batch]
- Rear-compartment example: Boot Floor N, Chassis Member Rear Section Rear LH/RH R, Door Back N, Fuel Tank R&R N, Suspension Rear R&R N. [estimate-select-parts-rules-2026-10-17]
- **FRONT hit** — N: Bumper Front + Bumper Front R&R, Engine and Suspension R&R, Bonnet (only if the bonnet is replaced), Bumper Front Reinforcement Panel, Fender Front (hit side), Front Panel (Assembly/Upper), Headlamp Assembly (tts), Chassis Member Front (if replaced), Crossmember Front. R: Chassis Member Front LH + RH Front Section, Chassis Member Front (End) Closing (Section) LH + RH, Chassis Member Front & Inner Fender, Fender Front Inner (+ Reinforcement / Section / Upper) both sides, Headlamp Panel LH/RH, Front Panel Upper, Bodyside Section Front. [labour-n-r-selection] [labour-reference-sinar-batch]
- **Front Panel replaced** → R on BOTH sides: Chassis Member Front End Closing LH + RH, Chassis Member Front LH + RH Front Section. [estimate-select-parts-rules-2026-10-17] [labour-diff-log]
- **Fender Front replaced** → R Fender Front Inner Upper (same side). [estimate-select-parts-rules-2026-10-17]
- **SIDE / door hit** — N: the replaced Door Front/Rear, Runningboard Panel if replaced. R: Door Glass Front/Rear Window, Doorskin, Door Weatherstrip Retainer Panel, Centre Pillar (& Reinforcement), Runningboard Panel Section, Front Pillar Outer. [labour-n-r-selection]
- **Every replaced door** → R its glass: Door Glass Front Window (front door); Door Glass Rear Window + Door Glass Quarter Rear (rear door). **Front door** → R Door Mirror (tts) (don't tick N Door Mirror unless the mirror itself is damaged). [estimate-select-parts-rules-2026-10-17] [labour-diff-log]

### Labour lessons from the user's corrections (sinar batch 2, 2026-10-20). I ticked far too few R.
- **Front/rear hit: tick the inner structure behind every replaced outer panel on BOTH sides.** [labour-diff-log]
  - Chassis member front/rear sections and end closings.
  - Inner fender supports and reinforcements.
  - Bumper retainer panels and headlamp panel masks.
- **A panel next to the hit but not replaced = R, not N.** Bonnet, the other side's Fender Front, Front Panel Assembly. **N only for parts actually replaced**, plus R&R jobs (one headlamp replaced → the other side's Headlamp R&R). [labour-diff-log]
- **PERODUA front hit (Alza TCB8444/WYN5733)**: [labour-diff-log]
  - N: Front Panel / Front Panel Upper, Bonnet Mntg Support Pnl LH + RH.
  - R, both sides:
    - Bumper Retainer Panel Front, Chassis Member Front Front Section, Chassis Member Front End Closing, Crossmember Front;
    - Fender Front Inner Assembly / Side Reinforcement (Section) / Support Panel / Upper Support Panel;
    - Front Panel Support Panel, Front Panel Support Reinforcement, Front Panel Upper Support Panel;
    - Headlamp Panel Mask, Front Panel Assembly.
- **PERODUA Myvi front-RH (TCP4539)**: [labour-diff-log]
  - N: Headlamp LH R&R.
  - R: Chassis Member Front End Closing LH + RH, Chassis Member Front LH (+ Front Section), Fender Front LH, Front Panel Radiator Support RH, Front Panel Upper.
- **Side hit with front + rear doors (BRS8642 Vios RH)**: [labour-diff-log]
  - N: Door Mirror (tts) on the hit side.
  - R:
    - Doorskin Front + Rear;
    - Centre Pillar Inner / Reinforcement / Reinforcement Upper / Centre Pillar & Runningboard;
    - Front Pillar Inner / Inner Upper, Bodyside Section Front;
    - Drain Channel Rear, Door Front Weatherstrip Retainer Panel;
    - Fender Front Inner Upper / Inner Reinforcement Section;
    - Quarter Panel (B), Quarter Panel Inner Extension, Quarter Panel Inner Reinforcement Lower + Upper;
    - Runningboard Panel Section Rear.
- **Rear hit, MPV tailgate (SK64A Avanza)**: R Quarter Inner Reinforcement LH + RH, Quarter Panel LH + RH, Rear Panel Inner (+ Centre, LH), Rear Panel Outer, Spoiler Rear. [labour-diff-log]
- **Rear hit, sedan (WQF8918 Civic)**: also the opposite side's Chassis Member Rear Section Rear and Quarter Panel Inner Striker Reinforcement Panel. [labour-diff-log]

### Labour lessons, batch 3 (user review 2026-10-24). User removed NOTHING; only added — mostly R on the inner structure. Tick more R.
- **Every replaced panel → R its inner reinforcements on the same side**, not just the inner panel: [labour-diff-log]
  - Front hit: Fender Front Inner Reinforcement / Section / Side Reinforcement (Section) / Support Panel / Upper Support Panel; Front Panel Support Panel; Bumper Front Reinforcement Panel; Front Panel; the other side's Headlamp Assembly (tts); Grille Front.
  - Side hit (doors): Front Pillar Inner + Front Pillar Reinforcement; Centre Pillar Inner + Centre Pillar Reinforcement (Lower); Runningboard Panel Reinforcement (+ Centre Section, Section Rear) + Runningboard Panel Section Centre; Quarter Pillar Front Reinforcement Panel (+ Upper); Quarter Panel Inner Striker Reinforcement Panel.
  - Quarter / rear hit: Quarter Panel Inner + Inner Reinforcement Lower + Upper; Quarter Pillar Rear Reinforcement LH + RH; Quarter Panel Inner Fuel Filler Panel; Chassis Member Rear Closing LH + RH, Chassis Member Rear Deformation Panel; Rear Lamp Panel and Drain Channel LH + RH.
- **Tailgate in the photos → N Tailgate R&R** (NDG4731). [labour-diff-log]
- **Wheel arc finisher replaced → N its Wheel Arch Extension** (WVH6628 Hilux front + rear LH). [labour-diff-log]
- Per model details: playbook 10.

## Misc ticks (Select Parts → Misc)
- Side hit (BRS8642, TCB8444, WYN5733 final): Electrical, Car-O-Liner, Other items, Road test, Road wheel alignment, Road wheel balancing, Underseal materials. No number plate. [labour-diff-log]
- Misc must match the impact: side hit → side misc, never the front set ("Number plate, front") (WYN5733 Alza side hit got front misc). Check misc on every case. [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Rear hit: Electrical (check & diagnose), Floor board sealant, Car-O-Liner bench, Number plate rear, Other items, Tail lamp sealant, Underseal materials, Windscreen sealant rear. [labour-reference-sinar-batch]
- Front hit: Air cond system checking, Air-cond gas (Normal), Electrical, Car-O-Liner, Number plate front, Other items, Radiator coolant, Underseal. [labour-reference-sinar-batch]
- ⭐ **Air-cond gas (Normal), Air cond system checking and Radiator coolant ONLY when Radiator / A/C Condenser is in Select Parts** (user 2026-10-30). A front hit without Radiator/Condenser gets none of the three. checkall flags `AIRCON MISC`.
- Suspension or wheel parts → add Road test, Road wheel alignment, Road wheel balancing. [labour-reference-sinar-batch]
- `labourfill.mjs` (08) adds misc/labour by 5 nearest past cases; it skips labour/misc if the case already has ticks. [labour-n-r-selection]

## Save my own choice (for learning)
- Right after ticking and Merimen's auto/Thatcham adds: `node selstate.mjs <cid> <ext> session_base.txt > ~/mrm-bot/state/sel_<PLATE>_mine.json`. Do the same after labourfill (misc). Copy it into memory labour-diff-log.md. [merimen-batch-workflow] [labour-diff-log]
