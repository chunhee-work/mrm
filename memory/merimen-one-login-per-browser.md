---
name: merimen-one-login-per-browser
description: One Merimen account per browser profile; the user has 2 Chrome profiles + Safari, so 3 accounts can be logged in at once
metadata:
  type: reference
---
Merimen keeps ONE logged-in account per browser profile: logging another account into the same Chrome kicks the first one out (user 2026-11-06).
The user has 2 Google Chrome profiles ("chun" and "Chun Hee (ark.tg)") plus Safari -> up to 3 accounts at the same time (e.g. TC0607 for cases + another account for background jobs).

Fixed map (user 2026-11-06): TC0607 = Chrome on port 9222, NVISSAC = 9223, YUSTRI = 9224 (window "20010"), CHONGAIAI = 9225 (~/mrm-bot/login.sh).

**How to apply:** keep case work (TC0607) in the automation Chrome on port 9222; anything that needs a second account (harvest, another workshop's cases) goes in a separate profile/browser, which the user logs in themselves. Never log in for the user. See [[whatsapp-download-trigger]].
