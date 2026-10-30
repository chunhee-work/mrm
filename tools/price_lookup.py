#!/usr/bin/env python3
"""Local price/knowledge lookup for the Merimen part-price DB. Pure local, no network.
Usage:
  price_lookup.py model <keyword>   # show price block(s) for matching model+year
  price_lookup.py part <keyword>    # show a part's price across all models (compare)
  price_lookup.py part <keyword> --model <kw>   # same, only models matching <kw> (e.g. "PERODUA Myvi 2017")
  price_lookup.py brands [brand]    # brand -> model family -> number of cases (what the data covers)
  price_lookup.py models [keyword]  # list model names (optionally filtered)
  price_lookup.py                   # interactive
"""
import sys, os, re

# locate the data file
CANDIDATES = [
    os.path.expanduser("~/.claude/projects/-Users-chunhee-Projects-gacha-smm-playbook-mrm/memory/merimen-part-prices-data.md"),
    os.path.join(os.path.dirname(__file__), "merimen-part-prices-data.md"),
]
DATA = next((p for p in CANDIDATES if os.path.exists(p)), None)

def load():
    if not DATA:
        sys.exit("data file not found; edit CANDIDATES in this script")
    txt = open(DATA, encoding="utf-8").read()
    blocks = []
    for m in re.finditer(r"^## (.+?)\s*\(case ([^)]+)\)\s*\n(.*?)(?=^## |\Z)", txt, re.S | re.M):
        model, case, body = m.group(1).strip(), m.group(2).strip(), m.group(3)
        parts, totals = [], ""
        for line in body.splitlines():
            line = line.strip()
            if line.startswith("- **Totals:**"):
                totals = line.replace("- **Totals:**", "").strip()
            elif line.startswith("- "):
                cells = [c.strip() for c in line[2:].split("|")]
                parts.append(cells)  # [item, partno, price] or [item, price]
        blocks.append({"model": model, "case": case, "parts": parts, "totals": totals})
    return blocks

def show_model(blocks, kw):
    kw = kw.lower()
    hits = [b for b in blocks if kw in b["model"].lower()]
    if not hits:
        print(f"(no model matches '{kw}')"); return
    print(f"== {len(hits)} model(s) match '{kw}' ==\n")
    for b in hits[:12]:
        print(f"## {b['model']}   (case {b['case']})")
        for c in b["parts"]:
            print("   " + " | ".join(c))
        if b["totals"]: print("   Totals: " + b["totals"])
        print()
    if len(hits) > 12: print(f"... {len(hits)-12} more; refine the keyword.")

def fam(model):
    w = re.sub(r"^\[OURS\]\s*", "", model).split()
    return " ".join(w[:3] if w and w[0] in ("LAND", "GREAT", "MERCEDES-BENZ") and len(w) > 2 and w[0] != "MERCEDES-BENZ" else w[:2])

def show_part(blocks, kw, mkw=None):
    kw = kw.lower()
    rows = []
    if mkw:
        blocks = [b for b in blocks if all(t in b["model"].lower() for t in mkw.lower().split())]
        print(f"(only models matching '{mkw}': {len(blocks)} case blocks)")
    for b in blocks:
        for c in b["parts"]:
            if kw in c[0].lower():
                price = c[-1]
                rows.append((price, c[0], b["model"]))
    if not rows:
        print(f"(no part matches '{kw}')"); return
    # numeric sort
    def num(p):
        try: return float(p.replace(",", ""))
        except: return 0.0
    rows.sort(key=lambda r: num(r[0]))
    prices = [num(r[0]) for r in rows if num(r[0])>0]
    print(f"== '{kw}' found in {len(rows)} rows across models ==")
    if prices:
        print(f"   price range RM{min(prices):,.2f} – RM{max(prices):,.2f}  (median RM{sorted(prices)[len(prices)//2]:,.2f})\n")
    by = {}
    for pr, item, model in rows:
        if num(pr) > 0: by.setdefault(fam(model), []).append(num(pr))
    if len(by) > 1:
        print("   by brand + model (cases, median):")
        for f, v in sorted(by.items(), key=lambda x: -len(x[1]))[:15]:
            v.sort(); print(f"     {f:28} {len(v):4}  RM{v[len(v)//2]:,.2f}")
        print()
    for price, item, model in rows[:40]:
        print(f"   RM{price:>10}  {item[:42]:42}  [{model[:44]}]")
    if len(rows) > 40: print(f"   ... {len(rows)-40} more.")

def list_models(blocks, kw=None):
    names = sorted(b["model"] for b in blocks)
    if kw: names = [n for n in names if kw.lower() in n.lower()]
    for n in names: print(n)
    print(f"\n{len(names)} models.")

def brands(blocks, kw=None):
    t = {}
    for b in blocks:
        f = fam(b["model"]); br = f.split()[0] if f else "?"
        if kw and kw.lower() not in br.lower(): continue
        t.setdefault(br, {}).setdefault(f, 0); t[br][f] += 1
    for br, fs in sorted(t.items(), key=lambda x: -sum(x[1].values())):
        print(f"{br} ({sum(fs.values())} cases): " + ", ".join(f"{f.split(' ',1)[-1]} {n}" for f, n in sorted(fs.items(), key=lambda x: -x[1])))

def main():
    blocks = load()
    args = sys.argv[1:]
    if not args:
        print(f"[local price lookup — {len(blocks)} models loaded]  commands: model <kw> | part <kw> | models [kw] | quit")
        while True:
            try: line = input("> ").strip()
            except EOFError: break
            if line in ("quit","exit","q",""): break
            parts = line.split(None, 1)
            cmd = parts[0]; kw = parts[1] if len(parts)>1 else ""
            if cmd=="model": show_model(blocks, kw)
            elif cmd=="part": show_part(blocks, kw)
            elif cmd=="models": list_models(blocks, kw or None)
            else: show_part(blocks, line)  # default: treat as part search
        return
    mkw = None
    if "--model" in args:
        i = args.index("--model"); mkw = " ".join(args[i+1:]); args = args[:i]
    cmd, kw = args[0], " ".join(args[1:])
    if cmd == "brands":
        return brands(blocks, kw or None)
    if cmd == "part":
        return show_part(blocks, kw, mkw)
    {"model":show_model, "part":show_part}.get(cmd, lambda b,k: list_models(b, k or None) if cmd=="models" else show_part(b, " ".join(args)))(blocks, kw)

if __name__ == "__main__":
    main()
