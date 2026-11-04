#!/usr/bin/env python3
"""Fill catalogue rows that Merimen shows with NO price (N/A / 0.00).

  python3 fillprices.py <batch_dir> [PLATE ...]      # dry run: prints the price it would use + source + ref count
  APPLY=1 python3 fillprices.py <batch_dir> [PLATE ...]

Price order (playbook 08): 1) same row elsewhere in this case (e.g. LH priced, RH N/A), 2) the user's price lists
tools/price-refs/*.tsv by exact part number, then by name, 3) tools/price_lookup.py median (all models),
4) fixed rule prices (Bumper Clips 10.00). Prices with < 5 reference rows are marked "FLAG".
"""
import glob, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe, par, ids, wait_login, H

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIXED = {r"^Bumper Clips": "10.00"}


def refs():
    out = []
    for f in glob.glob(os.path.join(REPO, "tools", "price-refs", "*.tsv")):
        for l in open(f):
            c = l.rstrip("\n").split("\t")
            if len(c) == 5 and re.match(r"^[\d.]+$", c[4] or "") and float(c[4]) > 0:
                out.append((os.path.basename(f), c[1], c[2], float(c[4])))
    return out


def base(n):
    return re.sub(r"\s*\[.*$", "", n).strip()


def lookup(name, model=""):
    # 2026-11-04: use `ref --model` (same model -> brand -> same class in the tier); the old all-models median priced a Mazda from a Vellfire
    r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "price_lookup.py"), "ref", name, "--model", model or ""], capture_output=True, text=True, cwd=REPO)
    m = re.search(r"REF .*?RM([\d,]+\.\d\d)\s+<- median of (\d+) rows, ([^\n]*)", r.stdout)
    if not m or "OTHER TIER" in m.group(3):
        return (None, 0)
    return (m.group(1).replace(",", ""), int(m.group(2)))


def plan(p, cat, rows, R, model=""):
    out = {}
    priced = {base(x[0]): x[2] for x in rows if x[2] not in ("", "N/A", "0.00")}
    pn = {l: (re.search(r"\(([^)]+)\)\s*$", l) or [None, None])[1] for _, l, _ in cat}
    for x in rows:
        if x[2] not in ("", "N/A", "0.00"):
            continue
        name = x[0]; b = base(name); side = re.sub(r"\b(LH|RH)\b", lambda m: "RH" if m.group(1) == "LH" else "LH", b)
        for rx, v in FIXED.items():
            if re.search(rx, b):
                out[name] = (v, "rule", 99); break
        else:
            if side in priced:
                out[name] = (priced[side].replace(",", ""), "other side in this case", 99); continue
            nos = [n for l, n in pn.items() if n and base(re.sub(r"^\S+ \[[^\]]*\] ", "", l)) == b]
            mk = (model.split() or [""])[0].upper()   # 2026-11-04: a price list only for its own brand (a Suzuki got a Perodua Myvi price)
            RB = [rf for rf in R if rf[0].split("_")[0].upper() == mk]
            hit = [rf for rf in RB if rf[2] in nos] or [rf for rf in RB if rf[1].lower() == b.lower()]
            if hit:
                out[name] = ("%.2f" % hit[0][3], f"price list {hit[0][0]}", len(hit) * 5); continue
            v, n = lookup(b, model)
            if v:
                out[name] = (v, f"price_lookup median of {n}", n)
    return out


def main():
    b = sys.argv[1]; I = ids(os.path.join(b, "ids.txt")); plates = sys.argv[2:] or list(I); R = refs(); apply = os.environ.get("APPLY") == "1"
    if apply:
        wait_login()
    global META
    try: META = json.load(open(os.path.join(b, "meta.json")))
    except (OSError, ValueError): META = {}
    def one(p):
        c, e = I[p]
        rows = json.loads(safe("rows.mjs", c, e, "session_base.txt") or "[]")
        cat = json.load(open(os.path.join(H, "s2", f"cat_{p}.json")))["cat"]
        pl = plan(p, cat, rows, R, META.get(p, ""))
        for k, (v, src, n) in pl.items():
            print(f"{p}  {k} -> {v}  ({src}){'  FLAG <5 refs' if n < 5 else ''}", flush=True)
        if apply and pl:
            f = os.path.join(H, "s2", f"autoprice_{p}.json"); json.dump({k: v for k, (v, _, _) in pl.items()}, open(f, "w"))
            print(p, safe("setprices.mjs", c, e, "session_base.txt", f).strip().splitlines()[-1], flush=True)
    par(one, plates)


if __name__ == "__main__":
    main()
