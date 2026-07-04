---
name: merimen-create-case-procedure
description: "End-to-end steps to create a TP motor claim in Merimen via Chrome (fast path)"
metadata:
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

Fast end-to-end procedure to create a Third-Party (TP) motor claim in Merimen e-Claims via chrome-control. Established 2026-07-02 (CBT3040 case, done A-Z).

**TWO TRIGGER MODES (user, 2026-07-02):**
- **"create case"** (+ plate) → do the FULL A-Z Merimen entry: Create Motor Claim subfolder → (Manager/Adjuster on Adjuster Claim Reference) → Edit Adjuster Report → Save & Adjust Estimates. Drive it all via chrome-control on the user's already-open Chrome.
- **"send me data"** (+ a PDF) → do NOT touch Merimen; just read the PDF and present the extracted claim data back (copy-box format per [[claim-extraction-output-format]]).

**WORKSHOP is now the user's job (2026-07-02):** The user will create the Merimen page(s) first and **select the Workshop themselves**; Claude just accesses Chrome and fills everything else. So Claude no longer needs to drive the workshop Lookup popup — skip step 4 below unless the user asks.

## 0. Locate + read the case
- User names a plate (e.g. CBT3040). Find its folder on Desktop: `~/Desktop/<workshop>/<PLATE>/` — the **parent folder = workshop** ([[workshop-from-desktop-folder]]). Read the PDF `<PLATE> <workshop>.pdf` with the Read tool (PDFs render directly; no pdftotext needed).
- Identify parties from the bundle:
  - **Our client (Claimant)** = the NOT-at-fault party (the complainant/pengadu; their JPJ cert + own insurance schedule are in the bundle).
  - **At-fault party** = the one police summoned (see Keputusan Penyiasatan Kes "pihak yang disalahkan" / no saman). Claim is lodged AGAINST their insurer.
  - Accident date/time = Tarikh & Masa Kejadian (police investigation page).

## 1. Chrome prep (if needed)
- If chrome-control `execute_javascript`/`get_page_content` return "Google Chrome is not running" but `get_current_tab` works → the "Allow JavaScript from Apple Events" setting is OFF; ask user to re-enable (View → Developer). If Chrome fully closed, `open_url` the Merimen URL; if it shows the login page, ask the user to log in manually (NEVER type their credentials — do not echo/store user ID `<ADJUSTER_ID>` or password).

## 2. Open the create form
- On the Merimen home, click the **Create MOTOR Claim** link (fuseaction=dsp_clmreg). Confirm via get_current_tab.

## 3. Fill (JS: set value + dispatch `change`+`input`; do dependent dropdowns first)
Field names + values (see [[merimen-claim-subfolder-fields]] for full map). For a TP claim:
- `ddlbInsurer` = at-fault insurer; `ddlbINSCOID` (Branch) = **HQ** (fixed default).
- `_CLMTYPECTRL` = "Third Party Vehicle Damage (TP)".
- `sleACCDATE` = accident date dd/mm/yyyy; `sleACCTIME` = hour band (Morning/Evening…).
- Claimant (our client): `sleCLMnm`, `sleCLMID1` (NRIC), `sleREGNO` (plate), `sleCHANO` (chassis).
- `sleINITIALEST_DD` = **"10,000 - 12,500"** (fixed every case).
- `ddlbDAMTYPE` = "Collision" (default); `mleLossDesc` = one-line accident description.
- Issued against (at-fault policy): `slePOLNO` = at-fault policy/cover-note; tick `chkCOVERNOTE` if it's an E-Cover Note; `ddlbPOLCOVER` = "Comprehensive"; `ddlbNEWPOL` = **"Yes"** (fixed every case); `slePOLFROM`/`slePOLTO` = at-fault policy period covering the accident date.
- Insured (at-fault party): `sleInm`, `sleIID1` (NRIC).
- TP / claimant-insurance block: `sleTPnm` (Third Party's Name) = OUR client; `sleTPID1` = our client NRIC; **`sleTPREGNO` = "Vehicle Reg. No. (Handling Insurer)" = the AT-FAULT plate** (the vehicle insured by the handling insurer, e.g. JTN6451 — NOT our client's plate!); `ddlbInjury` = "No"; `ddlb3INSCOID` = "Claimant's Insurance Company" = our client's OWN insurer; `sleTPPOLNO` = "Claimant's Policy" = our client's policy; **tick the `TPOWN` checkbox** ("claimant's vehicle insured with own comprehensive policy" — user rule 2026-07-02: tick it). WARNING: do NOT confuse `TPOWN` with `cbxSUBCLMTYPE`/`_subclmtype1` (a different sub-claim-type checkbox in the Claim Type row).
- **Field labels are DYNAMIC**: several labels only show their final wording AFTER Claim Type = TP is selected (e.g. `sleTPREGNO` reads "Vehicle Reg. No. (TP)" before, "Vehicle Reg. No. (Handling Insurer)" after). Always set Claim Type first, THEN re-read labels before mapping — don't trust pre-TP labels.
- Vehicle Model (claimant vehicle): `ddlbMan` (dispatch change) then `ddlbModel` = match variant + transmission (A/M) + period bracket to the reg date.

