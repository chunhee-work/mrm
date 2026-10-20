# 04 · Adjuster Report (dsp_estmain, step 4)

Side mapping: INSURED / Insured Driver = the AT-FAULT party; CLAIMANT = OUR client. [merimen-adjuster-report-fields]

## Script path (current)
- Build the report JSON (template `~/mrm-bot/report_mdp.json`; `build_report.py` helps). [merimen-batch-workflow]
- Keys reportpar reads: `cid`, `extid`, `adjFile`, `inspectAt`, `reserve`, `police`, `policeDate`, `policeTimeBand`, `policeStation`, `damType`, `collType`, `lossDescCat`, `lossSelect`, `impact`, `accPlace`, `lossState`, `lossCity`, `lossPostcode`, `TL`, `isCompanyInsured`, `insured{name,nric,idType,dob,gender,addr,state,city,postcode,phone}`, `insDriver{…+exp}`, `claimant{name,nric,dob,gender,addr,state,city,postcode,phone,isCompany}`, `clmDriver{name,nric,idType,dob,gender,exp}`, `veh{eng,jpjLogbook,jpjReg,manYear,cc,colour,odo,body}`. [merimen-batch-workflow]
- Run `node reportpar.mjs <PLATE[,PLATE…]> session_base.txt <json>` (dry), then again with `save` → must end `dsp_selection ✅`. `MGR`/`ADJ` env default to the fixed Manager/Adjuster. [merimen-batch-workflow]
- reportpar sets Assignment + Inspection date = TODAY (real date, Asia/Kuala_Lumpur). [merimen-batch-workflow]
- Optional `collType` (e.g. "Motor Cycle") and `lossDescCat` (e.g. "Collision- Head to Side"). [merimen-batch-workflow]
- After every save, run the pink-box check (below) and fix whatever it returns. [merimen-pink-required-fields]

## Save rules
- Fill EVERY required field before "Save & Adjust Estimates": validation is sequential and a failed save reloads and WIPES the form → re-fill everything, not just the flagged field. [merimen-adjuster-report-fields] [merimen-session-timeout-workflow]
- Set postcodes AFTER cities (a city change clears the postcode): states → cities → postcodes → save. [merimen-az-progress]
- Save & Adjust Estimates = `SaveReport(1)` → dsp_selection. [merimen-az-progress]
- Any alert modal → OK. [merimen-adjuster-report-fields]

## Pink (required) boxes
- Find them: inputs/selects/textareas whose computed background is `rgb(242, 204, 204)` and value empty → fix all. [merimen-pink-required-fields]
- `sleINSPECT` Inspection/Investigation Date = today. [merimen-pink-required-fields]
- `sleNUM_REPDAYS` Est. Duration of Repair = 25. [merimen-pink-required-fields]
- `ddlbLocClaim` Acc/Loss Location Type = City Road (select by text). [merimen-pink-required-fields]
- Occupation: set dropdown `ddlbIOCC`/`ddlbDOCC`/`ddlbCLMOCC` (+ `ddlbCMDOCC`) by TEXT AND the text box `sleIOCC`/`sleDOCC`/`sleCLMOCC` = "OTHERS" in the SAME submit (dropdown alone still fails "Insured Occupation should be specified"). Most insurers: "Unemployed" (350); Etiqa General Takaful: "Others" (800); some forms "430=Others: -". After a good save the text boxes read back empty but not pink = fine. [merimen-pink-required-fields] [merimen-session-timeout-workflow] [merimen-adjuster-report-fields] Both \"Unemployed\" and \"Others\" are fine, so use whichever option this insurer's dropdown has (user 2026-10-20).
- Option values differ per insurer: always select by option TEXT, never a remembered numeric value (e.g. Head to Side = 18 most, 20019 Etiqa Takaful). [merimen-pink-required-fields]
- Naming a separate claimant-driver makes the whole CMD block required: `ddlbCMDMARITAL`, `sleCMDAddr1`, `ddlbCMDState`, `ddlbCMDCity`, `sleCMDPostCode`, `ddlbCMDOCC`, `sleCMDDRVEXP` (fill like the insured-driver block). [merimen-pink-required-fields]
- `sleTINTBRAND` (Tint Film Model) and `mleDATEALTERREASON` can never be saved from the client → they stay pink; flag, don't retry. [merimen-pink-required-fields]

