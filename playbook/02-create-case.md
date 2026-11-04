# 02 · Create the case (step 2)

## Script path (current)
- Build a cases JSON per plate (keys the script reads: `insCOID`, `branchMatch`, `polcover`, `insVehClass`, `client{name,nric,phone,policy,insCOID,isCompany}`, `veh{make,modelValue,chassis}`, `acc{date,time,impact}`, `atfault{plate,policy,from,to,isCoverNote,ownerName,ownerNric,ownerIsCompany,driverName,driverNric}`, `workshopKeyword`, `workshopMatch`). [merimen-batch-workflow]
- Run `node createpar2_sinar.mjs <PLATE[,PLATE…]> session_base.txt cases.json` (dry), then add `submit`. It also sets Manager/Adjuster. [merimen-batch-workflow]
- Get the extid with `node getext_one.mjs <cid> session_base.txt` (worklist). Keep a cid/extid list from the moment each case exists (re-entry after relogin is cheap). [merimen-batch-workflow] [merimen-session-timeout-workflow]
- Verify by re-opening the form; never trust the landing on dsp_clmheader alone. [merimen-claimant-insurance-fields]

## Create form (dsp_clmreg) — fixed rules
- Set dependent dropdowns in order and dispatch `change` each time: insurer → branch/coverage, claim type → damage type, manufacturer → model. [merimen-claim-subfolder-fields]
- Insurer `ddlbInsurer` = the AT-FAULT party's insurer (locked after save). [merimen-claim-subfolder-fields]
- Branch `ddlbINSCOID` = HQ (Etiqa = "ET/EI HQ"; Liberty = region, e.g. East Coast); locked after save. [merimen-az-progress] [merimen-create-case-procedure]
  - Liberty branches (2026-11-04, branchopts.mjs): East Coast · East Malaysia · Klang Valley · Northern · Southern — pick by the accident state (Selangor/KL = Klang Valley). branchMatch "HQ" fails with "must have Handling Insurer indicated" (VDV9302).
