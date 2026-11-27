"""DINOv2 names from predict_case.py (CPU). The weights stay outside git."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass


class ModelError(RuntimeError):
    pass


@dataclass(frozen=True)
class Prediction:
    file: str
    model_name: str | None
    confidence: float | None
    alts: tuple[str, ...]


def parse_predict_stdout(text: str) -> list[Prediction]:
    out: list[Prediction] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        obj = json.loads(line)
        top = obj.get("top") or []
        name = top[0][0] if top else None
        if not isinstance(name, str) or not name.strip() or name.strip() == "__none__":
            name = None
        else:
            name = " ".join(name.split())[:120]
        conf = obj.get("conf")
        if conf is None and top:
            conf = top[0][1]
        try:
            conf_n = None if name is None or conf is None else max(0.0, min(1.0, float(conf)))
        except (TypeError, ValueError):
            conf_n = None
        alts = []
        for item in top[1:3]:
            if isinstance(item, (list, tuple)) and item and isinstance(item[0], str):
                alt = " ".join(item[0].split())[:120]
                if alt and alt != name:
                    alts.append(alt)
        out.append(Prediction(str(obj.get("file") or ""), name, conf_n, tuple(alts)))
    return out


def predict_command(python: str, script: str, images: list[str], *, vehicle: str, prod_file: str, batch: int) -> tuple[list[str], dict[str, str]]:
    if script.startswith("/Users/") or any(p.startswith("/Users/") for p in images):
        raise ModelError("mac path")
    env = {
        "PROD": "1",
        "PROD_FILE": prod_file,
        "VEHICLE": vehicle[:120],
        "JEV": "0",
        "PRED_BS": str(batch),
    }
    return [python, script, "auto", *images], env


def names_for_photos(photos: list[dict], preds: list[Prediction]) -> list[dict]:
    """Match on the file name predict_case prints: the local file it was given (<photo id>-<name>, so two photos with the same
    name each get their own row), else the photo's own name. Does not touch final_name."""
    by = {os.path.basename(p.file): p for p in preds}
    rows = []
    for photo in photos:
        base = os.path.basename(photo.get("local") or photo.get("src_name") or photo.get("file") or "")
        hit = by.get(base)
        if hit is None:
            rows.append({"id": photo["id"], "failed": True, "name_error": "worker: no prediction"})
            continue
        rows.append({
            "id": photo["id"],
            "failed": False,
            "model_name": hit.model_name,
            "confidence": None if hit.confidence is None else f"{hit.confidence:.4f}",
            "alts": list(hit.alts),
            "how": "model",
            "name_state": "named",
        })
    return rows
