#!/usr/bin/env python3
"""Measure the model-variant judgment against real corrected cases.
   Usage:  python3 typesafe/run_eval.py
   Needs TYPESAFE_API_KEY in the environment."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from judgments import pick_model_variant
from client import TypeSafeError

HERE = os.path.dirname(os.path.abspath(__file__))
cases = json.load(open(os.path.join(HERE, "eval_cases.json")))["cases"]

ts_hits = regex_hits = escalated = 0
rows = []
for c in cases:
    try:
        r = pick_model_variant(c["candidates"], c["rc_line"], c["insurance_line"],
                               c["reg_date"], c["chassis"], c["cc"], c.get("notes"))
    except TypeSafeError as e:
        print("ERROR:", e); sys.exit(1)
    ts_ok = (r["value"] == c["expected"])
    rx_ok = (c["regex_picked"] == c["expected"])
    ts_hits += ts_ok; regex_hits += rx_ok; escalated += (not r["ok"])
    rows.append((c["plate"], ts_ok, rx_ok, r["ok"], r["confidence"], r["value"]))

w = max(len(r[0]) for r in rows)
print("%-*s  TypeSafe  regex  auto?  conf   picked" % (w, "plate"))
for p, t, x, ok, conf, v in rows:
    print("%-*s  %-8s  %-5s  %-5s  %.2f   %s" % (
        w, p, "PASS" if t else "FAIL", "PASS" if x else "FAIL",
        "yes" if ok else "REVIEW", conf, (v or "")[:52]))
n = len(cases)
print("\nTypeSafe %d/%d correct   |   old regex %d/%d   |   %d sent for review"
      % (ts_hits, n, regex_hits, n, escalated))
print("A case that is wrong AND sent for review is a caught error, not a silent one.")
