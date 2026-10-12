---
name: merimen-missing-photo-data-rules
description: "What to key when the case photos can't give odometer / colour, or a case has no photos at all"
metadata:
  node_type: memory
  type: feedback
---

User rules (2026-08-29), given when three cases in the sinar+LKH batch had photo gaps:

1. **Case folder has NO usable photos at all → PASS the case.** Leave it pending, finish every other case in the batch, and report it at the end. (e.g. PNQ3586 — its `... .zip` extracted to an empty folder, so there were no photos, no odometer, no colour, no damage shots.) Do not invent values to push it through.
2. **Odometer unreadable (dash LCD off / no cluster photo) → key `0`.** (e.g. PHE9072 — every instrument-cluster photo had the LCD dark because the engine was off.) Do not leave it blank and do not guess a plausible mileage.
3. **Colour → always key what the PHOTO shows**, even when the paint is obscured — e.g. a brand-new car still wrapped in factory protective film reads pink/rose, so key the colour as seen (SMG5678, Proton e.MAS 7). Do not substitute the manufacturer's catalogue colour or the colour named in any document.

**Why:** The user wants the batch to keep moving with predictable, honest placeholders rather than stalling or fabricating.
**How to apply:** Apply these silently mid-batch (see [[batch-autonomy-rule]]) and list what was passed/zeroed in the final per-case summary. Related: [[merimen-adjuster-report-fields]], [[merimen-data-conflict-rules]].
