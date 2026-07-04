---
name: merimen-adjuster-report-fields
description: "Merimen Edit Adjuster Report (dsp_estmain) form: every section + field name + what to key in (TP claim, BKH9821 example)"
metadata:
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

Reached via: Edit Claim Subfolder -> **Next (Save & Return)** -> claim header (dsp_clmheader) -> **Edit Adj Rpt** button -> **Edit Adjuster Report** (fusebox=MTRadjuster&fuseaction=dsp_estmain). This is the big adjuster report form. Reference example = BKH9821 (caseid 21265076). Field `name=` attributes captured live 2026-06-30 so they can be targeted for auto-fill.

**SIDE MAPPING (same as [[merimen-claim-subfolder-fields]]):** "INSURED" side = the AT-FAULT other party (TCM9889 / Takaful Ikhlas). "CLAIMANT" side = OUR customer (BKH9821 / <CLAIMANT>). Much of this form auto-populates from the subfolder + MRC vehicle DB; the adjuster fills/verifies the rest.

**FILL CLASSIFICATION (user-confirmed 2026-06-30):**
- **FIXED defaults — always key the same value:** Est. Duration of Repair = 25; Damage/Loss Type = Collision; Pre-accident Damage = No; General Condition = Good; Vehicle Still Driveable = Yes; Condition of Damage = Moderate; all condition text fields = Serviceable (Paintwork = Good); Tyre size 175/65 R17; treads 6.00mm all four; spare 8.00mm; FL/FR/RL/RR Tyre Type = **Michelin**; Total Loss = NO.
- **DO NOT fill (auto-populated by system / skip):** Inspected At; Recmd'ed Reserve; Adjuster; Adj File Ref No; Liability Percentage (auto 100%); Labour Calculations (THATCHAM…); both Birth Date fields (insured driver & claimant).
- **From the POLICE/CLAIM REPORT (varies per case):** Description of Accident (e.g. "COLLISION- HEAD TO SIDE"); Police Report No./Date/Time; Acc place/state/city/postcode; Party At Fault.
- **DERIVED from age:** Drv. Experience (years) = current age − 18 (Malaysia min driving age 18). Compute from driver's birth year.
- **From CAR PHOTOS:** Odometer Reading (read dashboard photo, e.g. 153,295 km); Colour of Vehicle (read photo — BKH9821 = Grey).
- **Assembly Type ← JPJ cert "Status Asal":** Pemasangan Tempatan → Locally Assembled; Kenderaan Import Terpakai → Reconditioned; Kenderaan Import Baru → New Import. (Ignore "Rebuild".)

## A. Header — ADJUSTER'S CLAIM REFERENCE (Main tab)
| Field name | Label | Value / source |
|---|---|---|
| sleFILENO | Adj File Ref No | <ADJ_FILE_REF> (adjuster file ref) |
| sleASGMT | Assignment Date | 27/06/2026 |
| sleINSPECT | Inspection/Investigation Date | 27/06/2026 |
| sleINSPECT2 / sleINSPECT3 | 2nd/3rd Inspection Date | blank |
| sleNUM_REPDAYS | Est. Duration of Repair (days) | 25 |
| mleINSPECTAT | Inspected At (textarea) | Bengkel Kereta Sinar Gemilang (HQ) + address (workshop) |
| slePOSITION | Present Location of Vehicle | blank |
| sleACLMNO | Insurance Claim No | blank |
| sleRESERVE | Recmd'ed Reserve (RM) | 12,924.68 |
| ddlbMGRNAME | Manager | (HQ) manager picked |
| ddlbADJNAME | Adjuster | <ADJUSTER_ID> (= the user) |
| ddlbASSNAME | Clerical | blank |
| ADJREMARKS | Adjuster Remarks | blank |
| (Assignment From) | display | Takaful Ikhlas General Berhad (HQ) = at-fault insurer |

