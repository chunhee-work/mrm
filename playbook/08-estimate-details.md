# 08 · Estimate details (dsp_details, step 10)

## Order of commands
1. `node labourfill.mjs <cid> <ext> session_base.txt AUT apply` (account: AUT = Autoris, NV = Newvest, RW = Rawang) → labour/misc from the 5 most similar past cases (ticks what ≥3 of 5 ticked; skips if the case already has ticks). Snapshot selstate again afterwards (07). [merimen-batch-workflow] [labour-n-r-selection]
2. `node estfill.mjs <PLATE> session_base.txt extmap.json v` → paint popup first, then Damage Conditions + misc prices + Paintwork 500 (`v` prints the plan). [merimen-batch-workflow] [step2-paint-popup-method]
3. Manual parts: `node addparts.mjs <cid> <ext> session_base.txt add.json save` (rows `[group, name, price, qty, comment]`). [merimen-batch-workflow]
4. `node fillempty.mjs <cid> <ext> session_base.txt` → Damage Condition on EMPTY rows only (by row name), save. [merimen-batch-workflow]
5. `node setcmt.mjs <cid> <ext> session_base.txt <cmt.json>` → sensor/hinge comments. [merimen-batch-workflow]
6. Check qty with `node rows.mjs <cid> <ext> session_base.txt`; fix with `node setqty.mjs <cid> <ext> session_base.txt '{"Bumper Clips":"15","Bumper Rear Sensor":"2"}'` (catalogue clips come in at qty 1). [merimen-batch-workflow]
- Remove manual rows: `node delrow.mjs <cid> <ext> session_base.txt "Name|Name"`. Set a condition by name: `node setcond.mjs <cid> <ext> session_base.txt cond.json` (`{"<row name prefix>":"<Damage Cond>"}`). [merimen-batch-workflow] [tools/mrm-bot]
- Always set values by row NAME, never by remembered row number (manual rows move after a save). [merimen-step2-estimate-detail-fill]
- Render race: wait until `[name^="PDC"]` count ≥ `PROWCNT`, sleep ~2 s, re-count unchanged — before BOTH apply and verify (CDR332 filled 30 of 65 and still "passed"). [merimen-step2-estimate-detail-fill]

- ⚠️ **After any re-save of the Select Parts page (untick / tickall + `gonext.mjs`), a catalogue row whose N/A price was set with `setprices` can vanish from the details page** (batch 7 PRM7898 Wheel Arch Inner Rear RH, RM1,855.60 lost). Fix: `gonext.mjs` once more (the row comes back as N/A), then `fillprices.py` APPLY + `fillempty.mjs`, then `finish.py` for that case. sync_check shows it as `ADD?`.

- ⭐⭐ **Manual-row price when this model has no row (user 2026-11-04, Mazda 3 Rear Wheelhouse RH: RM692.52 "too cheap").** Use the brand TIER, then cars of the SAME CLASS (A/B small, C compact, D large, SUV, MPV, pickup) and a newer generation, other side's price if that side is missing — `price_lookup.py ref` now does this in that order. Never the whole-tier median when same-class cars exist, and never an "ALL models / OTHER TIER" price as is (a Vellfire price is not a Mazda 3 price). Mazda 3 2022 Rear Wheelhouse RH = RM1,356.58 (Civic 2016–2020).

- ⚠️ `fillprices.py` (2026-11-04): a price list (tools/price-refs/<Brand>_<Model>.tsv) is used ONLY for its own brand (WYY3391 Suzuki got a Perodua Myvi strut price RM39 -> RM372 Swift ref), and its fallback is `price_lookup ref --model` (never the all-models median, never an OTHER TIER price). Fix a wrong set price with `FORCE=1 node setprices.mjs …`.

