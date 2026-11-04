# mrm-bot — Merimen scripts (reference)

Playwright scripts that drive the **automation Chrome** (port 9222) over CDP. They never log in: they read the
session from `session_base.txt` (written by the user's `relogin.mjs`).

- **Live copy:** `~/mrm-bot` — always run scripts from there (`cd ~/mrm-bot && node <script> …`). Several scripts
  read `session_base.txt` and `photoplan.json` from the current folder.
- **Repo copy:** this folder. Keep the two in step with `sync.sh` (`diff` before every commit, `collect` to copy
  live edits into the repo, `install` on a new machine).
- **Local only, never in git:** `session_base.txt` (live session tokens), `relogin.mjs` (holds the login), case data
  (`cases_*.json`, `report_*.json`, `uploads_*.json`, `state/`, `s2/`, `up/`, screenshots).
- **Output:** save-scripts print a short result. Never pipe a script that saves into `| head`: it dies before Save.
  Redirect to a log and grep it.
- `$MRM` = the repo folder (`$HOME/Documents/VS Code/gacha-smm-playbook/mrm` on the current Mac; quote it, it has spaces).
- `<sess>` below = `session_base.txt`. `<cid>` = Merimen caseid (8 digits), `<ext>` = extid (7 digits).
  Get the ext with `getext_one.mjs`.
- Each case-level step has a playbook file with the RULES (what to choose). This file only covers HOW to run the tools.

## Session + helpers

| Command | What it does |
|---|---|
| `node relogin.mjs <USER_ID>` | **The user runs it, never an agent.** Logs in in the 9222 Chrome and writes `session_base.txt`. Template: `relogin.example.mjs` (reads the password from Keychain). |
| `nohup node keepalive.mjs >> keepalive.log 2>&1 &` | Clicks "Continue Session" in every Merimen tab every 15 s. Must always run. Check with `pgrep -f "node keepalive.mjs"`. |
| `bash doctor.sh` (from the repo) | Read-only health check: tools, scripts in step, session file, Chrome 9222, keepalive, photo model. |
| `node wl.mjs` | Worklist: prints `plate caseid extid` for open cases of this account. |
| `node getext_one.mjs <cid> <sess>` | Prints the extid of one case (from the worklist). |
| `node listphotos.mjs <cid> <ext>` | Lists the case's documents/photos (`docid caption`). |
| `node cmts.mjs <cid> <ext> <sess>` | Shows comment fields of Sensor/Hinge rows on dsp_details. |
| `node fetchfull.mjs <tasks.json> <outdir>` | Photo-labeller helper: downloads photos (max 1280 px) by docid. **Only docids of cases of the logged-in account**: other accounts' docids log the session out. Never use it on the training photos in `typesafe/photo_train/data/` (company-wide harvest): it failed and logged out on 2026-10-21. |

## Step 2 · create the case (`playbook/02-create-case.md`)

```bash
node dumpmodels_sinar.mjs PERODUA,TOYOTA          # -> model_opts_sinar.json {MAKE:[{v,t,c}]}; c=clsMTRModelLevel1 = green (has parts data)
node createpar2_sinar.mjs BRS8642,SK64A session_base.txt cases.json            # dry run: fills, screenshots, no save
node createpar2_sinar.mjs BRS8642,SK64A session_base.txt cases.json submit     # creates; also sets Manager/Adjuster
node getext_one.mjs <cid> session_base.txt
```
Failed create → screenshot `~/mrm-bot/creg_<PLATE>.png` plus the Merimen message. `MGR`/`ADJ` env override the
default Manager/Adjuster (don't override).

`cases.json` (one key per plate; values are placeholders):
```json
{"ABC1234": {
  "insCOID": "37", "branchMatch": "HQ|Head", "polcover": "Comprehensive",
  "acc": {"date": "dd/mm/yyyy", "time": "19", "impact": "rear"},
  "client": {"name": "<OUR CLIENT>", "nric": "<NRIC>", "isCompany": false, "phone": "<digits>", "insCOID": "9616", "policy": "<CLIENT POLICY / COVER NOTE>"},
  "veh": {"make": "PERODUA", "modelValue": "<ddlbModel value from model_opts>", "chassis": "<CHASSIS>"},
  "atfault": {"plate": "<AT-FAULT PLATE>", "policy": "<POLICY>", "from": "dd/mm/yyyy", "to": "dd/mm/yyyy", "isCoverNote": false,
              "ownerName": "<OWNER>", "ownerNric": "<NRIC or Co Reg No>", "ownerIsCompany": false, "driverName": "<DRIVER>", "driverNric": "<NRIC>"},
  "workshopKeyword": "bengkel kereta sinar", "workshopMatch": "Sinar Gemilang"}}
```
`insCOID` = the AT-FAULT insurer (`ddlbInsurer`); `client.insCOID` = our client's insurer (`ddlb3INSCOID`, codes in
playbook 01). `impact`: rear / front / right-side / left-side / rear-left / front-right … .

## Step 4 · Adjuster Report (`playbook/04-adjuster-report.md`)

```bash
python3 build_report.py <cases.json> <extract.json> <extmap.json> <out_report.json>   # optional helper
node reportpar.mjs BRS8642,SK64A session_base.txt report.json          # dry
node reportpar.mjs BRS8642,SK64A session_base.txt report.json save     # must end "dsp_selection ✅"
```
Screenshot on failure: `~/mrm-bot/rep_<PLATE>.png`. `report.json` also feeds steps 5 and 6:
```json
{"ABC1234": {
  "cid": "22000000", "extid": "9700000", "TL": "No", "adjFile": "<ADJ FILE REF>", "reserve": "10000.00",
  "inspectAt": "Bengkel Kereta Sinar Gemilang, Kemaman",
  "police": "TRAFIKKUANTAN/008375/26", "policeDate": "dd/mm/yyyy", "policeTimeBand": "13", "policeStation": "TRAFIK KUANTAN",
  "damType": "Collision", "collType": "Private Vehicle", "lossDescCat": "Collision- Head to Rear",
  "accPlace": "<PLACE>", "lossState": "Pahang", "lossCity": "Kuantan", "lossPostcode": "25000",
  "isCompanyInsured": false,
  "insured":   {"name": "", "nric": "", "idType": "NRIC", "dob": "dd/mm/yyyy", "gender": "Male", "addr": "", "state": "", "city": "", "postcode": "", "phone": ""},
  "insDriver": {"name": "", "nric": "", "idType": "NRIC", "dob": "", "gender": "", "addr": "", "state": "", "city": "", "postcode": "", "phone": "", "exp": "<age-18>"},
  "claimant":  {"isCompany": false, "name": "", "nric": "", "dob": "", "gender": "", "addr": "", "state": "", "city": "", "postcode": "", "phone": ""},
  "clmDriver": {"name": "", "nric": "", "idType": "NRIC", "dob": "", "gender": "", "exp": ""},
  "veh": {"eng": "", "jpjLogbook": "", "jpjReg": "dd/mm/yyyy", "manYear": "2019", "cc": "1496", "colour": "Red", "odo": "0", "body": "<model word>"},
  "afplate": "<AT-FAULT PLATE>", "impact": "rear", "betterment": "6.8 yr(s) - 20%", "tpKind": "m/car"}}
```
`city` may be `"A|B"` (first match wins). `tpKind` = `m/car` (default) or `m/cycle`. `betterment` is read from Merimen
in step 5, then added here before step 6.

## Step 5 · discounts + labour rates · Step 6 · narratives (`playbook/05-rates-and-narratives.md`)

```bash
node disclabourpar.mjs BRS8642,SK64A session_base.txt report.json   # PD 10 / SP 0 / labour 30x4 (uses cid, extid)
node narrpar.mjs BRS8642,SK64A session_base.txt report.json         # 5 narratives; must print VERIFY 500-540 ✓ (TL=Yes adds 550)
```

## Step 7 · upload documents (`playbook/06-upload-docs-and-photos.md`)

```bash
node uploadpar.mjs BRS8642,SK64A session_base.txt uploads.json
```
```json
{"ABC1234": {"cid": "22000000", "ext": "9700000", "files": [{"path": "/abs/path/ABC1234_DOC.pdf", "fdesc": "DOC"}]}}
```
`fdesc`: DOC / RC / INS / P.REPORT / JPJ SEARCH. FTYPE is always "Other". Compress only files over 5 MB (PyMuPDF).

## Step 8 · upload photos

```bash
python3 "$MRM/tools/naming-desk/naming.py" plan <out_dir> <cases_root> ABC1234   # writes photoplan.json
node uploadphotos.mjs ABC1234 <cid> <ext> 0 999      # one shot, maxno=250, originals, FDESC = final name
node chkorder.mjs ABC1234 <cid> <ext>                 # must print "mismatch 0" and photos = plan
node relabel_ui.mjs <cid> <ext> '{"9":["General View","Side View"]}' save   # fix captions (position: [old, new])
```
`photoplan.json` = `{"<PLATE>": [["/abs/original.JPG", "<FTYPE>", "<FDESC name>"], …]}` in upload order.
FTYPE: the 4 corner views → "4 angles of vehicle photos"; Odometer Reading; Chassis Number; Engine Compartment →
"Engine view"; everything else → "Photographs of Damaged Parts". Never relabel with a hand-built dsp_docmanage URL.

## Step 9 · Select Parts + Labour (`playbook/07-select-parts-and-labour.md` + `memory/mistakes-log-sinar-batch2.md`)

```bash
node selcat2.mjs <cid> <ext> session_base.txt s2/cat_ABC1234.json        # catalogue: {"cat":[[value,label,checked]], "labs":[[label,checked]]}
VEHICLE="<Merimen model text>" python3 "$MRM/typesafe/step2_plan.py" s2/cat_ABC1234.json <final_ABC1234.json> rear s2/tick_ABC1234.json s2/miss_ABC1234.json
#   -> tick.json {"CP":[catalogue values], "N":[labour labels], "R":[labour labels]} + the items it could not match
#   READ the plan against the photos and the playbook before ticking. It is a draft, not the answer.
node tickall.mjs <cid> <ext> session_base.txt s2/tick_ABC1234.json > s2/tick_ABC1234.log 2>&1   # ticks, Save, Thatcham "Apply & Submit"
node selstate.mjs <cid> <ext> session_base.txt > state/sel_ABC1234_mine.json                   # snapshot MY choice (labour learning)
node untick.mjs <cid> <ext> session_base.txt '{"CP":["<part label>"],"CL":["<N label>"],"CLR":["<R label>"],"CM":["<misc label>"]}'
node gonext.mjs <cid> <ext> session_base.txt                                                   # -> dsp_details
```
`untick` matches the visible LABEL text (selstate output), `tickall` matches catalogue VALUES (`NN@partno`).
`CL` = labour N (left box), `CLR` = labour R (right box), `CM` = misc. Ticking N on a part label also adds that part.

## Step 10 · estimate details (`playbook/08-estimate-details.md`)

```bash
node labourfill.mjs <cid> <ext> session_base.txt AUT apply      # misc/labour from 5 nearest past cases (labour_all.json + labour_predict.py)
node estfill.mjs ABC1234 session_base.txt extmap.json v          # paint popup (pwset.mjs) + damage conditions + misc prices + paint 500
node addparts.mjs <cid> <ext> session_base.txt add.json save     # manual rows: [["70","Bumper Clips","10.00","15","Rear LH & Rear RH"], …]
node fillempty.mjs <cid> <ext> session_base.txt                  # condition on EMPTY rows only
node setcmt.mjs <cid> <ext> session_base.txt cmt.json            # {"<exact row name>": "Rear LH & Rear RH"}
node setcond.mjs <cid> <ext> session_base.txt cond.json          # {"<row name prefix>": "Cut"}
node setqty.mjs <cid> <ext> session_base.txt '{"Bumper Clips":"15","Bumper Rear Sensor":"2"}'   # by row-name prefix
node rows.mjs <cid> <ext> session_base.txt                       # [[name, qty, price, condition], …] -> check everything
node delrow.mjs <cid> <ext> session_base.txt "Name A|Name B"     # delete manual rows by exact name
node delrow_price.mjs <cid> <ext> session_base.txt "Name@123.45" # delete only the row with that name AND price
node dedup.mjs <cid> <ext> session_base.txt "<exact name>"       # keep one row of a duplicated name
```
`extmap.json` = `{"<PLATE>": {"cid": "…", "extid": "…"}}`. Account codes for labourfill: AUT (Autoris), NV (Newvest),
RW (Rawang). Manual-part prices: `python3 "$MRM/tools/price_lookup.py" part "<name>"` / `model "<model>"`
(same model first; flag prices with fewer than 5 reference rows).

## Other scripts here

`tickparts.mjs` (tick CP values only; older), `setcond.mjs`, `dedup.mjs`, `build_report.py`, `labour_predict.py` +
`labour_all.json` (217 past cases, used by labourfill), `pwset.mjs` (paint popup, imported by estfill).
`~/mrm-bot` holds many more one-off debug scripts (`insp*.mjs`, `diag*.mjs`, `modlk*.mjs` …). They are not part of
the workflow.
node wslookup.mjs session_base.txt "kw1|kw2"     # READ-ONLY: workshop Lookup rows for new workshops (blank claim form, nothing saved)

node revokephotos.mjs <cid> <ext> <from> <to>    # remove photos at positions to..from (UI Remove button, caption-checked; 2026-11-04)
