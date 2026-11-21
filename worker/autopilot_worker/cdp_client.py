"""Read-only page facts and the allowlist for a later save. Saving stays behind MERIMEN_WRITES."""

from __future__ import annotations

import re

_NAME = re.compile(r"^[A-Za-z0-9_]{1,40}$")
_SECRET = re.compile(r"pass|pwd|token|cookie|secret|cfid|cftoken", re.I)


def allow_field(name: object) -> bool:
    return isinstance(name, str) and bool(_NAME.match(name)) and not _SECRET.search(name)


def page_block(info: dict) -> str | None:
    """Why a save must not run. None means the open page looks like a logged-in claims page."""
    if info.get("has_password"):
        return "password_page"
    from .chrome import is_logged_in_url

    urls = info.get("urls") or []
    if any(is_logged_in_url(u) for u in urls):
        return None
    return "not_logged_in"


def create_fields(case_data: dict, plate: str) -> list[dict]:
    """Field names copied from the owner's create script. Values are not logged by the caller."""
    veh = case_data.get("client_vehicle") or {}
    at = case_data.get("at_fault") or {}
    policy = at.get("policy") or {}
    raw = [
        ("sleREGNO", plate),
        ("sleCHANO", veh.get("chassis_no") or ""),
        ("slePOLNO", policy.get("policy_no") or ""),
    ]
    return [{"name": n, "value": v} for n, v in raw if allow_field(n) and v]
