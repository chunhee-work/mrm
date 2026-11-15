# photo-model service

Runs the owner's trained photo-naming model (private HF repo `chunhee00/mrm-photo-model`, folder `production/`) for the
photo desk. Plan and decisions: https://github.com/chunhee-work/mrm/issues/26 (Revision 6).

- `predict_case.py` and `zones.py` are the original files, byte for byte (`SOURCE.sha256`, checked in the image build and in CI).
  They are never edited here. Everything around them is `core.py` (signing, queue, subprocess) and `app.py` (HTTP).
- Same runtime as the original machine: Python 3.9, torch 2.8.0, torchvision 0.23.0.
- The photos are only kept in a temp folder for the length of one job. Nothing is written to a log.

## Setting up the Space (owner, once)
1. Create a **private** Space, SDK **Docker**, free CPU, name e.g. `mrm-photo-model-service`. Push this folder as the Space repo root
   (plus a `README.md` header: `sdk: docker`, `app_port: 7860`).
2. Space **secrets**: `HF_TOKEN` (fine-grained token, read access to the model repo only; used only at build), `PHOTO_MODEL_SECRET`
   (long random string, the same value as in Vercel).
3. Space **variable**: `HF_REVISION` = the commit sha of the model repo to serve.
4. Vercel env (names only): `PHOTO_MODEL_URL` (the Space URL), `HF_SPACE_TOKEN` (fine-grained token, read access to this Space only),
   `PHOTO_MODEL_SECRET`, and last of all `PHOTO_MODEL_ENABLED=true` (unset or anything else means off).

## Tests
`python -m pytest tests` (no torch, no model: a fake predict script stands in).
