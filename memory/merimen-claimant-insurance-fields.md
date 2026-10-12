---
name: merimen-claimant-insurance-fields
description: "The INS (claimant's own insurance) fields are MANDATORY whenever the bundle has an INS doc — never skip them"
metadata:
  node_type: memory
  type: feedback
---

**User correction (2026-09-11): "you missed all INS information, didn't fill in — please fill in. Need to fill in INS information if the case have it; if don't have, then only leave it."**

"INS information" = our client's **own** insurance, the thing the `INS` document in the bundle holds (our customer's insurance schedule / policy — see [[merimen-document-upload-naming]]). On the Create form (`dsp_clmreg`, Block 2 of [[merimen-claim-subfolder-fields]]) it is these three:

| Field | Label on form | Value |
|---|---|---|
| `ddlb3INSCOID` | Claimant's Insurance Company | our client's OWN insurer |
| `sleTPPOLNO` | Claimant's Policy/Cover Note No. | our client's OWN policy / cover note no. |
| `TPOWN` (checkbox) | "claimant's vehicle is insured with their own comprehensive policy" | TICK |

## ⚠️⚠️ WHY I SILENTLY SKIPPED THESE — THE `TPOWN` GATE (root cause found 2026-09-11)
**`ddlb3INSCOID` and `sleTPPOLNO` ship DISABLED. A disabled field is not submitted, so setting `.value` and saving looks fine and persists NOTHING** (verified: first attempt saved, reloaded, both blank). This is exactly how a whole batch ends up with no INS data and no error anywhere.

**The gate is the checkbox `#TPOWN`** — "Check here if claimant's vehicle is insured with their own comprehensive policy". Its `onclick` (`TPOwnClick(this);checkKFK(this);`) flips `disabled=false` on both fields.

⚠️ **`TPOWN` has an EMPTY `name` attribute** — `document.querySelector("[name=TPOWN]")` returns null and makes it look absent (same trap as `#MTRworkshopbtn`). Use **`document.getElementById("TPOWN")`**.

Working order, every time:
```js
var t=document.getElementById("TPOWN"); if(!t.checked) t.click();   // enables both fields
var s=document.querySelector("[name=ddlb3INSCOID]"); s.value=<COID>; s.dispatchEvent(new Event("change",{bubbles:true}));
var p=document.querySelector("[name=sleTPPOLNO]");  p.value="<policy>"; p.dispatchEvent(new Event("change",{bubbles:true}));
```
then click the **"Next (Save & Return) >>"** anchor (it submits form `ClaimHeader` → `act_clmreg`), and **re-open the form to verify** — never trust the save landing on `dsp_clmheader`.

**Claimant-insurer `ddlb3INSCOID` option values** (stable): Allianz `35` · Etiqa General Insurance `9517` · Etiqa General Takaful `9516` · Liberty `61` · Syarikat Takaful Malaysia Am `72` · Takaful Ikhlas `1713` · Zurich General Insurance `70` · Zurich General Takaful `9616` · Generali `37` · Berjaya Sompo `32` · MSIG `44` · RHB `67` · Tokio Marine `64` · AIG `29` · Pacific & Orient `38` · The Pacific `57`.

**Which number to key:** the claimant document's own primary number — Allianz schedules usually show `Policy No. N/A` so key the **E-Cover Note No.** (`AEKT…`/`AEKN…`); takaful certificates key the **Certificate / E-Certificate / Certificate Ref. No.**; conventional policies key the **Policy Number** verbatim (keep slashes, e.g. `KLM712629/25-01`).

**The rule, exactly:**
- **If the bundle contains the claimant's own insurance at all → FILL ALL THREE. Every case. No exceptions.** This is not optional and not "nice to have"; I have skipped it before and the user had to key it in.
- **Only when the bundle genuinely has no claimant insurance** (no INS schedule, no policy page for our client) → leave them blank and untick, and **say so in the final report** for that case.
- Do **not** date-match — key the policy number that is in the bundle even if its period doesn't cover the accident date ([[merimen-data-conflict-rules]] rule 2).
- Don't confuse it with the at-fault side: `slePOLNO` / `ddlbPOLCOVER` / `slePOLFROM`-`slePOLTO` are the AT-FAULT party's policy (from the I-SEARCH / JPJ SEARCH doc). The INS fields above are OUR client's.

**Why:** Without the claimant's own insurer + policy the case is incomplete and the user has to fix it by hand after the fact.
**How to apply:** Fill them during Create (step 1 of [[merimen-az-progress]]) and verify after save — don't leave it to a FormVerify blocker to remind you, because these fields do not block the save.
