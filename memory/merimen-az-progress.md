---
name: merimen-az-progress
description: "⭐ THE complete A-Z case checklist — READ THIS BEFORE every stage of every case, so I stop missing required fields"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

**User rule (2026-07-16): BEFORE doing a case (esp. before the report) I MUST call back this complete A-Z progress and follow it top-to-bottom.** I kept missing fields (Police Station, Claimant's Insurance Co, Claimant's Policy No, occupation, phones, postcodes, JPJ, CC, estimate discounts, Betterment narrative) because I improvised and only found them reactively via FormVerify blockers. This is the single authoritative sequence so nothing is missed. Field maps: [[merimen-create-form-fieldmap]], [[merimen-adjuster-report-fields]]. Judgment/analysis gates: [[merimen-precase-checklist]].

## ⚠️ WORK STYLE — PARALLEL, MULTIPLE TABS (user rule, re-confirmed 2026-07-16 — I KEEP BREAKING THIS)
**Count the cases in the Desktop folder → open THAT MANY browser tabs, ONE per case, and work them ALL in parallel. NEVER do first-case-fully-then-next, and NEVER a sequential per-case loop.**
- **WHY I keep forgetting (root cause, own it):** in execution mode I default to writing an engine that does ONE case per invocation and then run it in a `for` loop case-by-case — that IS "one at a time," just disguised. Storing the rule ≠ applying it.
- **THE FIX — bake parallelism into the engine:** write the engine as `createOne(page, plate)` and run **`await Promise.all(plates.map(p => createOne(ctx.newPage(), p)))`** so every case's tab opens + is driven CONCURRENTLY. Use **`page.on('popup', …)` per page** (NOT context-wide `ctx.waitForEvent('page')`) so concurrent Workshop-Lookup popups don't grab each other. Parallel must be the DEFAULT execution shape, not something I remember each time.

## 0. SESSION (every ~15 min)
Session times out silently (pages show "Session Timeout", fields/tabs vanish). Re-login <LOGIN — local only, redacted from repo> → grab fresh CFID/CFTOKEN/USID/RID → rewrite scratchpad/session_base.txt. All scripts read it. Drive via Playwright (`playwright-core` connectOverCDP 9222) for real clicks/popups; agent-browser for reads.

