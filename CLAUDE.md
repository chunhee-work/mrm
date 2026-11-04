# MRM — Merimen motor-claim work (read this first, every session)

Reply in **Simplified Chinese**, ALWAYS, even when the user writes in English. Merimen part/field names stay in English.

**Doing cases: do NOT read `TUTORIAL.md` or `HANDOVER.md`.** They are only for setting up a new machine or handing the work to a new agent. For cases, read only the playbook file for each step (table below). Quick check before Merimen work: `bash tools/mrm-bot/doctor.sh`. Memory lives in the repo folder `memory/` (index `memory/MEMORY.md`): write new memories there and commit them. Script arguments, when needed: `tools/mrm-bot/README.md`.

## The rule that matters most
The step playbooks in `playbook/` hold ALL of the user's rules, one file per step. **Before doing a step, Read its playbook file in full, even if you think you remember it.** Long sessions get compressed and rules are lost. Every past mistake came from skipping this.

| Before you… | Read |
|---|---|
| start any batch / anything with Merimen, WhatsApp, Google Sheet, git | `playbook/00-start-and-rules.md` |
| read a case's PDF bundle | `playbook/01-read-documents.md` |
| create a case in Merimen | `playbook/02-create-case.md` **and** `playbook/12-model-choices.md` (which model option for the RC) |
| name photos / publish or re-read the 照片命名台 | `playbook/03-photo-naming.md` **and** `playbook/10-car-models.md` (this model's rare items + names) **and** `playbook/11-car-logos.md` (badge names) |
| fill the Adjuster Report | `playbook/04-adjuster-report.md` |
| set discounts/labour rates, write narratives | `playbook/05-rates-and-narratives.md` |
| upload documents or photos, relabel photos | `playbook/06-upload-docs-and-photos.md` |
| **Select Parts + Labour (Step 2)** | `playbook/07-select-parts-and-labour.md`, `memory/mistakes-log-sinar-batch2.md` **and** `playbook/10-car-models.md` |
| finish any case | add what you learned about that model to `playbook/10-car-models.md` |
| estimate details (conditions, misc, paint, manual parts, qty, comments) | `playbook/08-estimate-details.md` |
| finish a batch: report tables, car-model report, sheet, re-sync after review | `playbook/09-finish-and-report.md` |

## Workflow (one instruction = every case; two phases — user 2026-10-23)
**Start:** `wa_watch.sh` (background) sees chong's file → `python3 tools/batch/intake.py <batch_dir> <msg_id>` (fetch + unzip + case folders + RC pages, ~5 s) → read ONLY the RC pages → `meta_rc.json` → `META=… photos.py model` (builds the page) → publish at once (playbook 00).
**Phase A (no stopping):** 1 read docs → 2 photo model → **publish the 照片命名台 FIRST** (user 2026-11-04: so the user can name photos while Claude works) → 3 create → 4 Adjuster Report → 5 rates → 6 narratives → 7 upload DOC → 8 upload photos with the model's names (user 2026-11-04: upload first, the user may name slowly; a case ALREADY marked 「完成」 is skipped with `DONE_PLATES=…` and `phase_b.py` uploads it with the final names) → **car-model report** (playbook 09 format).
Then push a notification + one line: `照片命名台 ready: <PLATES>`. Start the Step 2 planning agents on the model names now (playbook 07 "head start"); they only plan, nothing is ticked. Also start the 2-min cron that watches each case's 「完成」 (playbook 09). **STOP. Do NOT touch Select Parts, Labour or Miscellaneous until the user says they have finished the 照片命名台.**
**Phase B (per case, as soon as the user presses that case's 「完成」 on the page — or all cases on "done" in chat):** dump db `names`/`orders` → `python3 tools/batch/phase_b.py <batch> <db_dir> <PLATE>` (final names; uploads the photos if not in Merimen yet, else relabel + reorder to the user's names/order and checks; new Step 2 draft + changed names) → 9 planning agents in REVISE mode for the changed names, then ONE `apply_plan.py` run for all cases (ends with `finish.py` auto-fix + checks) → 10 estimate details → 11 Google Sheet. Push a notification when done.
The other stop: a missing document → send `<PLATE> pending <doc>` and continue with the other cases.

## When the user corrects something
1. Fix it in Merimen.
2. Add the rule to the matching `playbook/0X-*.md`, under the right heading, not just to `memory/`.
3. Put it into the scripts (`typesafe/step2_plan.py`, `typesafe/photo_train/name_map.py`, `~/mrm-bot/*.mjs`) when it can be automated.
4. Commit and push.
Ask (with the photo) only when the reason for a change is unclear.

## Never
- Log in with a password, or print/commit any credential (the handoff file, `typesafe/driver.py`). Never run `relogin*.mjs` / `login.mjs` yourself: the user runs `cd ~/mrm-bot && node relogin.mjs`. Never print or commit `~/mrm-bot/session_base.txt`.
- Build Merimen URLs for dsp_docmanage / act_docinfo, or fetch files of other accounts' cases. Both log the session out.
- Close the automation Chrome window (port 9222). keepalive.mjs must be running.
- Pipe a script that saves into `| head`.
