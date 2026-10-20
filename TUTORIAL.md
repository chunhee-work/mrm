# MRM hand-over tutorial: set up and run a batch, step by step

For the next agent taking over this work, or for setting up a new machine. Read it once from top to bottom. After that,
do NOT re-read it for case work: work from `CLAUDE.md` (it loads automatically) and read the `playbook/` file for each
step before you do that step.

**Reading order**
1. This file: setup, the daily start, and how to run every step (commands).
2. [`HANDOVER.md`](HANDOVER.md): all the context. Who the user is, accounts, history, and what is open right now.
3. [`CLAUDE.md`](CLAUDE.md): the short rule sheet, loaded in every session.
4. [`playbook/`](playbook/README.md): the user's rules, one file per step. **Read the matching file before every
   step.** This tutorial says HOW; the playbook says WHAT to choose.
5. [`tools/mrm-bot/README.md`](tools/mrm-bot/README.md): every script, its arguments and its JSON input.

**The rules you must never break** (details in `CLAUDE.md` and `playbook/00`)
- One instruction = every case 0→100%. Never stop to ask. The only stop is a missing document: send
  `<PLATE> pending <doc>` and carry on with the other cases.
- Reply in Simplified Chinese. Merimen part and field names stay in English.
- Never log in, never type or print a password. The user runs `cd ~/mrm-bot && node relogin.mjs`.
- Never close the automation Chrome window (port 9222). `keepalive.mjs` must always run.
- Never build Merimen URLs for `dsp_docmanage` / `act_docinfo`, and never fetch other accounts' files. Both log
  the session out.
- When the user corrects you: fix it in Merimen, write the rule into the playbook, put it into the scripts, commit
  and push.

---

## Part A · One-time setup (new machine or new agent)

On the user's current Mac everything is already set up. Run `bash tools/mrm-bot/doctor.sh` (A10). If every line
says OK, skip to Part B.

### A1. What you need

| Item | Why |
|---|---|
| macOS + Google Chrome | Merimen runs in a separate "automation" Chrome profile that the scripts drive over CDP (port 9222). |
| Node.js 18+ and npm | The Merimen scripts (`~/mrm-bot`, Playwright `playwright-core`). |
| Python 3.9+ with PyMuPDF (`pip3 install pymupdf`) | Reading and compressing the PDF bundles. |
| Claude Code, signed in to the **user's claude.ai account** | Gives access to the two artifacts (照片命名台, 部位标注台) through the `Artifact` and `ArtifactData` tools. A different account cannot open them (see A8). |
| Claude-in-Chrome extension, "Browser 1" signed in to Google | The only way to type rows into the Google Sheet "Cari Makan". |
| `PushNotification`, `SendUserFile` tools | Notify the user when a batch is done; send photos when you ask about a naming change. |
| WhatsApp desktop app + Accessibility permission for the terminal | Only for the "下载 / download" trigger (A7). |
| Repo access: `https://github.com/chunhee00/mrm` (private) | This repo. On the current Mac it lives at `~/Documents/VS Code/gacha-smm-playbook/mrm`. |

The path has spaces, so always quote it. Examples below use:
```bash
MRM="$HOME/Documents/VS Code/gacha-smm-playbook/mrm"
```

### A2. Get the repo
```bash
git clone https://github.com/chunhee00/mrm.git "$MRM"
```

### A3. Install the Merimen scripts into `~/mrm-bot`
```bash
bash "$MRM/tools/mrm-bot/sync.sh" install     # copies the scripts and data, runs npm install (playwright-core)
```
`~/mrm-bot` is the **live** copy: always run scripts from there. `tools/mrm-bot` is the copy in git. Before you
commit, run `sync.sh diff`. If you changed a script in `~/mrm-bot`, run `sync.sh collect` to copy it into the repo.

### A4. The login script (the USER does this, once)
The agent never handles the password. The user creates a Keychain item and the login script:
```bash
security add-generic-password -s merimen -a <USER_ID> -w      # macOS asks for the password; nothing is echoed
cp "$MRM/tools/mrm-bot/relogin.example.mjs" ~/mrm-bot/relogin.mjs
```
After that, every login is: `cd ~/mrm-bot && node relogin.mjs <USER_ID>`. It writes `~/mrm-bot/session_base.txt`
(live session tokens: never print it, never commit it). Which user ID: the Merimen account depends on the workshop
(`playbook/00`, "Automation Chrome + login"). On the current Mac, `~/mrm-bot/relogin.mjs` already exists and needs
no argument. Never commit it, and never run it yourself.

