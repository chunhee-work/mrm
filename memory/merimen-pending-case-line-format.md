---
name: merimen-pending-case-line-format
description: "How the user wants a blocked/missing-data case reported: one copy-pasteable line `<PLATE> pending <what is missing>`"
metadata:
  node_type: memory
  type: feedback
---

**User rule (2026-09-19):** when a case can't be done because something is missing, report it as **one short copy-pasteable code line**, not a paragraph:

```
<PLATE> pending <the exact missing item>
```

Their example: `BMC2457 pending RAY2427 JPJ Search`

So the line names the plate, the word `pending`, and the specific artefact needed (at-fault plate + document type, a photo set, a policy page…). One line per blocked case, listed together at the end of the batch report so they can paste them straight to the workshop/client.

**Why:** they forward these lines as-is to chase the missing documents — prose is useless for that.
**How to apply:** set the case aside per [[batch-autonomy-rule]], keep doing the workable ones, then emit these lines in the final report alongside the status table ([[batch-completion-report-format]]).
