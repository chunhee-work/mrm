---
name: merimen-batch-workflow
description: "⭐⭐ THE workflow (user 2026-10-17): one instruction = every case 0→100% (create, report, estimate, photos artifact, Step 2, photo upload, DOC upload, sheet paste, notification). Only a missing document stops a case: send its copy line, continue the others, never ask"
metadata:
  type: feedback
---

User (2026-10-17, after the sinar batch): "moving forward will use this workflow. the only thing will stop u is missing document and that need to send me the copy to copy and proceed with others first always do not stop and ask me. u need to do it all from 1-100% complete." Also: "when done send me notification, as always when u done the case."

## Rules of engagement
- **Never stop to ask.** Use memory rules, then sensible defaults. Report assumptions in the final summary.
- **The only stop is a missing document.** Send the one-line copy text `<PLATE> pending <doc>` ([[merimen-pending-case-line-format]]) right away, then carry on with every other case. Finish that case when the doc arrives.
- **"do" = all cases**, each 100% done ([[batch-autonomy-rule]]).
- **When the batch is done, send a push notification** (PushNotification tool), then send the completion table ([[batch-completion-report-format]]).

## Setup
- **Automation Chrome:** `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.agent-browser-chrome"`. Keep a window open: with no window, CDP fails with "Browser context management is not supported" (reopen with the same command).
- **Login:** the user runs `cd ~/mrm-bot && node relogin.mjs` in their own Terminal. Claude never logs in with a password.
  - If any script lands on "Session Timeout / User Not Logged On", ask for relogin in one line.
  - Logging in on the user's normal Chrome kills the automation session.
- **Scripts:** ~/mrm-bot (copies in repo tools/mrm-bot/; ~/mrm-bot is the live copy). All take `<cid> <extid> session_base.txt` or `<PLATE> session_base.txt <json>` and drive the 9222 Chrome over CDP.
  - Building URLs with session_base IS fine there.
  - Never build CFID URLs in the user's normal Chrome.

## Per case, in order (run cases in parallel where scripts allow)
Order set by the user 2026-10-17: read → create → artifact → report → rates → narratives → DOC upload → photo upload → Step 2 parts/labour (from the photos) → estimate details → sheet.
1. **Read the bundle** (PDF pages → images), extract the case data, and pick the Merimen model variant ([[merimen-az-progress]], [[merimen-create-case-procedure]]).
   - Doc missing → copy line, skip the case, move on.
2. **Create:** `createpar2_sinar.mjs` with a cases JSON (insCOID, polcover, client, veh.modelValue, atfault, workshop). It also sets Manager/Adjuster.
   - Get the extid with `getext_one.mjs <cid>` (worklist).
3. **Photos → 照片命名台 artifact** as soon as the model is known:
   - Run `typesafe/photo_train/case_report.py` and add a tab for the case ([[case-photo-naming-artifact]], [[case-workflow-order]]).
   - Don't wait for the review. The user edits in parallel. Re-read db `names`/`orders` right before the photo upload (step 8) and again before Step 2 (step 9), and learn from every edit.
4. **Adjuster Report:**
   - Build the report JSON (fields as in ~/mrm-bot/report_mdp.json: insured/insDriver/claimant/clmDriver/veh/police…; build_report.py helps).
   - Run `MGR="VINCENT KANG" ADJ="Terrence Chia" node reportpar.mjs <PLATE> session_base.txt <json>` (dry), then again with `save` → must end `dsp_selection ✅`.
   - reportpar TODAY is now the real date.
   - Optional `collType` (e.g. "Motor Cycle") and `lossDescCat` ("Collision- Head to Side").
5. **Discount/Labour rates:** `disclabourpar.mjs` → PD 10 / SP 0 / 30×4. Read the betterment `X yr(s) - Y%`.
6. **Narratives:**
   - Put `betterment` (and `tpKind`: "m/cycle" for a motorcycle TP) into the JSON.
   - Run `narrpar.mjs` → VERIFY 500–540 ✓.
7. **Upload DOC:** `uploadpar.mjs` (FDESC DOC, FTYPE Other; compress under 3 MB).
8. **Upload photos:** `uploadphotos.mjs <PLATE> <cid> <ext> 0 999` from photoplan.json, built from the artifact's final order and names.
    - Original photos; one upload per case (maxno=250); types per [[case-photo-naming-artifact]].
    - Verify with `chkorder.mjs` (count + order = artifact).
9. **Step 2 Select Parts + Labour** — look at the PHOTOS themselves plus the artifact's final names (user 2026-10-17: "only u got the image then u know what to choose what to add"):
   - Go through every photo: what each one shows decides which parts, companions, quantities and labour to add, not just the name text.
   - Dump the catalogue with `selcat2.mjs` and match with typesafe/partmatch.py.
   - Apply ALL rules in [[estimate-select-parts-rules-2026-10-17]] and [[estimate-companion-parts-rule]]: every named item in; Bumper → Bumper Clips 15; full door set + mirror for front doors; Quarter Outer → Liner; Shock Absorber → Suspension Crossmember; sensors qty + comment.
   - Labour per [[labour-reference-sinar-batch]], filtered to the impact area and side.
   - Tick with `tickall.mjs <cid> <ext> sess tick.json` ({CP:[values],N:[labels],R:[labels]}). It clicks Thatcham "Apply & Submit".
   - Verify with `selstate.mjs`. Remove wrong ticks with `untick.mjs`.
   - **Save my own choice** (user 2026-10-17: "next time remember what u choose with the labour, i will add in"). Right after ticking and Merimen's auto/Thatcham adds, snapshot it: `node selstate.mjs <cid> <ext> session_base.txt > ~/mrm-bot/state/sel_<PLATE>_mine.json`. Do the same after labourfill (misc). Also copy it into memory file labour-diff-log.md.
   - Then `gonext.mjs` → dsp_details.
10. **Estimate details:**
   - `labourfill.mjs <cid> <ext> sess AUT apply` (misc)
   - `estfill.mjs <PLATE> sess extmap.json v` (conditions, misc, paint 500)
   - Manual parts with `addparts.mjs <cid> <ext> sess add.json save` ([group,name,price,qty,comment]; price from tools/merimen-part-prices-data.md, same model first)
   - `fillempty.mjs`
   - `setcmt.mjs` (sensor/hinge comments)
   - Check qty with `rows.mjs`.
11. **Google Sheet:** paste `<date> <PLATE> <WORKSHOP> D` rows into Cari Makan ([[google-sheet-cari-makan-paste]]).

## End of batch
- **Labour learning:** when the user has reviewed a case (or at the start of the next batch), re-read `selstate.mjs` and diff it against `sel_<PLATE>_mine.json`. Every label the user ADDED or REMOVED becomes a rule (part / impact → label) in [[labour-reference-sinar-batch]] / [[estimate-select-parts-rules-2026-10-17]]. Log the diff in labour-diff-log.md.
- Re-read every case (rows/selstate/chkorder) → completion table + manual-price list + pending copy lines.
- Push notification.
- Commit and push memory changes.

**Why:** the user wants zero check-ins; every miss in the sinar batch (photos, clips, door sets, qty, comments, labour, sheet) is now a step here.
