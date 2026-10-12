---
name: perodua-front-panel-rule
description: PERODUA cars never use "Front Panel Assembly" — front panel is split into Front Panel Upper / Fender Inner / Front Crossmember / Front Panel Lower; all other makes use Front Panel Assembly
metadata:
  type: feedback
---

**PERODUA (Myvi, Axia, Bezza, Alza, Aruz, Ativa, Viva, Kancil…): the front panel must NEVER be named "Front Panel Assembly".** Use the separate pieces: **Front Panel Upper, Fender Inner LH/RH, Front Crossmember, Front Panel Lower** (Merimen sells it as "Separate (PERODUA)"). Every other make → **Front Panel Assembly** (do not use the Perodua split names).

**Why:** user said it twice (2026-10-11, repeated 2026-10-12 "need to remember this") — Merimen parts list differs for Perodua; wrong name = wrong part/price in Step 2.

**How to apply:**
- Photo naming / Step 2 parts selection: check the Vehicle Model first. Perodua + front-panel photo → pick which split piece is at the crosshair; never Front Panel Assembly.
- Code: `photo_train/predict_case.py` takes `VEHICLE=` env and moves Front Panel Assembly probability onto the Perodua split names (and the reverse for non-Perodua). Labeling-tool tasks for Perodua must not offer Front Panel Assembly.
- Training: `build_big.py` drops Perodua photos labeled Front Panel Assembly and maps non-Perodua split names → Front Panel Assembly, using case vehicles in `lamp_models.json`.
Related: [[photo-center-crosshair-rule]], [[merimen-step2-estimate-detail-fill]]
- 2026-10-12 (user): "Front Panel" = "Front Panel Assembly" (same thing, use Front Panel Assembly). name_map.py MERGE maps "Front Panel" → "Front Panel Assembly"; for PERODUA it is then treated like Front Panel Assembly (dropped from training / remapped to split pieces in prediction).
- 2026-10-12 (user, repeated): "Perodua always not using front panel assembly" + "others model always front panel assembly". Labeling tool now hides/blocks the wrong-side names per vehicle; t84 (Honda Jazz) corrected to Front Panel Assembly; t61 (Perodua Aruz) reopened for re-labeling.