## Page fields
- URL `index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=<cid>&extid=<extid>&tpins=0&<sess>`. [merimen-step2-estimate-detail-fill]
- `PROWCNT` part rows; `PPT<i>` row marker; `PDC<i>` Damage Condition (skip if readOnly); `MROWCNT` misc rows; `MMI<k>` misc price (skip if readOnly). [merimen-step2-estimate-detail-fill]
- Row name = first non-empty `<td>` text in that `<tr>` that is not a bare `< > = *`; no readable name → skip the row. [merimen-step2-estimate-detail-fill]

## Damage Condition — `cond(name)`, lower-case, FIRST match wins (order matters)
- Valid values: Bent, Broken, Cracked, Cut, Damage, Necessary, Bracket cracked. [merimen-step2-estimate-detail-fill]
- 1 `bumper.*retainer` → Bracket cracked · 2 `bracket` → Bracket cracked · 3 `weather sheeting|wheel hub|wheel bearing` → Necessary · 4 `weatherstrip|weather strip` → Cut · 5 `bumper.*sensor|sensor.*bumper` → Cut · 6 `mirror` → Broken · 7 `support strut|\bstrut\b` → Broken · 8 `windscreen|windshield` → Broken · 9 `centre guide|center guide` → Broken · 10 `spare wheel well|wheel well` → Broken · 11 `lock|striker|hinge` → Bent · 12 `lamp panel` → Bent · 13 `reinforcement` → Bent · 14 `liner` → Damage · 15 `reflector|fog lamp|lamp assembly|head ?lamp|signal lamp|tail ?lamp|\blamp\b` → Cracked · 16 `glass|window` → Cracked · 17 `sensor` → Necessary · 18 `clip|retainer|\bguide\b|nozzle|grommet|washer` → Necessary · 19 `trim|finisher|garnish|moulding|spoiler|skirt|extractor vent|\bvent\b|badge|emblem|grille|\bmask\b|valance|\bcover\b|cladding|\bflap\b|deflector` → Broken · 20 `rim|tyre|wheel` → Bent · 21 `absorber|control arm|tie rod|crossmember|drive ?shaft|stabilizer|\blink\b|knuckle` → Bent · 22 `panel|tailgate|boot ?lid|bonnet|fender|quarter|\bdoor\b|floor|wheelhouse|member|pillar|roof|firewall|apron|\bdeck\b|body side|support` → Bent · 23 `bumper` → Broken · 24 fallback → Bent. [merimen-step2-estimate-detail-fill]
- User corrections (FB438): Fender Signal Lamp Front RH = Cracked; Bumper Front Side Retainer RH = Bracket cracked; Grille Front = **Cut** (not Broken). [merimen-step2-estimate-detail-fill]

## Damage conditions — never empty (user 2026-10-24)
- ⭐⭐ **Every part row must have a Damage Condition. Never leave one empty.** Check every case with `node emptycond.mjs ids.txt` (prints rows with an empty condition) and fill them (`fillempty.mjs`) until every case prints `[]`.
- **Rooflining → "Broken"** (KCM8604 was left empty; estfill.mjs cond() now has it).

## Row comments
- **Badge / Emblem rows → comment = the logo name in brackets, as in the photo name**: Grille Badge → "(PROTON)", Boot Lid Badge → "(SAGA)", Tailgate Badge → "(CITY)", "(JAZZ)", "(I-VTEC)" — always CAPITALS (user 2026-10-31, playbook 11) (user 2026-10-24, TCH9615).
- ⭐ **Row name already has LH or RH → NO comment** (user 2026-10-30: Bonnet Support Strut LH needs no "LH"; same for every LH/RH row). Only exception: door hinges.
- **Row name without a side → comment says which one**, e.g. Stabiliser Bar Front Link Rod → "Front LH" (user 2026-10-30).
- ⭐ **Door hinge rows ALWAYS get "Upper LH & Lower LH" / "Upper RH" / "Lower RH"… unless the name already says Upper/Lower** (user 2026-10-30, VS3408 Door Front Hinge LH qty 2 had no comment). checkall: `HINGE NO CMT`, `CMT NOT NEEDED`.
- qty-2 rows always "Front LH & Front RH" / "Rear LH & Rear RH" (07), e.g. Bumper Rear Bracket Side LH ×2 → "Rear LH & Rear RH".

