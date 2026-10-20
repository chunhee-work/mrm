# naming-desk: the 照片命名台 page

The page where the user checks the model's photo names before they go into Merimen. Live page:
https://claude.ai/artifact/K6yLWFN8XChRKRVHUFcUBR (rules: `playbook/03-photo-naming.md`).

| File | What |
|---|---|
| `template.html` | The page. `__DATA__` and `__NAMES__` are filled by `naming.py build`. It reads photos from `pics/<PLATE>.json` (one JSON of data-URIs per case, which keeps the published file count low) and stores edits in the page database. |
| `names.json` | The name list for the name box (1,247 names). `build` also adds every name the model produced. |
| `naming.py` | `build` (page + pics), `final` (model names + the user's edits + naming rules → `final_<PLATE>.json`), `plan` (→ `~/mrm-bot/photoplan.json` for the upload). |

Database of the page (read it with the `ArtifactData` tool, `action: "list"`, `out_dir`):
- `names/<PLATE>-NN`: `{case, n, src, model, name, at}`. Only photos the user renamed.
- `orders/<PLATE>`: `{case, order: [original n, …]}`. Only cases the user reordered.

Flow per batch:
1. Run `case_report.py` for every case.
2. Run `naming.py build`.
3. Publish `naming.html` with its `files` to the URL above.
4. The user reviews.
5. Read the database.
6. Run `naming.py final`.
7. Run `naming.py plan`.
8. Run `uploadphotos.mjs`, then `chkorder.mjs`.

The full commands are in `TUTORIAL.md`, steps 3 and 8. Tested on batch 2 (2026-10-20): `build` reproduced the published
photo files, and `plan` reproduced the uploaded plan. The only differences were in BRS8642 (see `HANDOVER.md`) and
names that the naming rules now spell differently.
