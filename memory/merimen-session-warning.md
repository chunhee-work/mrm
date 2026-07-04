---
name: merimen-session-warning
description: "Always click 'Continue Session' on Merimen's Session Expiration Warning popup"
metadata:
  node_type: memory
  type: feedback
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

Rule (user, 2026-07-02): When Merimen shows the **"Session Expiration Warning"** popup ("Your session is about to expire. You will be logged out in: N seconds") with **Continue Session** / **Logout** buttons, ALWAYS click **Continue Session** (never Logout). This keeps the session alive so in-progress form work isn't lost.

**How to apply:** While driving Merimen via chrome-control, if this popup appears, immediately click the button whose text matches /continue session/i (it's a `<button>`). Do NOT click Logout. Then resume the task.

Related: [[merimen-create-case-procedure]], [[motor-claim-adjuster-workflow]].
