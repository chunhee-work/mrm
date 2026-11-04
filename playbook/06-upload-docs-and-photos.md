# 06 · Upload documents + photos (steps 7–8)

A case is not done until BOTH its documents and its photos are in Merimen; say so in the completion table. [merimen-document-upload-naming] [case-photo-naming-artifact]

## Documents (step 7)
- Run `node uploadpar.mjs <PLATE[,PLATE…]> session_base.txt <json>` (JSON per plate: `cid`, `ext`, `files`). FDESC = DOC, FTYPE = Other. [merimen-batch-workflow]
- Every source PDF in the case folder must be uploaded; never optional. [merimen-document-upload-naming]
- Document Name (FDESC) by content, not the Desktop filename: [merimen-document-upload-naming]
  - one combined bundle → `DOC`
  - our client's ownership cert (`… GERAN.pdf`) → `RC`
  - our client's own insurance (`… POLICY.pdf`) → `INS`
  - police report → `P.REPORT`
  - at-fault party's insurance / I-SEARCH (`JPJ SEARCH ….pdf`, `… TP INS.pdf`) → `JPJ SEARCH`
- FTYPE (Type dropdown `#Type0`) = "Other" (value `32`) on every row; empty = silent failure. FCMMT blank. [merimen-document-upload-naming] [macos-native-dialog-automation]
- Compress ONLY files over 5 MB; files ≤ 5 MB upload as-is (user 2026-10-20). Use PyMuPDF (render pages to JPEG and rebuild) to get under 5 MB.
- ⭐ The compressed file MUST end under 5 MB: step the dpi down (150 → 120 → 100 → 85 → 72) until < 4.8 MB. A 14.7 MB file was dropped by Merimen with no error (CEW7805, 2026-11-03). After every DOC upload run `node listdocs_pdf.mjs <cid> <ext>` (prints the number of PDF rows) — `docsInList` also counts photos, so it is no proof. phase_a.py does both now.
- Skip a case that already has a Documentation row with that name (no double uploads). [macos-native-dialog-automation]
- Verify by counting rows in the case's Documentation list before/after (XHR `fusebox=SVCdoc&fuseaction=dsp_docview&domainid=1&objid=<caseid>&corole=4&<sess>`, regex `SVCDOCObjRow(…)`; class 1 = documents, 2 = photos); never trust a stale `.template-download` row. [macos-native-dialog-automation]
- Manual fallback: one fresh `dsp_docupload` tab per file (`index.cfm?fusebox=SVCdoc&fuseaction=dsp_docupload&domainid=1&objid=<caseid>&corole=4&docclassid=1&maxno=20&BCO_FLAGMODE=ADD&SHOWLABEL=0&nolayout=1&<sess>`), add the file via base64 DataTransfer into `#FilesID` (`typesafe/run_upload.py`, no Accessibility needed) or the native picker (Cmd+Shift+G + type full path + Return ×2), set Type + `#Desc`, click Start upload; success = row flips to `.template-download` "Ok <file>.PDF Successful". [macos-native-dialog-automation]
- A double space in a filename breaks the Go-to-folder keystroke → copy to a single-space temp path first. [macos-native-dialog-automation]

## Photos (step 8)
- Before uploading, re-read the artifact's db `names` and `orders` (see 03). [merimen-batch-workflow]
- Build `photoplan.json` from the artifact's final order + names, then run `node uploadphotos.mjs <PLATE> <cid> <ext> 0 999` (reads `photoplan.json` + `session_base.txt` in ~/mrm-bot). [merimen-batch-workflow]
- ONE upload per case: the upload page (dsp_docupload, docclassid=2) opened with `maxno=250` so all photos go at once (the button popup caps at 20). [case-photo-naming-artifact] [mistakes-log-sinar-batch2]
- Upload the ORIGINAL photos from the case folder (not the 900 px thumbnails), in artifact order. [case-photo-naming-artifact]
- FDESC = the artifact's final name. [case-photo-naming-artifact]
- FTYPE by name: the 4 corner views → "4 angles of vehicle photos"; Odometer Reading → "Odometer Reading"; Chassis Number → "Chassis Number"; Engine Compartment → "Engine view"; everything else → "Photographs of Damaged Parts". [case-photo-naming-artifact]
- Merimen lists photos by FDESC in upload order. [case-photo-naming-artifact]

## Check order (after EVERY upload)
- Run `node chkorder.mjs <PLATE> <cid> <ext>` → count + order must equal the artifact (photoplan.json). [merimen-batch-workflow] [mistakes-log-sinar-batch2]
- A one-shot upload once stored one photo twice (same file, two docids) and shifted the order (BRS8642). Find the duplicate by fetching each docid with dsp_getfile (this account's case only) and hashing. [case-photo-naming-artifact]
- 2026-11-04 batch 8: JSF901 / WJD4327 / WWH3780 got every photo twice (phase_a re-run). User: "u delete" -> Claude removes the second copies at the END of the next batch (one relogin afterwards).
- ⭐ **Remove (revoke) photos: `node revokephotos.mjs <cid> <ext> <from> <to>`** (2026-11-04, user "find way to delete it"): Relabel/Reorder page → the photo's info icon → **Remove**, confirm pre-approved in the page; removes positions to..from from the highest down and only when the info window shows the same caption as that row. Tested on WWH3780: no logout. Then `chkorder.mjs`.
- Removing the duplicate: never through `act_docinfo … action=DEL` from a CDP page (logs out); do revokes last in the batch or ask the user to delete it in the UI; ask for relogin afterwards if it logged out. [case-photo-naming-artifact] [merimen-logout-causes]

## Relabel / reorder
- Relabel ONLY with `node relabel_ui.mjs <cid> <ext> '{"<pos>":["<old name>","<new name>"]}' save` (clicks the docview "Relabel/Reorder" link; verified on 7 cases without logout). [merimen-logout-causes] [mistakes-log-sinar-batch2]
- Reorder ONLY with `node reorder_ui.mjs <cid> <ext> <map.json> save` (same Relabel/Reorder page; sets the order boxes `SDO*`; map = `{"<current pos>":["<name now>",<new pos>]}` built from the old vs new photoplan by `src`; it refuses to save if any current name/position differs). Verified on PRY826 2026-10-30 (26 moves, chkorder mismatch 0).
- Never build the dsp_docmanage URL by hand (immediate logout). [merimen-logout-causes]
- Then verify with `chkorder.mjs`. [merimen-batch-workflow]
