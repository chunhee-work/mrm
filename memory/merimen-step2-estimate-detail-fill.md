---
name: merimen-step2-estimate-detail-fill
description: "⭐ What the user means by \"STEP 2\": fill Damage Condition + Misc prices + Paint Consumables on the estimate DETAIL page (dsp_details)"
metadata:
  node_type: memory
  type: project
---

**When the user says "do step 2", THIS is what they mean** (spec handed over 2026-09-11 as `STEP2_SPEC.md`). Not the adjuster report, not the uploads — I have guessed wrong on this before, so read this file first.

Case flow: **create → report → [USER selects the damaged parts] → STEP 2 → narratives → upload.**

Step 2 runs on the estimate **DETAIL** page `dsp_details`, AFTER a human has ticked which parts are damaged. Step 2 never chooses parts. For the already-selected rows it fills:
1. **Damage Condition** on every part row (`PDC<i>`)
2. **Miscellaneous** service prices (`MMI<k>`) — only rows we recognise
3. **Paintwork Materials** price `MMI1` = fixed **500.00** (via the Edit -> Other/anything retrieval, see below)

**Hard precondition:** parts must already be selected. No selection ⇒ `PROWCNT`=0 ⇒ nothing to fill. A Total-Loss case still runs step 2 normally.

## URL + page field map
```
https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=<cid>&extid=<extid>&tpins=0&<SESS>
```
| Field | Meaning |
|---|---|
| `PROWCNT` | number of PART rows |
| `PPT<i>` | part row `i` marker (locates the row) |
| `PDC<i>` | Damage Condition input for part row `i` — **skip if `readOnly`** |
| `MROWCNT` | number of MISC rows |
| `MMI<k>` | Misc price input for misc row `k` — **skip if `readOnly`** |
| `MPWCB1` | Paint Consumables checkbox (its onclick un-readonly's the price box) |
| `MPWCV1` | Paint Consumables price input |

**Row name lookup:** the item name for a row = the first non-empty `<td>` text in that `<tr>` that is not a bare symbol `< > = *`. For parts use the `PPT<i>` row. **No readable name ⇒ skip the row** — don't invent a condition.

## Damage Condition — `cond(name)`, lower-case the name, FIRST match wins
Valid values: `Bent, Broken, Cracked, Cut, Damage, Necessary, Bracket cracked`.

| # | matches (regex, i) | Condition |
|---|---|---|
| 1 | `bumper.*retainer` | Bracket cracked |
| 2 | `bracket` | Bracket cracked |
| 3 | `weather sheeting`\|`wheel hub`\|`wheel bearing` | Necessary |
| 4 | `weatherstrip`\|`weather strip` | Cut |
| 5 | `bumper.*sensor`\|`sensor.*bumper` | Cut |
| 6 | `mirror` | Broken |
| 7 | `support strut`\|`\bstrut\b` | Broken |
| 8 | `windscreen`\|`windshield` | Broken |
| 9 | `centre guide`\|`center guide` | Broken |
| 10 | `spare wheel well`\|`wheel well` | Broken |
| 11 | `lock`\|`striker`\|`hinge` | Bent |
| 12 | `lamp panel` | Bent |
| 13 | `reinforcement` | Bent |
| 14 | `liner` | Damage |
| 15 | `reflector`\|`fog lamp`\|`lamp assembly`\|`head ?lamp`\|`signal lamp`\|`tail ?lamp`\|`\blamp\b` | Cracked |
| 16 | `glass`\|`window` | Cracked |
| 17 | `sensor` | Necessary |
| 18 | `clip`\|`retainer`\|`\bguide\b`\|`nozzle`\|`grommet`\|`washer` | Necessary |
| 19 | `trim`\|`finisher`\|`garnish`\|`moulding`\|`spoiler`\|`skirt`\|`extractor vent`\|`\bvent\b`\|`badge`\|`emblem`\|`grille`\|`\bmask\b`\|`valance`\|`\bcover\b`\|`cladding`\|`\bflap\b`\|`deflector` | Broken |
| 20 | `rim`\|`tyre`\|`wheel` | Bent |
| 21 | `absorber`\|`control arm`\|`tie rod`\|`crossmember`\|`drive ?shaft`\|`stabilizer`\|`\blink\b`\|`knuckle` | Bent |
| 22 | `panel`\|`tailgate`\|`boot ?lid`\|`bonnet`\|`fender`\|`quarter`\|`\bdoor\b`\|`floor`\|`wheelhouse`\|`member`\|`pillar`\|`roof`\|`firewall`\|`apron`\|`\bdeck\b`\|`body side`\|`support` | Bent |
| 23 | `bumper` | Broken |
| 24 | *(fallback)* | Bent |

## Miscellaneous — `misc(name)`, FIRST match wins, `null` = leave the row alone
⚠️ **These prices are OUR OWN reference — never copy another company's misc prices** (user rule).

| # | matches | Price (RM) |
|---|---|---|
| 1 | `paintwork material.*solvent`\|`solvent.*paintwork` | 500.00 |
| 2 | `paintwork material` (no "solvent") | *skip* |
| 3 | `car-o-liner`\|`frame aligner`\|`aligner bench`\|`frame bench` | 400.00 |
| 4 | `electrical` | 35.00 |
| 5 | `underseal` | 60.00 |
| 6 | `road test` | 30.00 |
| 7 | `road wheel align`\|`alignment` | 45.00 |
| 8 | `balancing` | 35.00 |
| 9 | `number plate` | 25.00 |
| 10 | `windscreen sealant`\|`glass sealant` | 45.00 |
| 11 | `sealant` (other) | 30.00 |
| 12 | `other items` | 35.00 |
| 13 | `\btyre\b` | 350.00 |
| 14 | `air.?cond`\|`r134` | 150.00 |
| 15 | `fogging` | 45.00 |
| 16 | *(no match)* | *skip* |

Only the misc rows Merimen actually lists are candidates — **never add misc lines Merimen didn't list.**

## Paintwork Materials 500 — NEW method (user video 2026-10-07; supersedes the MPWCB1/MPWCV1 tick)
The old Paint Consumables checkbox no longer exists on the page (`MPWCB1` absent). The 500.00 now goes in the **Paintwork Materials row price box `MMI1`** (Miscellaneous tab), which is read-only until the paint is "retrieved":
1. Click **Edit** on the Paintwork Materials row (input button, onclick `PWEdit(0,0)`).
2. In the dialog set **Paint Manufacturer** `slePNTMAN` = **Other** (value -1) and the text box `sleMANCUSTOM` = **anything**.
3. Click **Submit** (`PWSubmitConfirm`) -> "Retrieval completed!" -> click **OK** (`clickButton('OK')`). Block now reads "Paint Manufacturer: anything".
4. `MMI1` is now editable: set **500.00**, then Save as usual.
Isolated world: `.click()` on those buttons works (inline onclick fires); don't call `PWEdit` directly. Exclude the Paintwork row from the misc-price judgment. Runner: `typesafe/run_step2.py`. Verify = empty PDC 0 AND `MMI1`==500.00.

## Save & verify
1. Navigate to `dsp_details`, wait ~4 s for render.
2. Set all PDC + MMI + Paint (fire `input`+`change` on each).
3. Neutralise stray click targets: every `<img>` → `pointer-events:none` (avoids mis-clicks).
4. Click **Save** (exact text, force).
5. Accept confirmations: up to 3× click a visible **OK**.
6. Re-navigate to the same URL and **verify**: count part rows with non-empty `PDC<i>` (`filled`) vs empty, and read back `MPWCB1.checked` + `MPWCV1.value`.
   **Done = `empty == 0` AND paint chk=true val=500.00.**

Auto-accept JS dialogs throughout (`page.on('dialog', d => d.accept())`).

## Gotchas
- **Regex ORDER is load-bearing** — a broad later rule (`panel`) must not pre-empt a specific earlier one (`lamp panel` → Bent at #12, before generic `\blamp\b` → Cracked).
- Skip `readOnly` PDC/MMI inputs (system-locked rows).
- One case per tab; small parallel batches fine. Session dies ~15 min → re-login and re-run; **Save is idempotent** (overwrites the same fields).
- Reference implementation was `estfill.mjs` (Playwright over Chrome CDP 9222) — the ZIP the user sent contained only the spec, so the code has to be re-written; this document is the source of truth for the rules.

Related: [[merimen-az-progress]], [[merimen-create-case-procedure]], [[car-part-item-names]], [[merimen-claimant-insurance-fields]].

## Field notes from the first full run (16 cases, 2026-09-11)
- **⚠️ THE RENDER RACE IS THE REAL TRAP — it silently under-fills.** `dsp_details` renders its grid progressively: `PROWCNT` is already correct while only *some* `PDC` inputs exist. Applying then hits only the rows rendered so far and the verify (on a likewise-partial page) reports `empty=0`, so it looks like a pass. CDR332 filled **30 of 65** rows that way and still printed a clean verify.
  **Fix — poll before BOTH apply and verify:** wait until `document.querySelectorAll('[name^="PDC"]').length >= PROWCNT`, sleep ~2 s, then re-count and require the count to be unchanged. A fixed `sleep(12)` is not enough on the bigger cases.
- **Paint Consumables can legitimately be absent.** WJX5883 has no `MPWCB1`/`MPWCV1` and no "Paint Consumables" text at all (no panels to paint) — `noCB` there is a correct result, not a failure. Only treat it as a failure when the control exists and is unticked/blank.
- **AppleScript `execute javascript` is enough** — Chrome does not need CDP/Playwright for this page. Setting `.value` + dispatching `input`+`change`, then a plain `.click()` on the exact-text **Save** button, persists correctly (re-read after reload confirms). This differs from the discount boxes on `dsp_selection`, which do need real input ([[merimen-az-progress]] §3).
- Row counts seen: 25–65 parts, 6–10 misc rows per case; `skipped` (unnamed rows) was 0 throughout.

**⭐ USER RULE (2026-10-11, corrected): every case's estimate total must NOT be LOWER than RM 6,000 (minimum RM6,000).** The user first wrote "must not be over 6k", then corrected to "cannot down than 6k" when asked. When selecting parts / filling prices in step 2, make sure the case total is at least RM6,000; if the justified parts/prices come out below RM6,000, flag the case to the user rather than inventing items.
