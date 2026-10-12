---
name: merimen-pink-required-fields
description: "The PINK (required) boxes on the Adjuster Report I kept leaving empty — what they are and the fixed values to key"
metadata:
  node_type: memory
  type: feedback
---

**User correction (2026-09-19/20): "you missed the red box for all case, pls fill in — these must be filled in."**

On `dsp_estmain` the required-but-easy-to-miss boxes are shaded **pink**. Find them programmatically — they are the only controls whose computed `backgroundColor` is **`rgb(242, 204, 204)`**:
```js
[...document.querySelectorAll("input,select,textarea")]
  .filter(e => getComputedStyle(e).backgroundColor === "rgb(242, 204, 204)" && !String(e.value).trim())
  .map(e => e.name || e.id)
```
Run that check after every report save and fix anything it returns.

## The fixed values (user-confirmed 2026-09-20)
| Field | Label | Value |
|---|---|---|
| `sleINSPECT` | Inspection/Investigation Date | **today's date** |
| `sleNUM_REPDAYS` | Est. Duration of Repair (days) | **25** |
| `ddlbLocClaim` | Acc/Loss Location Type | **City Road** (value `23`) |
| `sleIOCC` / `sleDOCC` / `sleCLMOCC` | Occupation free-text | `OTHERS` (with `ddlbXOCC` = `350` Unemployed) |

## ⚠️ OPTION CODES ARE PER-INSURER — MATCH BY TEXT, NOT BY VALUE (2026-09-23)
`ddlbLossDesc`, `ddlbIOCC`/`ddlbDOCC`/`ddlbCLMOCC` and friends use **different option values for different insurers**. Setting a hard-coded value silently leaves the select empty (and pink):
| | most insurers | Etiqa General Takaful |
|---|---|---|
| Collision- Head to Side | `18` | `20019` |
| Occupation "Others" | `350` (Unemployed) | `800` (Others) |
**Always select by option TEXT** (`[...s.options].find(o => /Head to Side/i.test(o.text))`), never by a remembered numeric id. Same for `ddlbLossDesc` after `ddlbDAMTYPE` is set — the list is only populated once the damage type changes.

## The claimant-DRIVER block turns required once you name a separate driver
Filling `sleCMDnm`/`sleCMDID1` with someone other than the claimant makes the whole `CMD` block pink: `ddlbCMDMARITAL`, `sleCMDAddr1`, `ddlbCMDState`, `ddlbCMDCity`, `sleCMDPostCode`, `ddlbCMDOCC`, `sleCMDDRVEXP`. Fill them the same way as the insured-driver block (marital=Unknown, occupation Others, phone, driving exp = age − 18, relationship Others).

## Phone prefix: pick by TEXT, the option VALUES differ per insurer
`sleIPhone1pref` / `sleDPhone1pref` / `sleCLMPhone1pref` / `sleCMDPhone1pref` do **not**
take `"012"`. Some insurers' lists use `6012-`, others `012`. Setting a guessed value
fails silently and the box stays pink. Match the option by text instead:
```python
rx = r"^6?0?%s-?$" % str(code).lstrip("0")   # "012" -> matches "012" or "6012-"
```
Same lesson as the loss-description codes: **never set a remembered option value, always
select from what the page is actually showing.**

## `slePOLICEDCODE` (PIAM IPD Code) cannot be typed
The options are opaque state codes (`PHG01`…`PHG11`, `TRG01`…`TRG07`) with no district names, so it can only be set correctly through the **Police Station "Browse…" popup**, which fills the station name AND the code together ([[macos-native-dialog-automation]]). Typing the station name by hand leaves the code blank/pink. Either drive the Browse popup or leave it and flag it.

## Two quirks found
- **The occupation text boxes are cleared by any save that doesn't re-send them.** Always set the `ddlbIOCC`/`ddlbDOCC`/`ddlbCLMOCC` dropdowns AND the `sleIOCC`/`sleDOCC`/`sleCLMOCC` text in the SAME submit. After a correct save they read back empty but are no longer pink — that is Merimen satisfied, not a failure.
- **`sleTINTBRAND` (Tint Film Model) can never be saved from the client**: the SELECT and the text INPUT share the name `sleTINTBRAND`, so the select's value wins on submit and the model text is always dropped. **`mleDATEALTERREASON`** likewise never persists (the server ignores it unless a date was actually altered). Both stay pink — flag them, don't keep retrying.

Related: [[merimen-adjuster-report-fields]], [[merimen-az-progress]].
