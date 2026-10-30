# 01 · Read the documents (step 1)

## Where the case files are
- Desktop: `~/Desktop/<workshop>/<PLATE>/` — the parent folder = the workshop; the case folder holds the PDF(s) (`<plate> <workshop>.pdf`) + numbered photos. [workshop-from-desktop-folder]
- WhatsApp zip: `<workshop>/<PLATE>/*.JPG` (downloaded to ~/Downloads).
- ⭐ **The case PDF can sit at the TOP of the zip, next to the folder** (`LKH .zip`: `PRY826/` photos + `PRY826 adj.pdf` at the root). List with `unzip -Z1 <zip>` (full names — names contain spaces) and move every PDF into its case folder before saying a document is missing (user 2026-10-30; I wrongly reported PRY826 pending). [case-photo-naming-artifact]
- Folder named `(TOTALOST)` / `TOTAL LOSS` (e.g. `BGF2916 (TOTALOST)`) = TOTAL LOSS case; PDF usually `<plate> DOC - total loss ….pdf`. [workshop-from-desktop-folder]
- Count the cases first; read ALL cases' PDFs + photos up front (names, NRIC, policies, vehicle, accident, odo, colour, damage zone) before touching Merimen. [merimen-create-case-procedure]
- If the source folder is gone, pull the uploaded PDFs back from Merimen: dsp_docview → `SVCDOCAttView(<docid>,4,'PDF')` → navigate a Chrome tab to the dsp_getfile URL for that docid (only cases of this account); move/rename from ~/Downloads at once (next download reuses the name). curl does not work (needs HttpOnly cookies). [merimen-document-upload-naming]

## Reading the bundle
- A case may be split across several PDFs and page order may jump: read ALL files, work out which page is which, report missing pages. [claim-extraction-output-format] [workshop-from-desktop-folder]
- Read PDFs with the Read tool. Scans have no text layer: render pages with PyMuPDF into one contact sheet per case to find pages, then re-render the page at ~230 dpi to read numbers. [merimen-document-upload-naming]
- ⭐ **Unclear word or digit → zoom in and key your best reading; don't ask the user** (user 2026-10-30: "try ur best"). (was: "never guess, flag it") [claim-extraction-output-format] [car-part-item-names]
- Full bundle pages: (1) JPJ Sijil Pemilikan Kenderaan = our client's RC; (2–3) our client's insurance schedule; (4) police investigation result (Keputusan Penyiasatan Kes); (5) other party police report; (6) our party police report; (7) sketch (Rajah Kasar) = ignore; (8) other party vehicle + insurance (I-SEARCH / JPJ SEARCH). [claim-extraction-output-format]
- Each bundle has TWO insurances: our client's own (INS) and the at-fault party's (JPJ SEARCH). [claim-extraction-output-format] [workshop-from-desktop-folder]
- File-label meaning: RC = our client's ownership cert; INS = our client's own insurance; P.REPORT = police report(s); JPJ SEARCH = 对方保单 = the at-fault party's insurance/I-SEARCH page. [workshop-from-desktop-folder]

## Parties
- Every case is a Third Party (TPPD) claim lodged against the AT-FAULT party's insurer. [motor-claim-adjuster-workflow]
- Claimant = OUR client = the not-at-fault party (pengadu); their RC + own insurance are in the bundle. [merimen-create-case-procedure]
- Lock the at-fault party in two steps: (1) police Keputusan Penyiasatan names the "disalahkan" plate; (2) the at-fault insurer = the JPJ SEARCH / I-SEARCH page for THAT exact plate. The plates must match. [workshop-from-desktop-folder]
- An insurance doc naming a different plate is misfiled from another case → ignore it; never pick by "which doc looks more complete". [workshop-from-desktop-folder]
- JPJ SEARCH is usually the last page but NOT always: read the whole PDF and look for the second insurance-search page naming a different insurer/plate than our client. Never mark a case "no at-fault JPJ" before reading every page (BMB8496, STA8148A, VMJ6957, VNL7354 were wrongly skipped). [workshop-from-desktop-folder]
- ⭐⭐ **Chain collision — never ask (user 2026-10-30):** claim against the car whose insurance IS in the bundle (normally the one that directly hit our client), even when the police blame a car further back. Just do it; no question to the user.
- Chain collision: claim against the vehicle that DIRECTLY hit our client; the party whose insurance is provided in the bundle is the one (CCX3911 → WGQ4340, not the summoned WRD9621; VFA1371 → middle car TCP6855). [motor-claim-adjuster-workflow]
- Insured = at-fault OWNER; owner unknown or owner has no NRIC → Insured = the at-fault DRIVER. [merimen-data-conflict-rules] [merimen-az-progress]
- Insured Driver = the at-fault driver (from the at-fault police report). [merimen-adjuster-report-fields]
- Accident date/time = Tarikh & Masa Kejadian on the police investigation page; it is also the date for policy matching. [merimen-create-case-procedure] [claim-extraction-output-format]

