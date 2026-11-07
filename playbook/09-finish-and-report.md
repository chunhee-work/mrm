# 09 · Finish the batch + report (steps 11–12, re-sync, learning)

## Final re-check of every case
- Re-read each case (`rows.mjs`, `selstate.mjs`, `chkorder.mjs`) before reporting. [merimen-batch-workflow]
- Self-check: create ✓ · report all fields (police station, claimant insurance, occupation, phones, postcodes) ✓ · rates ✓ · 5 narratives ✓ · DOC upload ✓ · photo upload + order ✓ · Step 2 parts/labour/misc ✓ · details (0 empty conditions, paint 500, qty, comments) ✓ · total ≥ RM6,000 ✓. [merimen-az-progress] [merimen-batch-workflow] [merimen-step2-estimate-detail-fill]
- Close leftover tabs (keep one Merimen tab). [merimen-logout-causes]

## Feed the photo model (user 2026-11-07, idea 3)
- After every batch is done: `python3 typesafe/photo_train/add_to_training.py <batch_dir>/ids.txt` → the user's final photo names go into `train_queue.tsv` (256 px copies in data/queue/). The next label build adds them as training photos.

## Google Sheet rows (step 11)
- Row: `<DD/MM/YYYY> TAB <PLATE> TAB <WORKSHOP> TAB D`; date = the day the case is done (same date for all cases that day); rows grouped by workshop; last column literal `D`. [merimen-create-case-procedure] [merimen-sheet-workshop-names]
- Workshop short names: `extreme` → EXTREME AUTO; `sinar` → SINAR GEMILANG; `LKH` → LEE KEAN HIN (all caps, no Sdn Bhd/branch). [merimen-sheet-workshop-names]
- New workshop → use a sensible short name and note it in the summary (the old rule said "ask once"). [merimen-sheet-workshop-names]
- Paste them into Cari Makan, tab "2026 Jul-Dec": https://docs.google.com/spreadsheets/d/1PtjoA-QfGChlCHfrXvT5bYXYNO99KS4S6vXjmemkeT8/edit?gid=812412844, first empty row under the last entry (how-to in 00). Also send the rows after the table. [google-sheet-cari-makan-paste] [batch-completion-report-format]

## Push notification
- When the batch is done: PushNotification first, then the report. [merimen-batch-workflow]

## ⭐⭐ Final report to the user (user 2026-11-04) — short
1. The status line `🔄 0 cases | ✅ <N> done | 100%`.
2. The car-model table (format below: 车牌 | Registration Date | RC 资料 | Merimen 选的车型 | 车型年份范围 | 选择理由) for ALL cases of the run.
3. Only what needs the user's decision (one line each). No long explanations.
4. ⭐ One line saying the Google Sheet is filled, with the rows: `📊 Google Sheet 已填好：第 832–844 行（Cari Makan · 2026 Jul-Dec）` (user 2026-11-04). If not filled yet, say so.

