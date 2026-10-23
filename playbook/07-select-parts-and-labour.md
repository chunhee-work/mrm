# 07 · Step 2: Select Parts + Labour (dsp_selection, step 9)

The most error-prone step. Read this whole file before every case. Step 2 = select the parts AND tick Labour N/R + Misc, all from the photos; then conditions/prices/paint (08). [step2-paint-popup-method] [labour-n-r-selection] [merimen-batch-workflow]

## Before you start
- Re-read the artifact's db `names`/`orders` (03): the user may have edited them. [merimen-batch-workflow]
- Look at the PHOTOS themselves, not just the name text: what each photo shows decides parts, companions, quantities and labour ("only u got the image then u know what to choose"). [merimen-batch-workflow]
- Re-read dsp_selection + dsp_details first; never duplicate rows/ticks the user already added; don't overwrite labour the user already ticked. [mistakes-log-sinar-batch2] [labour-n-r-selection]
- Skip view/document names (Front View, Odometer Reading, Road Tax…) when building the parts list. [step2-paint-popup-method]

## Tools + commands
- Dump the catalogue: `node selcat2.mjs <cid> <ext> session_base.txt <out.json>`; match names with `typesafe/partmatch.py` (plan builder `typesafe/step2_plan.py`: exact-name first, group-aware, clips per bumper, crossmember companions). [merimen-batch-workflow]
- Tick: `node tickall.mjs <cid> <ext> session_base.txt tick.json` with `{"CP":[catalogue values],"N":[labour labels],"R":[labour labels]}`; it saves and clicks Thatcham "Apply & Submit". Redirect output to a log, never `| head`. [merimen-batch-workflow] [mistakes-log-sinar-batch2]
- Verify: `node selstate.mjs <cid> <ext> session_base.txt`. Remove wrong ticks: `node untick.mjs <cid> <ext> session_base.txt '<json>'`. [merimen-batch-workflow]
- Then `node gonext.mjs <cid> <ext> session_base.txt` → dsp_details. [merimen-batch-workflow]
- Thatcham Advisory modal ("Thatcham require you to also select…") after Save: nothing is saved until "Apply & Submit" is clicked; keep the R&R items Thatcham adds. [merimen-step2-estimate-detail-fill]
- Catalogue accounts (Autoris/Newvest, MRC): tick in the catalogue, add manual rows for misses; no-catalogue accounts (Rawang): everything via `addparts.mjs`. Qty field `PBT<row>`, row comment `PCM<row>`. [step2-paint-popup-method] [estimate-companion-parts-rule]

