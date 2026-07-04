---
name: workshop-from-desktop-folder
description: "Desktop folder name for a case = which workshop to select in Merimen"
metadata:
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

Rule (2026-07-02): On the user's Desktop, case PDFs/photos are grouped into folders **named by WORKSHOP**. The folder name tells you which Workshop/Repairer to select in the Merimen "Edit Claim Subfolder" form. Inside each workshop folder are per-case subfolders named by plate (e.g. `~/Desktop/extreme/CBT3040/`), each containing the claim PDF (`<plate> <workshop>.pdf`) + numbered photos.

Known workshop folders → Merimen workshop (confirm exact name via the Workshop **Lookup...** search):
- `extreme` → Extreme (workshop). e.g. ~/Desktop/extreme/CBT3040, CCX3911, CDN5619, CFG3362, WLW551, WUG466, WUN7241.
- `sinar` → Sinar Gemilang = "Bengkel Kereta Sinar Gemilang (HQ)" (the workshop used in the BKH9821 example).

**How to apply:** When the user names a case, find its folder under the matching workshop folder on Desktop, read the PDF for claim data, and in Merimen pick the workshop matching the parent folder name (use the Lookup search box, type the folder name, pick the match).

**A case may be SPLIT across several PDFs (2026-07-03).** A case folder can contain multiple PDFs — read ALL of them. Document/file naming convention (matches Merimen's Documentation list labels RC/INS/P.REPORT/JPJ SEARCH):
- **RC** = Sijil (JPJ Sijil Pemilikan Kenderaan — OUR client's vehicle ownership cert).
- **INS** = OUR customer's own insurance.
- **P.REPORT** = police report(s).
- **JPJ SEARCH** = the **对方保单 = the AT-FAULT party's insurance/policy** (the vehicle-detail/I-SEARCH page for the party we claim against). So the "JPJ SEARCH <plate>.pdf" file holds the at-fault insurer + policy no + period + coverage. e.g. for TCL730 read `~/Desktop/sinar/JPJ SEARCH TCL730.pdf` for the at-fault policy.

**PDF > 5 MB rule (2026-07-03):** If a case PDF exceeds 5 MB, try to COMPRESS it yourself (e.g. Ghostscript `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -o out.pdf in.pdf`, or similar) so Merimen upload accepts it; if you cannot compress it, tell the user so they compress it manually. (The Read tool itself handles big PDFs fine — the 5 MB limit is about the Merimen document upload.)

**Workshop Lookup — WORKING METHOD (2026-07-02):** On the Create Motor Claim form, the Workshop field (`ddlbREPCOIDTEXT` display + `ddlbREPCOID` hidden COID) is set via a **Lookup...** popup (`MTRworkshopbtn`). 
- Claude CANNOT open the popup (synthetic clicks are popup-blocked; only a real user click opens it). So ask the USER to click **Lookup...** once.
- Once open, the popup is a controllable tab (about:blank, title "Find..." → "Company List"). Claude DRIVES it via chrome-control with that tab_id: (1) set the single `input[type=text]` (the KEYWORD box) to the workshop name e.g. "extreme auto" + fire input/change; (2) click the **Search** button; (3) click the result `<td>` whose text contains the workshop (e.g. "Motor Repairer - Extreme Auto Car Care - Kuantan") — a delegated handler sets `ddlbREPCOIDTEXT` + `ddlbREPCOID` on the opener form and closes the popup.
- The direct XML endpoint search (`&S=`/`&KEYWORD=` GET/POST) does NOT filter server-side, so don't bother — drive the popup UI instead.
- **After the popup selection, re-set `ddlbDAMTYPE` = "Collision"** — the re-render on selection can clear the Damage Type dropdown; verify/re-set it.

Related: [[merimen-claim-subfolder-fields]], [[motor-claim-adjuster-workflow]].
