# 03 · Photo naming + 照片命名台 (step 3)

Start as soon as the Merimen model variant is chosen; don't wait for the user's review. [case-workflow-order] [merimen-batch-workflow]

⭐⭐ **The user's review of the 照片命名台 is the gate for Step 2 (user 2026-10-23).** After Phase A, tell the user `照片命名台 ready: <PLATES>` and wait. When they say done: dump db `names`, relabel every changed photo (06), update `~/mrm-bot/photoplan.json`, and only then start Select Parts / Labour / Misc from those final names. If the user edits names again later, run the two-way `tools/naming-desk/sync_check.py` (09).

## Run the model
- Pending cases (missing document) that have photos also get a tab in Phase A (user 2026-10-28); see 00.
- Run `typesafe/photo_train/case_report.py` and add a tab for the case to the 照片命名台 artifact. [merimen-batch-workflow]
- Model: `photo_train/predict_case.py models/dinov2_b_big10a.pt <photos in order>` with `VEHICLE=<full Merimen model variant>` (needs "4 Dr"/"Sal"/"5 Dr"/"Hatch"/"MPV" in it, not just the JPJ line). [case-photo-naming-artifact] [photo-center-crosshair-rule]
- Production = big10a + seq_best.pt + seq_best_crop.pt averaged (default; `SEQ=0` turns seq off); photos under 60% also get a Jev second opinion (`JEV=0` off); vehicle priors are OFF (`PRIOR=1` only on request; user decided not to use). [photo-naming-two-step-jev]
- Sure = confidence ≥ 0.60 (was: 0.80). Under 60% = orange frame / unsure. [photo-confirm-workflow] [case-photo-naming-artifact]
- VEHICLE drives: PERODUA split front-panel names, LORRY side-less chassis member, Boot Lid ↔ Tailgate by doors. [perodua-front-panel-rule] [lorry-front-chassis-member] [photo-center-crosshair-rule]
- Motorcycle cases are not trained and never go into the labelling tool. [photo-center-crosshair-rule]

## Order + opening shots
- Name in file order. `case_report.py` moves the ID shots to the front only when Odometer/Chassis are not within the first 10 photos. [case-photo-naming-artifact]
- Opening rule: 1–4 = Front View Right, Front View Left, Rear View Right, Rear View Left; 5 = Interior View (windscreen shot) or Road Tax (paper slip/disc at the centre). Then Odometer Reading, Chassis Number, Engine Compartment. [case-photo-naming-artifact] [car-part-item-names]
- INSPECTION DISC photo → Road Tax. [photo-center-crosshair-rule]
- Missing opening shots: corner views = the photos before the first ID shot; fewer than 4 → use the model's own view guess, mark unsure, never force corner names onto damage photos; add `<PLATE> pending <photo> photo`. [case-photo-naming-artifact]
- Rear-impact cars: the first straight-from-behind shot = "Rear View" (no Left/Right). [photo-center-crosshair-rule]

## 照片命名台 artifact
- ONE artifact for all cases: https://claude.ai/artifact/K6yLWFN8XChRKRVHUFcUBR, one tab per case (template scratchpad `sinar/report/tpl.html` + `cases.json`; photos `photos/<PLATE>/NN.jpg`; ≤255 files per publish). [case-photo-naming-artifact]
- Page: Merimen report layout "n/N: Name", % chip, orange frame = unsure, big clickable name box (datalist), Paste button (click then ⌘V), one-line "其他可能", 还原; drag to reorder (names follow the photo). [case-photo-naming-artifact]
- db `names`: doc `<PLATE>-NN` {case, n, src, model, name}. db `orders/<PLATE>`: {order:[original n…]}. [case-photo-naming-artifact]
- Re-read `names` and `orders` right before the photo upload (06) and again before Step 2 (07); learn from every edit. [merimen-batch-workflow]
- The upload follows the artifact EXACTLY: order from `orders` (else page order), names from `names` (else model name). [case-photo-naming-artifact]

