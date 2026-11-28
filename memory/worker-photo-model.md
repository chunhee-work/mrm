---
name: worker-photo-model
description: How the worker runs the shop's photo model (PR #152, 2026-11-28): weights, naming rules, heartbeat, deploy check
metadata:
  type: project
---

PR chunhee-work/mrm#152 (2026-11-28) made the worker's `photo_model` step actually run the owner's model.
- Image: CPU torch 2.8.0 + DINOv2 code at commit 7764ea0 in `/opt/dinov2_hub`. Weights download once from private HF `chunhee00/mrm-photo-model` `production/` with `HF_TOKEN` (name only) into `PHOTO_MODEL_DIR` (docker volume `photo-model`). `HF_MODEL_REVISION` pins a model commit.
- Naming rules: one logic copy `typesafe/photo_train/name_rules.py` (Mac naming.py build, case_report, worker). Rule DATA (modelBans, modelSwaps, badge brands, Rear Lamp) lives in `playbook/photo-rules.json`; after editing run `node scripts/sync-playbook.mjs` (copies to web + worker). New owner photo rules: data in that JSON, logic in name_rules.py, never in the callers.
- Any worker failure → ModelError → website names photos with Claude. A photo that can't be downloaded → only that photo goes to Claude.
- Heartbeat: website calls the worker gone after 90 s without `worker_runtimes.seen_at`. `loop.LeaseKeeper` now beats at once + every 30 s during every job (was only at tick start, so long jobs looked offline and Claude took the photos).
- Deploy acceptance: timeline shows "Photos named by the on-site model"; then a Claude thread compares the first real case's `case_photos.model_name` with a Mac re-run, paired by file name (before anyone opens the 照片命名台).
- Rollback: `PHOTO_WORKER=off` + restart.
