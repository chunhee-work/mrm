"""Prints every label the pinned checkpoints can output, as JSON. Used once in the dry run to build the label snapshot that the
web app's label-mapping test runs against. Mirrors predict_case.py: the labels of the sequence models (or of the stage-1 head when a group has none),
plus the runtime renames predict_case.py applies for 4-door cars (Tailgate Striker -> Boot Lid Striker)."""
import json
import os
import torch

here = os.path.dirname(os.path.abspath(__file__))
prod = json.load(open(os.environ.get("PROD_FILE", os.path.join(here, "models", "production.json"))))
labels = set()
for g in prod["groups"]:
    seq = g.get("seq", [])
    if seq:
        for p in seq:
            labels.update(torch.load(os.path.join(here, p), map_location="cpu")["labels"])
    else:
        labels.update(torch.load(os.path.join(here, g["stage1"]), map_location="cpu")["labels"])
out = sorted(labels)
if "Tailgate Striker" in labels and "Boot Lid Striker" not in labels:
    out = sorted(set(out) | {"Boot Lid Striker"})
print(json.dumps({"labels": out}))