## Core naming principles
- ⭐ **Capitals (user 2026-10-23):** never write a name in ALL CAPITALS. Every word starts with one capital, the rest small: QUARTER PILLAR LH → **Quarter Pillar LH**, SPARE WHEEL FOAM → Spare Wheel Foam. Only LH, RH and real abbreviations (A/C, ECU, ABS, SRS, LED, MPV, 4WD) stay capital. `name_map.final()` applies this to every name; the ALL-CAPS spellings quoted in this playbook are only the wrong forms to replace.
- The named item = the part under the image centre (crosshair of the vertical + horizontal midlines); edge content is context only. [photo-center-crosshair-rule]
- A hand/finger holding, lifting or pointing at a part → that part is the name; overrides the crosshair. [photo-center-crosshair-rule]
- Every new item starts with a zoom-out shot; a close-up belongs to the part of the zoom-out before it. Same angle, closer = same part, even if another part looks central; a new part starts when angle/position changes. [photo-center-crosshair-rule]
- Side (LH/RH) carries over from the most recent zoom-out (which tyre/lamp/door is visible). Always check the first LH/RH view before the zoom-ins. [photo-center-crosshair-rule]
- Crosshair on a boundary → look at the neighbouring zoom-out/zoom-in shots to see which part the sequence is about. [photo-center-crosshair-rule]
- Decide the shooting area first (FRONT / REAR / SIDE / UNDER from the photo ± 2 neighbours) and use only that area's names; one case can have several damaged sides, so decide per photo group. [photo-center-crosshair-rule]
- One image = ONE item. Never a name with "&" or joined by " n " ("Bonnet & Fender Front LH", "BOOT FLOOR N RR END PANEL"); single items with a comma are fine ("Number plate, rear" → Rear Number Plate). [photo-center-crosshair-rule]
- Merimen captions are noisy; when the model's pick matches what sits at the crosshair, prefer it over a conflicting caption. [photo-center-crosshair-rule]
- Word order `<Zone> <Part> <Sub-part> <LH/RH>`, LH/RH always last: Front Bumper (not Bumper Front), Door Front RH (not Front Door RH), Front Shock Absorber RH, Front Stabiliser Bar Link Rod RH, Door Front Regulator Motor RH, Driveshaft RH, Door Front Trimboard RH, Door Front Check Strap RH, Door Front Hinge Upper/Lower RH. [car-part-item-names]
- Badges: `<Part> Badge (<MODEL/BRAND>)`, e.g. Tailgate Badge (MYVI), Grille Front Badge (PERODUA). [car-part-item-names]
- LH = the car's left = the right side of the photo when facing the front. [photo-center-crosshair-rule]
- Only LH or RH as side: LHF/LHR/RHF/RHR are typos (WHEEL RIM ALLOY RHR → Rear Wheel Rim RH; DOOR LHF → Door Front LH; CHASSIS MEMBER RHF → Front Chassis Member RH; ABSORBER LHF → Front Shock Absorber LH). NS = LH, OS = RH. [photo-center-crosshair-rule]
- Drop a needless "Front"/"Rear" on: Tailgate, Bonnet (+Lock/Hinge), Fender, Headlamp, Driveshaft, Steering Tie Rod (End), Trailing Arm, Engine Splash Shield, Fender Liner, Fender Signal Lamp, Quarter Pillar. [photo-center-crosshair-rule]
- Drop names with no side/position: DOOR LH/RH, Chassis Member LH/RH, SUSPENSION LOWER ARM LH/RH, Kangaroo Bar (no front/rear), Sensor LH / SENSOR REAR LH, Reflector (Rear) LH/RH, side-less Bumper Rear Bracket/Retainer, Tailgate/Boot Lid Hinge without side. [photo-center-crosshair-rule]
- Never pure numbers ("24", "60") as names. Same words in a different order/case/abbreviation (FRT, RR, ASSY) = one name (most common spelling). Always run `name_map.final()`. [photo-center-crosshair-rule] [mistakes-log-sinar-batch2]

