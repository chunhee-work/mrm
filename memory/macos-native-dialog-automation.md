---
name: macos-native-dialog-automation
description: "Drive native OS dialogs (file picker, Lookup/Browse popups) via osascript once Accessibility is granted"
metadata: 
  node_type: memory
  type: reference
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

**Capability unlocked 2026-07-04:** the user granted **Accessibility permission** to VS Code ("Code") in System Settings → Privacy & Security → Accessibility. This lets Claude use macOS's built-in **`osascript` (AppleScript / System Events)** — callable from the Bash tool — to generate **real OS-level keyboard/mouse gestures**, which drive things `chrome-control` (page-JS only) cannot: the native **file-open dialog** ("Add files..."), and popup windows like the workshop **Lookup** / police-station **Browse**.
Check permission with: `osascript -e 'tell application "System Events" to tell process "Google Chrome" to return name of windows'` — if it errors `-1728 not allowed assistive access`, permission is off. (No cliclick/Quartz installed; pure osascript keyboard is enough.)

## ✅ UPLOAD WITHOUT THE NATIVE PICKER OR ACCESSIBILITY (verified 2026-10-07, KFY775)
`typesafe/run_upload.py` — stream the PDF into a fresh `dsp_docupload` tab as base64 chunks (`window.__b+=...`, 120 KB per `execute javascript`), build `new File([bytes],name)`, `DataTransfer` -> `#FilesID.files`, dispatch `change` -> blueimp adds a `.template-upload` DIV row (not `<tr>`). Set that row's `select` (Type) = 32 ("Other") and `input#Desc` = DOC, click its `.start`; success = `.template-download` text "Ok <file>.PDF Successful". No keypress, so it works while Accessibility is revoked.
Verify by the Documentation list: XHR `fusebox=SVCdoc&fuseaction=dsp_docview&domainid=1&objid=<caseid>&corole=4&<sess>` and regex the `SVCDOCObjRow(ds,<docid>,..,<class>,"",1,"<stamp>", "<name>"` calls — class 1 = Documentation (2 = photos). (The page renders blank in a tab; the raw HTML via XHR is fine.) Skip a case that already has a row with the name -> no double uploads. Merimen session expires ~15 min idle -> re-login.

## WORKING RECIPE — upload a document via the "Add files..." native picker (verified end-to-end on VFA1371)
The Merimen "Upload Documentation" popup has a hidden `<input type=file id=FilesID>` (blueimp widget). Steps:
1. **chrome-control (page JS):** `document.getElementById('FilesID').focus()` on the upload tab; verify `document.activeElement.id === 'FilesID'`.
2. **osascript:** bring the upload popup WINDOW to front + activate Chrome:
   `tell application "Google Chrome"` → loop windows, find the one whose `URL of active tab` contains `dsp_docupload`, `set index of that window to 1`, `activate`.
3. **chrome-control:** re-focus `#FilesID` (window activation can blur it).
4. **osascript:** send a REAL space to activate the focused file input → opens the native open-panel:
   `tell application "System Events" to keystroke space`. Confirm it opened: `count of sheets of window 1` of process "Google Chrome" becomes 1.
5. **osascript:** drive the open-panel by keyboard (no mouse coords needed):
   `keystroke "g" using {command down, shift down}` (Go-to-folder) → `delay 0.6` → `keystroke "<FULL FILE PATH>"` → `key code 36` (Return: selects the file) → `delay` → `key code 36` (Return: Open). Sheets count returns to 0 = dialog closed. (If it lands in the folder without selecting, re-do Cmd+Shift+G with the full FILE path; a full path selects the file.)
6. **chrome-control:** the blueimp row now shows the filename + these fields — set ALL of them:
   - **`FTYPE` (document Type dropdown, id `Type0`) = "Other"** — **REQUIRED. If left empty the upload silently FAILS** (this was the bug that made the first attempt fail). "Other" is the generic type; 944 options exist (RC/police/etc. have specific types but "Other" works for a combined DOC).
   - **`FDESC` (document name) = "DOC"** for a single combined file, else RC / INS / P.REPORT / JPJ SEARCH.
   - `FCMMT` (comment) = leave.
   Then click the **Start upload** `<button>`. Wait ~5 s and CONFIRM real success: the row's class flips from `.template-upload` to **`.template-download`** (download row = uploaded). Do NOT trust body-text matching "complete" — that gave a false positive. Then click **Close**.
7. Verify for real: reload the `dsp_docview` (Documents) tab — a NEW numbered row must appear in the Documentation list with the current timestamp (e.g. "2  <time>  DOC  Load PDF"). If the count didn't increase, the upload did NOT land — check FTYPE was set.

## Browse + Lookup popups — VERIFIED WORKING via real gesture (2026-07-04, VFA1371)
Both were previously "user must click" (popup-blocked for synthetic clicks). Now Claude opens them: **JS `.focus()` the button → bring that Chrome tab/window front (AppleScript) → re-focus → osascript real Space keypress** (Space activates a focused `input[type=button]` = real gesture → its onclick's window.open is NOT blocked).
- **Police Station "Browse..."** (`vaCDPOLICESTATION`, onclick `MTRCLMPolice`): opens the **"PIAM IPD Code"** popup tab (piampolicedist4.htm) — a STATE→station drilldown (no search box). Click the STATE (e.g. "Pahang") → the station list appears → click the specific station (e.g. `BP Pekan` for a TRAFIK**PEKAN** report; match the town in the police report no). Selecting it sets BOTH **Police Station Name** and **PIAM IPD Code** on the parent report + closes the popup. Then SaveReport(1) to persist.
- **Workshop "Lookup..."** (`#MTRworkshopbtn`, onclick `MTRworkshop.StartSearch`): opens the **"Find..."** popup tab. **If the first Space doesn't open it, retry with ONE combined osascript: `tell application "Google Chrome" to activate` → `delay 0.5` → `keystroke space`** (a plain space after a separate activate can race/miss). In the popup: keyword field is **`#MTRworkshopslcFilter`** (may have NO name attr — use getElementById), set it + click **Search** (`MTRworkshop.Search`). **The search matches FROM THE BEGINNING of the company name** — search the START of the workshop name (e.g. `"bengkel kereta sinar"` for "Bengkel Kereta Sinar Gemilang"; `"extreme auto"` for "Extreme Auto Car Care"), NOT a mid-string word like "sinar" (returns nothing). Click the result row (`<tr>`/`<td>` containing the exact name, avoid look-alikes like "Sinar Jaya") → sets `ddlbREPCOID` (COID) on the opener form + closes. (Clicking Search returns "missing value" to chrome-control because the popup reloads — that's normal, just read the results in the next call.)

