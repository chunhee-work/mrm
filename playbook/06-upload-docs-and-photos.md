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
- Compress: under 3 MB (was: "only compress files over 5 MB; ≤5 MB as-is", 2026-07-07). Use PyMuPDF `scratchpad/compress_pdf.py "<path>"` (re-renders pages, DPI 140→96 until <3 MB, writes `<name>_compressed.pdf`); Ghostscript is not installed. [merimen-batch-workflow] [workshop-from-desktop-folder] [merimen-create-case-procedure]
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
- Removing the duplicate: never through `act_docinfo … action=DEL` from a CDP page (logs out); do revokes last in the batch or ask the user to delete it in the UI; ask for relogin afterwards if it logged out. [case-photo-naming-artifact] [merimen-logout-causes]

## Relabel / reorder
- Relabel ONLY with `node relabel_ui.mjs <cid> <ext> '{"<pos>":["<old name>","<new name>"]}' save` (clicks the docview "Relabel/Reorder" link; verified on 7 cases without logout). [merimen-logout-causes] [mistakes-log-sinar-batch2]
- Never build the dsp_docmanage URL by hand (immediate logout). [merimen-logout-causes]
- Then verify with `chkorder.mjs`. [merimen-batch-workflow]
