---
name: merimen-manager-adjuster
description: Fixed Manager + Adjuster to pick on the Adjuster Claim Reference page (every case)
metadata: 
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

On the Merimen Adjuster Claim Reference page (dsp_adjclmref), the Manager/Adjuster dropdowns are FIXED for every case (confirmed 2026-07-04 from the case list — CBT3040, CCX3911, CDN5619 all identical):

- **Manager** `ddlbMGRNAME` = **"(HQ) <MANAGER_NAME>"**
- **Adjuster** `ddlbADJNAME` = **"(HQ) <ADJUSTER_NAME>"** (the user; pick the plain "<ADJUSTER_NAME>", NOT "<ADJUSTER_NAME_ALT>"; there are duplicate options — use exact-text first match)
- **Clerical** `ddlbASSNAME` = leave default "(First Pick-up)".

The dropdowns contain duplicate entries (two "<MANAGER_NAME>", two "<ADJUSTER_NAME>") — match exact text and take the first. After setting, click OK on the CHARGEADJ points-notification modal, then Next (Save & Return).

Related: [[merimen-create-case-procedure]], [[merimen-adjuster-report-fields]].
