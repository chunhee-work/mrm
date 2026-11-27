"""Progress screenshots of the Merimen tab. Best effort: a failed shot never fails a job.
Rules: never the login page or any page with a password box; private Blob only; the owner is the case submitter."""

from __future__ import annotations

import io
import re
from datetime import datetime, timezone

from .chrome import is_logged_in_url

MAX_WIDTH = 1280
QUALITY = 70
# step -> (zh, en)
STEPS = {
    "login_verified": ("登录已验证", "Login verified"),
    "case_opened": ("案件已打开", "Case opened"),
    "photos_named": ("照片已命名", "Photos named"),
    "documents_uploaded": ("文件已上传", "Documents uploaded"),
    "case_complete": ("案件已完成", "Case complete"),
    "failed": ("处理出错", "Something went wrong"),
}
# a progress code reported by a driver -> milestone
CODE_TO_STEP = {"create_case": "case_opened", "upload_docs": "documents_uploaded", "parts_labour": "photos_named", "checks": "case_complete"}
_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def pathname(user_id: str, case_id: str, step: str, when: datetime) -> str:
    if not _ID.match(user_id or "") or not _ID.match(case_id or "") or step not in STEPS:
        raise ValueError("screenshot path")
    return f"screenshots/{user_id}/{case_id}/{step}-{when.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.jpg"


def to_jpeg(raw: bytes, max_width: int = MAX_WIDTH, quality: int = QUALITY) -> bytes:
    from PIL import Image

    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if im.width > max_width:
        im = im.resize((max_width, max(1, round(im.height * max_width / im.width))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=quality, optimize=True)
    return out.getvalue()


def page_block(page) -> str | None:
    """Why this page must not be photographed. None means: a logged-in claims page without a password box."""
    try:
        if page.locator("input[type=password]").count() > 0:
            return "password_box"
        if not is_logged_in_url(page.url or ""):
            return "not_logged_in"
    except Exception:
        return "unreadable"
    return None


def milestones_after(step: str, outcome, *, saved: bool) -> list[str]:
    """Milestones a finished job proves. Dry runs prove nothing was changed in Merimen, so they claim nothing."""
    if step not in ("phase_a", "phase_b", "checks"):
        return []
    if outcome.job_state == "failed" or (outcome.error and outcome.job_state != "done"):
        return ["failed"]
    if outcome.job_state != "done":
        return []
    if step == "phase_a" and outcome.merimen_caseid:
        return ["case_opened"] if getattr(outcome, "partial", False) else ["case_opened", "documents_uploaded"]  # a create-only save proves no upload
    if step == "phase_b" and outcome.case_status == "checking":
        return ["photos_named"]
    if step == "checks" and outcome.done:
        return ["case_complete"]
    return []


class Screenshotter:
    def __init__(self, repo, *, enabled: bool, page_for, put, now=lambda: datetime.now(timezone.utc)):
        self.repo, self.enabled, self.page_for, self.put, self.now = repo, enabled, page_for, put, now

    def shoot(self, job: dict, case: dict, step: str) -> bool:
        if not self.enabled or step not in STEPS:
            return False
        user_id = case.get("created_by")
        if not user_id:  # no submitter: nobody may see it, so there is nothing to store
            return False
        try:
            page = self.page_for(job["org_id"])
            if page is None or page_block(page):
                return False
            data = to_jpeg(page.screenshot(type="jpeg", quality=QUALITY))
            when = self.now()
            path = pathname(user_id, case["id"], step, when)
            self.put(path, data)
            zh, en = STEPS[step]
            self.repo.add_screenshot(
                org_id=job["org_id"], user_id=user_id, case_id=case["id"], job_id=job["id"],
                step=step, caption_zh=zh, caption_en=en, blob_pathname=path,
            )
            return True
        except Exception:
            return False


def cleanup(repo, delete, days: int, limit: int = 50) -> int:
    """Blob first, then deleted_at. A blob that will not delete stays listed and is tried again next time. No SQL DELETE."""
    n = 0
    for row_id, path in repo.expired_screenshots(days, limit):
        try:
            delete(path)
        except Exception:
            continue
        repo.mark_screenshot_deleted(row_id)
        n += 1
    return n
