---
name: jev-in-workflow
description: Where Jev (TypeSafe) is used in the MRM workflow since 2026-11-10, and where it was tested and rejected
metadata:
  type: project
---
User 2026-11-10: "jev is fast and cheap — add it where it speeds up and is 精准; 可有可无 ones don't add". Cost is not a concern (user).
**In use:** (1) page_index.py (intake, page types; step 1 reads page_index.json first; maybe_missing is a draft only), (2) phase_a jev_options (insurer + Liberty branch, warn only), (3) wa_route.py via wa_watch.sh (file rules + Jev gate; texts never auto-acted), (5) sync_check Jev >= 0.7 may only CLEAR false alarms, (6) photo second opinion in predict_case (old).
**Rejected after tests:** Step 2 jev_prefill (user: 可有可无), part condition (rules ~100%), photo LH/RH (Jev 28% vs model 73%), model variant + loss desc votes (marginal), city / state / police station (code better).
**Why:** measured tests typesafe/jev_*test.py; Jev scores vary between runs, so it never adds warnings or decides "pending" alone.
**How to apply:** measure the next batch's real timing vs batch 9 and report (expected 30–40% less Claude time). Related: [[step2-model-ab-test]].
- Batch 10 measured (2026-11-11, 2 cases): sync_check false alarms pre-Jev 13 -> code fixes 10 -> with Jev 4 (Jev cleared 60%); insurer check 2/2 agree (no catch); page index ~10 s, no reading time saved on 8-page bundles; WhatsApp: chong's text + I-SEARCH photo caught with the right plate (NBJ6603) -> VBK3162 policy fixed same hour.
