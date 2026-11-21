"""Photo order, Merimen file types and the 完成 snapshot. Same rules as web/src/lib/photos/order-rules.ts and snapshot.ts:
both read playbook/photo-rules.json (copied to playbook/photo-rules.json here) and share golden vectors in their tests."""

from __future__ import annotations

import hashlib
import json
import os
from functools import lru_cache

_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "playbook")


@lru_cache(maxsize=1)
def rules() -> dict:
    with open(os.path.join(_DIR, "photo-rules.json"), encoding="utf-8") as f:
        return json.load(f)


def file_type(name: str | None) -> str:
    r = rules()["fileTypes"]
    if name and name in rules()["opening"]["corners"]:
        return r["corner"]
    return r["byName"].get(name or "", r["default"])


def shown_name(row: dict) -> str | None:
    """The name a photo carries: the adjuster's, else the model's."""
    return row.get("final_name") or row.get("model_name") or None


def snapshot_of(rows: list[dict], extras: list[str]) -> str:
    """The fingerprint the site stores when 完成 is pressed. rows are in desk order (position, id)."""
    lines = "\n".join(f"{r['id']}\t{shown_name(r) or ''}" for r in rows)
    ex = "\n".join(sorted(e.lower() for e in extras))
    return hashlib.sha256(f"{lines}\n--\n{ex}".encode()).hexdigest()


def plan_rows(rows: list[dict]) -> list[dict]:
    """What Merimen gets, in desk order: the original file, the name, the file type. Unnamed photos are left out (the desk blocks done while any exist)."""
    out = []
    for r in rows:
        name = shown_name(r)
        if name:
            out.append({"id": r["id"], "src": r.get("src_name") or "", "name": name, "ftype": file_type(name), "position": len(out) + 1})
    return out