## ⚠️ THE REAL-SPACE GESTURE NEEDS RETRIES (verified 2026-08-29, 13 uploads across 9 cases)
A single `.focus()` + separate `keystroke space` misses often (~1 in 5). **Always loop up to 4 attempts, and send activation + space in ONE osascript** so nothing races in between:
```
js(tab, 'el.focus()')
osa(f'tell application "Google Chrome"\n set active tab index of window {w} to {t}\n set index of window {w} to 1\n activate\nend tell\ndelay 0.8\ntell application "System Events" to keystroke space')
```
Check the result each round (new tab appeared / `count of sheets of window 1` == 1) and retry if not. This applies to BOTH gestures in the upload flow: opening the "Upload Documents" popup, and opening the native panel off `#FilesID`. If the panel still won't open, click **Close** on the popup before returning — a leftover popup tab breaks the next case.

**Go-to-folder is reliable:** `Cmd+Shift+G` → **`keystroke "<full file path>"`** (type it; `set value of text field` does NOT work — the panel ignores it and the file is never added) → `key code 36` (select) → `key code 36` (Open). Sheets count back to 0 = file added.

**Upload-popup field ids (blueimp, one row per file):** `#FilesID` (file input, multiple) · `#Type0` = the Type dropdown, **"Other" = value `32`** · `#Desc` = Document Name (`FDESC`) · then click the **Start upload** button. Success = the row's class flips to **`.template-download`** and its text reads "Ok <FILE>.PDF Successful". Then click **Close**.
One file per popup cycle is the reliable shape: open popup → pick 1 file → Type+Desc → Start upload → Close. ~35 s per file.
Working driver: `scratchpad/up.py` + `run.py` (session 4a6e2dd1).

## 🔴 HOW TO TELL THE ACCESSIBILITY PERMISSION IS GONE (2026-09-19)
Symptom: every upload returns `panel-fail`/`popup-fail` even though the page and buttons are fine.
**One-line check:**
```
osascript -e 'tell application "System Events" to tell process "Google Chrome" to return count of windows'
```
- Permission OK → the real window count.
- **Permission revoked → `0`** (and `window 1 of process "Google Chrome"` errors `-1719 Invalid index`), while `tell application "Google Chrome" to count of windows` still reports the true number. That mismatch IS the diagnosis — nothing about the page is wrong, System Events simply cannot see or drive Chrome.
Fix: re-grant Accessibility to the controlling app in System Settings → Privacy & Security → Accessibility. Until then every native-dialog step (file picker, Lookup, Browse) is impossible — report it and do the rest.

## ⚡ SKIP THE UPLOAD POPUP GESTURE ENTIRELY (2026-09-19)
The "Upload Documents" button only calls `JSVCopenWin('/claims/index.cfm?fusebox=SVCdoc&fuseaction=dsp_docupload&...')`.
Read that URL off the button's `onclick`, or build it — `objid` is the **caseid**:
```
index.cfm?fusebox=SVCdoc&fuseaction=dsp_docupload&domainid=1&objid=<caseid>&corole=4&docclassid=1&maxno=20&BCO_FLAGMODE=ADD&SHOWLABEL=0&nolayout=1&<CFID&CFTOKEN&USID>
```
Open it in a normal new tab — no popup blocker, no keyboard gesture, and `#FilesID` is right there. Only the file-picker step still needs a real keypress.

## ⚠️ TWO UPLOAD TRAPS FOUND 2026-09-20
1. **One fresh upload tab PER FILE.** Re-using the same `dsp_docupload` tab for a second file reports a bogus `OK` — the `.template-download` row from the FIRST upload is still in the DOM, so the status read is stale and the later files silently never land. (CBG4305 reported 4× OK but only the DOC existed.) **Verify by counting rows in the case's Documentation list before/after, never by the template row.**
2. **A DOUBLE SPACE in the filename breaks the Go-to-folder keystroke** — `keystroke "…/PLF5335  extreme.pdf"` mis-types and the pick fails. Copy the file to a temp path with a single space and upload that; the Merimen document name (`FDESC`) is what matters, not the filename.

## Gotchas
- Keystrokes go to the FRONTMOST app + window — always bring the exact Chrome window front first (step 2) or keys land elsewhere.
- Paths with spaces/parentheses are fine typed literally into the Go-to-folder field (no escaping).
- Compress the file to <3 MB first (Merimen's hard upload limit) — see [[workshop-from-desktop-folder]].
- If the tab_id changes mid-flow (popup opens as a new window/tab), re-list tabs and target the `dsp_docupload` tab.

Related: [[merimen-create-case-procedure]] (STEP 7.5 upload), [[workshop-from-desktop-folder]].