## 1. CREATE (dsp_clmreg) — 2 pages then adjclmref
- Insurer = **at-fault's insurer** → Branch (HQ; Etiqa="ET/EI HQ"; Liberty=region e.g. East Coast) → ClaimType=TP → [Tokio Marine: ddlbVehClass_TMI=Private]
- Accident date + time; **Claimant + Third Party** name/NRIC = OUR CLIENT; **Insured** = at-fault owner (fallback at-fault driver if owner has no NRIC); RegNo+Chassis = client vehicle; **sleTPREGNO = at-fault plate**
- **ddlb3INSCOID = "Claimant's Insurance Company" = our client's OWN insurer** ⟵ was always missed
- **Claimant's Policy/Cover Note No. (sleTPPOLNO) = our client's OWN policy no** — FILL FOR EVERY CASE (user rule 2026-07-16), UNLESS the PDF shows no claimant insurance. Pairs with ddlb3INSCOID.
- **sleCURINSCOID (hidden) = handling insurer = the main insurer COID** (JS insurer-set doesn't auto-fill it)
- **⚠️⚠️ WORKSHOP / REPAIRER — MUST select via the LOOKUP popup on the first page (user rule 2026-07-16, I keep forgetting — DON'T). Missing it BLOCKS the create.** EXACT steps (I've done this before): the "Workshop/Repairer" row has a pink box + a **"Lookup..."** button (⚠️ **id=`MTRworkshopbtn`, its NAME attr is EMPTY** — select by `#MTRworkshopbtn`/id, NOT `[name=MTRworkshopbtn]`; using the name selector was why I "couldn't find" it for ages, onclick `MTRworkshop.StartSearch`). (1) **REAL-click "Lookup..."** → a popup window titled "Find…" opens with a **KEYWORD** text box + **Search**/**Clear** buttons. (2) type the workshop name in KEYWORD: `bengkel kereta sinar`. (3) click **Search**. (4) select the result row "Motor Repairer - Bengkel Kereta Sinar Gemilang - Kemaman" (COID 29709; avoid "Sinar Jaya"). This sets ddlbREPCOID + the visible text and REGISTERS the repairer.
  - 🛠️ **HOW to real-click:** a synthetic JS click is popup-blocked → use the **browser-use / Playwright skill** for the trusted click. ⚠️ Playwright's OWN `newPage()`+goto of dsp_clmreg does NOT render the workshop widget (ColdFusion AJAX). So: RENDER the create form via agent-browser (open form, select insurer→branch→claimtype — the "Lookup..." button then appears), THEN attach Playwright (connectOverCDP) to THAT SAME tab and real-click Lookup + drive the popup. A bare `ddlbREPCOID=29709` hidden-set does NOT register. See [[workshop-from-desktop-folder]].
- DamType=Collision; LossDesc "COLLISION- HEAD TO REAR/ON/SIDE (INSURED HIT TP)"; Init Est=10,000-12,500; NewPol=Yes; PolCover=Comprehensive
- **TPOWN checkbox — TICK** (claimant has any policy; only skip if truly no claimant insurance)
- **Manufacturer + Model** — pick the variant whose [date bracket] contains the vehicle's reg YEAR (right generation)
- Next → [**Zurich only:** click OK on "Policy not found" + "charged 14 pts" modals] → lands **dsp_adjclmref** (case CREATED). ⚠️ **The Merimen PLATFORM sometimes just LOADS SLOWLY (not Zurich-specific — user corrected 2026-07-16)** — a case landing on `act_clmreg` or a page that looks stuck is usually still loading. WAIT longer and RE-CHECK the tab (it settles on dsp_clmheader with a real caseid) before ever concluding it failed. Verify via the survey list (dsp_maindtl) if unsure.
- adjclmref: Manager=**<MANAGER_NAME>**, Adjuster=**<ADJUSTER_NAME>** → SaveReport(2)

## 2. ADJUSTER REPORT (dsp_estmain, Main tab) — FILL ALL, else FormVerify silently blocks (custom OK-modal names the field)
- Police report no (no spaces) / date / time band; **Party at Fault = Third Party**; DamType=Collision; CollType=Private; Circumstances(ddlbLossDesc)+AddLD; Acc place / **state (Terengganu Darul Iman) / city / POSTCODE**
- **⚠️ Police Station Name (vaCDPOLICESTATION)** — TYPE it e.g. "TRAFIK DUNGUN" ⟵ was missed
- For Insured, Insured-Driver, Claimant EACH: name + NRIC + Addr1 + **State + City + POSTCODE** + Marital=Unknown + **Occupation** (sleXOCC text="OTHERS" OR ddlbXOCC dropdown=Unemployed/Others — set BOTH) + **Mobile Phone** (prefix+number; all 3 parties; claimant phone as fallback) + TIN=NA + SST=No + DOB + Gender(EXACT match)
- Driving Exp = age−18; Provisional=No; Relationship=Others; Claimant-driver name+NRIC
- Vehicle: Eng no, JPJ Log Book No('-'), JPJ Reg date, Year, **CC**, Assembly=Locally Assembled, VehClass=Private, Colour, Fuel=Petrol
- Condition: Good / Driveable Yes / Damage Moderate / Pre-acc No / texts Serviceable + Paint Good / ODO / units km
- Tyres: Michelin ×4, 175/65 R17, treads 6.00, spare 8.00
- **cbxTL (SELECT) = Yes for TOTAL LOSS cases, else No**; PaintType=Solid; Labour=THATCHAM; Liability=100
- ⚠️ **Set POSTCODES atomically AFTER cities (city-change cascade-clears postcode)**; order: states→cities→postcodes→save
- Save & Adjust Estimates (SaveReport(1)) → dsp_selection

## 3. ESTIMATE page (dsp_details/dsp_selection) — the PART SELECTION is USER's, but I STILL fill these:
- ⛔ Selecting/pricing the damaged parts = USER does it, not me.
- ✅ **Discount + Labour rates — I FILL THESE for EVERY case (user rule 2026-07-16), even on empty estimate:**
  - **Parts tab:** Part Discount on P Items % (`PARTDISCPC`) = **10**; Special Discount on S Items % (`SPCDISCPC`) = **0**. (These are the RIGHT/pink boxes; the left `R`-prefixed ones are display.)
  - **Labour tab** (click the "Labour" tab first): the 4 Labour Rate boxes `LRPRATE`/`LMTRATE`/`LPNRATE`/`LPARATE` = **30** each.
  - ⚠️⚠️ **MUST use REAL input to persist** — Playwright `locator.fill()` + a REAL "Save" button click. Setting `.value=`+dispatch events does NOT persist (reverts on reload); real `.fill()` does. (This is why my first discount attempt "didn't save".) Verified all 12 persist as PD=10.00 SP=0.00 L=30/30/30/30.
  - Std Betterment % is auto e.g. [20.5 yr(s) - 40%] (read-only display).
- ⚠️ **JPJ Reg Date drives the betterment** — I used `01/01/<manufacture year>` placeholders (no exact reg date extracted). Betterment ≈ correct but VERIFY reg date vs RC when finalizing (e.g. BGF2916 first got 2020→5yr by mistake, fixed to 01/01/2001→24.8yr-40%).
- ✅ **READ the Std Betterment `[<AGE> yr(s) - <%>]`** off this page (auto-computed from JPJ reg date → acc date) — needed for the Betterment narrative below.

## 4. NARRATIVES (dsp_estmain → Narratives tab = mseClick(...,1); wait ~1.8s to render)
Checkbox = `input[name=cbxNarr][value=<slot>]` (tick via .click()); text=mlePara<slot>; title=AWTitle<slot>. Do **5** narratives (user 2026-07-16 — do NOT skip 540): 500 BRIEF CIRCUMSTANCES / 510 CONSISTENCY / 520 SOURCE OF PARTS PRICE / 530 retitle→WITHOUT PREJUDICE / **540 BETTERMENT**. Must tick or text won't persist. SaveReport(1) + OK modals; verify by re-open.
- **540 BETTERMENT text:** "In view that the age of the subject vehicle is `<AGE>` years, we have applied `<%>` betterment on all franchise parts recommended." — **`<AGE>` = the FULL DECIMAL** from the estimate page's `[<AGE> yr(s) - <%>]` (e.g. "20.5 years", NOT "20"). READ it, don't compute. Fill 540 after the estimate betterment value is available.

## 5. UPLOAD (Documents) — one file at a time
Real-click "Upload Documents"→popup→setInputFiles→FTYPE=Other, FDESC=DOC (or JPJ SEARCH / P.REPORT for separate files)→Start upload→verify in doc list. Compress PDF >5MB first.

## SELF-CHECK before declaring a case done
Create ✓ · Report ALL fields (esp. Police Station + Claimant's Insurance Co + occupation + phones + postcodes) ✓ · Narratives 4 ✓ · Upload ✓ · (Estimate + Betterment = user).
