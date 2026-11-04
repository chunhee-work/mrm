---
name: case-status-line-format
description: While working cases, report progress as ONE line every 10 min: 🔄 running | ✅ done | minutes left (estimate) | % (user 2026-11-04)
metadata:
  type: feedback
---
While doing cases, do not write long updates. Send one line every ~10 minutes:
`🔄 <cases still running> cases | ✅ <cases done> done | <estimated minutes LEFT> minutes | <percent done>%`
- 🔄 = cases still running, ✅ = cases finished; a case moves from 🔄 to ✅ when it is done.
- minutes = estimated time still needed. When everything is done, drop the minutes: `🔄 0 cases | ✅ 13 done | 100%`.
**Why:** user 2026-11-04: "don't say many thing … update this format every 10 min"; "(Minutes) means how long to done, estimate … once done no need to show minutes".
**How to apply:** every mid-batch update. Only questions that block the work, or items the user explicitly asked for (e.g. the car-model report), may add lines. See [[batch-completion-report-format]].
