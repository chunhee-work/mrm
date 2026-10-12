---
name: merimen-model-variant-trim-match
description: "Pick the ddlbModel option whose TRIM word matches the vehicle's actual trim — Executive=Executive, AV=Advanced"
metadata:
  node_type: memory
  type: feedback
---

**User correction (2026-09-11): "you did it wrong with these 2, I have edited it. Executive = Executive, Advance = AV."** The user had to go into Merimen and re-pick the model on two cases because I chose a variant with the wrong trim level.

The `ddlbModel` option is not just make + body + engine — the **trim word inside the option is part of the match, and it must equal the vehicle's real trim**:

| Trim on the vehicle / in the docs | Merimen `ddlbModel` option to pick |
|---|---|
| **Executive** (Proton) | the option reading **`Executive`** — e.g. `Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [08/16-03/19]` |
| **AV** (Perodua's top trim badge) | the option reading **`Advanced`** / `Advance` — e.g. `Alza 2009 On MPV 1.5 Advanced 103Bhp (A) [01/14-10/18]` |

So **AV and "Advanced" are the SAME trim** — a Perodua badged `AV` must go to the `Advanced` option, never to Standard / Premium / SE / X / G. And an `Executive` car must go to the `Executive` option, never to Standard / Premium / Priv.

Matching order, all four must line up: **trim** → engine + body + transmission (A)/(M) → the `[date bracket]` containing the vehicle's registration year → prefer options **highlighted green** (they carry parts data). Trim is the one I keep dropping — check it last before moving on.

⚠️ Re-picking costs the user money and time: the make/model registration is only valid **3 days**, and changing it after that is charged (RM12). Get the trim right the first time.

**Why:** Wrong trim = wrong parts prices and wrong estimate on the whole case.
**How to apply:** At the Create form's Vehicle Model block ([[merimen-claim-subfolder-fields]] Block 3), read the trim off the JPJ cert / RC / insurance schedule and match the word. Related: [[merimen-az-progress]], [[merimen-create-case-procedure]].
