---
name: merimen-data-conflict-rules
description: "Standing rules for resolving document conflicts / odd data when keying a Merimen TP case"
metadata:
  node_type: memory
  type: feedback
---

Standing rules the user gave 2026-08-29 (apply to EVERY case from now on, don't re-ask):

1. **Document content beats file/folder names.** If a Desktop folder or PDF filename says one plate but the RC / policy / police report inside say another, **use what's inside the documents**. (e.g. folder `PMV7499` but every doc reads `PMW7499` → the case is PMW7499.)
2. **Claimant's Policy/Cover Note No. — always fill it, no date matching.** Do NOT check whether our client's own policy period covers the accident date; just key in the policy number that's in the bundle. (Supersedes any instinct to hunt for the earlier policy.)
3. **Policy Cover type = whatever the I-SEARCH row actually says.** If the at-fault party's cover is "TP, Fire & Theft" (or Third Party), key THAT — do not force "Comprehensive".
4. **Conflicting field values between RC and the insurance schedule (e.g. chassis no., CC): either one is acceptable.** Pick one and move on; don't block the case on the discrepancy.
5. **At-fault owner unknown (only the driver is named in the police report) → Insured = the at-fault DRIVER.** Confirmed again 2026-08-29.
6. **Work order on a batch: do the straightforward cases first; only escalate to the user when a case actually blocks.** (Said of the EV case SMG5678 — an electric vehicle has watts, not CC — do the others, come back if Merimen won't accept it.)

**Why:** The user wants the batch to flow without a round of clarifying questions per anomaly.
**How to apply:** When any of these anomalies appears mid-batch, apply the rule silently and note it in the final per-case summary. Related: [[merimen-az-progress]], [[workshop-from-desktop-folder]], [[merimen-create-case-procedure]].
