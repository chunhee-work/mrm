---
name: lorry-front-chassis-member
description: Lorry/truck models — name it "Front Chassis Member" with NO LH/RH side
metadata:
  type: feedback
---

For **lorry** models (Merimen vehicle model contains "LORRY", e.g. HINO 300 SERIES LORRY, ISUZU NPR LORRY, MITSUBISHI CANTER/FUSO LORRY), the chassis part is just **"Front Chassis Member"** — never "Front Chassis Member LH/RH". Cars keep LH/RH.

**Why:** user instruction 2026-10-12 ("for lori model with Front Chassis Member no left and right… keep in memory").

**How to apply:** photo naming + Step 2 parts selection: check Vehicle Model; lorry → pick "Front Chassis Member" without side. Code: `predict_case.py` (VEHICLE env, LORRY/TRUCK) merges LH/RH probability into "Front Chassis Member"; `build_big.py` relabels lorry training photos the same way.
Related: [[perodua-front-panel-rule]], [[photo-center-crosshair-rule]]