## Views + ID shots
- Never "General View" → Front View, Rear View or Side View. REAR/RR GENERAL VIEW = Rear View; FRT/FRONT GENERAL VIEW, FRT PANEL VIEW, Front Full View = Front View. [photo-center-crosshair-rule]
- Overview shots of the whole front (incl. bumper removed) = Front View, not Bonnet / Front Panel Upper / Front Chassis Member / Front Bumper Reinforcement / Washer Tank. Far shot of the quarter = Side View RH/LH. [photo-center-crosshair-rule] [photo-naming-two-step-jev]
- Never Rear Panel View → **Rear View** (user 2026-10-29).
- Never "Bumper Rear Absorber & Bumper Rear Absorber" → **Bumper Rear Absorber** (user 2026-10-29).
- Never Rear End View, Rear Damage View, Rear End Assembly, DAMAGES PART / DAMAGES PHOTO / DAMAGE PART PHOTO. [photo-center-crosshair-rule]
- Engine Compartment (not Engine Compartment View / engine bay / ENGINEVIEW); Dashboard (= DASHBOARD VIEW / Dashboard Panel); Chassis Number (= CHASSIS NO / 1ST SUPPLE-CHASSIS NO); Tyre Size (not Size Of The Tyre); Front/Rear Suspension View LH/RH; Rear/Front Tyre LH/RH (not Tyre View). [photo-center-crosshair-rule]

## Model-dependent names
- PERODUA (Myvi, Axia, Bezza, Alza, Aruz, Ativa, Viva, Kancil…): NEVER Front Panel Assembly → Front Panel Upper / Fender Inner LH/RH / Front Crossmember / Front Panel Lower (whichever is at the crosshair). Every other make → Front Panel Assembly. [perodua-front-panel-rule]
- "Front Panel" = Front Panel Assembly. Front Panel Upper ≠ Front Panel Upper Cover (the plastic on top). [perodua-front-panel-rule] [photo-center-crosshair-rule]
- Front Panel Radiator Support = Headlamp Panel LH/RH. [photo-center-crosshair-rule]
- LORRY models (HINO 300 / ISUZU NPR / CANTER / FUSO LORRY…): "Front Chassis Member" with NO side; cars keep LH/RH. [lorry-front-chassis-member]
- Boot Lid and Tailgate never on the same car: 4-door saloon (Sal/Sedan: Lancer, Civic, Saga, Bezza) = Boot Lid… names; 5-door/hatch/MPV/SUV (Myvi, Grand Livina) = Tailgate… names; Hinge/Lock/Strut/Trim/Weatherstrip/Striker follow (was: merge Boot Lid Striker → Tailgate Striker). [photo-center-crosshair-rule]
- ⭐ Never use any "Lamp Assembly Rear …" catalogue spelling as a photo name, e.g. **"[inner] Lamp Assembly Rear LH (tts)" → Rear Lamp Inner LH** (user 2026-10-29). Photo names are Rear Lamp (Inner/Outer) LH/RH only; "Lamp Assembly Rear LH (tts)" is Merimen's catalogue/labour label, not a photo name.
- Rear lamps: never TAIL LAMP (Taillamp/Body/NS/OS) → one-piece lamp = Rear Lamp LH/RH; split lamp (body + boot-lid piece, e.g. Civic FD) = Rear Lamp Outer LH/RH + Rear Lamp Inner. Mixed models: piece that moves with the boot lid/tailgate = Inner, fixed on body = Outer. Rear Lamp ≠ Rear Lamp Outer. Lamp Assembly Rear (tts) / [outer] … → Rear Lamp; "Outer Lamp LH" → Rear Lamp Outer LH; Tail Lamp Panel → Rear Lamp Panel LH/RH. Table: `photo_train/lamp_table.json`. [photo-center-crosshair-rule]
- ⭐ **Inner/Outer consistency (user 2026-10-23, NDG4731):** once a car is known to have Inner + Outer lamps or Inner + Outer sensors, EVERY lamp/sensor photo of that car carries Inner or Outer — never plain "Rear Lamp LH" / "Rear Bumper Sensor LH". Lamp fixed on the body = Outer; piece on the tailgate/boot lid = Inner. Sensors: corner ones = Outer, middle ones = Inner. Check this on every case before upload.
- Bumper parking sensors by count (count holes in the wide bumper shot): 2 = Sensor LH/RH; 4 = Inner + Outer (each side); 6 = Inner + Outer + Centre. Name: Rear/Front Bumper Sensor Inner/Outer/Centre LH/RH. Rear Bumper Sensor RH ≠ Rear Bumper Sensor Outer RH. [photo-center-crosshair-rule]