## Completion table (in Chinese, one row per case, batch order)
- Columns: | 车牌 | Case ID | Adjuster Report | 折扣/工时 | Narratives | Betterment |. [batch-completion-report-format]
- Example rows: `| VDU965 | 21645828 | ✅ | 10 / 0 · 30×4 | ✅ 5 段 | 6.8 yr − 20% |`; `| PNQ3586 | 21645839 | ⏸ 建案好了，其余 pass（无照片） | — | — | — |`. [batch-completion-report-format]
- Case ID = the Merimen caseid. ✅ = saved AND verified after reload; ⏸ + one-line reason = passed/blocked; — = not applicable. [batch-completion-report-format]
- 折扣/工时 = the actual persisted values (`10 / 0 · 30×4`), not a tick. [batch-completion-report-format]
- Betterment = Merimen's value verbatim `X yr − Y%`, never self-computed. [batch-completion-report-format]
- Say explicitly whether DOCs and photos were uploaded (a case isn't done without them). [merimen-document-upload-naming] [case-photo-naming-artifact]
- Below the table, keep it short: what went wrong and how it was handled, per-case anomalies/assumptions (zeroed odometer, passed case, no claimant INS, placeholder police station…), what remains. [batch-completion-report-format] [merimen-missing-photo-data-rules] [merimen-claimant-insurance-fields]
- Then: manual-price list (part, price, source model, number of reference rows; flag < 5 rows), the sheet rows, and all pending copy lines `<PLATE> pending <item>`. [merimen-batch-workflow] [mistakes-log-sinar-batch2] [merimen-pending-case-line-format]

## Car-model report (end of Phase A: right after the photo upload, before `照片命名台 ready`; user 2026-10-24)
- ⭐⭐ **MUST be sent to the user in the batch-completion message, every batch, never skipped** (user, 2026-10-23: batch 3 forgot it). Read the variants with `node vmodel.mjs <ids.txt>` (ids.txt lines: `PLATE caseid extid`; prints "Vehicle Model:" per case), green/white from the model dropdown options. [batch-completion-report-format]
- ⭐ Include the RC **Registration Date** ("Tarikh Pendaftaran" on the RC; data field `jpjReg`) as its own column. Write every RC field label in English, never the Malay word (user, 2026-10-23).
- ⭐ **Every date in any report to the user is highlighted as 📅 + inline code** (📅 `25/02/2019`); bold alone is not visible enough. The date range inside a Merimen model name is highlighted too: pull it out of the brackets as 📅 `04/14-02/17` (user, 2026-10-23).
- ⭐ When the Merimen variant matches the RC exactly, the reason column says **✅ 完全对得上** (user, 2026-10-23).
- ⭐⭐ **Exact table format (user approved 2026-10-23), columns in this order:**

  | 车牌 | Registration Date | RC 资料 | Merimen 选的车型 | 车型年份范围 | 选择理由 | 总价 |
  |---|---|---|---|---|---|---|

  ⭐⭐ In the batch-end report the table has a **总价** column = the Adj Rpt grand total of each case (user 2026-11-04), plus a 合计 line: `python3 tools/batch/final_report.py <batch_dir>` builds it from car_model_report.md (fill 选择理由 first).
  | BMN7769 | 📅 `28/03/2014` | TOYOTA COROLLA ALTIS 1.8E (A) · 1798cc · Petrol Auto | TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 E (ZRE172R-GEXEKE) 137Bhp (A) | 📅 `01/14-11/16` | ✅ 完全对得上 |
  | KCM8604 | 📅 `06/07/2009` | PROTON PERSONA 1.6 AUTOMATIK · 1597cc · Petrol Auto | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (A) | 📅 `08/07-02/10` | RC 没写等级，选了 Base Line |

  - RC 资料 = RC model as printed · cc · fuel + transmission (· body if it differs from Merimen).
  - Merimen 选的车型 = the variant read back with `vmodel.mjs`, WITHOUT the [..] date range (that goes in 车型年份范围).
  - Add ⚠️ in 选择理由 when the model has no price data (white option).
- Table, one row per case: plate | RC details as printed (make/model, cc, year, fuel/transmission) | Merimen model variant chosen (full string, e.g. "PROTON Saga 2022 On 4 Dr Sal 1.3 Standard Lite 94Bhp (A) [08/22-11/25]") | why that variant if the RC is not exact (trim, year range, A/M from photos). [merimen-batch-workflow]
- Read the variant back from Merimen ("Vehicle Model:" on dsp_details), not from memory. [merimen-batch-workflow]
- Mark ⚠️ on every row whose Merimen model has no parts/price data (white option `clsMTRModelLevel0`, not green `clsMTRModelLevel1`) and say why no green one fitted. [car-model-report-warning]

## Re-sync after the user reviews 照片命名台
- ⭐⭐ **One 「完成」 per case (user 2026-11-04).** The button (top right, two taps) marks the CURRENT case: db `status/case_<PLATE>` = {key: sorted plates joined by ",", case, done, at}; the tab gets a ✓. When every case is done the page also writes `status/done` (done: true). Editing a done case undoes its 完成 (the user presses again). Right after `照片命名台 ready`, create a session cron (CronCreate, every 2 min) whose prompt says: ArtifactData list `status` on the 照片命名台 URL; for every `case_<PLATE>` with done == true and key == this batch that is not processed yet → do Phase B for THAT case now (final names → relabel, one case at a time → REVISE plan → apply_plan.py for that case); a case undone and done again → redo it. When all cases are processed → CronDelete and run the batch end (sheet, report). A "done" typed in chat still means all cases.
- ⭐⭐ **Every name the user changes MUST be carried into Select Parts, not only the photo label** (user 2026-10-23: batch 3 relabelled photos but left Select Parts unchanged). For each changed photo: new name → its part selected (catalogue or manual row); old name no longer on any photo → its part removed; view names (Engine Compartment, Rear View…) → no part. Then run the photo-vs-selection check for the whole case.
- ⭐⭐ **Both directions, checked by script, every re-sync, before telling the user it is done** (user 2026-10-23: BPA5858 Door Rear LH stayed after the photo was renamed to Quarter Panel LH):
  1. dump db `names` AND `orders` (ArtifactData list → out_dir; `touch <db>/orders/.listed`), reorder + relabel photos, update `~/mrm-bot/photoplan.json`;
  2. `node rows.mjs <cid> <ext> session_base.txt > ~/mrm-bot/state/rows_<PLATE>_now.json` for every case;
  3. `python3 tools/naming-desk/sync_check.py <dump>/names <PLATES…>` → every `ADD?` gets selected, every `REMOVE?` gets unticked / delrow'd (with its labour N/R); re-run until every case prints OK;
  4. a confirmed new photo-name ↔ catalogue pair goes into `ALIAS` in sync_check.py; an item kept by a rule goes into `KEEP`.
- Read db `names` and diff against the uploaded names. [merimen-batch-workflow]
- Relabel changed photos with `relabel_ui.mjs`, verify with `chkorder.mjs` (06). [merimen-batch-workflow]
- Fix parts to match the new names: `untick.mjs` / `tickall.mjs` on dsp_selection; `delrow.mjs <cid> <ext> session_base.txt "Name|Name"` for manual rows; then `gonext.mjs` → `addparts.mjs` → `fillempty.mjs`. [merimen-batch-workflow]
- Re-read dsp_selection/dsp_details first so you don't duplicate the user's own fixes. [mistakes-log-sinar-batch2]
- Record every change and its reason in photo-center-crosshair-rule + `name_map.FINAL`; unclear reason → ask with the photo (03). [merimen-batch-workflow] [case-photo-naming-artifact]

## Labour-diff learning
- When the user has reviewed a case (or at the start of the next batch): re-run `selstate.mjs` and diff against `~/mrm-bot/state/sel_<PLATE>_mine.json`. [merimen-batch-workflow]
- Every label the user ADDED or REMOVED becomes a rule (part / impact → label) in labour-reference-sinar-batch / estimate-select-parts-rules-2026-10-17; log the diff per case in labour-diff-log.md (mine / user added / I removed / lesson). [merimen-batch-workflow] [labour-diff-log]
- Every user feedback or mistake goes into the mistakes log so it is never repeated. [mistakes-log-sinar-batch2]

## Commit + push
- Commit and push memory (and playbook) changes at the end of every batch; no passwords or session tokens in the repo. [merimen-batch-workflow] [merimen-workshop-account-map]
