---
name: merimen-idle-logout
description: Idle Merimen accounts log out after 30-60 min even with keepalive clicking Continue Session; only an account in real use stays in
metadata:
  type: project
---
Tested 2026-11-06 with 4 account windows (TC0607 9222, NVISSAC 9223, YUSTRI 9224, CHONGAIAI 9225): keepalive.mjs clicked "Continue Session" in every window, but NVISSAC/YUSTRI/CHONGAIAI were logged out 30-60 min after login when nothing used them. TC0607 stayed in because it was really working (case work + rare-photo harvest).

**Why:** Merimen ends idle sessions server-side; the Continue Session click alone does not keep them.
**How to apply:** treat the non-TC0607 accounts as normally logged out. At the start of a batch for one of them, check login and, if out, push "<ACCOUNT> 要登录（按 Macfleet 的 <ACCOUNT> 按钮）". The user is fine with idle accounts being logged out. Related: [[merimen-one-login-per-browser]].
