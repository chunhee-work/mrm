---
name: merimen-claim-subfolder-fields
description: "Merimen Create Motor Claim -> Edit Claim Subfolder form: which PDF field goes into which textbox (TP claim)"
metadata:
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

After clicking **Create Motor Claim** in Merimen e-Claims, the first form is **"Edit Claim Subfolder"**. This memory maps each PDF source field to its Merimen textbox, for a **Third Party Vehicle Damage (TP)** claim (the standing case type). Reference example = BKH9821 bundle.

**KEY CONCEPT (counter-intuitive — get this right):**
- **"Claimant" everywhere = OUR customer** (the not-at-fault third party, e.g. BKH9821).
- **Top "Insurer" + entire "INSURANCE CLAIM ISSUED AGAINST" block + "Vehicle Reg. No. (Handling Insurer)" = the AT-FAULT OTHER party** (e.g. TCM9889 / Takaful Ikhlas) — the party we claim against.
- **"Claimant's Insurance Company" / "Claimant's Policy/Cover Note No." = our customer's OWN insurer** (e.g. Allianz). Filled because our customer also has comprehensive cover.

**Create form (dsp_clmreg) field names + block roles (confirmed live 2026-07-02, CBT3040 case):** The initial "Create MOTOR Claim" form (fuseaction=dsp_clmreg) uses these `name`s, and its blocks map as:
- **Insurer** = `ddlbInsurer` (at-fault insurer, locked after save) + **Branch** = `ddlbINSCOID` (e.g. HQ — also cannot be changed).
- **Claim Type** `_CLMTYPECTRL`; **Date of Loss** `sleACCDATE` + **Time** `sleACCTIME`.
- **Claimant** (= OUR client): `sleCLMnm`, `sleCLMID1` (NRIC), `sleREGNO` (reg), `sleCHANO` (chassis), workshop `ddlbREPCOIDTEXT`/`ddlbREPCOID`, `sleINITIALEST_DD`, damage `ddlbDAMTYPE`, loss desc `mleLossDesc`.
- **ISSUED AGAINST** (at-fault policy): `slePOLNO` (+ `chkCOVERNOTE` tick if cover note), `ddlbPOLCOVER`, `ddlbNEWPOL` = **ALWAYS "Yes"** (fixed rule, user 2026-07-02), `slePOLFROM`/`slePOLTO`.
- **Insured** block (`sleInm`, `sleIID1`) = the AT-FAULT party (the insurer's insured).
- **Third Party / claimant-insurance block**: `sleTPnm` (Third Party's Name) = OUR client; `sleTPID1` = our client NRIC; **`sleTPREGNO` = "Vehicle Reg. No. (Handling Insurer)" = the AT-FAULT plate** (vehicle insured by handling insurer — NOT the claimant plate; corrected 2026-07-02); `ddlb3INSCOID` = "Claimant's Insurance Company" = our client's own insurer; `sleTPPOLNO` = "Claimant's Policy" = our client's policy. **Tick the `TPOWN` checkbox** ("claimant's vehicle insured with own comprehensive policy" — user rule: always tick). Do NOT confuse `TPOWN` with `_subclmtype1` (`cbxSUBCLMTYPE`, a Claim-Type sub-option). NOTE labels are DYNAMIC — only correct after Claim Type = TP is chosen.
- **Vehicle Model** = `ddlbMan` + `ddlbModel` (match variant+transmission+period to reg date), for the CLAIMANT vehicle.
- The at-fault VEHICLE reg (Handling Insurer) is entered LATER in the Edit Claim Subfolder step, not on this create form.
- To set dependent dropdowns via JS you must dispatch `change` events (insurer→branch/coverage, claimtype→damagetype, manufacturer→model).

## Block 1 — CLAIM SUBFOLDER
| Merimen field | Source | BKH9821 value |
|---|---|---|
| Insurer | at-fault party's insurer (page 8) | Takaful Ikhlas General Berhad (HQ) |
| Claim Type | fixed | Third Party Vehicle Damage (TP) |
| Date of Loss + Time | accident date/time = Tarikh & Masa Kejadian (page 4) | 15/06/2026 / 19:00-19:59 (Evening) |
| Claimant's Name (Individual) | our customer's owner name (JPJ cert / police report) | <CLAIMANT_NAME> |
| Claimant's ID (NRIC) | our customer NRIC | <CLAIMANT_NRIC> |
| Claimant's Second ID (Old IC) | usually blank | - |
| Vehicle Reg. No. (Claimant) | our customer plate | BKH9821 |
| Chassis No (Claimant) | JPJ cert No. Chassis | <CHASSIS> |
| Workshop/Repairer | workshop (Lookup) | Bengkel Kereta Sinar Gemilang (HQ) |
| Initial Estimation (RM) | **FIXED default (user rule 2026-07-02): ALWAYS select the `10,000 - 12,500` band, every case.** CANNOT change after notification | 10,000 - 12,500 |
| Settlement Type | fixed | CLAIMS |

## Block 2 — INSURANCE CLAIM ISSUED AGAINST (= the at-fault party's policy)
| Merimen field | Source | BKH9821 value |
|---|---|---|
| Policy/Cover Note No. | at-fault policy no. (I-SEARCH, page 8) | <AT_FAULT_POLICY> |
| Policy Coverage |险种 | Comprehensive |
| New Policy? | — | Yes |
| Policy Cover From / To | at-fault policy period covering accident date | 22/04/2026 -> 21/04/2027 |
| Insured Name (Individual) | at-fault owner name | (was "-" / blank in screenshot) |
| Insured ID (NRIC) | at-fault NRIC | (blank) |
| Insured Second ID (Old IC) | — | (blank) |
| Vehicle Reg. No. (Handling Insurer) | at-fault party plate | TCM9889 |
| Checkbox "claimant's vehicle is insured with their own comprehensive policy" | tick if our customer has own comprehensive | TICKED |
| Claimant's Insurance Company | our customer's OWN insurer (pages 2-3) | Allianz General Insurance Company (Malaysia) Berhad |
| Claimant's Policy/Cover Note No. | our customer's OWN policy | <CLAIMANT_POLICY> |

## Block 3 — VEHICLE MODEL (= the Claimant / our customer's vehicle)
| Merimen field | BKH9821 value |
|---|---|
| Manufacturer | PERODUA |
| Model | Myvi 2005 On 5 Dr Hatch 1.3 EZi 86Bhp (A) [08/08-05/11] |

Notes: vehicle make/model registration valid 3 days (changing later = RM12 charge). Models highlighted green have parts data — prefer those. "Next (Save & Return)" advances.

**Policy number note (confirmed 2026-06-30):** at-fault TCM9889 may appear as <AT_FAULT_POLICY_ALT> (earlier doc) or <AT_FAULT_POLICY> (I-SEARCH / form). User confirmed BOTH are valid/work for this case.

Related: [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]], [[car-part-item-names]].
