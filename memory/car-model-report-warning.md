---
name: car-model-report-warning
description: "Step 12 car-model report: mark ⚠️ when the chosen Merimen model has no parts/price data (white, not green, in the Model dropdown)"
metadata:
  type: feedback
---

User 2026-10-20: "for those car model dont have price in merimen one u need to put ⚠️ in 车型报告. so i know"

- In Merimen's Model dropdown, **green** options (class clsMTRModelLevel1, background rgb(218,250,220)) have parts/price data. **White** ones (clsMTRModelLevel0) have none.
- Pick a green variant whenever one fits the RC (make/model, cc, trim, year range, A/M).
- In the step-12 report (plate | RC details | chosen Merimen model), put **⚠️** on every row whose chosen model is white, and say why no green one fitted.
- Check the class from the model dump (dumpmodels_sinar.mjs gives `c` per option).

**Why:** a model without price data means every part is priced by hand, and the user wants to see that at a glance.
**How to apply:** step 12 of [[merimen-batch-workflow]].