## Batch 3 review (user 2026-10-23) — names the user set in the 照片命名台
- **Badge format:** `Boot Lid Badge (<MODEL>)` / `Tailgate Badge (<MODEL>)`, e.g. Boot Lid Badge (CITY), Boot Lid Badge (PROTON), Tailgate Badge (JAZZ), Tailgate Badge (i-VTEC). Never "Badge", "Boot Lid Emblem", "Tailgate Emblem", "Badge Boot Lid [..]", "Badge Tailgate [..]", "Bootlid Finisher [chrome]" for a badge. Each badge photo gets the model word printed on it.
- Rear bumper side spoiler pieces = **Spoiler Bumper Rear LH/RH** (BMN7769 Altis), not "Bumper Rear Finisher" / "Rear Bumper Spoiler" when the piece sits at one side.
- **Door Rear Weatherstrip Outer LH/RH** (user's spelling, KCM8604); **Door Front/Rear Run Felt LH/RH**; **Door Front/Rear Window LH/RH**; **Door Front Handle Outer Release LH/RH**; **Door Rear Regulator Motor LH/RH**; **Door Rear Aperture Weatherstrip LH/RH**.
- Never "NUMBER PLATE FRT HOLDER" → **Number Plate Front Holder** (user 2026-10-23).
- **Rear Panel Upper** (KER815 #113–119 were wrongly "Rear Windscreen"); **Spare Wheel Foam**; **Boot Storagetray**; **Cowl Panel**; **Front Suspension View** (no side); **Front Chassis Member RH**; **Subframe**→ the arm shown (Front Suspension Lower Arm RH); **Rear Wheel Rim LH** (not "Wheel Rim Alloy").
- Corrections of the model to remember: corner/overview shots of the rear bumper = Rear Bumper (not Rear Lamp Panel / Sensor / Finisher); a fog-lamp-named photo that shows the headlamp = Headlamp RH; photos named Front/Rear Windscreen on a side hit were the door windows; Rear Lamp Inner vs Outer by where it sits (Inner = on the boot lid/tailgate); underside crumple behind the boot = Rear Chassis Member RH (KER815 #108–109).

## Part rules — front
- Marked damage (X / finger) on the painted bumper skin under the bonnet, round the lower grille opening, or at the bumper corner beside the headlamp = Front Bumper (not Grille Front / Bonnet Finisher / Grille Front Lower / Fender). [photo-center-crosshair-rule]
- Grille Front Moulding = one name in the middle; the end piece over a headlamp = Grille Front Moulding LH/RH. [photo-center-crosshair-rule]
- FOGLAMP LH/RH = Front Bumper Fog Lamp LH/RH. [photo-center-crosshair-rule]
- Lamp strip in the front bumper (Myvi) = Lamp Daytime Running LH/RH, not a sensor or bracket. [photo-center-crosshair-rule]
- Chrome strip under the headlamp (Saga) = Bumper Front Moulding RH; front-panel side-member shots ("Headlamp Panel RH" on a Saga) are covered by Front Panel. [merimen-step2-estimate-detail-fill]
- Headlamp Mounting Bracket = the piece BELOW the headlamp. [photo-center-crosshair-rule]
- Front bumper brackets: Bumper Front Bracket Support / Side Retainer / Retainer-Guide / Bracket Front [side] = Front Bumper Bracket LH/RH; [upper] = Bumper Front Bracket Support Upper LH/RH. [photo-center-crosshair-rule]
- Bumper Front Reinforcement Panel = Front Bumper Reinforcement. [photo-center-crosshair-rule]
- Washer tank captions (Screen / Windscreen / Front / plain) = Windscreen Washer Tank; pump, filler pipe, cap, motor, hose, bracket stay separate. [photo-center-crosshair-rule]
- Bonnet Hinge = a different layer from the bonnet. [photo-center-crosshair-rule]

## Part rules — rear
- Rear Bumper = the main cover; Rear Bumper Spoiler = extra piece at the LOW part (only some models); Rear Bumper Moulding = finisher strip on the UPPER part. A strip at the edge never beats the part at the centre. [photo-center-crosshair-rule]
- Close-ups of the bumper under a tailgate = Rear Bumper, not Tailgate. [photo-center-crosshair-rule]
- Bumper Rear Cover LH/RH / Bumper Rear LH [cover] = Rear Bumper; Rear Bumper LH/RH stays separate (some cars have side pieces); Bumper Rear Section → Rear Bumper LH/RH; BUMPER REAR LOWER → Bumper Rear Lower Cover. [photo-center-crosshair-rule]
- Rear bumper brackets: only Rear Bumper Bracket Side LH/RH (vertical, by the wheel arch) and Rear Bumper Bracket Upper LH/RH (horizontal, under the rear lamp). Plain Rear Bumper Bracket / Mounting Bracket / [support] / [side - Outer] = Side; Bumper Rear Retainer / Guide = Upper. [photo-center-crosshair-rule]
- Rear Bumper Reflector = always the RED, small, long, horizontal piece; not red → not a reflector. [photo-center-crosshair-rule]
- **Rear Panel Upper** (confirmed by user 2026-10-23) = the top horizontal section of the rear panel, above the rear bumper and between the rear lamps; the boot lid/tailgate closes onto it and the striker sits there. Some catalogues split it: Rear Panel Upper Section LH/RH.
- Rear Panel (= Rear Panel Outer, RR END PANEL, END PANEL, Rear End Panel); rear end panel inner trim → Rear Panel Inner Trim; Rear Panel LH/RH → Rear Lamp Panel. [photo-center-crosshair-rule]
- Boot Floor = steel floor with stamped ribs (BOOTFLOOR); Spare Wheel Well = the plastic/concave corner well (not Boot Side Trim); Spare Wheel Cover Board (never SPARE WHEEL BOARD); Floor Panel (not Rear Floor Panel); Boot Floor ≠ Floor Panel. [photo-center-crosshair-rule]
- Rear Wheelhouse = the curved arch bulge at the boot side/corner (only the left part with the strength line); the arch seen from inside the boot = Rear Wheelhouse LH, not Boot Floor. [photo-center-crosshair-rule]
- Rear Panel Inner Trim = plastic; Boot Lid Hinge = steel; Boot Lid Striker vs Lock often mistyped (check which is at the centre). [photo-center-crosshair-rule]
- Boot Lid / Tailgate Aperture Weatherstrip; Tailgate Emblem; Spoiler Rear [bootlid]; Tailgate Spare Wheel Carrier (MPV tailgate bracket, Avanza). [photo-center-crosshair-rule]
- Other rear names to use: Number Plate Holder Rear, Rear Exhaust Pipe, Exhaust Rear Mounting, Exhaust Silencer, Rear Axle, Rear Seat Back, Spare Wheel Retainer, Rear Number Plate Lamp (LH/RH), Parcel Shelf Rear. [photo-center-crosshair-rule]

## Part rules — side
- Front door = the door next to the front wheel (handle just behind the front wheel / mirror); the rear door ends where the rear wheel arch starts; outer handle release at the rear of the door tells front vs rear. [photo-center-crosshair-rule]
- Panel round the rear wheel arch, behind the rear-door line = Quarter Panel LH/RH, not Door Rear. [photo-center-crosshair-rule]
- Every quarter name starts with "Quarter Panel" (Quarter Pnl / Quater → Quarter Panel; Quarter Panel Outer = Quarter Panel; Rear LH Quarter Panel → Quarter Panel LH; Quarter Inner Trim → Quarter Panel Inner Trim). [photo-center-crosshair-rule]
- Rear lower diffuser piece on models whose catalogue has no spoiler item (e.g. CCQ6119 Toyota Vios 2023 To 2026, NGC102): photo name **Rear Bumper Spoiler** (user 2026-10-23); in Select Parts it is the catalogue item "Bumper Rear Lower Cover". [photo-center-crosshair-rule]
- REAR RADAR DISTANCE SENSOR LH/RH = **Blind Sport ECU LH/RH** (user's spelling; there is a left and a right one) (user 2026-10-23). Plain "REAR RADAR LH/RH" stays Rear Bumper Sensor. [photo-center-crosshair-rule]
- Never "RR PANEL TRIM" → **Rear Panel Inner Trim**; never "RR BUMPER AFTER DISMANTLE" or "REAR PANEL BOOT FLOOR" → name the part at the crosshair (user 2026-10-23). [photo-center-crosshair-rule]
- Front LH/RH Bumper Lamp = **Front Bumper Fog Lamp LH/RH** (user 2026-10-21). Spoiler Runningboard Extension LH/RH (any case) = **Runningboard Spoiler LH/RH**, never the Extension name (user 2026-10-21). [photo-center-crosshair-rule]
- Never "REAR RADAR LH/RH": it is **Rear Bumper Sensor LH/RH** (user 2026-10-21). [photo-center-crosshair-rule]
- **Boot Extractor Vent** = Extractor Lower Vent = Boot Extractor Vent LH/RH: one name, never LH or RH (user 2026-10-21). [photo-center-crosshair-rule]
- ⭐ **A liner is ALWAYS black** (user 2026-10-29): Fender Liner / Quarter Liner = the black plastic shell inside the wheel arch. Anything body-coloured or painted is never a liner → name the panel (Fender, Quarter Panel, Rear Wheelhouse, Wheel Arch Extension…). A black, non-plastic steel arch seen from inside = Front/Rear Wheelhouse, not a liner.
- Exception: the liner is **Quarter Liner LH/RH**, never "Quarter Panel Liner" (Quarter Panel Liner / Quarter Panel Liner Rear → Quarter Liner) (user 2026-10-20). [photo-center-crosshair-rule]
- Door Mirror LH/RH for every door/side-mirror caption; Mirror Glass, Base Capping, cover, signal lamp stay separate. [photo-center-crosshair-rule]
- Door Window Regulator Front/Rear LH/RH for every regulator caption; Regulator Motor/switch/handle stay separate. [photo-center-crosshair-rule]
- Door hinges: Door Front/Rear Hinge Upper/Lower LH/RH (Rear LH Door Hinge → Door Rear Hinge Upper LH). [photo-center-crosshair-rule]
- Door weatherstrips: Door Front Outer Weatherstrip LH/RH = black strip along the bottom of the window, outside (Door Front Weatherstrip merges here); Door Front Aperture Weatherstrip LH/RH = rubber seal round the door opening (often pulled out by fingers). Same for rear doors. [photo-center-crosshair-rule]
- Door Lower Moulding LH/RH → Door Rear Lower Moulding LH/RH. [photo-center-crosshair-rule]
- Tailgate Moulding = **Tailgate Finisher** (same item, user 2026-10-23).
- Foam tray in the spare-wheel well = **Spare Wheel Foam** (exactly this format, not SPARE WHEEL FOAM) (user 2026-10-23).
- Never "Tailgate Strut": always the full name **Tailgate Support Strut LH/RH** (user 2026-10-23).
- Door Glass Front Window LH/RH = **Door Front Window LH/RH** (photo name; same for Rear) (user 2026-10-23). Merimen's labour label "Door Glass Front Window" stays as Merimen writes it.
- New name (user 2026-10-23): **Door Front Run Felt LH** (the rubber channel the window glass runs in); same pattern for Door Front/Rear Run Felt LH/RH. Not sure → ask the user with the photo.
- Front Pillar = pillar between windscreen and front door (= Front Pillar Outer; Outer Trim / Inner stay separate); Centre Pillar = Centre Pillar Outer. [photo-center-crosshair-rule]
- Runningboard Panel = metal, flat sill (= Runningboard Panel Outer); Runningboard Spoiler LH/RH = plastic add-on skirt with raised bits + black rubber seal (Spoiler Runningboard Panel / Extension → Runningboard Spoiler); no add-on → Runningboard Panel. Runningboard Panel Extension = Runningboard Extension. [photo-center-crosshair-rule] [car-part-item-names]
- Bodyside LH/RH (merges Bodyside Rear / Section). [photo-center-crosshair-rule]

## Part rules — under / suspension
- Chassis member side: ONLY by the tyres (far-right tyre in the photo = RH, far-left = LH) plus where the spare-wheel recess sits; never by the exhaust (withdrawn rule). A chassis member is a long straight beam. [photo-center-crosshair-rule]
- Rear/Front Chassis Member LH/RH (not "Chassis Member … Section"; Rear LH Chassis Frame → Rear Chassis Member LH); Chassis Assembly. [photo-center-crosshair-rule]
- Rear Crossmember = straight member UNDER the boot floor supporting it (not a suspension arm). [car-part-item-names]
- Stabiliser link rod (thin vertical rod) = Front Stabiliser Bar Link Rod RH, not the stabiliser bar. [photo-center-crosshair-rule]
- Front Wheel LH/RH → Front Wheel Rim LH/RH. [photo-center-crosshair-rule]

## Keep separate (not the same part)
- Front Wheelhouse ≠ Fender Inner Wheelhouse; Radiator Air Deflector ≠ …Lower; Boot Floor ≠ Floor Panel; Rear Wheel Arc Finisher ≠ Door Lower Finisher; Rear Lamp ≠ Rear Lamp Outer; Rear Bumper Sensor RH ≠ …Outer RH; Front Panel Upper ≠ Front Panel Upper Cover. [photo-center-crosshair-rule]

## Labelling tool / quick-confirm (部位标注台)
- https://claude.ai/artifact/BS7auqjnbs6Y7SZvzL4Vnh — collections `tasks` and `labels`. When the user says a name is wrong or Claude is unsure, add those photos as a new batch (photo + previous 2 as assets; task {img, vehicle, guess[3], probs[3], cid, seq, nb, order}). [photo-confirm-workflow] [photo-center-crosshair-rule]
- No polling: read `labels` only when the user says the batch is done. Answers → `photo_train/user_corrections.json` (cid:seq → name); regions → `photo_train/user_regions.jsonl`. [photo-confirm-workflow]
- ★ marks the photo's one item; "Background" (floor) and "Finger" are non-parts and never the answer; what the finger points at is usually the name. [photo-confirm-workflow] [photo-center-crosshair-rule]
- Keep mixing rare items into labelling batches. [photo-confirm-workflow]

## Learning loop after the user reviews 照片命名台
- List every change (name or order), study the photos, work out the rule, and write it into photo-center-crosshair-rule + `name_map.FINAL`. [case-photo-naming-artifact] [merimen-batch-workflow]
- When a reason is unclear, ASK the user and SEND THE PHOTO itself (SendUserFile, `photo_train/user_photos/<PLATE>/NN_*.jpg`), not just the number; never guess silently. (This is the one allowed question; it never blocks the batch.) [case-photo-naming-artifact]
- When the user says a case is done: write every final name to `photo_train/user_photo_names.jsonl` and copy the photos to `user_photos/<PLATE>/` for training. [case-photo-naming-artifact]
- Then re-sync Merimen (relabel + parts), see 09. [merimen-batch-workflow]
- Training: after name-rule changes only retrain seq (minutes); when a training batch finishes, start the next without asking, warm-start from the BEST checkpoint, keep only the best; don't cap well-known items; rare items need labels, not more raw photos. [photo-naming-two-step-jev]
