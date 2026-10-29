#!/usr/bin/env python3
"""Step 3 + 8 in parallel.

  python3 photos.py model  <batch_dir>             # photo model for every case in <batch_dir>/meta.json, PAR_MODEL at once (default 3)
  python3 photos.py upload <batch_dir> [PLATE ...] # upload photos (photoplan.json) + chkorder, PAR cases at once (default 5)

<batch_dir> holds <PLATE>/ (original photos), meta.json {PLATE: "<Merimen model text>"}, ids.txt (PLATE cid ext), report/ (case_report output).
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe, par, ids, wait_login

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PT = os.path.join(REPO, "typesafe", "photo_train")


def model(b):
    meta = json.load(open(os.path.join(b, "meta.json")))
    def one(p):
        r = subprocess.run([os.path.join(PT, ".venv/bin/python"), "case_report.py", os.path.join(b, p), p, meta[p], os.path.join(b, "report")],
                           cwd=PT, capture_output=True, text=True)
        line = (r.stdout + r.stderr).strip().splitlines()[-1:] or ["?"]
        print(p, line[0], flush=True)
    with ThreadPoolExecutor(int(os.environ.get("PAR_MODEL", "3"))) as ex:
        list(ex.map(one, meta))


def upload(b, plates):
    I = ids(os.path.join(b, "ids.txt")); plates = plates or list(I)
    wait_login()
    def one(p):
        c, e = I[p]
        safe("uploadphotos.mjs", p, c, e, "0", "999", timeout=3600)
        print(p, safe("chkorder.mjs", p, c, e).strip().splitlines()[-1], flush=True)
    par(one, plates)
    safe("closetabs.mjs")


if __name__ == "__main__":
    cmd, b = sys.argv[1], sys.argv[2]
    model(b) if cmd == "model" else upload(b, sys.argv[3:])
