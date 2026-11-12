#!/usr/bin/env python3
"""Keep the production photo model safe (user 2026-11-12).
  python3 backup_model.py freeze   -> copy the production files to models/frozen/ (training never writes there)
  python3 backup_model.py upload   -> freeze + upload them + production.json to the PRIVATE Hugging Face repo <your account>/mrm-photo-model
  python3 backup_model.py restore  -> download the latest backup from Hugging Face into models/ (new Mac / after a crash)
swap_model.py set runs `upload` automatically, so every production version is kept in the repo history.
Login once: `hf auth login` (the token lives in ~/.cache/huggingface, never in this repo)."""
import json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(HERE, "models"); PROD = os.path.join(M, "production.json"); FROZEN = os.path.join(M, "frozen")
def _repo():
    if os.environ.get("MRM_MODEL_REPO"): return os.environ["MRM_MODEL_REPO"]
    from huggingface_hub import whoami
    return whoami()["name"] + "/mrm-photo-model"   # the logged-in account (2026-11-12: chunhee00)


def files():
    cfg = json.load(open(PROD))
    return [p for g in cfg["groups"] for p in [g["stage1"], *g.get("seq", [])]]


def freeze():
    os.makedirs(FROZEN, exist_ok=True)
    keep = set()
    for p in files():
        src = os.path.join(HERE, p); dst = os.path.join(FROZEN, os.path.basename(p)); keep.add(os.path.basename(p))
        if not (os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(src) and os.path.getmtime(dst) >= os.path.getmtime(src)):
            shutil.copy2(src, dst + ".tmp"); os.replace(dst + ".tmp", dst)
    shutil.copy2(PROD, os.path.join(FROZEN, "production.json")); keep.add("production.json")
    for f in os.listdir(FROZEN):
        if f not in keep: os.remove(os.path.join(FROZEN, f))
    print("frozen:", ", ".join(sorted(keep)))


def upload():
    from huggingface_hub import HfApi
    freeze(); api = HfApi()
    REPO = _repo(); api.create_repo(REPO, private=True, exist_ok=True)
    tag = " + ".join(os.path.basename(g["stage1"]) for g in json.load(open(PROD))["groups"])
    api.upload_folder(repo_id=REPO, folder_path=FROZEN, path_in_repo="production", commit_message="production: " + tag,
                      delete_patterns=["production/*"])
    print("uploaded to https://huggingface.co/" + REPO + " (private):", tag)


def restore():
    from huggingface_hub import snapshot_download
    d = snapshot_download(_repo(), allow_patterns=["production/*"])
    cfg = json.load(open(os.path.join(d, "production", "production.json")))
    os.makedirs(M, exist_ok=True)
    for g in cfg["groups"]:
        for p in [g["stage1"], *g.get("seq", [])]:
            dst = os.path.join(HERE, p); os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(d, "production", os.path.basename(p)), dst); print("restored", p)
    shutil.copy2(os.path.join(d, "production", "production.json"), PROD); freeze()


if __name__ == "__main__":
    {"freeze": freeze, "upload": upload, "restore": restore}[sys.argv[1] if len(sys.argv) > 1 else "freeze"]()