## REQUIRED fields + save gotchas (learned 2026-07-03, CCX3911)
- **INSURED Address 1 is REQUIRED** — `sleIAddr1` (+ `ddlbIState`→`ddlbICity`→`sleIPostCode`) for the INSURED (= the at-fault party, handling insurer's insured). Fill with the at-fault party's address (same as the insured driver's). Missing it → alert "Address 1 should be specified."
- **OCCUPATION is REQUIRED** — set occupation dropdowns to **"Unemployed"** (or **"Others"** if that insurer's list has no Unemployed — options are insurer-specific): insured `ddlbIOCC`, insured-driver `ddlbDOCC`, claimant `ddlbCLMOCC`. Missing → alert "Occupation ...".
- **MARITAL STATUS is REQUIRED — always choose "Unknown"** (user rule 2026-07-04): `ddlbIMARITAL` (insured), `ddlbDMARITAL` (insured driver), `ddlbCLMMARITAL` (claimant), + claimant-driver if present. Missing → red box + alert on Save.
- **MOBILE PHONE NO — always fill for EVERY party** (user rule 2026-07-04), taken from the police reports: insured-driver `sleDPhone1pref`+`sleDPhone1`, insured `sleIPhone1pref`+`sleIPhone1`, claimant `sleCLMPhone1pref`+`sleCLMPhone1` (split each number into the 010-019 prefix + the rest).
- **GENDER selC substring bug:** matching "Male" wrongly hits "Female" (fe-MALE) — use an EXACT match for `sleDGender`/`sleIGender`/`sleCLMGender`, else the driver's gender ends up wrong.
- **TAX IDENTIFICATION NUMBER (TIN) — always fill "NA"** (user rule 2026-07-04; the field's own help text says: Input "NA" if TIN not available/not provided/not TIN-registered). Applies to each party's TIN field.
- **SST Registered? — select "No"** (user rule 2026-07-04; radio Yes/No, pick No).
- **PIAM IPD Code — just pick ANY random option** (user rule 2026-07-04; the value doesn't matter, just select one so it's not empty). Field `slePOLICEDCODE` in the Claim Loss section.
- **POLICE STATION NAME (`vaCDPOLICESTATION`) — LEAVE IT BLANK; the USER fills it himself** (user rule 2026-07-04, supersedes earlier). Do NOT wait for the user, do NOT try to open the "Browse..." popup — just skip this field and continue the flow. (Method for reference if ever needed: Browse → search the town from the police report no `TRAFIK<TOWN>/...` e.g. "kuantan" → click the result.)
- **DRIVING EXPERIENCE is REQUIRED for EVERY driver** (user rule 2026-07-04): `sleCDDRVEXP` (insured driver) and the claimant-driver experience field. Value = **driver's age − 18** (min legal car-driving age in Malaysia is 18). e.g. <DRIVER_NAME> age 52 → 34; <CLAIMANT_DRIVER_NAME> age 20 → 2.
- **INSURED DRIVER extra required fields** (user rule 2026-07-04): **Provisional Driving License = "No"**; **Relationship to Insured = "Others"** (`sleDRelation` — pick "Others"). Fill these for the insured (at-fault) driver.
- **TIN field names** (captured 2026-07-04, WLW551): `sleITIN` (insured), `sleCLMTIN` (claimant) — and by analogy `sleDTIN`/`sleCMDTIN` for the drivers if present; set each = "NA". **SST Registered? radios**: `sleISSTRegOpt` (insured), `sleCLMSSTRegOpt` (claimant) — select "No". These fields VARY BY INSURER FORM — some insurers' forms omit some of them; fill whichever exist.
- **The Claimant-Driver section varies by insurer**: some forms (e.g. WLW551) DO have `sleCMDAddr1` (address) + `sleCMDDRVEXP` (claimant-driver experience = age−18) and will alert if empty; other forms (e.g. WUN7241) only have Claimant-Driver Name/NRIC/License/Email. Fill whatever fields the form actually shows.
- **LABOUR CALCULATIONS is a REQUIRED red box** (`ddlbLABTYPE`, in the "INFORMATION FOR CALCULATING ESTIMATES" section; radio "Use time-based labour calculations (by hours)" + a mandatory pink dropdown) — user rule 2026-07-04: **select the THATCHAM labour type that matches the car's body/door count**: a **5-door** car → the "...5 DR HATCH" option; a **4-door** sedan → the "...4 DR" / SALOON option; MPV → the MPV option, etc. Do not leave it blank.
- **INSPECTED AT / vehicle address must always be filled** — user says "you keep missing the address." Fill every party's Address1/State/City/Postcode AND the **Inspected At** (`mleINSPECTAT` = workshop name + address) before moving on.
- **POLICE STATION NAME — normally SKIP/leave blank** (user fills it himself; updated rule 2026-07-04). EXCEPTION: some insurer forms (seen on **Liberty**, 2026-07-04) HARD-BLOCK the save with "Police Station Name should be specified" — if the save is blocked on it, type a placeholder like "IPD <town>" (e.g. "IPD KEMAMAN") to pass, and flag it for the user to correct.
- These required red-box fields (Insured Address 1 + all addresses, Inspected At, Labour Calculations car-type, Occupation, Marital Status, Mobile Phone, TIN, SST, Driving Experience) must ALL be filled before Save/next-step — fill them ALL, or the reload wipes everything. (EXCEPTION: Police Station Name — leave blank, the user fills it.)
- **Validation is sequential + a failed Save & Adjust Estimates RELOADS and WIPES unsaved fields.** So fill EVERY required field (incl. Insured Address 1 + all Occupations) BEFORE clicking "Save & Adjust Estimates", so it validates+saves in ONE pass. If it keeps alerting, re-fill everything each time (the reload clears in-memory data).
- **NARRATIVES only after a clean Save & Adjust Estimates** (user rule): do main report → Save & Adjust Estimates (reach the Parts page, read Std Betterment) → navigate back to Edit Adj Rpt (`fuseaction=dsp_estmain&caseid=...&extid=...` reusing CFID/CFTOKEN/USID) → fill the 5 narratives → **Save** (`SaveReport(1)`).
- **CRITICAL — check narrative boxes with `.click()`, NOT `.checked=true`:** each `cbxNarr` has `onclick="NarrCheck(this)"`; setting `.checked=true`+change does NOT persist (checkbox resets on reload). Use `if(!cb.checked) cb.click()` so NarrCheck fires, then Save. Verified: after that, both the checkbox `[x]` and the `mlePara<n>` body persist.
- **Std Betterment [<year> yr(s) - <%>] shows on the PARTS tab of the estimate-entry page**, reached by clicking **"Next (Save & Edit Estimates) >>"** from the Standard-Parts page (see [[merimen-create-case-procedure]] step 7). It's calculated from JPJ Reg Date → Accident Date (e.g. 15.6 yr - 40%) and appears there regardless of parts. Do NOT click the Labour tab for it. Read the exact [yr - %] for the BETTERMENT narrative; do NOT compute it yourself. READ that exact value for the BETTERMENT narrative — do NOT compute the age yourself (Merimen's value is authoritative; e.g. CCX3911 = 14.5 yr - 40%, not the 14.6 I computed). % caps at 40% for 10+ year cars.
- **ANY alert/warning popup → just click its OK button** (user rule 2026-07-04). Merimen alerts are custom modals with an OK button; dismiss with OK and continue.

## Fill rules (Edit Adjuster Report, user-confirmed 2026-07-02, CBT3040)
- Much auto-populates from the subfolder (both parties' name/NRIC/DOB/gender, chassis, vehicle type, labour type, liability 100%, workshop, Manager/Adjuster, narrative templates).
- **Inspection/Investigation Date** (`sleINSPECT`) = TODAY.
- **Recmd'ed Reserve** (`sleRESERVE`) = 10,000.00 (RM).
- **Party At Fault** (`ddlbFault`) = "Third Party" (our client is the TP claimant; other party at fault).
- **Circumstances of Accident/Loss** (`ddlbLossDesc`) — **ONLY EVER choose one of these 3 categories** (user rule 2026-07-04; do NOT use Chain Collision / Collided into parked vehicle / Turning / Change lane / any other option), decided by **WHERE OUR CUSTOMER's car was hit (read the damage photos)**:
  - **front** damage → **"Collision- Head on collision"**
  - **rear** damage → **"Collision- Head to Rear"** (use the "(Insured Hit TP)" variant when the at-fault/Insured hit our client's rear — the normal TP case; "(TP Hit Insured)" only if our client hit their rear)
  - **side** (incl. front-corner/side-swipe) damage → **"Collision- Head to Side"**
  Then click **Add Below** (`input[name=AddLD]`) — this auto-fills **Description of Accident/Loss** (`mleLossDesc`). DO NOT type mleLossDesc manually; clear it first if pre-filled, then use Add Below.
- **Acc/Loss Location Type** (`ddlbLocClaim`) = "City Road".
- **Est. Duration of Repair** (`sleNUM_REPDAYS`) = 25. **Pre-accident Damage** = No. **General Condition** = Good. **Driveable** = Yes. **Condition of Damage** = Moderate. Condition texts (`sleSTEERCON/sleFOOTCON/sleHANDCON/sleFSUSP/sleRSUSP`) = "Serviceable"; `slePAINTCON` = "Good".
- **Tyres**: size 175/65 R17 (front+rear); treads 6.00 all four; spare 8.00; type = Michelin (exact option) all four.
- **From CBT3040 photos**: Odometer (`sleODO`) e.g. 196,734; Colour (`ddlbCOLORID`) e.g. Silver; Road Tax expiry (`sleRoadTax`) from the road-tax disc photo.
- **Vehicle** (`sleENGNO`,`sleJPJNO`(=JPJ logbook top-right of cert),`sleJPJREG`,`sleVHMANYEAR`,`sleVehCC`) from JPJ cert; Assembly Type from Status Asal (Pemasangan Tempatan→Locally Assembled); Vehicle Class = Private/Company Vehicle.
- **Insured Driver** = at-fault driver (from at-fault police report): name/NRIC/DOB/gender/address/city/state/postcode; Drv Experience ≈ age − 18. **Claimant Custodian/Driver**: do NOT tick `COPYCLAIMANT` / "same as claimant" (user rule 2026-07-02) — key the driver fields in MANUALLY (name/NRIC etc., usually the same person as the claimant).
- Police fields use OUR client's police report (No `slePoliceRef` has NO space e.g. "TRAFIKKUANTAN/008375/26", Date, Time band).
- **Claimant Address** (`sleCLMAddr1`) = the "Alamat" from the JPJ Sijil Pemilikan Kenderaan page; then set `ddlbCLMState` (fire change) → `ddlbCLMCity` → `sleCLMPostCode` from that address.
- **Total Loss?** (`cbxTL`, options NO/YES) = **ALWAYS "No"** (user rule updated 2026-07-02 — this SUPERSEDES the earlier "Yes"). Marking Yes flips the estimates page into total-loss mode (skips itemized estimates), which is NOT wanted — keep it No.

## B. CLAIM LOSS DETAILS
| Field name | Label | Value / source |
|---|---|---|
| slePoliceRef | Police Report No. | TRAFIKKEMAMAN/002358/26 (page 4) |
| slePOLICERPTDT | Police Report Date | 15/06/2026 |
| slePOLICERPTTM | Time | 19:00-19:59 (Evening) |
| vaCDPOLICESTATION | Police Station (Browse) | blank |
| slePOLICEDCODE | PIAM IPD Code | blank |
| sleIOName | Investigation Officer | blank |
| ddlbFault | Party At Fault | **Third Party** (TP claim => other party at fault) |
| ddlbDAMTYPE | Damage/Loss Type | Collision |
| ddlbCollType | Collision With | Private Vehicle |
| ddlbLossDesc | Circumstances of Accident/Loss | (dropdown, pick matching phrase) |
| mleLossDesc | Description of Accident/Loss | COLLISION- HEAD TO SIDE |
| sleAccPlace | Acc/Loss Place | KM 158 JLN K/TERENGGANU |
| ddlbLossState | Acc/Loss State | Terengganu |
| ddlbLOSSCITY | Acc/Loss City | Kemaman |
| ddlbLocClaim | Acc/Loss Location Type | (dropdown) |
| sleAPcode | Acc/Loss Postcode | 20000 |
| sleAccPlaceLat / sleAccPlaceLng | GPS | blank |

## C. INSURED DETAILS (= at-fault party's policyholder; here mostly blank)
sleInm Name = "-"; sleIID1 NRIC = blank; sleInationsel Nationality = Malaysia; sleIEMAIL = NOEMAIL; address/phone blank. (Insured = registered owner of at-fault vehicle; often not fully known.)

## D. HIRE PURCHASE DETAILS
ddlbHPCOIDTEXT (H.P. Co., Lookup), sleHPAddr1/2, sleHPNo (HP Agreement No.), sleHPBal (O/S Bal), sleHPSettle (Early Settlement Amt). All blank for BKH9821.

## E. INSURED CUSTODIAN/DRIVER DETAILS (= the AT-FAULT driver of TCM9889)
| Field name | Label | Value |
|---|---|---|
| sleDnm | Name (Driver) | <DRIVER_NAME> |
| sleDID1 | ID (NRIC) | <DRIVER_NRIC> |
| sleDDOB | Birth Date | <DRIVER_DOB> |
| sleDGender | Gender | Male |
| sleDAddr1 | Address 1 | <DRIVER_ADDRESS> |
| ddlbDState / ddlbDCity / sleDPostCode | State/City/Postcode | Terengganu / Kemaman / 24000 |
| sleCDDRVEXP | Drv. Experience (years) | DERIVED = current age − 18 (Malaysia min driving age 18) |
| sleDEMAIL | E-mail | NOEMAIL |
| sleDRelation | Relationship to Insured | (Owner/paid driver etc.) |
(COPYINSURED checkbox copies Insured -> Driver.)

## F. CLAIMANT DETAILS (= OUR customer, BKH9821)
| Field name | Label | Value |
|---|---|---|
| sleCLMnm | Name (Claimant) | <CLAIMANT_NAME> |
| sleCLMID1 | ID (NRIC) | <CLAIMANT_NRIC> |
| sleCLMDOB | Birth Date | <CLAIMANT_DOB> |
| sleCLMGender | Gender | Female |
| sleCLMAddr1 | Address 1 | <CLAIMANT_ADDRESS> |
| ddlbCLMState / ddlbCLMCity / sleCLMPostCode | State/City/Postcode | Terengganu / Kemaman / 24000 |
| sleCLMEMAIL | E-mail | NOEMAIL |

## G. CLAIMANT CUSTODIAN/DRIVER DETAILS (do NOT tick COPYCLAIMANT — fill manually, user rule 2026-07-02)
Key in by hand: `sleCMDnm` Name = claimant's name; `sleCMDID1` NRIC = claimant NRIC; `sleCMDEMAIL` = NOEMAIL (typically the driver is the same person as the claimant, but entered manually rather than via the "same as claimant" checkbox).

## H. DESCRIPTION OF VEHICLE (= claimant vehicle BKH9821 Perodua Myvi)
| Field name | Label | Value |
|---|---|---|
| sleENGNO | Engine No | <ENGINE_NO> |
| sleCHANO | Chassis No | <CHASSIS> |
| sleJPJNO | JPJ Log Book No | <JPJ_LOGBOOK> |
| sleJPJREG | JPJ Reg. Date | 28/04/2009 |
| ddlbAssemType | Assembly Type | Locally Assembled |
| sleVHMANYEAR | Year of Manufacture | 2009 |
| ddlbVHTYPEID | Vehicle Type | (5 Dr hatch) |
| ddlbVehClass | Vehicle Class | Private/Company Vehicle |
| sleVehCC | Engine Cubic Capacity (cc) | 1,298 |
| ddlbCOLORID | Colour of Vehicle | Grey (read from car photo) |
| sleFUELTYPE | Fuel Type | Petrol |
| cbxFLAGS checkboxes | Air Cond / Wing Mirror / Clock / Radio / Seat Belts / Lamps | ticked |
(Tint film, seating capacity, road tax expiry etc. mostly blank.)

## I. CONDITION OF VEHICLE
ddlbGENCON General Condition = Good; ddlbDRIVEABLE Vehicle Still Driveable = Yes; sleODO Odometer = 153,295 km; ddlbConDamage Condition of Damage = Moderate; ddlbPREDAMAGE Pre-accident Damage = (No). Text fields all "Serviceable"/"Good": sleSTEERCON Steering, slePAINTCON Paintwork, sleFOOTCON Brake/Footbrake, sleHANDCON Handbrake, sleFSUSP Front Axle/Susp, sleRSUSP Rear Axle/Susp.

## J. CONDITION OF TYRES
ddlbFLTTYPEID/FR/RL/RR = tyre brand = **Michelin** (fixed default, all four). sleFTYRESIZE/sleRTYRESIZE = 175/65 R17. Treads sleFLTREAD/FR/RL/RR = 6.00; sleSPTREAD spare = 8.00 (mm). All fixed defaults.

## K. Court Details / TP Solicitor
rdCOURTDTLS = No (0) for BKH9821 -> court fields blank (Court Name, vaSUMMONNO Summon No., dates, Judge). TP Solicitor (iOTHSOLCOIDTEXT Lookup, OTHSOLREF Ref No, sleTPSOLAMOUNT) blank.

## L. INFORMATION FOR CALCULATING ESTIMATES
| Field name | Label | Value |
|---|---|---|
| cbxTL | Total Loss? | NO |
| ddlbLABTYPE | Labour Calculations | THATCHAM 2 MEDIUM 5 DR HATCH |
| ddlbPATYPEID | Paint Type | Solid |
| LIABLEPC | Liability Percentage | 100.00 |
Cost fields (mostly blank, each with a LIABFLAG checkbox to include in TP liability): sleTPJPJFEE JPJ Doc Fees, sleTPDOCFEE Other Doc Fees, fakesleTPADJFEE Adjuster's Fee, fakesleTPLEGALFEE Legal Costs, sleTPMEDICAL Medical Costs, sleMEDICALRPT Medical Report, sleTPOTHERS1 Other Costs, slePERSONALBELONG Personal Belongings, sleTPUDRINSURED Under-Insurance, sleTPLOSSNCD Loss of NCD, sleTPLOSSEXCESS Loss of Excess, sleCARRENTAL Car Rental, sleLOSSEARNING Loss of Earnings, TPLOSSUSE* Compensation for Assessed Repair Time, sleWreckVal salvage, sleCONSEALAMT Concealed Damage Amt.

## M. Narratives (checkbox + title + textarea per paragraph) — CLAUDE WRITES THESE (user rule 2026-07-02: NOT Merimen-autofilled; Claude selects + writes)
On the "Narratives" tab: each slot = a `cbxNarr` checkbox (values 500,510,520,530,540,550,560,570,580) + `AWTitle<n>` (title) + `mlePara<n>` (body). The originals are blank templates with placeholders (xxx / ... ). Claude must TICK + WRITE the standard set; leave 550 VEHICLE TOWED, 560 TOTAL LOSS ASPECT, 570 SPECIAL REMARKS, 580 unchecked/empty (user: no need).

**Standard narratives = exactly these 5 (select + write; FINAL per user 2026-07-04 — slot 530 is WITHOUT PREJUDICE, NOT Market Value; there is NO Market Value narrative):**
1. **BRIEF CIRCUMSTANCES OF ACCIDENT** (500) — write per case: "The accident occurred due to the subject vehicle was said to have knocked by a third party m/car reg. no. <AT-FAULT PLATE> on the <impact part, e.g. rear> portion."
2. **CONSISTENCY OF DAMAGES** (510) — "Our visual inspection of the subject vehicle upon sighting the police report No: <OUR CLIENT'S POLICE REPORT NO> revealed that the damage noted is consistent with the reported accident." (OMIT the template's trailing "(except for ... old damage / tampering, disallowed)" clause unless there genuinely IS old damage.)
3. **SOURCE OF PARTS PRICE** (520) — FIXED: "We have recommended the parts pricing based on franchise parts prices where in a discount of 10% have been applied."
4. **WITHOUT PREJUDICE** (slot 530) — FIXED, ALWAYS: "This report is strictly on a Without Prejudice basis." NOTE: slot 530's PRESET title is **"MARKET VALUE"** — **retitle it (`AWTitle` for slot 530) to "WITHOUT PREJUDICE"** and write the text there (do NOT leave it as Market Value, and do NOT use a blank slot like 580 — keep it in the 530 position so the 5 narratives run 500/510/520/530/540 in order).
5. **BETTERMENT** (540) — "In view that the age of the subject vehicle is <AGE> years, we have applied <BETTERMENT%> betterment on all franchise parts recommended." **Read AGE + % from the LABOUR tab of the estimates page** (`[<AGE> yr(s) - <%>]`, e.g. 14.5 yr - 40%) — do NOT compute it yourself.

Related: [[merimen-claim-subfolder-fields]], [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]], [[car-part-item-names]].
