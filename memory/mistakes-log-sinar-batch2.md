---
name: mistakes-log-sinar-batch2
description: "⭐ Every mistake I made on the sinar batches (2026-10-17..20) and the fix. Read before Step 2 of any case; never repeat"
metadata:
  type: feedback
---

User 2026-10-20: "for all my feedback and the things u do wrong pls learn from lesson and keep in memory never mistake again."

## Select Parts
1. **Missed photographed items.** Every item in the photos must be in the estimate; a catalogue miss becomes a manual row, never a drop.
   - BRS8642 Vios: front + rear Wheel Rim RH, Runningboard Spoiler RH, Door Mirror RH.
   - VDD414: Spare Wheel Well.
   - FB438: Fog Lamp LH.
2. **Wrong side or group.** Use the part in the photo's own group: 30/110 = Front Fender & Susp LH/RH, 60/80 = Rear Quarter & Susp LH/RH, 70 = Rear Panel, 10 = Front Panel.
   - TCP4539: the Wheel Rim was taken from the LH group for an RH hit.
   - Rear lamps were taken from 60@ instead of the Rear Panel group (70@).
   - Same text in two groups: pick the right group, and use qty 2 when both axles are hit (BRS8642 rims).
3. **Wrong item from a loose match.** Pick the exact name first:
   - "Door Mirror Cover RH" was picked for Door Mirror RH;
   - "Door Lock Central Locking Switch" and "Vehicle Lock Cylinder Set" were picked for the door lock.
4. **Bumper Clips:** one set per bumper in the photos (front and/or rear), each from that bumper's own group (10@ front, 70@ rear). If the group has none, add a manual row "Bumper Clips" 15 × 10.00. Never use an interior "Clips" item.
5. **Companions I missed** (full list in [[estimate-select-parts-rules-2026-10-17]]):
   - Shock Absorber → Suspension Crossmember (same axle) → Wheel Centre + Wheel Hub;
   - PERODUA Headlamp Panel → Front Panel Upper;
   - Tailgate/Boot Lid Hinge → qty 2 with Comment "Rear LH & Rear RH";
   - Door Front → Door Mirror;
   - Quarter Panel → Liner.
6. **Labour N ticks pull in parts.** Ticking N for an undamaged panel (Bonnet, Quarter Panel, Lamp RH, Crossmember Front…) adds that part. Snapshot after ticking and untick any part that is not in the photos.
7. **Misc must match the impact.** Side hit → no front set (no "Number plate, front"). WYN5733 got the front misc for a side hit.

8c. **2026-10-23 NDG4731:** the car had Rear Lamp Inner/Outer and Rear Bumper Sensor Inner/Outer, but photos were still named plain "Rear Lamp LH" / "Rear Bumper Sensor LH". User: when the car has Inner & Outer, always write Inner/Outer for lamps and sensors.
8b. **2026-10-23 (14-case batch):** the review dropped photographed items it judged undamaged or misnamed (CBL8902 Fog Lamp LH, BMN7769 bumper brackets + A/C hose, BPA5858 Door Rear LH, TAW339/NDG4731 badges, KCM8604 windscreens/pillar, WVH6628 fog lamp/arm/tread plate…). User: "all those got image one, no matter broken or not, need to select in select part." Run the photo-vs-selection check on every case.

## Prices
8. Manual prices taken from a median of 2–3 rows were wrong (Wheel Arch Moulding 1937, Retainer Centre 933.50, Spare Wheel Well 2675).
   - Use the same model first.
   - Flag any price with fewer than 5 reference rows in the report.
   - When the user gives a price, use it (e.g. Lamp Daytime Running Myvi 384.23).

## Process
9. **Check what the user already changed in Merimen before re-applying fixes.** Re-read dsp_details and dsp_selection first. I duplicated their manual Spare Wheel Well and Bumper Clips on VDD414 and SK64A.
10. **Don't pipe a script that saves into `| head`.** EPIPE killed tickall before Save. Redirect to a log file, then grep it.
11. **Photos:**
    - upload the original photos, in artifact order, all at once;
    - run chkorder after every upload (one duplicate shifted BRS8642);
    - relabel only through relabel_ui.mjs;
    - never build docmanage/act_docinfo URLs: that logs the session out ([[merimen-logout-causes]]).
12. **Session:**
    - keepalive.mjs must be running;
    - keep the automation Chrome window open;
    - close leftover tabs;
    - the user logging in on their own Chrome kicks the automation session out.
