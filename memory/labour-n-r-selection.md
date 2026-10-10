---
name: labour-n-r-selection
description: "Labour tab (Select Parts → Labour): left box = N (New/replace), right box = R (Repair). Rules learned from 217 old cases (Autoris 122, Newvest 90, Rawang 5)"
metadata:
  type: reference
---

**Where:** dsp_selection → Labour tab → "Labour Panels" list. Each panel has 2 checkboxes: `name=CL` (seltype N, value `0/1@<code>`) = **N (New = panel replaced)**, `name=CLR` (seltype R, value `2/1@<code>`) = **R (Repair)**. Page text: "Click LEFT for New, RIGHT for Repair". Never tick both on one panel (0 cases did). Save via the Save TD (`MClk`).

**Rule (verified on 217 cases, 2026-10-10):**
- **N = panels of the parts being REPLACED** (1719 of N ticks match a selected part) **+ "R&R" removal jobs** (728 ticks: Bumper Rear/Front R&R, Fuel Tank R&R, Suspension Rear R&R, Engine and Suspension R&R, Rooflining R&R, Boot Lid/Tailgate R&R, Windscreen Rear R&R, Door Front R&R, Dashboard Panel R&R). Rear lamps replaced → "Lamp Assembly Rear LH/RH (tts)" N.
- **R = neighbouring/structural panels that get REPAIRED, not replaced** (3091 of R ticks have no selected part): inner panels, reinforcements, chassis-member sections, lamp panels, quarter inner, wheel arch, doorskin, and glass to remove/refit (Quarter Glass Rear, Windscreen Rear, Door Glass).

**Standard bundles:**
- **REAR hit:** N = Bumper Rear + Bumper Rear R&R, Lamp Assembly Rear LH+RH, **Fuel Tank R&R + Suspension Rear R&R** (~75–95% whenever Boot Floor / Rear Panel / Rear Chassis Member is replaced), Boot Floor, Rear Panel Assembly, Boot Lid or Tailgate, Quarter Panel (hit side). R = Chassis Member Rear Section Rear LH+RH, Rear Lamp Panel LH+RH, Rear Lamp Panel Inner LH+RH, Quarter Panel Inner LH/RH, Quarter Panel Inner Reinforcement Upper/Lower, Quarter Panel (B), Rear Panel Reinforcement; tailgate cars also Windscreen Rear + Quarter Glass Rear (R).
- **FRONT hit:** N = Bumper Front + Bumper Front R&R, **Engine and Suspension R&R**, Bonnet, Bumper Front Reinforcement Panel, Fender Front (hit side), Headlamp Assembly, Chassis Member Front (if replaced), Front Panel/Upper. R = Chassis Member Front LH/RH Front Section (~85–95%), Fender Front Inner / Inner Section / Inner Reinforcement, Chassis Member Front & Inner Fender, Chassis Member Front Closing (Section).
- **SIDE (door) hit:** N = Door Front/Rear (replaced), Door Mirror, Runningboard Panel if replaced. R = Door Glass Front/Rear Window, Doorskin, Door Weatherstrip Retainer Panel, Centre Pillar (& Reinforcement), Runningboard Panel Section, Front Pillar Outer.

**Data:** per-part trigger table (177 parts → labour N/R with %) at `~/mrm-bot/labour_rules.json`; raw harvest `~/mrm-bot/labour_all.json`; harvester `harvest.mjs`. Related: [[estimate-companion-parts-rule]], [[step2-paint-popup-method]].

**User confirmed 2026-10-10:** R = **Repair (修理)** (right box), N = New. And **"step 2" now ALSO includes ticking Labour N/R + the misc items automatically** (from this table), after Select Parts and before Damage Cond/misc prices/paint. Don't overwrite labour the user already ticked on a case.

**Tool (built 2026-10-10, use from the NEXT NEW case — user said don't apply to existing cases):** `node ~/mrm-bot/labourfill.mjs <cid> <extid> <sessFile> <AUT|NV|RW> [apply]` — reads the case's selected parts, finds the 5 most similar past cases (same account, excluding itself) in labour_all.json, ticks Labour N / R / Misc items that ≥3 of 5 neighbours ticked; skips labour/misc if the case already has ticks. Offline accuracy: Misc ~85%, Labour N ~65–70% precise, Labour R ~55% precise (R is subjective) → tell the user to review labour on the first cases.
