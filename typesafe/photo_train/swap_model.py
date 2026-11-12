#!/usr/bin/env python3
"""Show / change the production photo-naming models (models/production.json, read by `predict_case.py auto`).
  python3 swap_model.py show
  python3 swap_model.py set <json-file | inline json>
     e.g. set '{"groups": [{"stage1": "models/dinov2_b_big10a.pt", "seq": ["models/seq_best.pt", "models/seq_best_crop.pt"]},
                           {"stage1": "models/dinov2_l_big15.pt", "seq": ["models/seq_L15.pt"]}]}'
Each group = one backbone (stage-1 ckpt with "bb"/"dim") + its seq group models; several groups are averaged.
`set` checks every file exists and loads (and that each seq model fits its backbone's dim) before writing;
the old file is kept as models/production.json.prev."""
import json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PROD = os.path.join(HERE, "models", "production.json")
rel = lambda p: p if os.path.isabs(p) else os.path.join(HERE, p)


def check(cfg):
    import torch
    gs = cfg.get("groups")
    if not isinstance(gs, list) or not gs: sys.exit("need {\"groups\": [ ... ]} with at least one group")
    for k, g in enumerate(gs):
        s1 = g.get("stage1")
        if not s1 or not os.path.exists(rel(s1)): sys.exit("group %d: stage1 missing: %s" % (k, s1))
        ck = torch.load(rel(s1), map_location="cpu", mmap=True)
        if "state" not in ck or "labels" not in ck: sys.exit("group %d: %s is not a stage-1 checkpoint" % (k, s1))
        bb, dim = ck.get("bb", "vitb14"), ck.get("dim", 768)
        if ck["state"]["1.weight"].shape[1] != dim: sys.exit("group %d: %s head is %d-d, dim says %d" % (k, s1, ck["state"]["1.weight"].shape[1], dim))
        print("group %d: %s  bb=%s dim=%d labels=%d" % (k, s1, bb, dim, len(ck["labels"])))
        for p in g.get("seq", []):
            if not os.path.exists(rel(p)): sys.exit("group %d: seq missing: %s" % (k, p))
            sk = torch.load(rel(p), map_location="cpu")
            for f in ("ctx", "labels", "win"):
                if f not in sk: sys.exit("group %d: %s has no %r" % (k, p, f))
            sd, cr = sk.get("dim", dim), sk.get("crop", 0)
            if sk["ctx"]["base.weight"].shape[1] != dim or sd != dim * (2 if cr else 1):
                sys.exit("group %d: %s does not fit backbone %s (seq dim %d, crop %s, base %d-d; backbone %d-d)"
                         % (k, p, s1, sd, cr, sk["ctx"]["base.weight"].shape[1], dim))
            bk = sk.get("backbone")
            if bk and os.path.basename(bk) != os.path.basename(s1): print("  note: %s was trained on %s" % (p, bk))
            print("  seq %s  win=%d crop=%s labels=%d" % (p, sk["win"], cr, len(sk["labels"])))


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("show", "set"): sys.exit(__doc__)
    if sys.argv[1] == "show":
        cfg = json.load(open(PROD)); print(json.dumps(cfg, indent=1)); check(cfg); return
    if len(sys.argv) < 3: sys.exit(__doc__)
    a = sys.argv[2]
    cfg = json.load(open(a)) if os.path.exists(a) else json.loads(a)
    check(cfg)
    if os.path.exists(PROD): shutil.copy2(PROD, PROD + ".prev")
    tmp = PROD + ".tmp"; json.dump(cfg, open(tmp, "w")); os.replace(tmp, PROD)
    print("wrote", PROD, "(old one -> production.json.prev)" if os.path.exists(PROD + ".prev") else "")
    # 2026-11-12 (user): every new production model is frozen + backed up off the Mac (private Hugging Face repo)
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(HERE, "backup_model.py"), "upload"], capture_output=True, text=True)
    print((r.stdout.strip().splitlines() or [""])[-1] if r.returncode == 0 else
          "BACKUP FAILED (model still works locally; run `hf auth login`, then python3 backup_model.py upload): " + (r.stderr.strip().splitlines() or ["?"])[-1])


if __name__ == "__main__":
    main()