12b. **2026-10-21:** ran `fetchfull.mjs` on 293 harvested training photos (other accounts' cases) to get full-res images for the 部位标注台: every fetch failed and the session logged out. Never fetch harvested docids; use the local photos.
13. **Names:**
    - always run name_map.final(): never General View or TAIL LAMP, and the other merges in [[photo-center-crosshair-rule]];
    - when two spellings are merged, keep the USER's spelling: I merged Quarter Liner into "Quarter Panel Liner"; the user wants **Quarter Liner LH/RH** (2026-10-20). Catalogue items keep Merimen's own text;
    - Perodua: never Front Panel Assembly.

## 13. Batch 3 (2026-10-23): forgot step 12, the car-model report
- The batch report went out without the RC vs Merimen model table. The user had to ask.
- Rule: the completion message is not finished until the car-model table (playbook 09, step 12) is in it. Use `~/mrm-bot/vmodel.mjs`.

## 14. Batch 3 (2026-10-23): naming-desk edits not carried into Select Parts
- I relabelled the photos after the user's 照片命名台 edits but did not update Select Parts. Gaps found: KCM8604 Door Glass Front/Rear Window LH, KER815 Rear Panel Upper, NDG4731 Rear Bumper Spoiler + Spare Wheel Foam, BMN7769 Spoiler qty, TCH9615 misc Number plate front, BMN7769 A/C hose (photo renamed to Engine Compartment).
- Rule: playbook 09 re-sync; every re-sync ends with the photo-vs-selection check.
- Misc sealant prices were wrong (45/30/30): Windscreen sealant rear 120, Floor board sealant 60, Tail lamp sealant 15 (user screenshot).
- 14b. Only the ADD direction was checked at first; old names' parts stayed: BPA5858 Door Rear LH (+N, Door Glass R&R), Bumper Rear Finisher LH/RH; KCM8604 Windscreen Front/Rear, Front Pillar Outer RH (+N); KER815 Boot Side Trim LH, Parcel Shelf Rear; NDG4731 Boot Storagetray, Spare Wheel Well, duplicate Badge; CCQ6119 Bumper Rear Moulding LH; AKF8382 Emblem i-VTEC; BMN7769 Number Plate Holder Rear, A/C Hose; WA9150L Door Lower Moulding Rear RH; CBL8902 Wheel House Inner Rear LH; TCH9615 Wheel House Inner Rear RH. Fix: tools/naming-desk/sync_check.py (both directions) is mandatory in every re-sync.

## 15. Batch 6 (2026-10-30): PRY826 reported "pending documents" but the PDF was in the zip
- `PRY826 adj.pdf` was at the zip ROOT, not inside `PRY826/`; my listing (`unzip -l | awk $4`) cut the name at the space, so I never saw it.
- Rule: `unzip -Z1` full names, move every PDF into its case folder, only then decide a document is missing (playbook 00 + 01).

## 16. Batch 5 (2026-10-30): PRY826 Moulding Fender Front RH mapped to Fender Signal Lamp Front RH
- The planning agent guessed the MINI side scuttle carries the indicator and ticked the lamp. User: not the same thing.
- Rule (07 Rule 2): no catalogue item with the photo's name -> manual row with that exact name; never swap to another kind of part.

## 17. Batch 5 (2026-10-30): photo items mapped to "closest" parts instead of the photo name
- VS3408: Front/Rear Bumper Spoiler + Runningboard Spoiler LH → Body Kit skirts; PRY826: Moulding Fender Front RH → Fender Signal Lamp. checkall SYNC printed `ADD?` for them and I explained them away as "acceptable mappings" instead of fixing.
- Why: the planning agent is told to find a catalogue item for every photo; when the exact name is missing it picks the nearest-looking item (often to avoid a manual price) and writes it in `coverage`, so the "every photo covered" check passes on paper.
- Rule: the row name = the photo name (or a confirmed ALIAS). No exact item → manual row. SYNC `ADD?` = must fix.
- Same review: hinge comments missing (VS3408 Door Hinge), LH/RH rows given side comments, aircon misc without Radiator/Condenser (WUE6407, PRY826), WUE6407 chassis End Plate / Front + Rear Section missed. All now in playbook 07/08 + checkall.
- Correction (user, same day): Bonnet Latch RH IS the bonnet lock (kept, ALIAS added). A closest item is fine when it is the same part; Bumper ≠ Bumper Spoiler.

## 18. Batch 5 (2026-10-30): PRY826 photo order from the 照片命名台 not uploaded
- Phase B dumped only db `names`; `orders` (the user's drag-and-drop order) was never read, so Merimen kept the old order.
- Rule: dump BOTH collections every time; naming.py final now stops unless `<db>/orders/.listed` exists; reorder in Merimen, then chkorder.

19. **2026-11-03 batch 7 (LKH/VP):** (a) marked CEW7805 + PLG158 "pending RC / police report" from the reading agent's list without opening the pages — the police report number/date were in the bundle and no-RC cases use the insurance (playbook 12 rule 13); (b) left the 3 VP cases out of the 照片命名台 while waiting for the account; (c) CEW7805 DOC compressed to 14.7 MB and silently dropped by Merimen, `docsInList` (which counts photos) hid it; (d) pick_model chose a Dbl.Cab Hilux for an RC "HILUX S/C" — fixed (cab + special-edition rules in pick_model.py). Rules now in playbook 00 / 06.

