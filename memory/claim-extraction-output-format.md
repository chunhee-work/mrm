---
name: claim-extraction-output-format
description: "How to present extracted claim-PDF data (copy boxes, per-page fields, policy-date matching)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

When reading a claim PDF and presenting its data back to the user (Way #1 of the workflow), follow these rules:

**Copyable vs display-only (refined 2026-06-28):**
- Copyable fields: VALUE must go in its OWN fenced code block (inline `code` does NOT give a copy button in the user's client — only fenced blocks do). Put the LABEL as a plain-text line directly ABOVE the code block (English/Malay only — NO Mandarin on label lines). Keep field order/position like the PDF. (This supersedes the earlier "one line / inline code" idea — copy button wins over single-line.)
- Display-only fields (marked "just show me here", e.g. Status Asal, Kelas Kegunaan, insurer name): render them BIGGER than normal — use heading size. The insurer NAME should be bigger than its description label.
- Use a clear, beginner-friendly UI: title / heading / subheading / body + emojis.
- If any word in the PDF is garbled/unclear, DO NOT guess — flag it and let the user check.

**Car-plate titles & emojis:**
- Section 5 (other party police report) big title: `🚗 <plate> Driver`.
- Section 6 (our party police report) big title: `🚙 <plate> Driver`.
- Consistent emoji per plate: other party (TCM9889) = 🚗, our customer (BKH9821) = 🚙.

**Per-page extraction template (sections 1–8 of a full bundle):**
1. JPJ Sijil Pemilikan Kenderaan: JPJ Log Book No (the code in the TOP-RIGHT corner of the cert, e.g. <JPJ_LOGBOOK> — differs per file), car plate, No ID, Name, Address, No Chassis, No Engine, Keupayaan Enjin → copyable; Status Asal / Kelas Kegunaan / Jenis Badan+Tahun / Tarikh Pendaftaran → display-only.
2–3. Insurance schedule (our customer): show which insurer (display); E-Cover Note No. + Policy No. → copyable.
4. Police investigation (Keputusan Penyiasatan Kes): No. Report Polis + separate date/time (copyable), Tempat Kejadian, Tarikh & Masa Kejadian + separate date/time (copyable). The Tarikh Kejadian = the accident date used for policy-date matching.
5. Police report (other party): big title = car plate they drove; then Butir Pengadu — Nama, No. K/P, Alamat Tinggal, No. Tel.
6. Police report (our party): same fields as #5.
7. Rajah Kasar (sketch): ignore.
8. Other party vehicle + insurance: big title = car plate; show which insurer (display); Policy No. + Policy Effective Date + Policy Expiry Date (+ E-Cover Note if present) → copyable.

**Policy-date matching:** Insurance docs (esp. MyCarInfo I-SEARCH reports) list multiple policies with effective/expiry dates. Pick the policy whose period covers the accident date (Tarikh Kejadian from page 4). Tell the user which one.

**Policy-number conflict rule (2026-06-28):** When the I-SEARCH (MyCarInfo) report and another doc (e.g. vehicle-detail page) give DIFFERENT policy numbers for the same period, USE THE I-SEARCH REPORT's policy number.

**Missing/multi-file:** A bundle's pages 1–8 may be split across multiple PDFs and page order may jump. Read all files, figure out which page is which, and tell the user if pages are missing. Each bundle has TWO insurances — one our customer, one the other party.

Related: [[motor-claim-adjuster-workflow]], [[use-repo-skills]].
