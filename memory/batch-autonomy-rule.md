---
name: batch-autonomy-rule
description: "Run the whole A-Z on the first instruction — do not stop mid-batch to ask for confirmation"
metadata:
  node_type: memory
  type: feedback
---

User rule (2026-08-29): **"proceed, next time don't need to ask, do A-Z with my first instruction."**

When the user says something like "do sinar and lkh in my desktop", that single sentence authorises the ENTIRE A-Z for every case in those folders — create → adjuster report → estimate discounts/labour → narratives → upload → sheet rows. Do not pause at milestones for approval, and do not ask which option to use when a memory rule or a sensible default already covers it.

**Still allowed to interrupt for:** a genuine blocker where no default exists and guessing is unrecoverable (e.g. missing source files, a fixed org-specific value that is not recorded anywhere — the Manager name, a locked-after-save Insurer/Branch with no precedent). Ask those in ONE batch, keep working on everything else meanwhile, and report anomalies in the final summary instead of mid-flow.

## ⛔⛔ "DO ALL STEPS A-Z" — DON'T STOP AFTER CREATE (user correction, 2026-09-19)
**"Moving forward take note do all step A-Z."** Said after I created 9 cases and then stopped and reported, so the user had to come back with *"proceed a-z step u missed the step."*

One instruction covers the WHOLE chain, per case, without being told again:
1. **Create** (+ Manager/Adjuster on `dsp_adjclmref` — this is part of create, not a separate ask)
2. **Adjuster Report** — every field ([[merimen-az-progress]] §2)
3. **Estimate page** — Part Discount 10 / Special 0 / Labour 30×4, and READ the `[X yr(s) - Y%]` betterment
4. **Narratives** — all 5 (500/510/520/530→WITHOUT PREJUDICE/540)
5. **Upload** the source PDFs ([[merimen-document-upload-naming]])
6. Then the completion table + Google-Sheet rows ([[batch-completion-report-format]], [[merimen-sheet-workshop-names]])

Finishing one stage across the batch is NOT finishing. Go case-by-stage all the way to upload, then report once at the end. The only legitimate stops are: a truly blocked case (set it aside, [[merimen-pending-case-line-format]]), a lost capability (e.g. Accessibility revoked — see [[macos-native-dialog-automation]]), or **STEP 2 / part selection, which genuinely waits on the user** ([[merimen-step2-estimate-detail-fill]]).

**Work the batch in PARALLEL TABS** (user re-confirmed 2026-09-19: *"do faster multiple case on 1 time, like before"*) — one tab per case, threads driving them concurrently, not a sequential per-case loop.

## ⛔ NEVER LET A BLOCKED CASE STOP THE BATCH (user rule, 2026-09-10)
**"Moving forward, for those cases that are missing information and would stop you — leave it first, proceed with those cases that can be done first."**

So when a case is missing something that genuinely blocks it (no photos, no police report, no at-fault JPJ/insurance, unreadable key field with no rule to fall back on):
1. **Set it aside immediately** — do not stop, do not ask mid-batch, do not fabricate values to force it through.
2. **Carry on with every other case in the batch** and finish them fully A-Z.
3. **Report the set-aside ones at the END**, one line each: which case, exactly what is missing, and what is needed to finish it.

This generalises the "no photos → pass the case" rule in [[merimen-missing-photo-data-rules]] to ANY blocking data gap. The only thing that still justifies stopping the whole batch is when NOTHING is workable — e.g. the source folder itself is missing or holds no claim documents at all.

**Why:** The user does these batches repeatedly and does not want a round of questions each time; interruptions cost more than the occasional documented assumption.
**How to apply:** Apply [[merimen-data-conflict-rules]] silently, follow [[merimen-az-progress]] top-to-bottom, and surface everything at the end. Related: [[merimen-create-case-procedure]].

## 2026-10-16 (re-stated, with the photo-artifact workflow): "moving forward no need to stop and ask me — start 0–100% to the end; the only thing that can stop you is a missing DOC."
Run Step 1 (create + adjuster report + estimate setup + narratives + upload) → photo artifact as soon as the model is chosen ([[case-workflow-order]]) → Step 2 after the user finishes the artifact, without check-ins. Missing documents → `<PLATE> pending <doc>` line ([[merimen-pending-case-line-format]]) and keep going with the other cases. Never show "confirm before save" tables any more.
Merimen (2026-10-16, still true for the USER'S normal Chrome): build NO URLs with CFID/CFTOKEN there — Merimen logs the session out ("suspected intrusion"). Navigate only by clicking links/buttons inside the logged-in tab (search box SRCH + "Go" → case link → page links).

2026-10-16 (user): **"when i said do then means all, not just 1"** — an instruction covers EVERY case in the batch; never finish one case and report back.


## 2026-10-17 — final form: [[merimen-batch-workflow]]
Do it all 1→100%. The ONLY stop is a missing document: send the copy line, proceed with the others, never ask. Automation goes through the 9222 Chrome scripts (session_base URLs OK there). Send a push notification when the batch is done.