## Header (Adjuster's Claim Reference)
- `sleFILENO` Adj File Ref No (from JSON `adjFile`); `sleASGMT` Assignment Date = today; `sleINSPECT` = today; 2nd/3rd inspection blank. [merimen-adjuster-report-fields] [merimen-batch-workflow]
- `mleINSPECTAT` Inspected At = workshop name + address — never leave empty. [merimen-adjuster-report-fields]
- `sleRESERVE` Recmd'ed Reserve = 10,000.00. [merimen-adjuster-report-fields]
- Manager/Adjuster as in 02; Clerical blank. [merimen-adjuster-report-fields]

## Claim loss / police
- Police fields come from OUR client's police report: `slePoliceRef` with NO spaces (e.g. `TRAFIKKUANTAN/008375/26`), `slePOLICERPTDT` date, `slePOLICERPTTM` time band. [merimen-adjuster-report-fields]
- Police Station `vaCDPOLICESTATION`: Claude chooses it (user 2026-10-20): Claude fills it via the "Browse..." popup (real gesture): click the STATE, then the station matching the town in the report no. (e.g. TRAFIKPEKAN → "BP Pekan"); that sets station name AND PIAM IPD Code together (was: "leave blank, user fills it" and "TYPE it, e.g. TRAFIK DUNGUN"). [merimen-adjuster-report-fields] [macos-native-dialog-automation] [merimen-az-progress]
- If the popup can't be opened, type a placeholder "IPD <town>" so the save isn't blocked (Liberty hard-blocks an empty station) and flag it. [merimen-adjuster-report-fields]
- PIAM IPD Code `slePOLICEDCODE`: Claude chooses it via the Browse popup (user 2026-10-20); can't be typed (opaque codes PHG01…, TRG01…): set via the Browse popup or leave it and flag (was: "pick any random option"). [merimen-pink-required-fields]
- `ddlbFault` Party At Fault = Third Party. [merimen-adjuster-report-fields]
- `ddlbDAMTYPE` = Collision; `ddlbLossDesc` list fills only after the damage type changes. [merimen-pink-required-fields]
- `ddlbCollType` Collision With = Private Vehicle ("Motor Cycle" when the TP is a motorcycle). [merimen-adjuster-report-fields] [merimen-batch-workflow]
- `ddlbLossDesc` Circumstances — ONLY these 3, decided by where OUR car was hit (read the photos): front → "Collision- Head on collision"; rear → "Collision- Head to Rear" ("(Insured Hit TP)" variant; "(TP Hit Insured)" only if our client hit their rear); side incl. front-corner/side-swipe → "Collision- Head to Side". Never Chain Collision / parked / turning / change lane. [merimen-adjuster-report-fields]
- Then click "Add Below" (`AddLD`) to fill `mleLossDesc`; don't type it (clear it first if pre-filled). reportpar's fallback text: "COLLISION- HEAD TO REAR/ON/SIDE (INSURED HIT TP)". [merimen-adjuster-report-fields] [merimen-az-progress]
- Acc place `sleAccPlace`, state `ddlbLossState`, city `ddlbLOSSCITY`, postcode `sleAPcode`; GPS blank. [merimen-adjuster-report-fields]
- State names are the full ones: Terengganu Darul Iman, Kedah Darul Aman, Perlis Indera Kayangan, Pahang Darul Makmur; Penang = "Pulau Pinang (Island)" vs "Pulau Pinang (Mainland)"; city "George Town" (not Georgetown). [merimen-session-timeout-workflow]

## Every party (Insured, Insured Driver, Claimant, Claimant Driver)
- Name + NRIC + DOB + Gender (EXACT match: "Male" substring-hits "Female") + Address1 + State → City → Postcode. [merimen-adjuster-report-fields] [merimen-az-progress]
- INSURED Address 1 is required (`sleIAddr1` + state/city/postcode): use the at-fault party's address (same as insured driver). [merimen-adjuster-report-fields]
- Marital = Unknown (`ddlbIMARITAL`, `ddlbDMARITAL`, `ddlbCLMMARITAL`, claimant-driver). [merimen-adjuster-report-fields]
- Mobile phone for every party, from the police reports: prefix + number (`sleIPhone1pref`/`sleIPhone1`, `sleDPhone1pref`/`sleDPhone1`, `sleCLMPhone1pref`/`sleCLMPhone1`, `sleCMDPhone1pref`); claimant phone as fallback. [merimen-adjuster-report-fields] [merimen-az-progress]
- Phone prefix values differ ("012" vs "6012-" on Allianz) → match by text with `^6?0?<digits without leading 0>-?$`. [merimen-pink-required-fields] [merimen-session-timeout-workflow]
- TIN = "NA" (`sleITIN`, `sleCLMTIN`, `sleDTIN`, `sleCMDTIN` where present). [merimen-adjuster-report-fields]
- SST Registered? = No (`sleISSTRegOpt` / `sleCLMSSTRegOpt`: 1 = Yes, 2 = No). [merimen-adjuster-report-fields] [merimen-session-timeout-workflow]
- E-mail = NOEMAIL; Nationality = Malaysia. [merimen-adjuster-report-fields]
- Fields vary per insurer form: fill whatever the form shows. [merimen-adjuster-report-fields]