### A5. The automation Chrome (port 9222)
```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.agent-browser-chrome"
```
- Keep at least one window with one Merimen tab open. With no window, scripts fail with
  "Browser context management is not supported": run the same command again.
- This profile is NOT signed in to Google, and it is not the user's normal Chrome. If the user logs in to Merimen
  in their own Chrome with the same account, the automation session is kicked out.
- Start the keepalive (clicks "Continue Session" every 15 s):
  ```bash
  cd ~/mrm-bot && nohup node keepalive.mjs >> keepalive.log 2>&1 &
  ```

### A6. Photo-naming model (optional but saves a lot of time)
```bash
cd "$MRM/typesafe/photo_train"
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```
- The trained weights are NOT in git (about 4.4 GB). Copy them from the old Mac into
  `typesafe/photo_train/models/`: `dinov2_b_big10a.pt`, `seq_best.pt`, `seq_best_crop.pt`. Also copy the DINOv2 code
  cache `~/.cache/torch/hub/facebookresearch_dinov2_main` (it is patched for Python 3.9).
- TypeSafe key (the "Jev" second opinion for unsure photos): Keychain item `TYPESAFE_API_KEY`, which the user adds in
  their own Terminal. Without it, run predictions with `JEV=0`.
- Without the model you name every photo by eye, following `playbook/03`. That is slower, but the rest of the workflow
  is the same.
- Details: `typesafe/photo_train/README.md` (in Chinese).

### A7. WhatsApp download helper (only for "下载 / download")
```bash
swiftc -O "$MRM/tools/rclick.swift" -o /tmp/rclick      # /tmp is wiped on reboot: rebuild then
```
The terminal needs Accessibility permission (System Settings → Privacy & Security → Accessibility). On the current
Mac, read `~/macfleet/macfleet/DOWNLOAD.md` before the first download.

### A8. The two artifacts (claude.ai pages)
| Page | URL | Use |
|---|---|---|
| 照片命名台 (photo naming desk) | https://claude.ai/artifact/K6yLWFN8XChRKRVHUFcUBR | One tab per case. The user checks the model's photo names and the order. Database: `names` (only photos the user renamed), `orders` (only cases the user reordered). |
| 部位标注台 (part labeller) | https://claude.ai/artifact/BS7auqjnbs6Y7SZvzL4Vnh | Quick-confirm for unsure photos (training data). Collections `tasks`, `labels`. |

Both belong to the user's claude.ai account. In a new conversation, `Artifact` `action: "read"` the page first, then
publish to its URL. If you cannot open them (another account), rebuild the naming desk from `tools/naming-desk/`.
That publishes a NEW URL: write the new URL into `playbook/03` and `memory/case-photo-naming-artifact.md`.

### A9. Google Sheet "Cari Makan"
https://docs.google.com/spreadsheets/d/1PtjoA-QfGChlCHfrXvT5bYXYNO99KS4S6vXjmemkeT8/edit?gid=812412844 (tab
"2026 Jul-Dec"). Only through Claude-in-Chrome "Browser 1". The Google Drive connector cannot write cells. Never type
the Google password.

### A10. Check everything
```bash
bash "$MRM/tools/mrm-bot/doctor.sh"
```
Every line should say `OK`. Each `FIX` line prints the command that fixes it. `doctor.sh` never prints tokens.

---

## Part B · Start of every session (2 minutes)

1. `CLAUDE.md` is loaded automatically. Read `playbook/00-start-and-rules.md` in full.
2. Check the open items in `HANDOVER.md` → "State at hand-over", and `git pull`.
3. `bash "$MRM/tools/mrm-bot/doctor.sh"`
4. If the Chrome 9222 window is missing, start it (A5). If keepalive is not running, start it (A5).
5. If the session is dead ("Session Timeout / User Not Logged On", or a login page), send the user one line and keep
   doing offline work (reading PDFs, naming photos) while you wait:
   > Merimen 已登出，请在 Terminal 运行：`cd ~/mrm-bot && node relogin.mjs`
6. Memory = the repo folder `memory/` (index `memory/MEMORY.md`). Write new memories there, not in `~/.claude/…`,
   and commit them.

---

## Part C · Run a batch: the 12 steps

