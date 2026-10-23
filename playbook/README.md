# Merimen TP-claim playbook — index

One checklist per workflow step, consolidated from `mrm/memory/` (newest rule wins; "(was: …)" marks old rules). Each bullet ends with its source memory in [brackets]. Order of a case: **Phase A** read → create → photo artifact → report → rates → narratives → DOC upload → photo upload → `照片命名台 ready` and WAIT for the user's done; **Phase B** relabel to the user's names → Step 2 parts/labour/misc → estimate details → sheet → car-model report (user 2026-10-23).

| File | Read it when |
|---|---|
| [00-start-and-rules.md](00-start-and-rules.md) | Start of every session/batch: autonomy (never ask; only a missing doc stops a case), Chinese replies, Chrome 9222 + relogin + keepalive, logout causes, tabs, push notification, WhatsApp "下载", sheet paste mechanics, git, security. |
| [01-read-documents.md](01-read-documents.md) | Before keying any case: locating files, reading the bundle, who is claimant vs at-fault, data-conflict rules, missing-doc lines, insurer COIDs, what to extract. Also for "send me data". |
| [02-create-case.md](02-create-case.md) | Creating the case: createpar2_sinar.mjs JSON, create-form fixed values, INS/TPOWN gate, workshop Lookup + names, model variant (trim, green = parts data), Manager/Adjuster, getext_one. |
| [03-photo-naming.md](03-photo-naming.md) | As soon as the model is chosen: run the photo model, 照片命名台 artifact (db names/orders), every naming rule (crosshair, zoom, sides, merges, PERODUA/lorry/boot-lid rules), learning loop. |
| [04-adjuster-report.md](04-adjuster-report.md) | Filling dsp_estmain with reportpar.mjs: JSON keys, pink required boxes, police/loss fields, every party's fields, vehicle/condition/tyres, labour type, Total Loss. |
| [05-rates-and-narratives.md](05-rates-and-narratives.md) | Discount 10/0 + labour 30×4 (disclabourpar), reading the betterment, the 5 narratives (narrpar, tpKind). |
| [06-upload-docs-and-photos.md](06-upload-docs-and-photos.md) | Uploading PDFs (DOC/RC/INS/P.REPORT/JPJ SEARCH, FTYPE Other, compression) and photos (one shot, maxno=250, types, originals), chkorder, relabel_ui, duplicates. |
| [07-select-parts-and-labour.md](07-select-parts-and-labour.md) | **Before every Step 2.** Every-item rule, exact name/side/group, group codes, qty + comments, all companion parts, sensors, Thatcham, Labour N/R bundles, misc by impact, snapshot of my choice. |
| [08-estimate-details.md](08-estimate-details.md) | On dsp_details: labourfill/estfill/addparts/fillempty/setcmt/setqty/delrow, damage-condition table + corrections, misc prices, paint popup, manual pricing, RM6,000 minimum. |
| [10-car-models.md](10-car-models.md) | Per car model: rare (冷门) items, Inner/Outer layouts, the catalogue's name for each photo name, items missing from the catalogue. Read at photo naming and Select Parts; add to it after every case. |
| [09-finish-and-report.md](09-finish-and-report.md) | End of batch: re-check, sheet rows, push notification, completion table, step-12 car-model report (⚠️), re-sync after user review, labour-diff learning, commit/push. |

Also read `mrm/memory/mistakes-log-sinar-batch2.md` before Step 2 if it has entries newer than this playbook.