## 4. Workshop — USER handles it (2026-07-02): the user pre-selects the workshop themselves; Claude skips this. (Legacy method below, only if user asks.)
- Claude can't open the Lookup popup (popup-blocked) → ask user to click **Lookup...** once. Then drive the popup tab (title "Find..."/"Company List"): set its `input[type=text]` KEYWORD = workshop name (Desktop folder, e.g. "extreme auto") → click **Search** → click the result `<td>` containing the workshop name. That sets `ddlbREPCOIDTEXT`+`ddlbREPCOID` on the form and closes the popup. Then **re-set `ddlbDAMTYPE`="Collision"** (selection re-render can clear it). See [[workshop-from-desktop-folder]].

## 5. Review + save
- Read back all fields, show the user a compact table for verification, then click **"Next (Enter Details)"** only after the user confirms (or let them click). Saving creates the case; Insurer + Branch cannot be changed afterward, and Initial Estimation can't change after notification.

## 6. Adjuster Claim Reference → Edit Adjuster Report → Estimates (rest of A-Z)
- After save → claim header: set Manager/Adjuster on the Adjuster Claim Reference (click OK on the CHARGEADJ prompt) → Next (Save & Return).
- Click **Edit Adj Rpt** → fill the Edit Adjuster Report (see [[merimen-adjuster-report-fields]] for the full field map + fixed defaults + photo-derived odo/colour + insured/claimant drivers).
- Then **Save & Adjust Estimates** to persist and move to the estimates page → then do step 7.

## 7. Estimates → Discounts → Labour → Narratives (post-report; user rule 2026-07-04 — this is the FULL end of A-Z)
After "Save & Adjust Estimates" lands on the **Standard Parts** estimate page (dsp_selection = the part-groups list, "image 1"):
1. Click **"Next (Save & Edit Estimates) >>"** (top-right) directly — do NOT select any parts (part selection is not part of this flow).
2. You land on the **Parts** tab (Claim Loss Details header + Parts/Labour/Miscellaneous tabs, "image 2"). The **Std Betterment [<X> yr(s) - <Y>%]** is shown HERE (calc'd from JPJ Reg Date → Accident Date, e.g. 15.6 yr - 40%) — this is where you READ betterment, NOT the Labour tab, and it does NOT need parts selected to appear. Fill the two pink/red discount boxes (right column):
   - **Part Discount on P Items %** = **10**
   - **Special Discount on S Items %** = **0**
   (The Std Betterment box already shows the % e.g. `40` — leave it as-is.)
3. Click the **Labour** tab ("image 3", e.g. [TC020] THATCHAM 2 MEDIUM 4 DR SAL). Fill the **four pink "Labour Rates (RM/hr)" boxes** (the 4 rate columns Others / MET / Panel / Paint) = **30** each. Then click **Save**.
   - **After filling the 10 (discount) & 30 (labour) and navigating, a NATIVE browser confirm pops** ("Remember to save any changes before you return to Claim Subfolder … Click OK to proceed without saving") — **click OK** (normal A-Z step; you've saved). chrome-control note: execute_javascript CANNOT dismiss native confirm() dialogs — call the page's `LinkBack(1,0,...)` (dowarn=0) to bypass, or accept the dialog.
4. Click **"<< Claim Subfolder"** (→ OK the native confirm), then **"Edit Std Prt"** (reopens the Adjuster Report), then the **"Narratives"** tab.
5. Tick + write exactly 5 narratives, based on THIS case (exact templates in [[merimen-adjuster-report-fields]] section M): BRIEF CIRCUMSTANCES (at-fault plate + impact portion e.g. "rear"), CONSISTENCY OF DAMAGES (our police report No), SOURCE OF PARTS PRICE (fixed 10% franchise discount), **WITHOUT PREJUDICE — this goes in the MARKET VALUE slot (530): tick the MARKET VALUE checkbox, CHANGE its title to "WITHOUT PREJUDICE" and CHANGE its body to "This report is strictly on a Without Prejudice basis." (do NOT leave the default Market-Value text; do NOT use a blank slot)**, BETTERMENT (age + % from the Std Betterment shown in step 2). Leave 550/560/570/580 unchecked. Then **Save** (`SaveReport(1)`).
- **Fixed estimate values:** Part Discount P = **10**, Special Discount S = **0**, Labour Rates = **30** (all four boxes).

## General rule: ANY alert/warning popup → click OK (user rule 2026-07-04)
Throughout the whole A-Z flow, whenever a Merimen alert/warning modal pops up (insurer API warning, validation notices, confirmations, etc.), just click its **OK** button and continue. (They're custom modals with an OK button, not native dialogs.) The Std Betterment [year - %] for the BETTERMENT narrative is shown on the **Parts** tab of the estimate-entry page (reached via "Next (Save & Edit Estimates)" — see step 7), NOT the Labour tab — read it there, don't compute it.

## Next (Enter Details) → immediately click OK (user rule 2026-07-02)
Right after clicking **"Next (Enter Details)"**, an insurer API warning modal may pop up (e.g. Zurich `ZURICH_API_INFO_CTXFRAME` "Policy not found!"). **IGNORE the warning content — immediately click its "OK" button** (an `input[type=button]` with onclick `JSVCVarNameGet('..._API_INFO').clickButton('OK')`); the case creation then proceeds regardless. So keep using the normal I-SEARCH policy number (the API "not found" message does NOT mean the number is wrong — just OK past it). Do this fast — the flow can time the session out; watch for the Continue Session popup ([[merimen-session-warning]]).

## Fixed defaults (never vary): Branch = HQ · Initial Estimation = 10,000 - 12,500 · New Policy? = Yes · Damage Type = Collision · TP Injury = No.

Related: [[merimen-claim-subfolder-fields]], [[merimen-adjuster-report-fields]], [[workshop-from-desktop-folder]], [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]].
