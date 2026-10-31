#!/usr/bin/env python3
"""Snapshot of harvested photos -> big_paths.txt + big_meta.tsv.
Same 44 test cases held out; training capped at CAP photos per name (balanced, bounded time)."""
import re, collections, csv, json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_dataset import label
CAP, MIN = int(os.environ.get("CAP", "300")), int(os.environ.get("MIN", "8"))
OVERRIDE = {("21915115", 37): "Front Panel", ("21915115", 38): "Front Bumper Reinforcement",
            ("21915115", 39): "Front Bumper Reinforcement", ("21915115", 40): "Front Bumper Reinforcement"}
M = {r["raw"]: r for r in csv.DictReader(open(os.path.join(HERE, "name_map.tsv")), delimiter="\t")}
def clean(raw):
    raw = re.sub(r"\s*[\t\r\n]+\s*", " ", raw).strip()   # same normalisation as name_map.py
    r = M.get(raw)
    if r is None: return label(raw)
    if r["method"].startswith(("generic", "multi-item")): return None
    return r["official"] or label(raw)
rows = []
for l in open(os.path.join(HERE, "index.jsonl")):
    try: rows.append(json.loads(l))
    except ValueError: pass
test = set(json.load(open(os.path.join(HERE, "test_cases.json"))))
UC = {}
for _f in ("claude_corrections.json", "user_corrections.json"):
    if os.path.exists(os.path.join(HERE, _f)): UC.update(json.load(open(os.path.join(HERE, _f))))
labs = [UC.get("%s:%d" % (r["cid"], r["seq"])) or OVERRIDE.get((r["cid"], r["seq"]), clean(r["name"])) for r in rows]
# PERODUA front panel rule (user): Perodua never "Front Panel Assembly"; other makes never the split pieces
VEH = json.load(open(os.path.join(HERE, "lamp_models.json"))) if os.path.exists(os.path.join(HERE, "lamp_models.json")) else {}
VEH = {k: v for k, v in VEH.items() if v and v != "-"}   # "-" = case not readable (Invalid Case Status) = unknown
SPLIT_RX = re.compile(r"^(Front Panel Upper|Fender Inner (LH|RH)|Front Crossmember|Front Panel Lower)$")
def make_fix(r, l):
    v = VEH.get(r["cid"], "").upper()
    if not l or not v or UC.get("%s:%d" % (r["cid"], r["seq"])): return l
    if re.search(r"LORRY|TRUCK", v) and re.match(r"^Front Chassis Member (LH|RH)$", l): return "Front Chassis Member"   # lorry: no side
    if "PERODUA" in v: return None if l == "Front Panel Assembly" else l   # which split piece is unknown -> drop
    return "Front Panel Assembly" if SPLIT_RX.match(l) else l
labs = [make_fix(r, l) for r, l in zip(rows, labs)]
# user 2026-10-14: motorcycle cases are not taken (motor.py -> motor_cases.json)
MOTOR = set(json.load(open(os.path.join(HERE, "motor_cases.json")))) if os.path.exists(os.path.join(HERE, "motor_cases.json")) else set()
labs = [None if r["cid"] in MOTOR else l for r, l in zip(rows, labs)]
# same name written with different spaces/case (BOOTLID, Bootlid, Boot Lid) -> the most common spelling
_sq = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
_best = {}
for l, n in collections.Counter(l for l in labs if l).most_common():
    _best.setdefault(_sq(l), l)
labs = [_best[_sq(l)] if l else l for l in labs]
# user 2026-10-17: duplicate-name review -> name_map.final() decisions + same words in any order = one name
from name_map import final, order_key
labs = [final(l) for l in labs]
_best = {}
for l, n in collections.Counter(l for l in labs if l).most_common():
    _best.setdefault(order_key(l), l)
labs = [_best[order_key(l)] if l else l for l in labs]
labs = [None if l and re.fullmatch(r"[\d\s./-]+", l) else l for l in labs]
labs = [None if l and re.fullmatch(r"(Tailgate|Boot Lid) Hinge", l) else l for l in labs]   # user: hinge always needs LH/RH   # number-only is never a part name
cnt = collections.Counter(l for r, l in zip(rows, labs) if l and r["cid"] not in test)
keep = {k for k, v in cnt.items() if v >= MIN}
pool = collections.defaultdict(list)
for i, (r, l) in enumerate(zip(rows, labs)):
    if l in keep and r["cid"] not in test: pool[l].append(i)
rnd = random.Random(11); chosen = set()
# user 2026-10-12: items the model already gets right (>=90% on test) need no more training -> small cap; focus on low-% items
STRONG = set(open(os.path.join(HERE, "strong_labels.txt")).read().split("\n")) if os.path.exists(os.path.join(HERE, "strong_labels.txt")) else set()
STRONG_CAP = int(os.environ.get("STRONG_CAP", "300"))
for l, ids in pool.items():
    rnd.shuffle(ids); chosen.update(ids[:STRONG_CAP if l in STRONG else CAP])
# 2026-10-31: the user's own answers (部位标注台) are always trained, never dropped by the per-name cap (UC_ALWAYS=0 = old behaviour)
if os.environ.get("UC_ALWAYS", "1") == "1":
    chosen.update(i for l, ids in pool.items() for i in ids if "%s:%d" % (rows[i]["cid"], rows[i]["seq"]) in UC)
with open(os.path.join(HERE, "big_paths.txt"), "w") as fp, open(os.path.join(HERE, "big_meta.tsv"), "w") as fm:
    fp.write("\n".join("data/" + r["file"] for r in rows))
    for i, (r, l) in enumerate(zip(rows, labs)):
        role = "test" if r["cid"] in test and l else ("train" if i in chosen else "skip")
        fm.write("%s\t%s\t%d\t%s\n" % (l or "", r["cid"], r["seq"], role))
print("photos", len(rows), "classes", len(keep), "train", len(chosen), "test", sum(1 for r, l in zip(rows, labs) if r["cid"] in test and l))
