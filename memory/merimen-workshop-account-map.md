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
| Shen Wah Auto Services Sdn Bhd | **Rawang** | `YUSTRI` |

Login commands (the USER runs them): TC0607 `cd ~/mrm-bot && node relogin.mjs` · NVISSAC `cd ~/mrm-bot && node relogin_nv.mjs` · YUSTRI `cd ~/mrm-bot && node relogin_rw.mjs` (user 2026-10-21).

Passwords are deliberately NOT written here — this repo is on a GitHub remote, and the existing memory redacts login details the same way (`<LOGIN — local only, redacted from repo>`). Ask the user for the password of whichever account the batch needs, per session.

**How to apply:** Count the Desktop case folders → identify the workshop → pick the account from this table → the user runs `cd ~/mrm-bot && node relogin.mjs` (Claude never handles passwords) → proceed with [[merimen-az-progress]]. A batch that mixes workshops across DIFFERENT agencies must be split into separate logins; Sinar/Extreme/Lee Kean Hin can all be done in one Autoris session (as in the 2026-08-29 sinar+LKH batch).

Related: [[merimen-create-case-procedure]], [[motor-claim-adjuster-workflow]], [[merimen-session-timeout-workflow]].
