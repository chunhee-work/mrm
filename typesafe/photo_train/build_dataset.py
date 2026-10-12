#!/usr/bin/env python3
"""index.jsonl -> split/{train,test}/<label>/<file> symlinks. Split is BY CASE (no case in both).
Merimen captions stay untouched in index.jsonl; only the training label is normalised:
same name in different letter case/spacing, and the user-confirmed synonyms, become one class."""
import collections, json, os, random, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
MIN_PER_LABEL = 8
HOLDOUT = {"21915115"}          # CDD5894: user-checked case, always test

SYN = [(r"^Front Bumper Cover$", "Front Bumper"),
       (r"^Fog Lamp (LH|RH)$", r"Front Bumper Fog Lamp \1"),
       (r"^Headlamp Assy (LH|RH)$", r"Headlamp \1")]


def label(name):
    n = re.sub(r"\s+", " ", name).strip()
    n = re.sub(r"\b(lh|rh)\b", lambda m: m.group(1).upper(), n, flags=re.I)
    n = " ".join(w if w.isupper() or "/" in w else w[:1].upper() + w[1:].lower() for w in n.split(" "))
    for a, b in SYN:
        n = re.sub(a, b, n)
    return n


def folder(lab):
    return lab.replace("/", "∕")


if __name__ == "__main__":
    rows = [json.loads(l) for l in open(os.path.join(HERE, "index.jsonl"))]
    for r in rows:
        r["label"] = label(r["name"])
    cnt = collections.Counter(r["label"] for r in rows)
    keep = {k for k, v in cnt.items() if v >= MIN_PER_LABEL and k}
    cases = sorted({r["cid"] for r in rows} - HOLDOUT)
    random.Random(7).shuffle(cases)
    test_cases = set(cases[: max(1, len(cases) * 15 // 100)]) | HOLDOUT
    out = os.path.join(HERE, "split")
    shutil.rmtree(out, ignore_errors=True)
    n = collections.Counter()
    for r in rows:
        if r["label"] not in keep:
            continue
        part = "test" if r["cid"] in test_cases else "train"
        dd = os.path.join(out, part, folder(r["label"]))
        os.makedirs(dd, exist_ok=True)
        dst = os.path.join(dd, r["file"].replace("/", "_"))
        if not os.path.exists(dst):
            os.link(os.path.join(HERE, "data", r["file"]), dst)
        n[part] += 1
    json.dump(sorted(test_cases), open(os.path.join(HERE, "test_cases.json"), "w"))
    print("photos", len(rows), "labels total", len(cnt), "kept", len(keep), "train", n["train"], "test", n["test"],
          "test cases", len(test_cases))
    print("dropped (rare) photos:", sum(v for k, v in cnt.items() if k not in keep))
