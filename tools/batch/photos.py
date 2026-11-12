#!/usr/bin/env python3
"""Step 3 + 8 in parallel.

  python3 photos.py model  <batch_dir>             # photo model for every case in <batch_dir>/meta.json, PAR_MODEL at once (default 3)
  python3 photos.py upload <batch_dir> [PLATE ...] # upload photos (photoplan.json) + chkorder, PAR cases at once (default 5)

<batch_dir> holds <PLATE>/ (original photos), meta.json {PLATE: "<Merimen model text>"}, ids.txt (PLATE cid ext), report/ (case_report output).
"""
import re, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe, par, ids, wait_login, close_tabs_if_alone

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PT = os.path.join(REPO, "typesafe", "photo_train")


def model(b):
    # META=<file>: e.g. meta_rc.json (RC make/model only) so the 照片命名台 can go out before step 1 is finished (user 2026-11-04)
    mf = os.environ.get("META") or os.path.join(b, "meta.json"); meta = json.load(open(mf))
    def one(p):
        r = subprocess.run([os.path.join(PT, ".venv/bin/python"), "case_report.py", os.path.join(b, p), p, meta[p], os.path.join(b, "report")],
                           cwd=PT, capture_output=True, text=True)
        line = (r.stdout + r.stderr).strip().splitlines()[-1:] or ["?"]
        print(p, line[0], flush=True)
    with ThreadPoolExecutor(int(os.environ.get("PAR_MODEL", "3"))) as ex:
        list(ex.map(one, meta))
    nd = os.path.join(REPO, "tools", "naming-desk", "naming.py")
    o = subprocess.run([sys.executable, nd, "build", os.path.join(b, "report"), mf], capture_output=True, text=True)
    print("NAMING PAGE BUILT -> publish report/naming.html now:", (o.stdout + o.stderr).strip().splitlines()[-1:], flush=True)


def upload(b, plates):
    I = ids(os.path.join(b, "ids.txt")); plates = plates or list(I)
    wait_login()
    def one(p):
        c, e = I[p]
        have = safe("chkorder.mjs", p, c, e).strip().splitlines()[-1:] or [""]
        m = re.search(r"photos (\d+)", have[0])
        if m and m.group(1) != "0" and os.environ.get("FORCE") != "1":   # 2026-11-04: never upload twice (batch 8 duplicated 3 cases)
            print(p, "already has", m.group(1), "photos -> skipped (FORCE=1 to upload anyway)", flush=True); return
        safe("uploadphotos.mjs", p, c, e, "0", "999", timeout=3600)
        # 2026-11-04: re-upload photos Merimen dropped (batch 9: SYG7166 #3, VFT4204 #4 #19 found by hand); Phase B relabel puts them in order
        for _ in range(2):
            out = safe("chkorder.mjs", p, c, e)
            m = re.search(r"MISSING ([\d,]+)", out)
            if not m:
                break
            for i in m.group(1).split(","):
                safe("uploadphotos.mjs", p, c, e, i, str(int(i) + 1), timeout=600)
            print(p, "re-uploaded missing photos", m.group(1), flush=True)
        print(p, safe("chkorder.mjs", p, c, e).strip().splitlines()[-1], flush=True)
    par(one, plates)
    close_tabs_if_alone()


if __name__ == "__main__":
    cmd, b = sys.argv[1], sys.argv[2]
    model(b) if cmd == "model" else upload(b, sys.argv[3:])