## Insured Driver (at-fault driver)
- From the at-fault police report. Driving Experience `sleCDDRVEXP` = age − 18. Provisional Licence = No. Relationship `sleDRelation` = Others. [merimen-adjuster-report-fields] [merimen-az-progress]

## Claimant + Claimant Driver (our client)
- Claimant Address `sleCLMAddr1` = the "Alamat" on the RC page; then state → city → postcode. [merimen-adjuster-report-fields]
- Do NOT tick `COPYCLAIMANT` ("same as claimant"); key the driver manually: `sleCMDnm`, `sleCMDID1`, `sleCMDEMAIL` = NOEMAIL; driver experience `sleCMDDRVEXP` = age − 18 where the form has it. [merimen-adjuster-report-fields]
- Company claimant/insured → `claimant.isCompany` / `isCompanyInsured` in the report JSON. [merimen-batch-workflow]

## Vehicle (our client's car)
- From the RC: `sleENGNO`, `sleCHANO`, `sleJPJNO` (JPJ Log Book No, top-right of cert; '-' if none), `sleJPJREG` (JPJ Reg Date), `sleVHMANYEAR`, `sleVehCC`. [merimen-adjuster-report-fields] [merimen-az-progress]
- JPJ Reg Date drives the betterment: use the real reg date from the RC (a `01/01/<year>` placeholder gives a wrong age, e.g. BGF2916). [merimen-az-progress]
- Assembly Type from Status Asal (see 01); Vehicle Class = Private/Company Vehicle; Fuel = Petrol. [merimen-adjuster-report-fields] [merimen-az-progress]
- Colour `ddlbCOLORID` = what the photo shows. [merimen-missing-photo-data-rules]
- Odometer `sleODO` from the dashboard photo; unreadable → 0; units km. [merimen-missing-photo-data-rules] [merimen-az-progress]
- Road Tax expiry `sleRoadTax` from the road-tax disc photo. [merimen-adjuster-report-fields]
- `cbxFLAGS` (Air Cond / Wing Mirror / Clock / Radio / Seat Belts / Lamps) ticked. [merimen-adjuster-report-fields]

## Condition + tyres (fixed)
- General Condition Good; Driveable Yes; Condition of Damage Moderate; Pre-accident Damage No. [merimen-adjuster-report-fields]
- `sleSTEERCON`/`sleFOOTCON`/`sleHANDCON`/`sleFSUSP`/`sleRSUSP` = "Serviceable"; `slePAINTCON` = "Good". [merimen-adjuster-report-fields]
- Tyres: type Michelin ×4 (exact option); size 175/65 R17 front + rear; treads 6.00 ×4; spare 8.00. [merimen-adjuster-report-fields]
- Court Details No; TP Solicitor blank; HP block blank. [merimen-adjuster-report-fields]

## Information for calculating estimates
- `cbxTL` Total Loss = **Yes when the folder/file says TOTAL LOSS / TOTALOST**, otherwise No (user 2026-10-20). JSON `TL`; narrpar adds narrative 550.
- Labour Calculations `ddlbLABTYPE` (required): click the `rbLABTYPE` radio first (the list is empty until then), then pick the THATCHAM type matching the body (5-door → "…5 DR HATCH", 4-door → "…4 DR"/SALOON, MPV → MPV option). [merimen-adjuster-report-fields] [merimen-session-timeout-workflow]
- Paint Type `ddlbPATYPEID` = Solid (also empty until `rbLABTYPE` is clicked); Liability = 100 (auto). [merimen-az-progress] [merimen-session-timeout-workflow]
