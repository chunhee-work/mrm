---
name: case-workflow-order
description: "⭐ Per-case order (user 2026-10-16): Step 1 create → as soon as the car model is confirmed, publish the photo-naming artifact → user edits while Step 1 continues → after user says done, Step 2 = Select Parts + Labour from the photo names"
metadata:
  type: feedback
---

User workflow (2026-10-16, "moving forward this is the workflow"):
1. **Step 1** = create the case in Merimen ([[merimen-az-progress]]).
2. The moment the car model is confirmed (the Merimen model variant is selected), **immediately** name the photos and add the case to the 照片命名台 artifact ([[case-photo-naming-artifact]]) — use that model variant as VEHICLE (doors decide Boot Lid vs Tailgate).
3. While the user edits the artifact, keep going with the rest of Step 1.
4. When the user says the artifact is done: absorb the changes (learning loop), then **Step 2 = select the items in Select Parts AND select the matching items in Labour**, using the artifact's final names (and order) — companion rules in [[estimate-companion-parts-rule]] (e.g. Bumper Spoiler → also Bumper; Bumper → Bumper Clips x15), sensor position in the row comment.

**Why:** the user reviews photo names in parallel so Step 2 can start right after, with correct part names.
