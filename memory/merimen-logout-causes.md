---
name: merimen-logout-causes
description: "Why the automation Merimen session logged out (2026-10-17..20) and the rules to prevent it; keepalive.mjs must be running"
metadata:
  type: feedback
---

User 2026-10-20: "I need to avoid this situation happen. As I said must click continue session always."

**Causes seen:**
1. **No keepalive on the automation Chrome.** typesafe/photo_train/merimen_keepalive.py only watches the user's normal Chrome (AppleScript). The CDP Chrome on port 9222 had nothing clicking "Continue Session", so it idled out over the weekend.
2. **Automation Chrome window closed.** Session cookies are lost and every script fails ("Browser context management is not supported" / "Session Timeout").
3. **Logging in on another Chrome** with the same account. When the user logs in on their normal Chrome, the automation session drops; it happened twice right after such a login.
4. **Risky requests from a CDP page** made Merimen log out as "suspected intrusion":
   - fetching dsp_getfile for docids of other accounts' cases (old harvest photos);
   - calling JSVCopenWinPost(act_docinfo … action=DEL) to revoke a photo.

5. **Opening dsp_docmanage (Relabel/Reorder) by building its URL** (coid=45667, docclassid=2) logged the session out at once (2026-10-20). Normal page URLs (dsp_details, dsp_estmain, dsp_selection, dsp_docview, dsp_docupload) are fine.

**Rules:**
- Always run `~/mrm-bot/keepalive.mjs` in the background (`nohup node keepalive.mjs >> keepalive.log &`). It clicks Continue Session in every Merimen tab of the 9222 Chrome every 15 s. Check it with `ps aux | grep keepalive.mjs` at the start of every batch and after each relogin.
- Keep one Merimen tab open (dsp_home) in the automation Chrome, and never close its window.
- **Close leftover tabs** (user 2026-10-20): scripts that fail, and some like labourfill/estfill, leave Merimen tabs open (16 at one point). After each batch step and at the end, close every page in the 9222 Chrome except one Merimen tab.
- Never build URLs for dsp_docmanage / act_docinfo. Relabel photos only through the docview page's own "Relabel/Reorder" link (UI click opens a popup; the photo one is the link whose page has many ONM fields). `~/mrm-bot/relabel_ui.mjs <cid> <ext> '{"pos":[old,new]}' save` does this and was verified on 7 cases on 2026-10-20 without a logout.
- Do not fetch files of cases outside the current account, and leave revoke/delete calls to the end of a batch (or ask the user to do them in the UI).
- After any logout: one line asking the user to run `cd ~/mrm-bot && node relogin.mjs`, then continue.

Related: [[merimen-batch-workflow]], [[merimen-session-warning]].
