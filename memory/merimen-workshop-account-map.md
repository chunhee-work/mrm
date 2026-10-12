---
name: merimen-workshop-account-map
description: "Which Merimen login to use for a batch — decided by the workshop the cases belong to"
metadata:
  node_type: memory
  type: project
---

Rule (user, 2026-08-29): **the Merimen account to log in with depends on the WORKSHOP the batch belongs to.** Check the Desktop workshop folder ([[workshop-from-desktop-folder]]) BEFORE logging in — using the wrong account means the cases land in the wrong agency.

| Workshop | Merimen agency | User ID |
|---|---|---|
| Sinar Gemilang · Extreme · Lee Kean Hin | **Autoris Adjusters Sdn Bhd (HQ)** | `TC0607` |
| Autoflex | **Ampang Newvest** | `NVISSAC` |

Passwords are deliberately NOT written here — this repo is on a GitHub remote, and the existing memory redacts login details the same way (`<LOGIN — local only, redacted from repo>`). Ask the user for the password of whichever account the batch needs, per session.

**How to apply:** Count the Desktop case folders → identify the workshop → pick the account from this table → ask the user for that account's password (never type credentials from guesswork) → log in → proceed with [[merimen-az-progress]]. A batch that mixes workshops across DIFFERENT agencies must be split into separate logins; Sinar/Extreme/Lee Kean Hin can all be done in one Autoris session (as in the 2026-08-29 sinar+LKH batch).

Related: [[merimen-create-case-procedure]], [[motor-claim-adjuster-workflow]], [[merimen-session-timeout-workflow]].