## Liners
- Liners are always black plastic (user 2026-10-29): Fender Liner / Quarter Liner rows are never painted — no paint on them in the paint popup.

## Manual-row groups
- **Rear Panel Inner Trim (manual) goes in group 70 Rear Panel, NOT 75 Rear Compartment** (user 2026-10-24; AKF8382, VCD3926, TCH9615 fixed).

## Misc prices — `misc(name)`, FIRST match wins; only rows Merimen lists
- Our own reference prices; never copy another company's misc prices; never add misc lines Merimen didn't list. [merimen-step2-estimate-detail-fill]
- `paintwork material.*solvent` 500.00 · other `paintwork material` → skip (handled by paint) · `car-o-liner|frame aligner|aligner bench|frame bench` 400.00 · `electrical` 35.00 · `underseal` 60.00 · `road test` 30.00 · `road wheel align|alignment` 45.00 · `balancing` 35.00 · `number plate` 25.00 · `windscreen sealant|glass sealant` **120.00** · `floor board sealant` **60.00** · `tail lamp sealant` **15.00** · other `sealant` 30.00 (sealant prices from the user's screenshot 2026-10-23; fix existing cases with `node miscfix.mjs <cid> <ext> session_base.txt`, misc rows only, no paint popup) · `other items` 35.00 · `\btyre\b` 350.00 · `air.?cond|r134` 150.00 · `fogging` 45.00 · Radiator coolant 35.00 · no match → skip. [merimen-step2-estimate-detail-fill] [step2-paint-popup-method]

## Paintwork Materials (popup method)
- Do the paint popup FIRST (its confirm resets unsaved values), save, reload, then conditions + misc. Needs parts selected (no paint row without parts). [step2-paint-popup-method]
- Miscellaneous tab → Paintwork Materials row → Edit (`PWEdit(0,0)`, click the button; don't call PWEdit directly). [step2-paint-popup-method] [merimen-step2-estimate-detail-fill]
- Popup: Paint Manufacturer `#slePNTMAN` = Other (value -1), `#sleMANCUSTOM` = `anything`; Base/Type/Range blank; Paint Consumables UNTICKED; no panels. [step2-paint-popup-method]
- Submit (`PWSubmitConfirm`) → "Unsaved values will be reset…" / "Retrieval completed!" → OK → row reads "Paint Manufacturer: anything". [step2-paint-popup-method] [merimen-step2-estimate-detail-fill]
- Then that row's price `MMI1` = 500.00 (force readOnly off), not 0 (was: price 0.00, 2026-10-07; and before that tick MPWCB1 + MPWCV1 = 500). [step2-paint-popup-method]
- If the estimate instead lists "Paintwork material (Solvent)" + "(Water-based)": Solvent = 500.00, Water-based stays 0.00, skip the generic row — never 500 twice. [step2-paint-popup-method]
- Old cases keep their old paint values unless the user asks (the 2026-10-05 batch keeps MMI1 = 500). [step2-paint-popup-method]
- Implemented in `~/mrm-bot/pwset.mjs` (`paintStep`), used by estfill.mjs. [step2-paint-popup-method]

## Manual parts + pricing
- Every photographed item / companion missing from the catalogue → manual row, with a price on every row. [estimate-select-parts-rules-2026-10-17] [estimate-companion-parts-rule]
- ⭐ **Price reference lists from the user (2026-10-24): `tools/price-refs/<Brand>_<Model>_<Year>.tsv`** (group, desc, part_no, code, price; OCR of the user's PDFs, `ocr_pdf.swift` + `parse_ocr.py`). Available: Perodua Myvi 2017, Proton Saga 2016, Toyota Vios 2016. Use them FIRST for that brand/model (`grep -i "<part>" tools/price-refs/*.tsv`); a 0.00 price = no price, look further. New PDF from the user → OCR it into the same folder.
- NDG4731 Jazz Wheel House Inner Rear at 64.70 was too cheap (user): Saga 2016 ref = 248.88, Myvi 2017 = 215.50. Never price a structural panel from a median of 2–3 cheap rows.
- ⭐ **2026-10-30: price data now covers 1,044 model blocks** — added 105 of our own cases (89 models: Perodua 29, Proton 24, Toyota 15, Honda 7, Nissan 4, Mitsubishi 3, Hyundai 2, Mazda 2, Ford, MINI, Subaru; 3,481 catalogue prices, rows with a part number only — our manual guesses are NOT used as references). Refresh any time: `node wlall.mjs 2 > a.txt; node wlall.mjs 3 >> a.txt` (in ~/mrm-bot) → `node pricegrab.mjs a.txt state/prices/grab.json` (read-only, own account only) → `python3 tools/batch/price_blocks.py <grab.json> <account>` (appends only new cases). Other accounts: `SESSF=session_nv.txt` / `session_rw.txt` before both node commands. Newvest NVISSAC done 2026-10-30 (92 cases, 81 were already in the file, +10 cases / 406 prices) → 1,054 model blocks. Aman Insurance Adjusters (Kepong) done 2026-10-30: ALL 7,188 cases via `wlpages.mjs` (clicks Next >; needs a big `totalcase`) + `pricegrab2.mjs` (reads the RAW page: catalogue rows use the LIST price = the original catalogue price shown in bold before the page script swaps in the case price, user 2026-10-30) → +6,999 cases / 2,132 models / ~269k prices → **8,053 model blocks** (54 brands incl. Mercedes, BMW, Lexus, Porsche, VW, Volvo, BYD, Tesla, lorries Hino/Isuzu). ⭐ **Manual-row prices of OTHER companies' accounts (Aman) are valid references** (user 2026-10-30): `MANUAL=1 python3 tools/batch/price_blocks.py …` adds them with part no `manual`. Never use our own TC0607 manual rows (our guesses). When the user logs in to an account in the 9222 Chrome by hand, take the session from that tab's URL into `~/mrm-bot/session_x.txt` (never print it) and use `SESSF=session_x.txt`.
- ⭐⭐ **Manual price = `python3 tools/price_lookup.py ref "<part>" --model "<Merimen model text>"`** (user 2026-10-31: never mix all models). It returns ONE price: median of the SAME model (same year generation first, then the model family) → if that model has no row, the SAME BRAND → then the SAME PRICE TIER (user-approved 2026-10-31) → only if the tier has none, all models. Tiers: T1 national/budget (Perodua, Proton, Inokom, Naza, Hicom) · T2 Japanese/Korean (Toyota, Honda, Nissan, Mazda, Mitsubishi, Hyundai, Kia, Suzuki, Daihatsu, Subaru, Isuzu cars) · **T2+ Japanese/Korean premium** (user 2026-10-31: Alphard, Vellfire, Estima, Harrier, Camry, Crown, Land Cruiser, Prado, Accord, Odyssey, Legend, Teana, Elgrand, Murano, CX-8, CX-9, Palisade, Carnival, Staria) · T3 European/American mainstream (VW, Ford, Peugeot, Chevrolet, Citroen, Renault, Ssangyong) · T4 Chinese premium/EV (BYD, Denza, Zeekr, Xpeng, Smart) · T4b Chinese budget (Chery, Great Wall/Haval/Ora, Changan, Jaecoo, Omoda, Neta, MG, Geely) (user 2026-10-31: split; VW stays T3) · T5 luxury (Mercedes, BMW, Lexus, Audi, Volvo, MINI, Land Rover, Tesla) · T6 super luxury (Porsche, Bentley, Maserati) · T7 commercial/lorry/bus/van — by VEHICLE, not brand (user 2026-10-31): any lorry/truck/bus/N-Series/Fuso/Dyna/Lorimas of any brand; Isuzu D-Max/MU-X = T2 (Hino, King Long, Dong Feng, Foton, UD, Yangtse, SKS, Farid = Placer X van, LMG = Trekker pickup) · motorcycles separate. New brand → put it in a tier in `TIERS` (tools/price_lookup.py) and here. Names match by words in any order (Door Hinge Front LH = Door Front Hinge LH), exact name first. Flag < 5 rows. `part … --model` / `brands` for browsing.
- Price source: `tools/merimen-part-prices-data.md` (`tools/price_lookup.py`), SAME MODEL first. [merimen-batch-workflow] [mistakes-log-sinar-batch2]
- Never trust a median of 2–3 rows (wrong before: Wheel Arch Moulding 1937, Retainer Centre 933.50, Spare Wheel Well 2675). Flag any price with fewer than 5 reference rows in the report. [mistakes-log-sinar-batch2]
- A price the user gives wins: Lamp Daytime Running (Myvi) 384.23; Bumper Front Fog Lamp LH (FB438) 763.00. [mistakes-log-sinar-batch2] [estimate-select-parts-rules-2026-10-17]
- Bumper Clips manual row: qty 15 × 10.00. Quarter Liner LH/RH manual row (Nissan, WWH2330): 325.00 each (Nissan median); the row name is Quarter Liner, never Quarter Panel Liner (user 2026-10-20). [estimate-select-parts-rules-2026-10-17]
- Lorry reference prices (user): Rear Panel 2600 · Rear Mudflap 280 · Rear Reflector 300 · Grille Front 985 · Door Lock 415 · Dashboard 1985 · Wooden Carrier Rear Door 1200 · Wooden Carrier Rear Support Stainless Steel 600 · Wooden Carrier Step Panel 450. [car-part-item-names]
- Manual rows also need the sensor/hinge comments and qty 2 rules from 07. [estimate-select-parts-rules-2026-10-17]
- List every manual price in the end-of-batch manual-price list (09). [merimen-batch-workflow]

## Quantities to check on every case
- Bumper Clips 15 (per bumper) · Grille Clips 9 · Bonnet Hinge 2 (single row) · sensors/brackets 2 (single row) · Boot Lid/Tailgate Hinge 2 (single row) · Tailgate Support Strut 2 (single row) · door hinge single row 2 · rims 2 when both axles share the item. [estimate-companion-parts-rule] [estimate-select-parts-rules-2026-10-17] [mistakes-log-sinar-batch2]

## Save + verify
- Set PDC + MMI + paint (fire `input` + `change`), make every `<img>` `pointer-events:none`, click the exact-text Save, accept up to 3 OK confirms, re-navigate and verify. [merimen-step2-estimate-detail-fill]
- Done = 0 empty PDC rows AND Paintwork price 500.00. Save is idempotent; on session loss relogin and re-run. [merimen-step2-estimate-detail-fill]
- ⭐ **The RM6,000 check uses the Adj Rpt total on the Claim Subfolder page** ("Adj Rpt RM10,668.09"), not the parts sum (user 2026-10-29). Read it with `node adjtotal.mjs ids.txt`.
- ⭐ **How the user lifts a case under RM6,000 (JJL6007 Wira, 2026-10-29)** — copy this, in order:
  1. Add every catalogue part the photos justify that was missed (JJL6007: Chassis Member Rear Section Rear LH/RH next to the Extension parts; labour N on them instead of R).
  2. Misc: **Paintwork Materials 500 → 700.00**, **Car-O-Liner frame aligner bench 400 → 600.00**. All other misc stay at the normal prices (Electrical 35, Floor board sealant 60, Number plate rear 25, Other items 35, Tail lamp sealant 15, Underseal 60, Windscreen sealant rear 120).
  3. Re-read the Adj Rpt total (`adjtotal.mjs`); JJL6007 ended at RM6,254.95.
- **Every case total must be ≥ RM6,000 — never lower** (user 2026-10-20). If it comes out lower, re-check the photos for missed parts, companions, labour N/R, misc and paint, and price manual rows by the same model. Every item must still be justified by the photos. Never send a case below 6,000; if it can't be justified, flag it in the report.
- A Total-Loss case still runs this step normally. [merimen-step2-estimate-detail-fill]