What starts a batch: "下载 / download" (WhatsApp zip), or "do" plus a folder or plates. "Do" means **all** cases,
each one 0→100%. Run cases in parallel: one Merimen tab per case; the `*par.mjs` scripts take `PLATE,PLATE,…`.

Two folders per batch:
- `$C`: the folder that holds the case folders `$C/<PLATE>/` (PDFs + original photos). This is the unzipped
  `<workshop>` folder, or `~/Desktop/<workshop>`. If a batch mixes workshops, there is one `$C` per workshop.
- `$B`: your working folder in the session scratchpad, e.g. `<scratchpad>/batchN`. It holds the batch JSON files,
  `$B/report/` (naming-desk output) and `$B/db/` (the naming desk's database export).

Keep `$B/extmap.json` = `{"<PLATE>": {"cid": "...", "extid": "..."}}` from the moment each case exists.

Each step below lists what to **Read** first, what to **Do**, and how to **Check** it.

### Step 0 · Get the files
- **Read:** `playbook/00` → "WhatsApp download", `playbook/01` → "Where the case files are".
- **Do (WhatsApp):** activate WhatsApp → screenshot → find the newest FILE from the configured contact (number in
  `memory/whatsapp-download-trigger.md`) → if it shows a download arrow, click it and wait → right-click →
  "Save to Downloads": `/tmp/rclick X Y r` (X, Y = screenshot pixels ÷ 2) → check with `ls -la ~/Downloads`.
  Unzip: `unzip -q ~/Downloads/<file>.zip -d "$B/zip"`. Layout: `<workshop>/<PLATE>/` with the PDF(s) and
  photos, so `C="$B/zip/<workshop>"`.
- **Do (Desktop):** `C=~/Desktop/<workshop>`. A folder named `(TOTALOST)` / `TOTAL LOSS` is a total-loss case.
- **Check:** count the cases. The workshop decides the Merimen account. If the session is for another account,
  ask the user to log in with the right one.
- Stop and ask only if the screen is locked, or WhatsApp asks for a login, QR code or update.

### Step 1 · Read the documents
- **Read:** `playbook/01-read-documents.md`.
- **Do:** read every PDF and every page. Scans have no text layer: render the pages and read the images.
  ```python
  import fitz                                   # PyMuPDF
  d = fitz.open(pdf)
  for i, p in enumerate(d):
      p.get_pixmap(dpi=230).save(f"{out}/p{i+1}.png")
  ```
  Fill the per-case JSONs: `cases.json` (step 2) and `report.json` (steps 4–6). Templates and every key:
  `tools/mrm-bot/README.md`.
- **Check:** the at-fault plate in the police result must match the JPJ SEARCH page. A missing document → send
  `<PLATE> pending <doc>` at once and continue with the other cases.

### Step 2 · Create the case
- **Read:** `playbook/02-create-case.md`.
- **Do:**
  ```bash
  cd ~/mrm-bot
  node dumpmodels_sinar.mjs PERODUA,TOYOTA                    # model options -> model_opts_sinar.json (c = green or white)
  node createpar2_sinar.mjs P1,P2 session_base.txt "$B/cases.json"          # dry run
  node createpar2_sinar.mjs P1,P2 session_base.txt "$B/cases.json" submit   # create
  node getext_one.mjs <cid> session_base.txt                                # extid
  ```
  Model variant: match trim → engine, body and A/M → the year bracket, and prefer a green option (it has price data).
  The model can be changed for free for 3 days only, so get it right the first time.
- **Check:** re-open the case. Save cid and extid into `$B/extmap.json` and into `report.json` (`cid`, `extid`).

### Step 3 · Photos → 照片命名台
- **Read:** `playbook/03-photo-naming.md`.
- **Do:** start as soon as the model variant is known. Don't wait for the user's review.
  ```bash
  cd "$MRM/typesafe/photo_train"
  .venv/bin/python case_report.py "$C/<PLATE>" <PLATE> "<Merimen model variant>" "$B/report"   # every case
  python3 "$MRM/tools/naming-desk/naming.py" build "$B/report" "$B/report/meta.json"
  ```
  `meta.json` = `{"<PLATE>": "<RC make/model text>"}`. Its keys decide which cases appear on the page (this batch only).
  Then publish with the `Artifact` tool (in a new conversation, `read` the URL first): `file_path` =
  `$B/report/naming.html`, `url` = the 照片命名台 URL, and `files` = `{"pics/<PLATE>.json": "$B/report/pics/<PLATE>.json", …}`.
  Leave out `capabilities` so the page keeps its database. Tell the user in one line that the tabs are ready.
- **Check:** open the page. Unsure photos (under 60%) have an orange frame. If the opening shots are missing, send
  `<PLATE> pending <photo> photo`.

### Step 4 · Adjuster Report
- **Read:** `playbook/04-adjuster-report.md`.
- **Do:**
  ```bash
  node reportpar.mjs P1,P2 session_base.txt "$B/report.json"        # dry
  node reportpar.mjs P1,P2 session_base.txt "$B/report.json" save   # must print "<PLATE>: dsp_selection ✅"
  ```
  reportpar fills the pink (required) boxes it knows, types the police station from `policeStation` and picks an
  IPD code. Check that both match the town in the police report number (you choose them, `playbook/04`).
- **Check:** `⛔` plus a message → fix that field in the JSON and run again. A failed save wipes the form.

### Step 5 · Discount + labour rates
- **Read:** `playbook/05-rates-and-narratives.md`.
- **Do:** `node disclabourpar.mjs P1,P2 session_base.txt "$B/report.json"` → PD 10 / SP 0 / labour 30×4.
  Read `Std Betterment [X yr(s) - Y%]` on the Parts tab and copy it as-is into `report.json` → `betterment`.
- **Check:** reload: 10.00 / 0.00 / 30 / 30 / 30 / 30.

### Step 6 · Narratives
- **Do:** `node narrpar.mjs P1,P2 session_base.txt "$B/report.json"` (needs `afplate`, `police`, `impact`,
  `betterment`, `tpKind`, `TL`).
- **Check:** it must print `VERIFY 500–540 ✓`. A total-loss case also gets 550.

### Step 7 · Upload the documents
- **Read:** `playbook/06-upload-docs-and-photos.md`.
- **Do:** compress only files over 5 MB (PyMuPDF: render the pages to JPEG and rebuild the PDF). Then:
  `node uploadpar.mjs P1,P2 session_base.txt "$B/uploads.json"` (FDESC DOC / RC / INS / P.REPORT / JPJ SEARCH,
  FTYPE Other).
- **Check:** the Documentation list has the new rows. No double uploads.

### Step 8 · Upload the photos (one shot per case)
- **Do:** first re-read the user's edits from the naming desk with `ArtifactData`, on the 照片命名台 URL:
  `action: "list"`, `collection: "names"`, `query: {"limit": 1000}`, `out_dir: "$B/db"`. Do the same for
  `collection: "orders"`. If a result has `next_cursor`, list again with it. Then:
  ```bash
  python3 "$MRM/tools/naming-desk/naming.py" final "$B/report" "$B/db"     # prints every name the user changed
  python3 "$MRM/tools/naming-desk/naming.py" plan  "$B/report" "$C"        # writes ~/mrm-bot/photoplan.json (originals from $C/<PLATE>/)
  cd ~/mrm-bot
  node uploadphotos.mjs <PLATE> <cid> <ext> 0 999
  node chkorder.mjs <PLATE> <cid> <ext>
  ```
  `final` applies the user's names and order plus the naming rules (`name_map.final`). A name flagged "NEEDS A NAME"
  is banned (e.g. General View, TAIL LAMP): look at the photo and choose. Every name the user changed is a lesson
  (Part D).
- **Check:** `chkorder` → photos = plan and `mismatch 0`. A duplicate photo shifts the order (`playbook/06`).

### Step 9 · Select Parts + Labour (the most error-prone step)
- **Read:** `playbook/07-select-parts-and-labour.md` **and** `memory/mistakes-log-sinar-batch2.md`, every time.
- **Do:**
  1. Re-read the naming desk (as in step 8) and re-run `naming.py final`.
  2. **Look at the photos themselves**, not just the names. What each photo shows decides the parts, companions,
     quantities and labour.
  3. Run the tools:
     ```bash
     cd ~/mrm-bot
     node selcat2.mjs <cid> <ext> session_base.txt s2/cat_<PLATE>.json
     python3 "$MRM/typesafe/step2_plan.py" s2/cat_<PLATE>.json "$B/report/final_<PLATE>.json" <impact> s2/tick_<PLATE>.json s2/miss_<PLATE>.json
     ```
  4. Review `tick_<PLATE>.json` against the photos and the playbook. Exact names, the right side and group, every
     photographed item, every companion part, full door sets, the N/R labour for the impact, and misc for the impact.
     Items the catalogue doesn't have become manual rows in step 10.
  5. Tick and snapshot:
     ```bash
     node tickall.mjs <cid> <ext> session_base.txt s2/tick_<PLATE>.json > s2/tick_<PLATE>.log 2>&1
     node selstate.mjs <cid> <ext> session_base.txt > state/sel_<PLATE>_mine.json    # my choice, for labour learning
     node gonext.mjs <cid> <ext> session_base.txt
     ```
- **Check:** `selstate` shows what you meant. N ticks can add parts that are not in the photos: remove them with
  `untick.mjs`.

### Step 10 · Estimate details
- **Read:** `playbook/08-estimate-details.md`.
- **Do (in this order):**
  ```bash
  node labourfill.mjs <cid> <ext> session_base.txt AUT apply
  node estfill.mjs <PLATE> session_base.txt "$B/extmap.json" v
  node addparts.mjs <cid> <ext> session_base.txt "$B/add_<PLATE>.json" save   # manual rows [group, name, price, qty, comment]
  node fillempty.mjs <cid> <ext> session_base.txt
  node setcmt.mjs <cid> <ext> session_base.txt "$B/cmt_<PLATE>.json"
  node setqty.mjs <cid> <ext> session_base.txt '{"Bumper Clips":"15"}'
  node rows.mjs <cid> <ext> session_base.txt
  ```
  Manual prices: `python3 "$MRM/tools/price_lookup.py" part "<name>"`. Use the same model first, and flag any price
  with fewer than 5 reference rows. A price the user gave always wins.
- **Check:** with `rows.mjs`: no empty conditions, paint 500, quantities (clips 15, pairs 2), comments, and the case
  total **≥ RM6,000**. If it is lower, look at the photos again for missed items. Never pad.

### Step 11 · Google Sheet
- **Read:** `playbook/09-finish-and-report.md`.
- **Do:** Claude-in-Chrome, Browser 1, open the sheet. Find the Name Box with `find`, click its ref, and go to the
  first empty row under the last entry. Per row, type `DD/MM/YYYY`, press Tab, `PLATE`, Tab, `WORKSHOP`, Tab, `D`,
  then Return. Press each Tab as a separate key: a tab typed inside the text becomes a space.
- **Check:** take a screenshot of the new rows. Workshop names: EXTREME AUTO / SINAR GEMILANG / LEE KEAN HIN.

### Step 12 · Car-model report
- **Do:** make one table row per case: plate | RC make/model, cc, year, fuel/transmission | the Merimen variant,
  read back from dsp_details "Vehicle Model:" | why that variant. Put **⚠️** on any model without price data (white
  option, not green).

### End of the batch
1. Re-check every case (`rows.mjs`, `selstate.mjs`, `chkorder.mjs`), then close leftover tabs (keep one Merimen tab).
2. `PushNotification` (one line).
3. The report, in Chinese:
   - the completion table (`playbook/09`);
   - problems and assumptions;
   - the manual-price list;
   - the sheet rows;
   - every `<PLATE> pending <doc>` line;
   - the car-model report.
4. Commit and push `memory/`, `playbook/` and script changes (`sync.sh diff` / `collect` first).

---

## Part D · After the user reviews: re-sync and learn

**Photo names (照片命名台).** When the user says "done":
1. Re-read `names` and `orders` (step 8), then run `naming.py final`. It prints every change.
2. Fix the captions in Merimen:
   `node relabel_ui.mjs <cid> <ext> '{"<pos>":["<old>","<new>"]}' save`, then `chkorder.mjs`.
3. Fix the parts to match: `untick.mjs` / `tickall.mjs`, `delrow.mjs` for manual rows, then `gonext.mjs` →
   `addparts.mjs` → `fillempty.mjs`. Re-read `dsp_selection` and `dsp_details` first: the user may already have fixed
   things.
4. Turn every change into a rule in `memory/photo-center-crosshair-rule.md`, `playbook/03` and
   `typesafe/photo_train/name_map.py` (`FINAL`).
5. Reason unclear → ask the user, and send the photo itself with `SendUserFile`.
6. Write the final names to `typesafe/photo_train/user_photo_names.jsonl` and the photos to `user_photos/<PLATE>/`
   (training data).

**Labour learning.**
1. Run `node selstate.mjs <cid> <ext> session_base.txt` and diff it against `~/mrm-bot/state/sel_<PLATE>_mine.json`.
2. Every label the user added or removed becomes a rule in `playbook/07` and `memory/labour-diff-log.md`.

**Any correction from the user.**
1. Fix it in Merimen.
2. Write the rule into the matching `playbook/0X-*.md`.
3. Put it into the scripts (`typesafe/step2_plan.py`, `name_map.py`, `~/mrm-bot/*.mjs`).
4. Add it to `memory/mistakes-log-sinar-batch2.md` if it was a mistake.
5. Commit and push.

**Photo model training.** It is optional and runs in the background: `typesafe/photo_train/retrain_names.sh`. Keep a
new model only if it beats the current one on the fixed test cases. Training is read-only on Merimen. Harvesting
during office hours can log the user out, so ask before you start it.

---

## Part E · Troubleshooting

| You see | Cause | Do |
|---|---|---|
| "Session Timeout / User Not Logged On", a login page, or ~5 inputs on the page | Session dead | Send the user one line asking for `node relogin.mjs`, then check keepalive. Unsaved work in that tab is gone. |
| "Browser context management is not supported" | The 9222 Chrome has no window | Run the `open -na …` command again (A5). |
| `connectOverCDP` ECONNREFUSED | The automation Chrome is not running | Start it (A5) and ask the user to log in. |
| Logged out right after your action | A `dsp_docmanage`/`act_docinfo` URL, another account's docid, or a `JSVCopenWinPost` revoke | Never do that again. Ask for relogin. Relabel only with `relabel_ui.mjs`. |
| Logged out for no visible reason | The user logged in with the same account elsewhere, or keepalive stopped | Ask for relogin and restart keepalive. |
| A script ended before "Save" with no error | It was piped into `head` (EPIPE) | Run it again with `> log 2>&1`. |
| Report save failed and the form is empty | A required field was missing. Merimen wipes the form | Fill every field and run `reportpar` again. Set postcodes after cities. |
| Insurer warning ("Policy not found", points charged) | Normal | Click OK and continue. |
| Photo count or order wrong after an upload | A photo was stored twice | Run `chkorder`. Find the duplicate by hashing (this account's case only). The user deletes it in the UI. |
| Parts appeared that you didn't tick | Labour N ticks add their part, or Thatcham added items | Keep the Thatcham R&R items. Untick parts that are not in the photos. |
| Duplicate manual rows | You re-applied a fix the user had already made | `delrow_price.mjs "Name@price"`. Always re-read before you fix. |
| Case total under RM6,000 | Missed parts, companions, labour, misc or paint | Look at the photos again. Never add items the photos don't justify; flag the case instead. |
| No green model fits the RC | Merimen has no price data for that variant | Pick the closest variant. Mark ⚠️ in the car-model report. |
| Sheet text in the wrong cell | Clicked by coordinates | ⌘Z. Use the Name Box ref from `find`. |
| Artifact publish refused (manifest/file limits) | Too many files | `naming.py build` already packs one JSON file per case. Publish only that batch's cases. |
| WhatsApp asks for login/QR, or the screen is locked | — | Stop and ask the user. |

---

## Part F · Where everything is

| What | Where |
|---|---|
| Rules per step | `playbook/00…09` (sources in `memory/`, index `memory/MEMORY.md`) |
| Mistakes never to repeat | `memory/mistakes-log-sinar-batch2.md` |
| Merimen scripts | live `~/mrm-bot`, repo `tools/mrm-bot` (reference `tools/mrm-bot/README.md`) |
| Naming-desk builder | `tools/naming-desk/` (`naming.py`, `template.html`, `names.json`) |
| Step 2 planner | `typesafe/step2_plan.py` (+ `typesafe/partmatch.py`, `tools/labour_rules.json`) |
| Labour data | `tools/damage_to_ticks.md` (217 cases), `tools/mrm-bot/labour_all.json`, `memory/labour-reference-sinar-batch.md` |
| Part prices | `tools/merimen-part-prices-data.md` + `tools/price_lookup.py` |
| Photo model | `typesafe/photo_train/` (`case_report.py`, `predict_case.py`, `name_map.py`; weights local only) |
| Session file, login script, case data | `~/mrm-bot` only, never in git |
| Credentials | Nowhere in the repo. The user's handoff notes file holds live passwords: never read it aloud, print, paste, commit or send it. `typesafe/driver.py` (legacy, holds a password) is git-ignored: never commit it. |
