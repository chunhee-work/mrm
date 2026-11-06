---
name: never-kick-user-login
description: My login checks kicked the user's fresh Merimen logins out repeatedly; only passive checks, sync window session first, hands off while the user logs in
metadata:
  type: feedback
---
Checking a login by opening a Merimen page with a SAVED (older) session logs out the session the user just made in that browser. It happened several times on 2026-11-06 (YUSTRI kept "failing"); the user: "how can you avoid this, you make this mistake all the time".

**Why:** Merimen keeps one session per browser; an old session token used in the same window ends the new one.
**How to apply:** only `mrm.logged_in()` (passive: window's own tab + its own session, fetch only); `mrm.run` syncs the window session first; never touch an account's window while the user is logging in; check once after they say done; no background polling. See [[merimen-idle-logout]], [[merimen-one-login-per-browser]].
