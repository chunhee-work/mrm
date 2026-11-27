"""Manual estimate rows (playbook 08 "Manual parts + pricing"): the group, the quantity and ONE reference price for a part the
Merimen catalogue does not have. The price comes from the owner's tools/price_lookup.py `ref` (same model -> same brand -> same tier
-> same class), read from tools/merimen-part-prices-data.md. An "ALL models / OTHER TIER" price is never used as is (playbook 08): the
row then has no price and is listed for a person.

Data path: `PRICE_DATA_DIR` (a folder holding price_lookup.py and merimen-part-prices-data.md); default the repo's tools/ folder."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import re

_DEFAULT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "tools"))
_cache: dict = {}

# fixed rows from the playbook: Bumper Clips 15 x 10.00 per bumper (playbook 08 "Manual parts")
_FIXED = [(re.compile(r"^bumper clips$", re.I), "10.00", 15)]


def _lookup():
    """(module, blocks), loaded once per process; None when the data is not on this machine."""
    if "mod" in _cache:
        return _cache["mod"]
    folder = os.environ.get("PRICE_DATA_DIR") or _DEFAULT
    src, data = os.path.join(folder, "price_lookup.py"), os.path.join(folder, "merimen-part-prices-data.md")
    out = None
    if os.path.isfile(src) and os.path.isfile(data):
        try:
            spec = importlib.util.spec_from_file_location("_price_lookup", src)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.DATA = data
            out = (mod, mod.load())
        except Exception:  # noqa: BLE001
            out = None
    _cache["mod"] = out
    return out


def ref_price(part: str, model: str) -> tuple[str, str]:
    """('1356.58', 'median of 7 rows, same model ...') or ('', why). Never an OTHER TIER / all-models price."""
    got = _lookup()
    if got is None:
        return "", "no price data on this machine"
    mod, blocks = got
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        med = mod.ref(blocks, part, model or "")
    text = buf.getvalue()
    m = re.search(r"<- median of (\d+) rows, ([^\n]*)", text)
    if med is None or not m:
        return "", "no reference price"
    if "OTHER TIER" in m.group(2):
        return "", "only an other-tier price (never used as is)"
    note = f"median of {m.group(1)} rows, {m.group(2).split('   ')[0].strip()}"
    return f"{float(med):.2f}", note + (" (< 5 rows)" if int(m.group(1)) < 5 else "")


def group(cat: list, text: str) -> str:
    """tools/step2/add_missing.py group(): Suspension Crossmember -> 130 (user 2026-11-04); Rear Panel Inner Trim -> 70 (playbook 08);
    else the group of the front / rear bumper cover the text points at; else the catalogue's first group."""
    if re.search(r"suspension crossmember|crossmember.*suspension", text, re.I):
        return "130"
    if re.search(r"rear panel inner trim", text, re.I):
        return "70"
    want = "Front" if re.search(r"front|bonnet|headlamp|fender|grille|radiator|windscreen", text, re.I) else \
           "Rear" if re.search(r"rear|tailgate|boot|quarter|trunk|spare", text, re.I) else None
    for v, lab, *_ in cat:
        if want and re.search(rf"Bumper {want} Cover", lab):
            return str(v).split("@")[0]
    return str(cat[0][0]).split("@")[0] if cat else ""


def rows_for(missing: list, cat: list, model: str) -> tuple[list, list]:
    """plan["missing"] entries ("Quarter Liner LH  (companion: quarter -> liner)", "Bumper Clips  (front bumper, manual 15 x 10.00)")
    -> (rows [group, name, price, qty, ""], unpriced [(name, why)]). Same name twice = one row, quantities added."""
    rows: dict = {}
    unpriced = []
    for raw in missing:
        name = re.split(r"\s{2,}\(", str(raw), maxsplit=1)[0].strip()
        if not name:
            continue
        fixed = next(((p, q) for rx, p, q in _FIXED if rx.search(name)), None)
        m = re.search(r"manual (\d+) x ([\d.]+)", str(raw))
        if m:
            fixed = (f"{float(m.group(2)):.2f}", int(m.group(1)))
        key = name.lower()
        if any(n.lower() == key for n, _ in unpriced):
            continue
        if key in rows:
            rows[key][3] = str(int(rows[key][3]) + (fixed[1] if fixed else 1))
            continue
        if fixed:
            price, qty = fixed
        else:
            price, why = ref_price(name, model)
            qty = 1
            if not price:
                unpriced.append((name, why))
                continue
        rows[key] = [group(cat, str(raw)), name, price, str(qty), ""]
    return list(rows.values()), unpriced
