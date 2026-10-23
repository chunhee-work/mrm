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