## Rule 1 — every photographed item goes in
- ⭐⭐ **(user 2026-10-23, MUST): every item that has a photo is selected in Select Parts, NO MATTER whether it looks broken or not.** Never drop a photographed item because it "looks intact", "damage not clear" or "probably no sensor". The photo name decides; if you think the name is wrong, the user fixes the name in the 照片命名台 — you still select the named item. After ticking, run the photo-vs-selection check (every non-view photo name must match a selected catalogue item or a manual row) and fix every gap before reporting. [mistakes-log-sinar-batch2]
- Every item named in the artifact / seen in the photos must be in the estimate. A catalogue miss becomes a MANUAL row (08), never a drop. [estimate-select-parts-rules-2026-10-17] [mistakes-log-sinar-batch2]
- Missed before: BRS8642 front + rear Wheel Rim RH, Runningboard Spoiler RH, Door Mirror RH; VDD414 Spare Wheel Well; FB438 Bumper Front Fog Lamp LH (user added at 763.00). [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Case note: TCP4539 also needed Fender Front Inner Wheel House RH. [photo-center-crosshair-rule]

## Rule 2 — pick the right catalogue item
- Exact name first; never a loose match ("Door Mirror Cover RH" ≠ Door Mirror RH; "Door Lock Central Locking Switch" / "Vehicle Lock Cylinder Set" ≠ Door Lock). [mistakes-log-sinar-batch2]
- Same side as the photo (RH damage → RH item). [estimate-select-parts-rules-2026-10-17]
- Use the item in the photo's own group; when the same text exists in two groups, take the right group (TCP4539 rim: 110@ RH, not 30@ LH). [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Rear lamps from the Rear Panel group 70@, not 60@. [mistakes-log-sinar-batch2]
- Same text in two groups and both axles hit → qty 2 (BRS8642 rims). [mistakes-log-sinar-batch2]
- Don't go hunting for the other side in an unrelated group (Boot Lid Hinge LH under 100 Front Door RH is wrong). [estimate-companion-parts-rule]
- PERODUA: never Front Panel Assembly → Front Panel Upper / Fender Inner LH/RH / Front Crossmember / Front Panel Lower. Other makes: Front Panel Assembly. [perodua-front-panel-rule] [mistakes-log-sinar-batch2]
- LORRY: "Front Chassis Member" with no side. [lorry-front-chassis-member]
- **Front Pillar Outer** (LH/RH) seen in the photos → select it as a part (user 2026-10-20).
- **Rear Bumper Spoiler = Bumper Rear Lower Cover** when the catalogue has no spoiler item (Vios 2023 To 2026 / CCQ6119; user 2026-10-23). step2_plan.py maps it automatically.
- "Bumper Rear Shock Absorber" is a bumper part, not suspension. [estimate-select-parts-rules-2026-10-17]

## Group codes (value prefix `NN@`)
- 10 Front Panel (front bumper, grille, headlamps, fog lamps, front number plate) · 20 Bonnet & Engine · 30 / 110 Front Fender & Susp. LH / RH · 40 / 100 Front Door LH / RH · 50 / 90 Rear Door LH / RH · 60 / 80 Rear Quarter & Susp. LH / RH · 70 Rear Panel (rear bumper, rear lamps, boot lid/tailgate) · 75 Rear Compartment · 130 Undercarriage. [mistakes-log-sinar-batch2] [typesafe/step2_plan.py]
- 45, 95, 120, 140: not described in memory — read the group title in the `selcat2` dump before using. [typesafe/step2_plan.py]

## Quantity + comments
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
- **Bumper → ALWAYS Bumper Sensor LH & RH + Bumper Bracket LH & RH**, front or rear to match the bumper (confirmed (user 2026-10-20)). [estimate-companion-parts-rule]
- **Grille** → Grille Clips, qty 9. [estimate-companion-parts-rule]
- **Bonnet** → Bonnet Hinge LH + RH (separate items → tick both; else one row qty 2, comment "Front LH & Front RH"). [estimate-companion-parts-rule]
- **Fender** LH/RH → Fender Liner, same side. [estimate-companion-parts-rule]
- **Quarter Panel (Outer)** LH/RH → the quarter liner, same side (both if both quarters). Tick the catalogue item as Merimen writes it (e.g. "Quarter Panel Liner Rear LH"); a manual row is named **Quarter Liner LH/RH**, never "Quarter Panel Liner" (user 2026-10-20). [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- **Boot Lid** (sedan) → Boot Lid Lock + Boot Lid Striker + Boot Lid Hinge + Boot Lid Aperture Weatherstrip + Rear Number Plate (misc "Number plate, rear" if that misc row exists, else a part). NO Support Strut on a boot lid. [estimate-companion-parts-rule]
- **Tailgate** (hatch/MPV) → Tailgate Lock + Striker + Hinge + Aperture Weatherstrip + Tailgate Support Strut LH & RH (separate items → both; else qty 2 "LH & RH") + Rear Number Plate. [estimate-companion-parts-rule]
- **Boot Lid / Tailgate Hinge**: only one side or a side-less item in the catalogue → that one row, qty 2, Comment "Rear LH & Rear RH" (was: comment "LH & RH"). [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- **Door replaced** → select ALL of that door's items. Saga 2022 Door Rear RH set: Door Check Strap Rear RH, Door Glass Weatherstrip Outer Rear RH, Door Lock Rear RH, Door Rear Aperture Weatherstrip, Door Rear Hinge Lower RH, Door Rear Hinge Upper RH, Door Rear RH, Door Striker, Door Trim Board Finisher Rear RH, Door Window Regulator Rear RH, Weather Sheeting Door. Same idea for Door Front. [estimate-select-parts-rules-2026-10-17]
- Also part of every door set (user 2026-10-20): Hinge, Lock, Striker, Trimboard, Weatherstrip Sheeting, **Regulator Motor**, Aperture Weatherstrip, **Handle Outer Release** (qty 1 each). Add each one the catalogue has for that door; if one is missing, add a manual row. [estimate-companion-parts-rule]
- Door hinge as one manual row: qty 2, comment "Upper LH & Lower LH" / "Upper RH & Lower RH". [estimate-companion-parts-rule]
- **Door Front** → also Door Mirror (same side). **Door Rear only → no mirror.** [estimate-select-parts-rules-2026-10-17]
- **Shock Absorber Front → Suspension Crossmember Front; Shock Absorber Rear → Suspension Crossmember Rear** (same axle). [estimate-select-parts-rules-2026-10-17]
- **Rear suspension** — any of Rear Shock Absorber LH/RH, Rear Suspension Spring, Rear Suspension Upper Arm, Rear Suspension Lower Arm → Rear Suspension Crossmember. [estimate-companion-parts-rule]
- **Suspension Crossmember → Wheel Centre + Wheel Hub** (same side and axle). Rear crossmember → Rear Wheel Hub, qty 1, in the rear quarter & susp. group of the damaged side. [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
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

## Misc ticks (Select Parts → Misc)
- Side hit (BRS8642, TCB8444, WYN5733 final): Electrical, Car-O-Liner, Other items, Road test, Road wheel alignment, Road wheel balancing, Underseal materials. No number plate. [labour-diff-log]
- Misc must match the impact: side hit → side misc, never the front set ("Number plate, front") (WYN5733 Alza side hit got front misc). Check misc on every case. [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Rear hit: Electrical (check & diagnose), Floor board sealant, Car-O-Liner bench, Number plate rear, Other items, Tail lamp sealant, Underseal materials, Windscreen sealant rear. [labour-reference-sinar-batch]
- Front hit: Air cond system checking, Air-cond gas (Normal), Electrical, Car-O-Liner, Number plate front, Other items, Radiator coolant, Underseal. [labour-reference-sinar-batch]
- Suspension or wheel parts → add Road test, Road wheel alignment, Road wheel balancing. [labour-reference-sinar-batch]
- `labourfill.mjs` (08) adds misc/labour by 5 nearest past cases; it skips labour/misc if the case already has ticks. [labour-n-r-selection]

## Save my own choice (for learning)
- Right after ticking and Merimen's auto/Thatcham adds: `node selstate.mjs <cid> <ext> session_base.txt > ~/mrm-bot/state/sel_<PLATE>_mine.json`. Do the same after labourfill (misc). Copy it into memory labour-diff-log.md. [merimen-batch-workflow] [labour-diff-log]
