# Merimen TP Claim — STEP 2 Spec (Estimate Detail Fill)

> Handoff spec for another AI/automation agent. Describes exactly what "step 2" does after the
> user has selected the damaged parts in a Merimen third‑party (TP) motor claim estimate.
> Reference implementation: `estfill.mjs` (Playwright over Chrome CDP 9222). This document is
> the source of truth for the **rules**; keep it in sync with the code.

---

## 1. Where step 2 sits in the A‑Z

Full case flow: **create → report → [USER selects damaged parts in the estimate] → STEP 2 → narrative → upload**.

Step 2 runs on the **estimate DETAIL page** (`dsp_details`) *after* a human has ticked which parts
are damaged (the "Select Parts" step). Step 2 does **not** choose parts — it only fills, for the
already‑selected parts:

1. **Damage Condition** for every part row (PDC field).
2. **Miscellaneous** service prices (MMI field) — only the rows we price.
3. **Paint Consumables** = fixed **500.00**.

Then it **Saves** and **verifies** every part row got a condition.

**Precondition (hard):** the user must have selected the damaged parts first. If no parts are
selected, `PROWCNT` = 0 and step 2 fills nothing. A Total‑Loss case still runs step 2 normally.

---

## 2. Inputs

- **caseid** + **extid** for the case (from the create/worklist step).
- A live logged‑in Merimen session string `CFID=…&CFTOKEN=…&USID=…&RID=…` (session times out ~15 min → re‑login).
- Chrome running with `--remote-debugging-port=9222` (Playwright `chromium.connectOverCDP('http://127.0.0.1:9222')`).

Per‑case JSON shape (one object keyed by plate):
```json
{ "<PLATE>": { "cid": "<caseid>", "extid": "<extid>" } }
```

CLI: `node estfill.mjs <PLATE> <sessionFile> <caseJson> [v]`  (`v` = verbose: also print the cond/misc mappings)

Target URL:
```
https://www.merimen.com.my/claims/index.cfm?fusebox=MTRestinterface&fuseaction=dsp_details&caseid=<cid>&extid=<extid>&tpins=0&<SESS>
```

---

## 3. Page field map (`dsp_details`)

