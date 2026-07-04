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

## Gotchas
- Keystrokes go to the FRONTMOST app + window — always bring the exact Chrome window front first (step 2) or keys land elsewhere.
- Paths with spaces/parentheses are fine typed literally into the Go-to-folder field (no escaping).
- Compress the file to <3 MB first (Merimen's hard upload limit) — see [[workshop-from-desktop-folder]].
- If the tab_id changes mid-flow (popup opens as a new window/tab), re-list tabs and target the `dsp_docupload` tab.

Related: [[merimen-create-case-procedure]] (STEP 7.5 upload), [[workshop-from-desktop-folder]].
