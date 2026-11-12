---
name: training-eta-full-round
description: When reporting photo-model training time, give the ETA of the WHOLE round (stage 1 + feature extract + stage 2 score), not one step
metadata:
  type: feedback
---
Give the time the round's final score is ready, not the end of one step.
**Why:** 2026-11-12 I told the user round 17 would be done "今晚约 20:30" — that was only stage 1; the feature extract (931k photos, ~17 h at ~15/s) followed, so the score comes ~14:00 next day. The user caught it.
**How to apply:** ViT-L round ≈ stage 1 ~10 h + extract ~17 h + stage 2 ~10 min ≈ 27 h. Report: step now, % done, and the final-score ETA. Related: [[photo-model-improvement-plan]].
