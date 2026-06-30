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

## G. CLAIMANT CUSTODIAN/DRIVER DETAILS (COPYCLAIMANT checkbox = TICKED -> copies claimant)
sleCMDnm Name = <CLAIMANT_NAME>; sleCMDID1 NRIC = <CLAIMANT_NRIC>; sleCMDEMAIL = NOEMAIL.

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

## M. Narratives (checkbox + title + textarea per paragraph)
Checked by default (cbxNarr): 500 BRIEF CIRCUMSTANCES OF ACCIDENT, 510 CONSISTENCY OF DAMAGES, 520 SOURCE OF PARTS PRICE, 530 WITHOUT PREJUDICE, 540 BETTERMENT. Unchecked: 550 VEHICLE TOWED DETAILS, 560 TOTAL LOSS ASPECT, 570 SPECIAL REMARKS, 580 (blank). Each has AWTitle<n> (title) + mlePara<n> (body textarea).

Related: [[merimen-claim-subfolder-fields]], [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]], [[car-part-item-names]].
