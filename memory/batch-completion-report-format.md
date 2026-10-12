---
name: batch-completion-report-format
description: "The exact status-table format to send the user when a Merimen batch is finished"
metadata:
  node_type: memory
  type: feedback
---

User rule (2026-08-29): **"always send me this format when done."** When a batch of cases is finished, report with this table — one row per case, in the batch's order:

| 车牌 | Case ID | Adjuster Report | 折扣/工时 | Narratives | Betterment |
|---|---|---|---|---|---|
| VDU965 | 21645828 | ✅ | 10 / 0 · 30×4 | ✅ 5 段 | 6.8 yr − 20% |
| PNQ3586 | 21645839 | ⏸ 建案好了，其余 pass（无照片） | — | — | — |

Rules for the table:
- **Case ID** = the Merimen caseid from the created case.
- Use **✅** for a stage that is saved AND verified (re-read after reload), **⏸ + one-line reason** for a passed/blocked case, **—** for stages that do not apply.
- **折扣/工时** shows the actual persisted values (`10 / 0 · 30×4`), not just a tick.
- **Betterment** is the value Merimen computed, copied verbatim as `X yr − Y%` — never self-computed.
- Below the table, add only: anything that went wrong and how it was handled, per-case anomalies/assumptions, and what still remains. Keep it short.
- The Google-Sheet paste rows (`<date> TAB <plate> TAB <workshop> TAB D`, see [[merimen-create-case-procedure]] STEP 8) are still sent as well, after the table.

**Why:** This is the shape the user wants to read a finished batch in.
**How to apply:** Produce it at the END of the batch (see [[batch-autonomy-rule]] — no mid-batch check-ins). Related: [[merimen-az-progress]].
