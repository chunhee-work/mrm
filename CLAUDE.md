# MRM — Merimen motor-claim work (read this first, every session)

Reply in **Simplified Chinese**. Merimen part/field names stay in English.

**Doing cases: do NOT read `TUTORIAL.md` or `HANDOVER.md`.** They are only for setting up a new machine or handing the work to a new agent. For cases, read only the playbook file for each step (table below). Quick check before Merimen work: `bash tools/mrm-bot/doctor.sh`. Memory lives in the repo folder `memory/` (index `memory/MEMORY.md`): write new memories there and commit them. Script arguments, when needed: `tools/mrm-bot/README.md`.

## The rule that matters most
The step playbooks in `playbook/` hold ALL of the user's rules, one file per step. **Before doing a step, Read its playbook file in full, even if you think you remember it.** Long sessions get compressed and rules are lost. Every past mistake came from skipping this.

| Before you… | Read |
|---|---|
| start any batch / anything with Merimen, WhatsApp, Google Sheet, git | `playbook/00-start-and-rules.md` |
| read a case's PDF bundle | `playbook/01-read-documents.md` |
| create a case in Merimen | `playbook/02-create-case.md` |
| name photos / publish or re-read the 照片命名台 | `playbook/03-photo-naming.md` |
| fill the Adjuster Report | `playbook/04-adjuster-report.md` |
| set discounts/labour rates, write narratives | `playbook/05-rates-and-narratives.md` |
| upload documents or photos, relabel photos | `playbook/06-upload-docs-and-photos.md` |
| **Select Parts + Labour (Step 2)** | `playbook/07-select-parts-and-labour.md` **and** `memory/mistakes-log-sinar-batch2.md` |
| estimate details (conditions, misc, paint, manual parts, qty, comments) | `playbook/08-estimate-details.md` |
| finish a batch: report tables, car-model report, sheet, re-sync after review | `playbook/09-finish-and-report.md` |

## Workflow (one instruction = every case, 0→100%, never stop to ask)
1 read docs → 2 create → 3 photos into 照片命名台 → 4 Adjuster Report → 5 rates → 6 narratives → 7 upload DOC → 8 upload photos → 9 Select Parts + Labour (look at the photos) → 10 estimate details → 11 Google Sheet → 12 car-model report (RC vs Merimen model, ⚠️ when no price data).
The only stop: a missing document → send `<PLATE> pending <doc>` and continue with the other cases. Push a notification when the batch is done.

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
