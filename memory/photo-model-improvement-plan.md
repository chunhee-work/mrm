---
name: photo-model-improvement-plan
description: User-approved plan (2026-11-04) to improve the photo-naming model: ideas 1-7 in order, then a 30h+ bigger-backbone run on the Mac mini
metadata:
  type: project
---
User approved (2026-11-04, "ok go ahead" + "after all these 1-7 done … try 6 use this device and train for 30 小时以上"):
1. clean training labels (2-fold cross-check `typesafe/photo_train/audit_folds.sh` -> suspects). DONE 2026-11-04: 139 recurring pairs, 92 decided by Claude from photos (label_fixes_audit5.json: 245 relabels + merges in name_decisions.json), 47 on the 标签核对台 https://claude.ai/artifact/VfvfpNfPMkHrcYZxFSpuhF (db audit5). The next label build (n4) MUST apply label_fixes_audit5.json + the user's audit5 decisions. ~1,100 single-photo suspects in audit_suspects.json not reviewed yet
2. LH/RH mirror augmentation (flip + swap LH/RH)  3. impact side / vehicle as model input
4. test-time augmentation (orig + flip + centre zoom)  5. targeted labelling of the most-confused pairs (rare_pick.py)
6. bigger backbone (DINOv2-L / SigLIP2-L) ON THIS Mac mini, 30h+ is OK (user does not want cloud upload for now)
7. confidence calibration so 要确认 (<90%) flags the right photos
Baseline (live, round 1): whole 82.3/92.8, crop 81.2/92.3 on the 3,306-photo test split. Error analysis 2026-11-04: only 5% of errors are LH/RH-only, 3% Front/Rear-only; most are same-area parts (Rear Bumper vs Spoiler/Sensor/Moulding, Front Panel Assembly vs Headlamp Panel/Upper/Reinforcement, Grille Front vs Lower Grille, Tailgate/Boot Lid vs Rear View).
**Why:** user wants fewer photos to fix on the 照片命名台. **How to apply:** do 1-7 in order when the machine is free (no Merimen batch running), compare on the same test split, swap a model in only if top-1 improves; then start 6. See [[photo-confirm-workflow]].

## 2026-11-05 results ideas 2+4 (mirrored photos)
- Test-time mirror (TTA=1) on the current crop model: top1 81.2 -> 81.9, top3 92.3 -> 92.8 (no retrain). Costs a 2nd backbone pass per photo (~+1 min per batch), not in case_report.py yet.
- Mirror-augmented training (FLIP_AUG 0.25/0.5, 4-8 epochs, + TTA): best 82.0/92.7 — same as TTA alone (noise). Not swapped.
- Next: idea 6 (bigger backbone on this Mac, 30 h+), then decide TTA in production.

## 2026-11-06 label audit round 6 (1,691 single suspect photos, 6 agents, contact sheets)
- keep 592 · model 638 · other 51 · unsure 410 → 689 relabels in typesafe/photo_train/label_fixes_audit6.json (local, like audit5).
- Apply audit5 + audit6 fixes at the next label build (n4), then retrain stage 2 and compare.
- Rare parts: 466 of 910 labels have < 100 train photos (test top1 21%) -> rare_lt100.json; harvest.py RARE_ONLY=1 grabs only those (+neighbours), never logs in, pauses on ~/mrm-bot/state/PAUSE_HARVEST. Blocked until Chrome "Allow JavaScript from Apple Events" is ticked again.

## 2026-11-07 idea 6 result: ViT-L backbone (2 stage-1 epochs, ~50 h incl. feature extraction on the Mac mini)
- stage 1: 74.1/89.2 (ViT-B big11: 77.1/90.9). Group model (stage 2, 6 epochs, no TTA): best 79.2/91.7 vs current 81.2/92.3 -> NOT swapped.
- Only plus: rare items 36.8% vs 21% on the 38 rare test photos (ViT-L sees rare parts better).
- Next: label build n4 = audit5 + audit6 fixes (689+252 relabels) + 35,827 harvested rare-part photos ("General View Left/Right" renamed or dropped), retrain the ViT-B path (hours, not days).
- 2026-11-07 ViT-B + ViT-L combined (average of the two models' answers, weight 0.6 on B): 82.1% top1 vs B alone 81.2% (3,306 test photos). Routing rare answers to L alone did not help. User wants ViT-L trained more (believes it will beat B) -> after n4, continue ViT-L stage 1 (warm start dinov2_l_big12) + re-extract.
- n4 labels built (build_n4.py): audit5 252 + audit6 535 relabels, 46,755 new train photos (+22,967 context), 892 train labels, 312 still < 100. train_n4.sh running.
- 2026-11-07 idea 4 (car-make prior) TESTED: on 2,556 test photos with a known make, top-1 83.72% -> 83.76% (4 changes) = no real gain; the model already follows the make. Not added (naming.py make rules stay).
- idea 3 done: add_to_training.py after every batch -> train_queue.tsv (batches 8+9 = 1,183 photos queued).
- idea 7 done: 🎯 每日确认台 https://claude.ai/artifact/JBn4fJi8FAvqTX9qErLEnh (daily_pick.py pick/apply, db `daily`, 30 photos/day, cron 09:13 in-session, 7-day limit).
