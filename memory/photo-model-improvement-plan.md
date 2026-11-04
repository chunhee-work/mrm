---
name: photo-model-improvement-plan
description: User-approved plan (2026-11-04) to improve the photo-naming model: ideas 1-7 in order, then a 30h+ bigger-backbone run on the Mac mini
metadata:
  type: project
---
User approved (2026-11-04, "ok go ahead" + "after all these 1-7 done … try 6 use this device and train for 30 小时以上"):
1. clean training labels (2-fold cross-check `typesafe/photo_train/audit_folds.sh` -> suspects -> user review page)
2. LH/RH mirror augmentation (flip + swap LH/RH)  3. impact side / vehicle as model input
4. test-time augmentation (orig + flip + centre zoom)  5. targeted labelling of the most-confused pairs (rare_pick.py)
6. bigger backbone (DINOv2-L / SigLIP2-L) ON THIS Mac mini, 30h+ is OK (user does not want cloud upload for now)
7. confidence calibration so 要确认 (<90%) flags the right photos
Baseline (live, round 1): whole 82.3/92.8, crop 81.2/92.3 on the 3,306-photo test split. Error analysis 2026-11-04: only 5% of errors are LH/RH-only, 3% Front/Rear-only; most are same-area parts (Rear Bumper vs Spoiler/Sensor/Moulding, Front Panel Assembly vs Headlamp Panel/Upper/Reinforcement, Grille Front vs Lower Grille, Tailgate/Boot Lid vs Rear View).
**Why:** user wants fewer photos to fix on the 照片命名台. **How to apply:** do 1-7 in order when the machine is free (no Merimen batch running), compare on the same test split, swap a model in only if top-1 improves; then start 6. See [[photo-confirm-workflow]].
