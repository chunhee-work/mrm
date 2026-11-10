---
name: step2-model-ab-test
description: Next batch: Step 2 planning agents run on both Opus 5.5 (applied) and Fable (shadow) to compare; other steps stay Opus
metadata:
  type: project
---
User 2026-11-10 agreed: on the NEXT batch, run Step 2 planning with Opus (applied) and Fable (shadow plan `final_plan_<P>_fable.json`, never applied), then compare both with the user's final estimate and report closeness, time, tokens. Rule written in playbook 07 (top). After that one batch, remove the A/B line once the user decides.
**Why:** Fable costs 2x and was ~60% slower; only Step 2 judgement might benefit. Photo test: Opus 18/30, Fable 20/30, our DINOv2 model 20/30 ([[photo-model-improvement-plan]]).
**How to apply:** at Phase A head start / Phase B REVISE, launch the fable agents alongside the opus ones in the same message.
