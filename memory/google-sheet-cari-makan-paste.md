---
name: google-sheet-cari-makan-paste
description: "After a batch, paste the sheet rows into the Cari Makan Google Sheet myself (lowest empty row)"
metadata:
  type: feedback
---

User rule (2026-10-17): "once u done always paste the code to" the Google Sheet **Cari Makan**
https://docs.google.com/spreadsheets/d/1PtjoA-QfGChlCHfrXvT5bYXYNO99KS4S6vXjmemkeT8/edit?gid=812412844 (tab "2026 Jul-Dec").
Append the `<date> TAB <PLATE> TAB <WORKSHOP> TAB D` rows ([[merimen-sheet-workshop-names]]) at the first empty row under the last entry. Do not just list the rows in chat.

**Why:** the user wants the sheet updated without copying by hand.
**How to apply:** the Google Drive connector can't write cells (only title/parent), so use Claude-in-Chrome in the user's own signed-in Chrome. The automation Chrome (port 9222) is not signed in to Google; never type the Google password. Related: [[batch-completion-report-format]].

**Working recipe (2026-10-17):**
- Use Claude-in-Chrome "Browser 1" (deviceId 2d7b4267…), the one signed in to Google. "Browser 2" asks for a Google sign-in.
- Find the Name Box with `find` and click its ref. Don't click by coordinates: the "Almost out of storage" banner shifts the layout, and a coordinate click once typed into A3 (undone with ⌘Z).
- Go to the first empty row and type each cell with a separate Tab KEY press, then Return. Tabs inside typed text become spaces.
