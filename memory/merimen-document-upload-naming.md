---
name: merimen-document-upload-naming
description: "Uploading the source PDFs into a case's Documents is MANDATORY — and each file must carry its standard format name"
metadata:
  node_type: memory
  type: feedback
---

User rule (re-confirmed 2026-08-29): **every case must have its source PDFs uploaded into Merimen's Documents section — this step is never optional — and each file must be named with the standard document format name**, not the filename off the Desktop.

**Document Name (`FDESC`) format — pick by what the file actually contains:**
| File content | Name to key |
|---|---|
| One combined bundle (RC + insurance + police + I-SEARCH in a single PDF) | **`DOC`** |
| JPJ Sijil Pemilikan Kenderaan / ownership cert (`... GERAN.pdf`) | **`RC`** |
| Our customer's own insurance schedule / policy (`... POLICY.pdf`) | **`INS`** |
| Police report | **`P.REPORT`** |
| The AT-FAULT party's insurance / I-SEARCH (`JPJ SEARCH ....pdf`, `... TP INS.pdf`) | **`JPJ SEARCH`** |

Also required on each upload row: **`FTYPE` (Type dropdown) = "Other"** — leaving it empty makes the upload silently fail.

**How to apply:** After the narratives are saved, go to the case's Claim Subfolder → **Documents** → **Upload Documents**, add every PDF in that case's Desktop folder one at a time, name each per the table, Start upload, and confirm the row appears in the Documentation list before closing. Compress only files over 5 MB ([[workshop-from-desktop-folder]]). The native file-picker recipe is in [[macos-native-dialog-automation]]. A case is not "done" until its documents are uploaded — say so explicitly in the completion table ([[batch-completion-report-format]]).

Related: [[merimen-create-case-procedure]], [[merimen-az-progress]].

## 🔁 Reading a case's documents BACK out of Merimen (verified 2026-09-11)
When the Desktop source folder is gone, the uploaded PDFs are still the source of truth and can be pulled back:
1. Case Documents page (`dsp_docview`) → each row's link is `SVCDOCAttView(<docid>,4,'PDF')` — scrape the `docid`.
2. Navigate a Chrome tab to `index.cfm?fusebox=SVCdoc&fuseaction=dsp_getfile&docid=<docid>&corole=4&<CFID&CFTOKEN&USID>&RID=<RID from the current page URL>` — Chrome downloads it to `~/Downloads` as `<FDESC>.PDF`; move/rename it immediately (the next one reuses the name).
   ⚠️ `curl` with only CFID/CFTOKEN gets `merimenerror: 1` — the session needs Chrome's HttpOnly cookies, so drive it through the browser, not curl.
3. The bundles are scans with no text layer — render pages with PyMuPDF into one contact sheet per case to find the right page, then re-render that page at ~230 dpi to read the numbers.
