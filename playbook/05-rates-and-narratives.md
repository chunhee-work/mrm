# 05 · Discount / labour rates + narratives (steps 5–6)

## Discount + labour rates
- Run `node disclabourpar.mjs <PLATE[,PLATE…]> session_base.txt <json>` (JSON per plate: `cid`, `extid`) → Part Discount 10 / Special Discount 0 / Labour 30×4. [merimen-batch-workflow]
- Fill these on EVERY case, even with an empty estimate. [merimen-az-progress]
- Route: dsp_selection → "Next (Save & Edit Estimates) >>" without selecting parts → Parts tab. [merimen-create-case-procedure]
- Parts tab: `PARTDISCPC` (Part Discount on P Items %) = 10; `SPCDISCPC` (Special Discount on S Items %) = 0 — the right/pink boxes; the left R-prefixed ones are display. Leave Std Betterment % as shown. [merimen-az-progress] [merimen-create-case-procedure]
- Labour tab: the four Labour Rate boxes `LRPRATE` / `LMTRATE` / `LPNRATE` / `LPARATE` (Others / MET / Panel / Paint) = 30 each, then Save. [merimen-az-progress]
- Plain JS `.value` + `input`/`change` events + a REAL Save click persists (verified by reload) (was: "only Playwright `.fill()` persists" [merimen-az-progress]). [merimen-session-timeout-workflow]
- Leaving the page fires a native confirm ("Remember to save…") → OK (or call `LinkBack(1,0,…)` to bypass). [merimen-create-case-procedure]
- Verify by reload: PD 10.00 / SP 0.00 / L 30/30/30/30. [merimen-az-progress]

## Betterment read-back
- READ `Std Betterment [<X> yr(s) - <Y>%]` off the estimate page; never compute it (Merimen's value wins: CCX3911 = 14.5 yr - 40%, not 14.6). Caps at 40% for 10+ year cars. [merimen-adjuster-report-fields] [merimen-create-case-procedure]
- It shows on the PARTS tab of the estimate-entry page, with or without parts selected (was: "read from the LABOUR tab", narratives section of the same memory). [merimen-create-case-procedure] [merimen-adjuster-report-fields]
- Copy it verbatim into the completion table as `X yr − Y%`. [batch-completion-report-format]

## Narratives
- Put `betterment` (the exact `X yr(s) - Y%` string) and, for a motorcycle TP, `tpKind: "m/cycle"` (default "m/car") into the JSON with `afplate`, `police`, `impact` (rear / front / right-side / left-side / rear-left / front-right / rear-right / front-left; anything else → "side"), `TL`. [merimen-batch-workflow]
- Run `node narrpar.mjs <PLATE[,PLATE…]> session_base.txt <json>` → must print VERIFY 500–540 ✓. [merimen-batch-workflow]
- Fill narratives only after a clean Save & Adjust Estimates and after the betterment is known. Route back: Claim Subfolder → "Edit Std Prt" / Edit Adj Rpt → Narratives tab (`mseClick(…,1)`, wait ~1.8 s). [merimen-adjuster-report-fields] [merimen-az-progress]
- Exactly 5 narratives, every case (was: "Narratives 4" in the old self-check; 540 must not be skipped): [merimen-az-progress]
  - 500 BRIEF CIRCUMSTANCES OF ACCIDENT: "The accident occurred due to the subject vehicle was said to have knocked by a third party <m/car|m/cycle> reg. no. <AT-FAULT PLATE> on the <impact> portion." [merimen-adjuster-report-fields] [merimen-batch-workflow]
  - 510 CONSISTENCY OF DAMAGES: "Our visual inspection of the subject vehicle upon sighting the police report No: <OUR CLIENT'S POLICE REPORT NO> revealed that the damage noted is consistent with the reported accident." Omit the "(except for … old damage …)" clause unless there really is old damage. [merimen-adjuster-report-fields]
  - 520 SOURCE OF PARTS PRICE (fixed): "We have recommended the parts pricing based on franchise parts prices where in a discount of 10% have been applied." [merimen-adjuster-report-fields]
  - 530: tick the preset MARKET VALUE slot, retitle `AWTitle530` to "WITHOUT PREJUDICE", body (fixed): "This report is strictly on a Without Prejudice basis." No Market Value narrative; don't use a blank slot. [merimen-adjuster-report-fields] [merimen-create-case-procedure]
  - 540 BETTERMENT: "In view that the age of the subject vehicle is <AGE> years, we have applied <Y>% betterment on all franchise parts recommended." AGE = the FULL decimal ("20.5 years", not "20"). [merimen-adjuster-report-fields] [merimen-az-progress]
- Leave 550/560/570/580 unticked — except a TOTAL LOSS case, where narrpar adds 550: "In view of the extent of damage sustained, the subject vehicle is deemed BEYOND ECONOMICAL REPAIR and we recommend this claim be settled on a TOTAL LOSS basis." [merimen-adjuster-report-fields] [merimen-batch-workflow]
- Tick boxes with `.click()` (`input[name=cbxNarr][value=<slot>]`, onclick `NarrCheck`), never `.checked=true` (doesn't persist); body `mlePara<slot>`, title `AWTitle<slot>`. [merimen-adjuster-report-fields]
- Save `SaveReport(1)` + OK modals; verify by re-opening. [merimen-az-progress]
