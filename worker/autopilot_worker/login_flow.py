"""One Merimen login check. The password is handed to `fetch_page` and nowhere else."""

from __future__ import annotations

from .crypto import open_secret
from .login_page import classify_login, finish_verify


def run_verify(row: dict, master: bytes, fetch_page) -> dict:
    """fetch_page(username, password) is called once. A thrown fetch is an unknown page, not a second try."""
    try:
        user = open_secret(master, row["org_id"], row, "user")
        password = open_secret(master, row["org_id"], row, "pass")
        page = fetch_page(user, password)
        if page.get("offline"):
            return {"verify_state": "queued", "blocked": False, "pause": False, "resume": False, "event": "", "email": None, "release": True}
        result = classify_login(
            url=page.get("url") or "",
            text=page.get("text") or "",
            has_password=bool(page.get("has_password")),
            has_otp=bool(page.get("has_otp")),
        )
    except Exception:
        result = "unknown"
    return finish_verify(result)
