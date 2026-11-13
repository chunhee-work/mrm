---
name: step2-model-ab-test
description: Step 2 planning A/B (Opus vs Fable) done 2026-11-11 on TBH3142 -> Opus kept
metadata:
  type: project
---
Done 2026-11-11 on TBH3142 (205 photos, Viva). Against the user's final estimate (corrected 2026-11-11 after the user said pillars are separate rows): Opus 3 misses (rear sensors, rear lower arm, pillar rows), Fable 2 (Floor Panel -> Boot Floor, manual alloy rim). Fable used +19% tokens (248,891 vs 208,862), +50% time (635 s vs 423 s), 2x price. **User decision 2026-11-11: stay on Opus 5.5** (its 3 misses are now rules; Fable slower and 2x price). The 2 Opus misses are now rules (brief.md + playbook 10 Viva).
**Why:** user asked for the comparison before deciding ([[jev-in-workflow]]).
**How to apply:** no more shadow plans unless the user asks again.

**2026-11-13 Sonnet 5.5 / Haiku 5.5 vs Opus (batch 11, same workflow + Jev, only the model changed; planning only).**
- Step 1 read (TCH1133 + CCV8434, 2 cases): Opus ~156-186 s, Sonnet 180 s, Haiku 234 s. Haiku broke the chain-collision rule (claimed vs the blamed bus TDE5582 -> wrong at-fault party, 33 fields wrong) although it opened playbook 01; read only 328/1571 lines of playbook 12. Sonnet: no wrong party, but left a field blank, Front vs Front-Left, missed road tax / a phone.
- Step 2 misses vs final Merimen (TCH1133 / CCV8434 / WB8467H): Opus 8/2/1, Sonnet 8/3/9, Haiku 17/6/11. Time per case: Opus 178-268 s, Sonnet 95-104 s, Haiku 229-262 s. Haiku also wrote 0.00 placeholder prices and a misc label that cannot tick.
- Decision pending the user; recommendation: keep Opus for Step 1 and Step 2 (Sonnet saves ~1.5 min/case on Step 2 but missed 8 more labour/part items on WB8467H). Sonnet had a small advantage (playbook already held the batch-11 corrections).
