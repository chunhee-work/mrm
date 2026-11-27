"""Car colour for the Adjuster Report, read by Jev from one of the case's own photos.

Owner decision 2026-11-27 (option A: the reader extracts the report fields from documents AND photos, extra AI cost accepted; playbook 04:
the colour is what the photo shows). ONE overview photo per case is sent. The odometer stays 0 (playbook 04: unreadable -> 0): Jev here answers choices and
probabilities, not free numbers. Results are
kept for this process so repeated dry runs do not pay again. Any error, a low confidence or Jev being off returns nothing: the report
then stops at `colour_unknown` for a person, never a guessed colour."""

from __future__ import annotations

import base64
import io
import re
import uuid

from .jev import Jev

MODEL = "jev-preview"  # image questions need the preview model (same as jev_pages)
MIN_CONF = 0.6
MAX_SIDE = 1600
COLOURS = {c: f"The car body is {c.lower()}." for c in (
    "White", "Black", "Silver", "Grey", "Red", "Maroon", "Blue", "Green", "Brown", "Gold", "Beige", "Yellow", "Orange", "Purple")}

_cache: dict[str, dict] = {}

OVERVIEW = re.compile(r"overview|full|front\s*view|rear\s*view|view|45|plate|number\s*plate|whole", re.I)
DASH = re.compile(r"odo|odometer|dashboard|meter|mileage", re.I)


def pick_photos(desk: list[dict]) -> tuple[dict | None, dict | None]:
    """(overview photo, dashboard photo) from the desk rows. Overview: a name that says so, else the first photo."""
    rows = [d for d in desk or [] if d.get("blob_path")]
    name = lambda d: d.get("final_name") or d.get("model_name") or ""  # noqa: E731
    over = next((d for d in rows if OVERVIEW.search(name(d))), rows[0] if rows else None)
    dash = next((d for d in rows if DASH.search(name(d))), None)
    return over, dash


def _small_jpg(raw: bytes) -> bytes:
    from PIL import Image

    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=82)
    return out.getvalue()


def _asset(jpg: bytes) -> tuple[str, dict]:
    ref = str(uuid.uuid4())
    return ref, {ref: {"type": "image", "format": "jpg", "data_base64": base64.b64encode(jpg).decode()}}


def read(jev: Jev | None, case: dict, fetch) -> dict:
    """{"colour": "Silver"} when read with confidence; {} otherwise."""
    cid = str(case.get("id") or "")
    if cid in _cache:
        return _cache[cid]
    if jev is None:
        return {}
    over, _dash = pick_photos(case.get("desk") or [])
    out: dict = {}
    try:
        if over:
            raw = fetch(over["blob_path"])
            if raw:
                ref, assets = _asset(_small_jpg(raw))
                ans = jev.ask({"photo": ref}, {"colour": {"type": "choice", "criteria": COLOURS,
                                                          "instructions": "`photo` shows a car from a motor claim. What is the main body colour of the car?"}},
                              purpose="photo_colour", case_id=cid or None, assets=assets, model=MODEL).get("answers") or {}
                a = ans.get("colour") or {}
                if a.get("choice") in COLOURS and isinstance(a.get("confidence"), (int, float)) and a["confidence"] >= MIN_CONF:
                    out["colour"] = a["choice"]
    except Exception:  # noqa: BLE001  (nothing here may stop a case: the report then stops at colour_unknown for a person)
        return out
    if cid:
        _cache[cid] = out
    return out
