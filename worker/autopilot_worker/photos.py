"""DINOv2 names from predict_case.py (CPU). The weights stay outside git."""

from __future__ import annotations

import json
import os
import contextlib
import fcntl
import sys
import tempfile
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


# ---- the shop's naming rules on the model's names. ONE copy: typesafe/photo_train/name_rules.py, also used by
# tools/naming-desk/naming.py build on the owner's Mac; the first pick is case_report.name_of (first name the rules allow).
_PT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "typesafe", "photo_train"))


def load_rules():
    """(name_map.final, name_rules). They ship in the same image, so a failed import is a deploy bug: fail the job (the website then
    names the photos with Claude) instead of storing raw, unmerged or banned names."""
    try:
        if _PT not in sys.path:
            sys.path.insert(0, _PT)
        from name_map import final  # noqa: PLC0415
        import name_rules  # noqa: PLC0415
    except Exception as e:  # noqa: BLE001
        raise ModelError("name rules missing") from e
    return final, name_rules


def apply_name_rules(preds: list[Prediction], vehicle: str, final=None) -> list[Prediction]:
    """preds = one case's photos in shooting order (the Rear Lamp Inner/Outer rule looks at the whole case)."""
    final_, nr = load_rules()
    final = final or final_
    vehicle = (vehicle or "").strip()
    rows = []
    for p in preds:
        top = list(p.top) or ([p.model_name] if p.model_name else [])
        if not top:
            rows.append(None)
            continue
        name = next((n for n in (final(nr.FIX.get(t, t)) for t in top) if n), None) or nr.FIX.get(top[0], top[0])
        alts = [a for a in (final(nr.FIX.get(t, t)) for t in top[1:4]) if a and a != name][:2]
        rows.append({"name": name, "conf": 0.0 if p.confidence is None else p.confidence, "alts": alts})
    nr.apply_case([r for r in rows if r], vehicle, final)
    out = []
    for p, r in zip(preds, rows):
        if r is None:
            out.append(p)
            continue
        conf = None if p.confidence is None else r["conf"]
        out.append(replace(p, model_name=r["name"][:120], confidence=conf, alts=tuple(a for a in r["alts"] if a != r["name"])[:2]))
    return out


def resolve_production(model_dir: str) -> str:
    """production.json lists "models/<file>.pt"; predict_case resolves those against typesafe/photo_train/, where the worker has no
    weights. Write a copy that points at <model_dir>/production/<file> and check every file is there."""
    d = os.path.join(model_dir, "production")
    src = os.path.join(d, "production.json")
    if not os.path.isfile(src):
        raise ModelError("model missing")
    try:
        cfg = json.load(open(src, encoding="utf-8"))
        for g in cfg.get("groups", []):
            g["stage1"] = os.path.join(d, os.path.basename(g["stage1"]))
            g["seq"] = [os.path.join(d, os.path.basename(x)) for x in g.get("seq", [])]
            for f in [g["stage1"], *g["seq"]]:
                if not os.path.isfile(f):
                    raise ModelError("model missing")
        out = os.path.join(d, "production.resolved.json")
        text = json.dumps(cfg)
        if os.path.isfile(out) and open(out, encoding="utf-8").read() == text:
            return out  # unchanged: never rewrite a file another case's predict_case may be reading
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")  # a unique name: two cases at once never share a tmp file
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, out)
    except ModelError:
        raise
    except (OSError, ValueError, KeyError, TypeError) as e:  # a broken production.json is "model missing", so the website falls back
        raise ModelError("model missing") from e
    return out


@contextlib.contextmanager
def _locked(model_dir: str, name: str):
    """flock on <model_dir>/<name>: each call opens the file itself, so it keeps out other threads of this worker and other processes."""
    try:
        os.makedirs(model_dir, exist_ok=True)
        lk = open(os.path.join(model_dir, name), "w")
    except OSError as e:
        raise ModelError("model missing") from e
    with lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        yield


def _revision_file(model_dir: str) -> str:
    return os.path.join(model_dir, ".revision")


def ensure_weights(model_dir: str, repo: str, token: str, revision: str = "") -> str:
    """Download production/ from the private Hugging Face repo once (no-op when the files are already there). With HF_MODEL_REVISION
    set, a folder downloaded at another revision is downloaded again, so a new model = change that setting and restart."""
    with _locked(model_dir, ".lock"):  # cases at once download and resolve one at a time
        have = open(_revision_file(model_dir), encoding="utf-8").read().strip() if os.path.isfile(_revision_file(model_dir)) else ""
        if not revision or have == revision:
            try:
                return resolve_production(model_dir)
            except ModelError:
                pass
        if not token:
            raise ModelError("model missing")
        try:
            from huggingface_hub import snapshot_download  # noqa: PLC0415
            snapshot_download(repo_id=repo, allow_patterns=["production/*"], local_dir=model_dir, token=token,
                              revision=revision or None)
        except Exception as e:  # noqa: BLE001  (the token is never printed)
            raise ModelError("model download failed") from e
        with open(_revision_file(model_dir), "w", encoding="utf-8") as fh:
            fh.write(revision)
        return resolve_production(model_dir)


def predict_slot(model_dir: str):
    """One predict_case at a time: two ViT-L + ViT-B processes would share the CPU and double the memory."""
    return _locked(model_dir, ".predict.lock")


_ENV_KEEP = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "DINOV2_HUB",
             "TORCH_HOME", "XDG_CACHE_HOME", "OMP_NUM_THREADS", "MKL_NUM_THREADS")


def predict_env(base, extra: dict[str, str]) -> dict[str, str]:
    """The environment for predict_case: what Python and torch need plus the predict settings; no secrets (it unpickles downloaded files)."""
    env = {k: v for k, v in base.items() if k in _ENV_KEEP}
    env.update(extra)
    return env


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
