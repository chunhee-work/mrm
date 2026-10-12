---
name: photo-confirm-workflow
description: After training, every case = Step 1 + Step 2; photo names come from the trained model, and any photo under 80% confidence goes to the user's quick-confirm page; user answers are saved and learned from
metadata:
  type: feedback
---

User rule (2026-10-11): once the photo model is trained, every new case is done through Step 1 AND Step 2 (create → report → … → select parts from photo names → conditions/misc/paint, total ≥ RM6,000). Photo names come from `typesafe/photo_train/predict_case.py <ckpt> <images in order>` (top-3 + conf, neighbour-smoothed; sure = conf ≥ 0.60).

Every photo with conf < 0.60 is sent (user agreed 2026-10-12 to lower from 0.80: at 0.80 only 21% of photos were 'sure', at 0.60 58% are sure at ~93% correct) to the user via the quick-confirm page https://claude.ai/artifact/BS7auqjnbs6Y7SZvzL4Vnh — upload the photo + the previous 2 photos (`nb` rel -2/-1) as assets, write a `tasks` doc with {img, vehicle (car model string), guess[3], probs[3], cid, seq, nb, order}. The user taps an option (auto-saves + next, keys 1/2/3), types another name, or draws regions (optional).

**Why:** user wants the AI to get smarter and stop making mistakes; they only want to answer the unsure ones, fast.
**How to apply:** read `labels` after the user says done → add answers to photo_train/user_corrections.json (cid:seq → name) for the next training round, and write any new distinguishing rule or note into [[photo-center-crosshair-rule]]. Merimen stays read-only for training work ([[photo-naming-two-step-jev]]).

User decision (2026-10-11): no automatic polling — the user tells Claude when a batch is done; then read `labels` and absorb.

- 2026-10-12: User asked for engine-bay photos (Front.pdf "i mean the engine part") and for rare (冷门) items in the labeling tool. Batch 4 = engine bay t81–t105; batch 5 = 30 rare labels (count 15–80 in big_meta) t106–t135, picked by scratchpad label/pick_rare.py. Keep mixing rare items into future batches.

- 2026-10-12 shape labeling (user idea, approved): SAM vit_b installed in photo_train/.venv (models/sam/sam_vit_b_01ec64.pth). photo_train/sam_segments.py auto-cuts each task photo into ≤15 polygons (~30 s/photo on CPU while GPU trains) → task doc field `segs`. Labeling tool: click a dashed SAM shape to take it (or drag to free-draw), drag the white vertex dots to adjust, then click an option card / type to name THAT shape (1 colour per shape). Shape containing the crosshair also sets the answer. Goal: later add a per-patch "shape" head on DINOv2 trained from user_regions.jsonl so the model knows part outlines and ignores background noise.
