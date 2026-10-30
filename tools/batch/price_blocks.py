#!/usr/bin/env python3
"""Append pricegrab.mjs output to tools/merimen-part-prices-data.md (catalogue rows only = rows with a part number; skip cases already in the file).
  python3 price_blocks.py <grab.json> <account label>"""
import json, re, sys, collections, os
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
F = os.path.join(REPO, "tools", "merimen-part-prices-data.md")
g = json.load(open(sys.argv[1])); acct = sys.argv[2]
txt = open(F).read(); have = {m.group(1).strip() for m in re.finditer(r"\(case ([^)]+)\)", txt)}
new, skip, nrows, man, models = [], 0, 0, 0, collections.Counter()
for pl, d in sorted(g.items(), key=lambda x: x[1].get("model", "")):
    if pl in have:
        skip += 1; continue
    rows, seen = [], set()
    for desc, _, pr, t in d.get("rows", []):
        m = re.match(r"^(.*?) (\S+) ([\d,]+\.\d\d)(?: [A-Z]{1,3})?$", t)
        if not m:
            man += 1; continue
        v = float(m.group(3).replace(",", ""))
        if v <= 0 or (desc, m.group(2)) in seen:
            continue
        seen.add((desc, m.group(2))); rows.append(f"- {desc} | {m.group(2)} | {v:,.2f}")
    if rows and d.get("model"):
        models[d["model"]] += 1; nrows += len(rows)
        new.append(f"## [OURS] {d['model']}  (case {pl})\n" + "\n".join(rows) + "\n")
if new:
    open(F, "a").write(f"\n<!-- harvested {acct}: {len(new)} cases, catalogue rows only (pricegrab.mjs) -->\n\n" + "\n".join(new))
print(f"{acct}: skipped (already in file) {skip}, new cases {len(new)}, catalogue rows {nrows}, manual rows left out {man}, models {len(models)}")
print(collections.Counter(m.split()[0] for m in models).most_common())
