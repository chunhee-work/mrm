#!/usr/bin/env python3
"""Batch-end car-model table WITH the total price of every case (user 2026-11-04: "let me know the total price for every case").

  python3 final_report.py <batch_dir>
Reads <batch_dir>/car_model_report.md (phase_a step 11; Claude has filled the 选择理由 column) and the Adj Rpt grand total
of each case (adjtotal.mjs, read-only, same figure as the 6k check) -> prints the table with a 总价 column and the batch sum,
and writes <batch_dir>/final_report.md.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mrm import safe

b = sys.argv[1]
tot = {}
for l in safe("adjtotal.mjs", os.path.join(b, "ids.txt"), timeout=600).splitlines():
    m = re.match(r"(\S+) ([\d,]+\.\d\d)\b", l.strip())
    if m:
        tot[m.group(1)] = m.group(2)
out = []; s = 0.0; n = 0
for l in open(os.path.join(b, "car_model_report.md")).read().strip().splitlines():
    if l.startswith("| 车牌"):
        out.append(l + " 总价 |")
    elif l.startswith("|---"):
        out.append(l + "---|")
    elif l.startswith("|"):
        p = l.split("|")[1].strip(); t = tot.get(p)
        if t: s += float(t.replace(",", "")); n += 1
        out.append(l + f" {'RM' + t if t else '?'}{'  ⚠️ < 6000' if t and float(t.replace(',', '')) < 6000 else ''} |")
    else:
        out.append(l)
out.append(f"\n合计 {n} 个 case：RM{s:,.2f}")
open(os.path.join(b, "final_report.md"), "w").write("\n".join(out) + "\n"); print("\n".join(out))