- Tokio Marine: `ddlbVehClass_TMI` = Private. [merimen-az-progress]
- Claim Type `_CLMTYPECTRL` = "Third Party Vehicle Damage (TP)"; set it FIRST, then re-read labels (they change after TP is chosen). [merimen-create-case-procedure]
- `sleACCDATE` dd/mm/yyyy; `sleACCTIME` = hour band (e.g. 19:00-19:59 (Evening)). [merimen-create-case-procedure]
- Claimant = OUR client: `sleCLMnm`, `sleCLMID1` (NRIC), `sleREGNO` (plate), `sleCHANO` (chassis). [merimen-claim-subfolder-fields]
- Initial Estimation `sleINITIALEST_DD` = "10,000 - 12,500" every case (cannot change after notification). Settlement Type = CLAIMS. [merimen-claim-subfolder-fields]
- Damage Type `ddlbDAMTYPE` = Collision; `mleLossDesc` = one-line description ("COLLISION- HEAD TO REAR/ON/SIDE (INSURED HIT TP)"). [merimen-create-case-procedure] [merimen-az-progress]
- Issued-against block (at-fault policy): `slePOLNO` (+ tick `chkCOVERNOTE` if it is an E-Cover Note), `ddlbPOLCOVER` (Comprehensive unless the doc says TP/TPFT), `ddlbNEWPOL` = Yes always, `slePOLFROM`/`slePOLTO` = the period covering the accident date. [merimen-create-case-procedure] [merimen-az-progress]
- Insured `sleInm` / `sleIID1` = at-fault owner (fallback: at-fault driver). Company owner → `atfault.ownerIsCompany` in the JSON. [merimen-az-progress] [merimen-data-conflict-rules]
- TP block: `sleTPnm` / `sleTPID1` = OUR client; `sleTPREGNO` ("Vehicle Reg. No. (Handling Insurer)") = the AT-FAULT plate, never our plate; `ddlbInjury` = No. [merimen-create-case-procedure]
- Hidden `sleCURINSCOID` = handling insurer = the main insurer COID (setting the insurer by JS doesn't fill it). [merimen-az-progress]
- Fixed defaults, never vary: Branch HQ · Initial Est 10,000 - 12,500 · New Policy Yes · Damage Type Collision · TP Injury No. [merimen-create-case-procedure]
- Total-loss folder → select Total Loss for the case (no normal parts estimate). [workshop-from-desktop-folder]

## Claimant's own insurance (INS) — mandatory when the bundle has it
- Fill all three every time the bundle has our client's insurance: `ddlb3INSCOID` (claimant's insurer, values in 01), `sleTPPOLNO` (claimant's policy/cover note), tick `TPOWN`. [merimen-claimant-insurance-fields]
- Only when the bundle truly has no claimant insurance → leave blank, untick, and say so in the report (was: "always tick TPOWN" [merimen-claim-subfolder-fields]). [merimen-claimant-insurance-fields]
- Gate: `ddlb3INSCOID` and `sleTPPOLNO` ship DISABLED; disabled fields don't submit, so the save "works" and stores nothing. Tick TPOWN first. [merimen-claimant-insurance-fields]
- `TPOWN` has an EMPTY name → use `document.getElementById("TPOWN")`, `if(!t.checked) t.click()`; then set both fields + `change`, then click "Next (Save & Return) >>", then re-open to verify. [merimen-claimant-insurance-fields]
- Don't confuse `TPOWN` with `cbxSUBCLMTYPE` / `_subclmtype1` (claim-type sub-option). [merimen-create-case-procedure]
- Don't confuse with the at-fault side (`slePOLNO`/`ddlbPOLCOVER`/`slePOLFROM`-`TO`). [merimen-claimant-insurance-fields]

## Workshop
- Folder → workshop → Lookup keyword (search matches from the START of the name):
  - `extreme` → Extreme Auto Car Care (HQ), COID 72619, keyword `extreme` (row "Motor Repairer - Extreme Auto Car Care - Kuantan"). [workshop-from-desktop-folder]
    - In cases.json set `workshopMatch: "Extreme Auto Car Care"` (plain "Extreme" picked another workshop, COID 7960, in the dry run 2026-10-23). Check `rep=72619` in the dry-run line before submit.
  - `sinar` → Bengkel Kereta Sinar Gemilang (Kemaman), COID 29709, keyword `bengkel kereta sinar`; avoid "Bengkel Kereta Sinar Jaya". [workshop-from-desktop-folder]
  - `LKH` / `LKH penang` → Lee Kean Hin Car Body Repairs Sdn Bhd (George Town), keyword `lee kean hin`, take the FIRST result → **COID 70382** "Lee kean Hin Car Body Repairs Sdn Bhd (HQ)", Lot 923 Lintang Kampung Rawa 1, George Town (verified 2026-10-30, PRY826). [workshop-from-desktop-folder]
  - `VP AIRBRESH` → **Vp Airbresh Services (Kuala Lumpur), COID 22209**, account TC0607 (user 2026-11-04 "same autoris"), keyword `vp air`, `workshopMatch: "Vp Airbresh Services"` (a second entry "Vp Air Bresh Services" also exists — not that one). Find any new workshop with `node wslookup.mjs session_base.txt "kw1|kw2"` (read-only, prints the Lookup rows).
- Register the workshop through the Lookup popup; a bare hidden `ddlbREPCOID` set does NOT register (was: setting hidden COID 72619 alone worked for Extreme, 2026-07-09). Missing workshop blocks the create. [merimen-az-progress]
- Lookup button `#MTRworkshopbtn` has an EMPTY name (select by id). Needs a real gesture (osascript Space / Playwright real click); keyword box `#MTRworkshopslcFilter` → Search (`MTRworkshop.Search`) → click the result row; that sets `ddlbREPCOIDTEXT` + `ddlbREPCOID` and closes the popup. [merimen-az-progress] [macos-native-dialog-automation]
- Use a popup handler per page (`page.on('popup')`), not context-wide, so parallel popups don't cross. Never `window.close()` the popup by hand (it kills the other create tabs). [merimen-az-progress] [workshop-from-desktop-folder]
- After the workshop selection re-set `ddlbDAMTYPE` = Collision (the re-render can clear it). [workshop-from-desktop-folder]
- The server-side XML search endpoint does not filter; drive the popup UI. [workshop-from-desktop-folder]

## Vehicle model (ddlbMan → ddlbModel)
- ⭐⭐ **Read `playbook/12-model-choices.md` before choosing**: RC word → Merimen option table, base-trim rule, bracket/transmission/body checks and the mistakes other adjusters made (111 real RCs + 7,239 chosen models, 2026-11-01).
- ⭐⭐ **Always follow the RC (JPJ Buatan/Nama Model) for the variant — never the body look, badges or the insurance schedule** (user 2026-10-30, WUE6407: RC "VIVA 1000 EZ" → Viva 1 EZ, not Viva Elite). Don't ask.
- Match in this order, all must line up: TRIM → engine + body + transmission (A)/(M) → the `[date bracket]` containing the registration year → prefer green options. [merimen-model-variant-trim-match]
- Trim words: Proton `Executive` → the `Executive` option; Perodua `AV` → `Advanced`/`Advance`, never Standard/Premium/SE/X/G. Check trim last before moving on. [merimen-model-variant-trim-match]
- Use the JPJ cert model code (e.g. "WISH MPV 1.8 DBA-ZGE20G (A)"), not the chassis prefix. [merimen-claim-subfolder-fields]
- Green = has parts/price data (option class `clsMTRModelLevel1`, background rgb(218,250,220)); white = `clsMTRModelLevel0`, no data. Pick a green variant whenever one fits the RC; dump options with `dumpmodels_sinar.mjs` (`c` = class). [car-model-report-warning]
- White model chosen → mark ⚠️ in the step-12 car-model report and say why no green one fitted (see 09). [car-model-report-warning]
- Model registration is valid only 3 days; changing it later costs RM12 → get it right first time. [merimen-model-variant-trim-match]
- The model string decides body type for photos (4 Dr/Sal = Boot Lid; 5 Dr/Hatch/MPV = Tailgate) and PERODUA/LORRY naming → start the photo artifact (03) as soon as the model is chosen. [case-workflow-order]

## After "Next (Enter Details)"
- Any insurer API warning (e.g. Zurich "Policy not found!", "charged 14 pts") → click OK at once and continue; the number is still right. [merimen-create-case-procedure] [merimen-az-progress]
- Lands on dsp_adjclmref = case created. If it looks stuck on act_clmreg, wait and re-check (dsp_clmheader with a real caseid; or the survey list dsp_maindtl). [merimen-az-progress]

## Manager / Adjuster (dsp_adjclmref)
- Manager `ddlbMGRNAME` = "(HQ) <fixed manager>"; Adjuster `ddlbADJNAME` = "(HQ) <the user>", the plain variant, not the alternate spelling. The scripts default to the right names (`MGR`/`ADJ` env). [merimen-manager-adjuster] [merimen-batch-workflow]
- Duplicate options exist → match exact text, take the first. Clerical `ddlbASSNAME` = default "(First Pick-up)". [merimen-manager-adjuster]
- Click OK on the CHARGEADJ points modal, then Next (Save & Return) / `SaveReport(2)`. [merimen-manager-adjuster] [merimen-az-progress]
