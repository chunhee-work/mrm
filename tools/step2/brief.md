# Step 2 planning brief (Select Parts + Labour + Misc + manual rows) — PLANNING ONLY

You do NOT touch Merimen and never run anything in ~/mrm-bot that talks to Chrome (no *.mjs). Read-only on Merimen data; you write plan files only.

READ IN FULL FIRST (they are the user's rules; follow them exactly):
- /Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/playbook/07-select-parts-and-labour.md
- /Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/playbook/08-estimate-details.md
- /Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/playbook/10-car-models.md (the section for your car models)
- /Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/memory/mistakes-log-sinar-batch2.md

Inputs per case <P> (B = <BATCH_DIR>):
- Final photo names (the user reviewed them; they decide the parts): B/report/final_<P>.json  (list of {n,name,...}); photos: B/report/photos/<P>/NN.jpg (look at them when a name is ambiguous, for sides, counts of sensors, whether a panel is replaced, and impact area).
- Case data (impact, vehicle): B/data/<P>.json ; Merimen model text: B/meta.json
- Catalogue: ~/mrm-bot/s2/cat_<P>.json  {"cat":[[value,label,checked]], "labs":[[labour label, checked]]}. value prefix NN@ = group (see playbook 07 group codes).
- Draft plan from typesafe/step2_plan.py: ~/mrm-bot/s2/tick_<P>.json, ~/mrm-bot/s2/miss_<P>.json, ~/mrm-bot/s2/plan_<P>.log  — a DRAFT, often wrong (e.g. it matched a fog lamp photo to "Fog Lamp Finisher", gave the same Bumper Clips value twice, gave only one tailgate strut side, missed items). Fix it.
- Prices for manual rows: /Users/chunhee/Documents/VS Code/gacha-smm-playbook/mrm/tools/price-refs/*.tsv (Myvi 2017, Saga 2016, Vios 2016 — same brand/model first), then `python3 tools/price_lookup.py ref "<part name>" --model "<Merimen model text from meta.json>"` (run from the repo folder; it gives ONE price: same model -> same brand -> all models only if the brand has none). Note how many reference rows; flag < 5.

Rules to apply that the draft often misses:
- The row must carry the PHOTO'S NAME: a closest catalogue item is OK only when it is the SAME part under another name (Bonnet Lock = Bonnet Latch). Never a different kind of part (Bumper is NOT Bumper Spoiler; Bumper Spoiler is NOT Body Kit Skirt; Runningboard Spoiler is NOT Runningboard Panel/Side Skirt; a trim is never a lamp). Otherwise manual row with the photo name. Never a "closest match".
- ⭐⭐ Manual row Suspension Crossmember Front / Rear: group "130" (Undercarriage), never another group (user 2026-11-04).
- ⭐⭐ Headlamp Panel <side> and Fender Inner <side> (Fender Front Inner / Inner Upper / Inner Reinforcement) are ALWAYS picked together, same side (user 2026-11-04).
- ⭐⭐⭐ THE PART NUMBER DECIDES (user 2026-11-04). Photo name ≠ catalogue name → check the part number in the label "(…)" against the maker's part name for that number (WebSearch the number; Mazda codes: -70-15X/-71-15X = inner wheelhouse R/L, -71-11Y = outer wheelhouse). Same part → tick it; not the same / not found → manual row with the photo name and a flag. Also fine: pairs listed in playbook 07 / 10 / sync_check ALIAS. Write the part number + what the maker calls it in "coverage", e.g. "Wheel Arch Inner Rear RH 80@BEYN7015X (Mazda 70-15X = Panel(R) Wheel House)".
- Confirmed: Rear Wheelhouse = Wheel Arch Inner Rear (Mazda, part no); Firewall Panel = Engine Partition Panel (Toyota 55101).
- Front Chassis Member LH/RH → also its End Plate, Front Section, Rear Section (same side) when in the catalogue.
- Misc Air-cond gas (Normal) / Air cond system checking / Radiator coolant ONLY when Radiator or A/C Condenser is selected.
- Comments: name has LH/RH → no comment (door hinge = exception, always Upper/Lower + side), EXCEPT qty-2 rows, which always get "Front LH & Front RH" / "Rear LH & Rear RH". Name without side → comment with the side.
- No catalogue item with the photo name -> manual row with THAT name. Never map it to a different kind of part (Moulding Fender Front RH is NOT Fender Signal Lamp Front RH; a trim is never a lamp).
- Every non-view photo name must become a selected catalogue item or a manual row (views/ID shots: Front/Rear/Side View…, Road Tax, Odometer Reading, Chassis Number, Engine Compartment, Interior View, Dashboard → no part).
- Front Bumper Fog Lamp LH/RH → ALWAYS also its Front Bumper Fog Lamp Finisher (same side) (user 2026-11-04).
- Companions (07): bumper → clips ×15 + sensors + brackets for THAT bumper; tailgate/boot lid set; door set; fender → liner; quarter → liner (NOT on Perodua Viva); suspension SET per corner; Grille → Grille Clips ×9; etc.
- Same catalogue value needed twice (e.g. one Bumper Clips value for front and rear) → tick it once AND add a manual row copy with the same price and a comment ("Front Bumper"/"Rear Bumper").
- qty-2 rows need comments "Front LH & Front RH"/"Rear LH & Rear RH"; door hinge rows without Upper/Lower+side in the name need "Upper RH" etc.; badge rows comment = logo in brackets e.g. "(MYVI)".
- Proton Saga / Perodua Myvi: Thatcham auto-adds Door Rear when Quarter Panel Outer is ticked — put those auto-added rows in "delete" (display names, e.g. "Door Rear LH") when there is no Door Rear photo; finish.py deletes them.
- Labour N/R: apply playbook 07 fully, including the "batch 3" lessons (tick MORE R on inner reinforcements, both sides for front/rear hits). Use ONLY labels that exist in cat.labs (exact text). N ticks pull in parts — only N what is replaced or an R&R job.
- Misc labels by impact (07 "Misc ticks"); suspension/wheel parts → add Road test, Road wheel alignment, Road wheel balancing. A car hit at front AND rear gets both sets (no duplicates).
- Rear Panel Inner Trim manual row goes in group 70.

OUTPUT per case: ~/mrm-bot/s2/final_plan_<P>.json :
{"CP": [catalogue values to tick, unique], "N": [labour labels], "R": [labour labels], "CM": [misc labels],
 "manual": [[group, name, price, qty, comment], ...],
 "qty": {"<row display name>": "2", ...}, "cmt": {"<row display name>": "Rear LH & Rear RH", ...},
 "delete": ["row display names Merimen auto-adds that must go, e.g. Door Rear LH"],
 "after": ["things I must check/do on the parts page after ticking"],
 "flags": ["anything unsure, prices with <5 refs, photos you could not decide"],
 "coverage": {"<photo name>": "<catalogue label or manual row it maps to, or 'view'>"}}
Every non-view photo name must appear in "coverage". Display names in qty/cmt = the catalogue label WITHOUT the leading code and [bracket] and (part no), e.g. "Bumper Rear Sensor", "Tailgate Support Strut LH".
Reply (English) with: per case, counts (CP/N/R/CM/manual), the manual rows with prices and ref counts, and the flags. Do not print personal data.

## REVISE mode (2026-11-04: plan during the user's naming, fix after)
Phase A already wrote a full final_plan_<P>.json from the MODEL's photo names. When the brief says REVISE, you get the list of
photo names the user changed (old -> new, from `naming.py final`). Do NOT re-plan from zero:
- read the existing ~/mrm-bot/s2/final_plan_<P>.json and B/report/final_<P>.json (now the user's names);
- for every changed photo: remove what only the OLD name needed (tick, N/R labour, manual row, qty/cmt, companions no other photo
  still needs) and add what the NEW name needs (same rules as above, incl. companions, prices, comments);
- re-check "coverage" for the changed names only, keep everything else as it is; overwrite final_plan_<P>.json.
A case with no changed names needs nothing. Reply with only the changes per case.
