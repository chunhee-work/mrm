---
name: labour-diff-log
description: "Per case: the Labour N/R/Misc I ticked vs the user's final ticks, to learn what the user adds or removes"
metadata:
  type: project
---

User (2026-10-17): "next time remember what u choose with the labour i will add in." For every case, record my labour choice right after Step 2, then the user's final state and the diff. Turn each diff into a rule in [[labour-reference-sinar-batch]]. Procedure: [[merimen-batch-workflow]] step 7 / End of batch.

## MDP5464 (Saga 2022, front-RH) — only case with both sides recorded
- Mine R: Chassis Member Front RH Front Section, Front Pillar Outer RH (+ labourfill: Chassis Member Front End Closing RH, Door Glass Front Window RH)
- User ADDED R: Chassis Member Front End Closing LH, Chassis Member Front LH Front Section, Door Glass Quarter Rear RH, Door Glass Rear Window RH, Door Mirror RH (tts), Fender Front Inner Upper RH
- I removed: N Bonnet and N Door Mirror RH (they pulled in undamaged parts)
- Lesson: front-panel jobs → both sides' front chassis closing + front section; each replaced door → its glass R; front door → mirror R; fender → inner upper R.

FB438 / JNC9717 / NEA4698 / WWH2330: my original ticks were not saved. Only the user's final state exists ([[labour-reference-sinar-batch]]).

## sinar batch 2 (2026-10-20) — my ticks vs the user's final (Misc diffs ignored: labourfill added them after my snapshot)
Pattern: **the user ticks the inner structure behind every replaced outer panel, on BOTH sides for a front or rear hit, and the full side structure for a side hit.** I ticked far too few R items.

**Side hit, front + rear doors (BRS8642 Vios 2023, RH)**
- User added N: Door Mirror RH (tts).
- User added R:
  - Doorskin Front RH, Doorskin Rear RH
  - Centre Pillar Inner RH, Centre Pillar Reinforcement RH, Centre Pillar Reinforcement RH Upper, Centre Pillar & Runningboard RH
  - Front Pillar Inner RH, Front Pillar Inner Upper RH, Bodyside Section Front RH
  - Drain Channel Rear RH, Door Front Weatherstrip Retainer Panel RH
  - Fender Front Inner Upper RH, Fender Front Inner Reinforcement Section RH
  - Quarter Panel (B) RH, Quarter Panel Inner Extension RH, Quarter Panel Inner Reinforcement Lower RH, Quarter Panel Inner Reinforcement Upper RH
  - Runningboard Panel Section Rear RH

**Rear hit, MPV tailgate (SK64A Avanza)**
- User added R: Quarter Inner Reinforcement LH + RH, Quarter Panel LH + RH (as R), Rear Panel Inner, Rear Panel Inner Centre, Rear Panel Inner LH, Rear Panel Outer, Spoiler Rear.

**Rear hit, sedan (WQF8918 Civic)**
- User added R: Chassis Member Rear Section Rear RH, Quarter Panel Inner Striker Reinforcement Panel RH (the opposite side too).

**Front hit, PERODUA (TCB8444 Alza, WYN5733 Alza)**
- N: Front Panel (TCB), Front Panel Upper (WYN), Bonnet Mntg Support Pnl LH + RH (TCB).
- Bonnet moved from N to **R** when the bonnet is not replaced.
- R, both sides:
  - Bumper Retainer Panel Front RH + LH
  - Chassis Member Front LH/RH Front Section, Chassis Member Front End Closing LH + RH, Chassis Member Front LH, Chassis Member Front & Inner Fender LH
  - Crossmember Front, Front Panel Assembly (R)
  - Fender Front Inner Assembly LH/RH, Fender Front Inner Side Reinforcement (Section) LH + RH, Fender Front Inner Support Panel LH + RH, Fender Front Inner Upper Support Panel LH + RH, Fender Front Inner Reinforcement LH, Fender Front Inner Section LH
  - Fender Front (the other side) as R
  - Front Panel Support Panel RH, Front Panel Support Reinforcement RH, Front Panel Upper Support Panel LH + RH
  - Headlamp Panel Mask LH + RH, Headlamp Assembly LH (tts)
- TCB side damage also: Doorskin Front/Rear LH, Runningboard Panel Reinforcement LH/RH (+ Centre/Front/Rear Sections), Runningboard Panel Section Centre LH/RH, Quarter Inner Reinforcement LH.

**Front-RH hit, PERODUA Myvi (TCP4539)**
- User added N: Headlamp LH R&R.
- User removed N: Bumper Front Bracket Support RH, Headlamp Assy LH (parts not replaced).
- User added R: Chassis Member Front End Closing LH + RH, Chassis Member Front LH (+ Front Section), Fender Front LH, Front Panel Radiator Support RH, Front Panel Upper.

**Rules learned**
1. For a front/rear hit, tick the inner structure on **both** sides: chassis member sections, end closings, inner fender supports/reinforcements, bumper retainer panels, headlamp panel masks.
2. For a side hit with doors: Doorskin of each door, the Centre/Front Pillar inner + reinforcements, Bodyside Section, Drain Channel, quarter inner set, runningboard sections.
3. A panel next to the hit but not replaced = **R**, not N (Bonnet, Fender of the other side, Front Panel Assembly).
4. N only for parts actually replaced, plus R&R jobs (Headlamp LH R&R when the other headlamp is replaced).
