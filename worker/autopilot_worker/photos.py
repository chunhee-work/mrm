"""DINOv2 names from predict_case.py (CPU). The weights stay outside git."""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, replace


class ModelError(RuntimeError):
    pass


@dataclass(frozen=True)
class Prediction:
    file: str
    model_name: str | None
    confidence: float | None
    alts: tuple[str, ...]
    top: tuple[str, ...] = ()  # every name predict_case printed, best first (raw, before the naming rules)


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
        raw = tuple(" ".join(t[0].split())[:120] for t in top if isinstance(t, (list, tuple)) and t and isinstance(t[0], str))
        out.append(Prediction(str(obj.get("file") or ""), name, conf_n, tuple(alts), raw))
    return out


# ---- the shop's naming rules on the model's names (the same as typesafe/photo_train/case_report.py + tools/naming-desk/naming.py
# build on the owner's Mac, 2026-11-28). Without them the worker stored the model's raw top-1 (banned / unmerged spellings, Perodua
# names on other makes).
FIX = {"ENGINEVIEW": "Engine Compartment", "FRT GENERAL VIEW": "Front View"}
# names a car model does NOT have -> next guess, marked unsure (naming.py MODEL_BANS)
MODEL_BANS = [(r"\bViva\b", r"^Quarter Liner"), (r"^PERODUA\b", r"^Front Panel Assembly$")]
# (vehicle must NOT match, name, replacement): only Perodua has these (naming.py MODEL_SWAPS)
MODEL_SWAPS = [(r"^PERODUA\b", r"^Bonnet Latch Stud Plate", "Front Panel Assembly"),
               (r"^PERODUA\b", r"^Fender Inner (LH|RH)$", "Front Panel Assembly")]
_FINAL = None


def _final_fn():
    """name_map.final from typesafe/photo_train (merged spellings, the owner's decisions; None = a banned name). Missing -> keep names."""
    global _FINAL
    if _FINAL is None:
        here = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "typesafe", "photo_train"))
        try:
            if here not in sys.path:
                sys.path.insert(0, here)
            from name_map import final  # noqa: PLC0415
            _FINAL = final
        except Exception as e:  # noqa: BLE001
            print(f"name rules: name_map not loaded ({type(e).__name__}), names kept as the model gave them", file=sys.stderr)
            _FINAL = lambda n: n  # noqa: E731
    return _FINAL


def apply_name_rules(preds: list[Prediction], vehicle: str, final=None) -> list[Prediction]:
    final = final or _final_fn()
    v = (vehicle or "").strip()
    w = v.upper().split()
    brand = " ".join(w[:2]) if w[:2] in (["LAND", "ROVER"], ["GREAT", "WALL"], ["KING", "LONG"], ["DONG", "FENG"]) else (w[0] if w else "")
    bans = [b for vre, b in MODEL_BANS if re.search(vre, v, re.I)]
    out = []
    for p in preds:
        names = list(p.top) or ([p.model_name] if p.model_name else [])
        allowed = list(dict.fromkeys(n for n in (final(FIX.get(t, t)) for t in names) if n and n != "__none__"))
        if not allowed:
            out.append(p)
            continue
        name, conf, rest = allowed[0], p.confidence, allowed[1:]
        if bans and any(re.search(b, name) for b in bans):
            alt = next((a for a in rest if not any(re.search(b, a) for b in bans)), None)
            if alt:
                rest = [a for a in rest if a != alt]
                name, conf = alt, None if conf is None else min(conf, 0.3)
        for notv, nm, rep in MODEL_SWAPS:
            if v and not re.search(notv, v, re.I) and re.search(nm, name):
                name = rep
        if brand and name.endswith("Badge (LOGO)"):  # playbook 11: a bare logo badge = the car's brand, in CAPITALS
            name = name.replace("(LOGO)", "(" + brand + ")")
        out.append(replace(p, model_name=name[:120], confidence=conf, alts=tuple(a for a in rest if a != name)[:2]))
    return out


def resolve_production(model_dir: str) -> str:
    """production.json lists "models/<file>.pt"; predict_case resolves those against typesafe/photo_train/, where the worker has no
    weights. Write a copy that points at <model_dir>/production/<file> and check every file is there."""
    d = os.path.join(model_dir, "production")
    src = os.path.join(d, "production.json")
    if not os.path.isfile(src):
        raise ModelError("model missing")
    cfg = json.load(open(src, encoding="utf-8"))
    for g in cfg.get("groups", []):
        g["stage1"] = os.path.join(d, os.path.basename(g["stage1"]))
        g["seq"] = [os.path.join(d, os.path.basename(x)) for x in g.get("seq", [])]
        for f in [g["stage1"], *g["seq"]]:
            if not os.path.isfile(f):
                raise ModelError("model missing")
    out = os.path.join(d, "production.resolved.json")
    tmp = f"{out}.{os.getpid()}.tmp"  # one file per process: two cases naming at once must not write the same tmp file
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh)
    os.replace(tmp, out)
    return out


def ensure_weights(model_dir: str, repo: str, token: str) -> str:
    """Download production/ from the private Hugging Face repo once (no-op when the files are already there)."""
    try:
        return resolve_production(model_dir)
    except ModelError:
        pass
    if not token:
        raise ModelError("model missing")
    try:
        from huggingface_hub import snapshot_download  # noqa: PLC0415
        snapshot_download(repo_id=repo, allow_patterns=["production/*"], local_dir=model_dir, token=token)
    except Exception as e:  # noqa: BLE001  (the token is never printed)
        raise ModelError("model download failed") from e
    return resolve_production(model_dir)


def predict_timeout(n: int) -> int:
    """Two backbones (ViT-B + ViT-L) on CPU: ~2-4 s a photo. 600 s cut off cases with 100+ photos."""
    return max(600, 300 + 8 * n)


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
