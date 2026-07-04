---
name: workshop-from-desktop-folder
description: "Desktop folder name for a case = which workshop to select in Merimen"
metadata:
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

Rule (2026-07-02): On the user's Desktop, case PDFs/photos are grouped into folders **named by WORKSHOP**. The folder name tells you which Workshop/Repairer to select in the Merimen "Edit Claim Subfolder" form. Inside each workshop folder are per-case subfolders named by plate (e.g. `~/Desktop/extreme/CBT3040/`), each containing the claim PDF (`<plate> <workshop>.pdf`) + numbered photos.

Known workshop folders → Merimen workshop + the exact **Lookup search keyword** (the search matches from the START of the workshop's name, so use these exact terms):
- `extreme` → **"Extreme Auto Car Care" (COID 72619)** — Lookup search **`extreme auto`** (user rule 2026-07-04). e.g. ~/Desktop/extreme/CBT3040, CCX3911, CDN5619, CFG3362, WLW551, WUG466, WUN7241.
- `sinar` → **"Bengkel Kereta Sinar Gemilang" - Kemaman (COID 29709)** — Lookup search **`bengkel kereta sinar`** (NOT "sinar" — the name starts with "Bengkel", and the search is beginning-match). Avoid the look-alike "Bengkel Kereta Sinar Jaya".

**How to apply:** When the user names a case, find its folder under the matching workshop folder on Desktop, read the PDF for claim data, and in Merimen pick the workshop matching the parent folder name (use the Lookup search box, type the folder name, pick the match).

**A case may be SPLIT across several PDFs (2026-07-03).** A case folder can contain multiple PDFs — read ALL of them. Document/file naming convention (matches Merimen's Documentation list labels RC/INS/P.REPORT/JPJ SEARCH):
- **RC** = Sijil (JPJ Sijil Pemilikan Kenderaan — OUR client's vehicle ownership cert).
- **INS** = OUR customer's own insurance.
- **P.REPORT** = police report(s).
- **JPJ SEARCH** = the **对方保单 = the AT-FAULT party's insurance/policy** (the vehicle-detail/I-SEARCH page for the party we claim against). So the "JPJ SEARCH <plate>.pdf" file holds the at-fault insurer + policy no + period + coverage. e.g. for TCL730 read `~/Desktop/sinar/JPJ SEARCH TCL730.pdf` for the at-fault policy.

**PDF > 5 MB rule (updated 2026-07-04):** When checking a case's files, **tell the user which PDF(s) exceed 5 MB, then COMPRESS each to under 3 MB and save it** (Merimen upload needs small files). Ghostscript/poppler are NOT installed on this Mac — use the **PyMuPDF** script `scratchpad/compress_pdf.py "<path>"` (installed via `pip install PyMuPDF`). Method: re-render each page to JPEG and rebuild the PDF, adaptively dropping DPI (140→96) until <3 MB; keeps document text legible at ~120 DPI. Saves alongside the original as `<name>_compressed.pdf`. (Verified 2026-07-04: a 17 MB scan → 2.68 MB at DPI 120 / q62.) The Read tool itself handles big PDFs fine — the size limit is only about the Merimen upload.

**Workshop Lookup — WORKING METHOD (2026-07-02):** On the Create Motor Claim form, the Workshop field (`ddlbREPCOIDTEXT` display + `ddlbREPCOID` hidden COID) is set via a **Lookup...** popup (`MTRworkshopbtn`). 
- Claude CANNOT open the popup (synthetic clicks are popup-blocked; only a real user click opens it). So ask the USER to click **Lookup...** once.
- Once open, the popup is a controllable tab (about:blank, title "Find..." → "Company List"). Claude DRIVES it via chrome-control with that tab_id: (1) set the single `input[type=text]` (the KEYWORD box) to the workshop name e.g. "extreme auto" + fire input/change; (2) click the **Search** button; (3) click the result `<td>` whose text contains the workshop (e.g. "Motor Repairer - Extreme Auto Car Care - Kuantan") — a delegated handler sets `ddlbREPCOIDTEXT` + `ddlbREPCOID` on the opener form and closes the popup.
- The direct XML endpoint search (`&S=`/`&KEYWORD=` GET/POST) does NOT filter server-side, so don't bother — drive the popup UI instead.
- **After the popup selection, re-set `ddlbDAMTYPE` = "Collision"** — the re-render on selection can clear the Damage Type dropdown; verify/re-set it.

Related: [[merimen-claim-subfolder-fields]], [[motor-claim-adjuster-workflow]].