## Data-conflict rules
- Document content beats file/folder names (folder `PMV7499`, docs `PMW7499` → case is PMW7499). [merimen-data-conflict-rules]
- Claimant's own policy/cover note: always key the number in the bundle; never date-match it to the accident. [merimen-data-conflict-rules] [merimen-claimant-insurance-fields]
- At-fault policy: pick the policy whose period covers the accident date (I-SEARCH may list several). [claim-extraction-output-format]
- Policy-number conflict between I-SEARCH and another doc for the same period → use the I-SEARCH number. [claim-extraction-output-format]
- At-fault Policy Cover = whatever the I-SEARCH row says (e.g. "TP, Fire & Theft", Third Party); if the bundle doesn't say → Comprehensive, don't ask. [merimen-data-conflict-rules] [merimen-az-progress]
- RC vs insurance schedule conflict (chassis no., CC…) → either value is fine; pick one and move on. [merimen-data-conflict-rules]
- Vehicle model: use the JPJ cert "Buatan/Nama Model" code (e.g. TOYOTA / WISH DBA-ZGE20G), never the chassis prefix (VFA1371 chassis ZGE25 ≠ model DBA-ZGE20G). [merimen-claim-subfolder-fields]
- EV (watts, not CC): do the other cases first; come back only if Merimen won't accept it. [merimen-data-conflict-rules]

## Missing data
- No usable photos at all → pass the case (pending), finish all others, report at the end. [merimen-missing-photo-data-rules]
- No at-fault insurance / no police report / unreadable key field with no rule → pending line, carry on. [batch-autonomy-rule]
- No claimant insurance in the bundle → NOT a blocker: leave the INS fields blank, untick TPOWN, say so in the final report. [merimen-claimant-insurance-fields]
- Odometer unreadable (LCD off / no cluster photo) → key `0`; never blank, never guess. [merimen-missing-photo-data-rules]
- Colour → what the PHOTO shows, even if wrapped in film (SMG5678 pink/rose); never the catalogue/document colour. [merimen-missing-photo-data-rules]

## Insurers (claimant's insurer `ddlb3INSCOID` values)
- Allianz `35` · Etiqa General Insurance `9517` · Etiqa General Takaful `9516` · Liberty `61` · Syarikat Takaful Malaysia Am `72` · Takaful Ikhlas `1713` · Zurich General Insurance `70` · Zurich General Takaful `9616` · Generali `37` · Berjaya Sompo `32` · MSIG `44` · RHB `67` · Tokio Marine `64` · AIG `29` · Pacific & Orient `38` · The Pacific `57`. [merimen-claimant-insurance-fields]
- Which number to key: Allianz schedules with "Policy No. N/A" → the E-Cover Note No. (AEKT…/AEKN…); takaful → Certificate / E-Certificate / Certificate Ref. No.; conventional → Policy Number verbatim, slashes kept (e.g. `KLM712629/25-01`). [merimen-claimant-insurance-fields]
- Other dropdown option codes differ per insurer (Etiqa General Takaful uses different values) → always select by option TEXT. [merimen-pink-required-fields]

## Fields to extract per case
- RC (our client): JPJ Log Book No (code in the TOP-RIGHT corner), plate, owner name, NRIC, address (Alamat), chassis no., engine no., Keupayaan Enjin (CC), Buatan/Nama Model, Status Asal, Kelas Kegunaan, Jenis Badan + Tahun, Tarikh Pendaftaran (= JPJ Reg Date, drives betterment). [claim-extraction-output-format] [merimen-adjuster-report-fields]
- Status Asal → Assembly Type: Pemasangan Tempatan = Locally Assembled; Kenderaan Import Terpakai = Reconditioned; Kenderaan Import Baru = New Import; ignore "Rebuild". [merimen-adjuster-report-fields]
- Our INS: insurer, E-Cover Note No., Policy No. [claim-extraction-output-format]
- Police investigation: report no. (no spaces, e.g. `TRAFIKKUANTAN/008375/26`), report date/time, place, accident date/time, disalahkan plate. [claim-extraction-output-format] [merimen-adjuster-report-fields]
- Police reports (each party): name, NRIC, address, phone (Butir Pengadu); our client's report no. goes into narrative 510. [claim-extraction-output-format] [merimen-adjuster-report-fields]
- At-fault vehicle: plate, insurer, policy no., effective/expiry dates, E-Cover Note (tick cover-note box), cover type, owner + driver. [claim-extraction-output-format] [merimen-create-case-procedure]
- From photos: odometer, colour, road-tax expiry, impact area (front / rear / side / corner), body type/doors. [merimen-adjuster-report-fields] [merimen-create-case-procedure]

## "send me data" output format
- Each copyable value in its OWN fenced code block; label as a plain line directly above (English/Malay only); keep the PDF's field order. [claim-extraction-output-format]
- Display-only fields (Status Asal, Kelas Kegunaan, insurer names) in heading size; the insurer name bigger than its label. [claim-extraction-output-format]
- Beginner-friendly layout (title / heading / subheading / body + emojis); other party plate = 🚗, our client = 🚙; police sections titled `🚗 <plate> Driver` / `🚙 <plate> Driver`. [claim-extraction-output-format]
- Say which at-fault policy matched the accident date. [claim-extraction-output-format]
