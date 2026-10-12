# TypeSafe judgments for the Merimen pipeline

Replaces five pieces of fragile parsing with TypeSafe System One judgments.
Python 3.9-safe: talks to the HTTP API directly (`typesafe-sdk` needs ≥3.10).

## Setup

    export TYPESAFE_API_KEY='ts-...'        # put this line in ~/.zshrc
    source ~/.zshrc
    python3 typesafe/run_eval.py            # measures #2 against real corrected cases

Never commit the key. `.gitignore` covers `.env` and `*.key`; this repo has a public
GitHub remote.

## What each judgment replaces

| # | Replaces | Primitive | Gate |
|---|---|---|---|
| 1 | `cond()` — 24 ordered regexes → damage condition, silent `Bent` fallback | Choice ×N (one request per case) | 0.60 |
| 2 | `pick_model_by_year()` — regex + `[MM/YY-MM/YY]` parsing | Choice over live options + 2 Nouls | 0.70, plus hard stop when trim is not stated |
| 3 | `misc()` — 15 ordered regexes, unrecognised line silently unpriced | Choice → category; **price looked up in code** | 0.60 |
| 4 | reading the PDF bundle by eye | Choice + 3 Nouls per page | 0.60 |
| 5 | eyeballing the police narrative for loss description | Choice ×2 over live options | 0.65 |

## Principles held to

- **Select, never generate.** Candidates are the live Merimen `<option>` texts, so
  per-insurer codes (Etiqa's `20019` vs everyone else's `18`) stop mattering.
- **Money stays in code.** #3 classifies the line; `MISC_PRICES` sets the amount.
- **Every closed set has `__none__`.** "No match" is an outcome, not a fallback.
- **Batch.** Independent questions go in one request — one call per case, not per row.
- **Unchanged in code:** fixed defaults (10/0, 30×4, paint 500, est band, manager/adjuster),
  form mechanics (`forms.X.submit()`, TPOWN unlock, pink-field scan), betterment
  (Merimen computes it), all date arithmetic.

## Baseline to beat

`eval_cases.json` holds 8 real cases from the Aug–Sep batches. The old regex picked
the wrong variant in **6 of 8** — every one of those needed a manual fix in Merimen,
and a model change costs RM12 once the 3-day window closes.

## Privacy note

#1, #2, #3 and #5 send vehicle/parts/narrative data only — no names, NRIC or addresses.
#4 needs the claimant's name and plate to detect misfiled pages; it is the only one that
sends personal data to a third-party API. Decide that one deliberately.
