---
name: case-status-line-format
description: While working cases, report progress as ONE line only: cases, done, minutes, % (user 2026-11-04)
metadata:
  type: feedback
---
While doing cases, do not write long updates. Each progress message is one line, in this order:
`- <cases> cases, - <done> done, - <minutes> minutes, - <percent>%`
(cases = how many cases in the batch being worked, done = how many finished, minutes = how long since the user's instruction, % = done/cases).
**Why:** user 2026-11-04: "when u doing case don't use a lot thing … just 1 sentence".
**How to apply:** every mid-batch update. Only questions that block the work, or a finished-batch item the user explicitly asked for (e.g. the car-model list), may add lines. See [[batch-completion-report-format]].
