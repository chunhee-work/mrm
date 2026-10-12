---
name: merimen-session-timeout-workflow
description: "Merimen logs out after ~15 min — fill and SAVE each stage immediately, never batch-fill 9 forms then save"
metadata:
  node_type: memory
  type: feedback
---

Learned the hard way 2026-08-29 (sinar+LKH batch of 9): I filled the Edit Adjuster Report on all 9 parallel tabs and then went to save — but the Merimen session had expired in the meantime. **Every tab was silently thrown back to the login page (the page has just 5 inputs = the login form) and ALL unsaved report data was lost.** The created cases survived because those had already been saved.

**Rules:**
- **Save at the end of every stage, per tab, immediately** — do not fill all N tabs across several stages and save at the end. The safe unit is: fill one stage on all tabs (a couple of minutes), then Save on all tabs, then verify the landing URL changed.
- **Session dies in ~15 minutes.** Between stages, check `document.title` — `"Session Expiration Warning"` means click **Continue Session** at once ([[merimen-session-warning]]); a page with ~5 inputs means it is already the login page and the work in that tab is gone.
- **Re-entry after a re-login is cheap** — navigate straight back with
  `index.cfm?fusebox=MTRadjuster&fuseaction=dsp_estmain&caseid=<caseid>&extid=<extid>&CFID=..&CFTOKEN=..&USID=..`
  so keep a caseid/extid list from the moment each case is created.
- **A failed Save (validation modal) also reloads and wipes the form** — so fix the cause and re-fill from stage 1 for the affected tabs, not just the flagged field.

**Field gotchas found the same day (they vary per insurer form, so match by TEXT not by value):**
- Occupation: `ddlbIOCC`/`ddlbDOCC`/`ddlbCLMOCC` values differ per insurer (`800=Others` on some, `430=Others: -` on others). Match `^Others`, **and also fill the paired text field `sleIOCC`/`sleDOCC`/`sleCLMOCC` = "OTHERS"** — the dropdown alone still fails with "Insured Occupation should be specified."
- Phone prefix `sle*Phone1pref` differs: `012` style on most forms, `6012-` style on Allianz. Match with `^6?0?<digits>-?$`.
- SST radios `sleISSTRegOpt`/`sleCLMSSTRegOpt` use **1=Yes, 2=No** (not 0/1).
- State names are the full ones: `Terengganu Darul Iman`, `Kedah Darul Aman`, `Perlis Indera Kayangan`, `Pahang Darul Makmur`, and Penang splits into **`Pulau Pinang (Island)`** vs **`Pulau Pinang (Mainland)`**. City is `George Town`, not "Georgetown".
- `ddlbLABTYPE` and `ddlbPATYPEID` are EMPTY until the **`rbLABTYPE` radio** is clicked; after that `ddlbLABTYPE` holds exactly one correct option — just select it.
- Discounts/labour rates DO persist from plain JS `.value=` + `input`/`change` events followed by a real Save click (verified by reload: PD=10.00 SP=0.00 L=30×4).

Related: [[merimen-az-progress]], [[merimen-adjuster-report-fields]], [[batch-autonomy-rule]].