| Field | Meaning |
|---|---|
| `PROWCNT` | number of PART rows (parts) |
| `PPT<i>` | part row `i` marker (used to locate the row) |
| `PDC<i>` | **Damage Condition** input for part row `i` (skip if `readOnly`) |
| `MROWCNT` | number of MISC rows |
| `MMI<k>` | **Miscellaneous** price input for misc row `k` (skip if `readOnly`) |
| `MPWCB1` | Paint Consumables checkbox (its onclick un‑readonly's the price box) |
| `MPWCV1` | Paint Consumables price input |

**Row name lookup** (`rowName`): the item name for a row = the first non‑empty `<td>` text in that
`<tr>` that is not a bare symbol `< > = *`. Match the PDC/MMI's own row; for parts use the `PPT<i>` row.

---

## 4. Damage Condition rules (the `cond(name)` function)

Lower‑case the part name, then test these regexes **in order** and return the **first** match.
Order matters (earlier rules win). Valid Merimen condition values: `Bent, Broken, Cracked, Cut,
Damage, Necessary, Bracket cracked`.

| # | If part name matches (regex, case‑insensitive) | Condition |
|---|---|---|
| 1 | `bumper.*retainer` | **Bracket cracked** |
| 2 | `bracket` | **Bracket cracked** |
| 3 | `weather sheeting` \| `wheel hub` \| `wheel bearing` | **Necessary** |
| 4 | `weatherstrip` \| `weather strip` | **Cut** |
| 5 | `bumper.*sensor` \| `sensor.*bumper` | **Cut** |
| 6 | `mirror` | **Broken** |
| 7 | `support strut` \| `\bstrut\b` | **Broken** |
| 8 | `windscreen` \| `windshield` | **Broken** |
| 9 | `centre guide` \| `center guide` | **Broken** |
| 10 | `spare wheel well` \| `wheel well` | **Broken** |
| 11 | `lock` \| `striker` \| `hinge` | **Bent** |
| 12 | `lamp panel` | **Bent** |
| 13 | `reinforcement` | **Bent** |
| 14 | `liner` | **Damage** |
| 15 | `reflector` \| `fog lamp` \| `lamp assembly` \| `head ?lamp` \| `signal lamp` \| `tail ?lamp` \| `\blamp\b` | **Cracked** |
| 16 | `glass` \| `window` | **Cracked** |
| 17 | `sensor` | **Necessary** |
| 18 | `clip` \| `retainer` \| `\bguide\b` \| `nozzle` \| `grommet` \| `washer` | **Necessary** |
| 19 | `trim` \| `finisher` \| `garnish` \| `moulding` \| `spoiler` \| `skirt` \| `extractor vent` \| `\bvent\b` \| `badge` \| `emblem` \| `grille` \| `\bmask\b` \| `valance` \| `\bcover\b` \| `cladding` \| `\bflap\b` \| `deflector` | **Broken** |
| 20 | `rim` \| `tyre` \| `wheel` | **Bent** |
| 21 | `absorber` \| `control arm` \| `tie rod` \| `crossmember` \| `drive ?shaft` \| `stabilizer` \| `\blink\b` \| `knuckle` | **Bent** |
| 22 | `panel` \| `tailgate` \| `boot ?lid` \| `bonnet` \| `fender` \| `quarter` \| `\bdoor\b` \| `floor` \| `wheelhouse` \| `member` \| `pillar` \| `roof` \| `firewall` \| `apron` \| `\bdeck\b` \| `body side` \| `support` | **Bent** |
| 23 | `bumper` | **Broken** |
| 24 | *(fallback — nothing matched)* | **Bent** |

---

## 5. Miscellaneous pricing (the `misc(name)` function)

Lower‑case, test **in order**, return the **first** match's price string. `null` = **do not fill**
that misc row (leave it). **⚠️ These prices are OUR OWN reference — never copy another company's
misc prices** (user rule).

| # | If misc name matches | Price (RM) |
|---|---|---|
| 1 | `paintwork material.*water` \| `water.*paintwork` (Water-based) | *null — skip* |
| 2 | `paintwork material` (Solvent, OR a single "Paintwork Materials" line) | **500.00** |
| 3 | `car-o-liner` \| `frame aligner` \| `aligner bench` \| `frame bench` | **400.00** |
| 4 | `electrical` | **35.00** |
| 5 | `underseal` | **60.00** |
| 6 | `road test` | **30.00** |
| 7 | `road wheel align` \| `alignment` | **45.00** |
| 8 | `balancing` | **35.00** |
| 9 | `number plate` | **25.00** |
| 10 | `windscreen sealant` \| `glass sealant` | **45.00** |
| 11 | `sealant` (other) | **30.00** |
| 12 | `other items` | **35.00** |
| 13 | `\btyre\b` | **350.00** |
| 14 | `air.?cond` \| `r134` | **150.00** |
| 15 | `fogging` | **45.00** |
| 16 | *(no match)* | *null — skip* |

---

## 6. Paint Consumables (fixed)

- Tick the checkbox **`MPWCB1`** (fires its onclick which un‑readonly's the price box).
- Force the price box **`MPWCV1`** editable (`readOnly=false`) and set value **`500.00`**; dispatch `input`+`change`.

Paint Consumables is always **500.00** for these cases.

**⚠️ Two paint templates:** (A) the separate **`MPWCB1`/`MPWCV1`** checkbox+price above; (B) templates with **no MPWCB1** — instead a Miscellaneous line named **"Paintwork material (Solvent)"** or a single **"Paintwork Materials"** line — priced via the Misc rules (#2 → 500.00), while a **"Paintwork material (Water-based)"** line stays blank (#1 → skip). So on a "no MPWCB1" page, confirm paint 500 landed on the Solvent / single Paintwork-Materials Misc line instead.

---

## 7. Save & verify flow

1. Navigate to the `dsp_details` URL; wait ~4s for render.
2. Compute & set all PDC, MMI, and Paint Consumables (fire `input`+`change` on each).
3. Neutralize stray image click‑targets: set every `<img>` `pointer-events:none` (avoids mis‑clicks).
4. Click the **Save** button (`getByText('Save', {exact:true})`, force).
5. Accept any confirmation: loop up to 3× clicking a visible **OK** button.
6. Re‑navigate to the same URL and **verify**: count PART rows where `PDC<i>` is non‑empty
   (`filled`) vs empty, and read back `MPWCB1.checked` + `MPWCV1.value`.
   - **Success = `empty == 0`** (every named part row has a condition) **and** Paint chk=true, val=500.00.

Auto‑accept JS dialogs throughout (`page.on('dialog', d => d.accept())`).

---

## 8. Output / done criteria

Console line per case, e.g.:
```
<PLATE> set PDC=41 MISC=11 PAINT[MPWCB1=true MPWCV1=500.00]
<PLATE> VERIFY PDC filled=41 empty=0 | PaintConsum chk=true val=500.00
```
Case is **done** when `filled == set` and `empty == 0`.

---

## 9. Gotchas

- **Order of the cond/misc regexes is load‑bearing** — a later, broader rule (e.g. `panel`) must not
  pre‑empt a specific earlier one (e.g. `lamp panel` → Bent at #12 before generic `\blamp\b`).
- Skip any `PDC`/`MMI` input that is `readOnly` (system‑locked rows).
- Rows with no readable name (`rowName` empty) are skipped — don't invent a condition.
- Run one case per tab; small parallel batches are fine, but if the session dies mid‑run, re‑login
  and re‑run — Save is idempotent (it overwrites the same fields).
- Miscellaneous: only the rows in the table are candidates; we price the ones we recognise and leave
  the rest blank. We never add misc lines that Merimen didn't list.
