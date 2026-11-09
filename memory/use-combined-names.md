---
name: use-combined-names
description: Always show the user's combined item names (name_map.final + merges, names.json) in every artifact and chat — never raw/old training labels
metadata:
  type: feedback
---
The user combined the item names earlier (名称对齐台 rounds, name_decisions.json, round-5 merges). On 2026-11-09 the 每日确认台 still showed old labels ("Suspension Arm Front LH", "Rear RH Bootlid Backup Lamp", "Photo Before Repair") and the user said: "Isn't I combined all the item name for u? Moving forward all use those combined name … in all artifact and conversation".

**Why:** old names make the user re-decide things already decided.
**How to apply:** pass every name through name_map.final + audit5 merges and only show names in tools/naming-desk/names.json. 100 training labels (10,514 photos) are still outside names.json (e.g. "Tailgate Badge (LOGO)", "Bumper Signal Lamp Front LH") — map them before the next label build. See [[photo-model-improvement-plan]].
