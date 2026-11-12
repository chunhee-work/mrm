---
name: batch-timing-log
description: Measured wall-clock time per Merimen batch (minutes per case) to compare workflow speed-ups
metadata:
  type: project
---
Baseline for "how much faster" questions (user 2026-11-12 asks for minutes saved and %).
- Batch 9 (2026-11-04, Sinar, 8 cases): 63 min end to end -> 7.9 min/case.
- Batch 10 (2026-11-11, 2 cases): blocked by a missing insurer name; not comparable.
- Batch 11 (2026-11-12, Sinar, 12 cases): 60 min of working time (02:07 resume after the Mac logout -> 03:07 UTC all done, sheet rows 892-903) -> 5.0 min/case (-37%). Lost ~25 min to fixable mistakes: out-of-order upload hand fixes (TCG9645, VGL7278), window->regulator name bug (TCP2136), closetabs killing a parallel run (TCH1133/VGL7278 re-apply, VMX9916 false low total). All four fixed in code 2026-11-12 -> target next batch ~3.5-4 min/case.
**How to apply:** after each batch add a line (cases, minutes, min/case, what slowed it). Related: [[jev-in-workflow]].
