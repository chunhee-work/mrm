"""Download a private Vercel Blob. The token stays in the Authorization header and is never logged."""

from __future__ import annotations

import os
import re
import shutil
import time
from urllib.parse import urlparse


def private_url(url_or_path: str, token: str) -> str:
    """Full private URL, or a pathname plus the store id inside a Vercel blob token. The token secret is not part of the URL."""
    if not url_or_path or not token:
        raise ValueError("blob")
    if url_or_path.startswith("https://"):
        parts = urlparse(url_or_path)
        if not parts.netloc.endswith(".blob.vercel-storage.com"):
            raise ValueError("blob host")
        return url_or_path
    if ".." in url_or_path or url_or_path.startswith("/"):
        raise ValueError("blob path")
    bits = token.split("_")
    # vercel_blob_rw_<storeId>_<secret>
    if len(bits) < 5 or bits[0] != "vercel" or bits[1] != "blob" or bits[2] != "rw" or not bits[3] or not bits[4]:
        raise ValueError("blob token")
    return f"https://{bits[3]}.private.blob.vercel-storage.com/{url_or_path}"


def blob_request(url_or_path: str, token: str) -> tuple[str, dict[str, str]]:
    return private_url(url_or_path, token), {"Authorization": f"Bearer {token}"}


# ---- downloaded case files on this machine: <state>/files/<case id>/<item id>-<name>, removed when the job ends ----

_ID_BAD = re.compile(r"[^A-Za-z0-9_-]")
NAME_MAX_BYTES = 150


def _safe_id(value) -> str:
    """A case or photo id as one folder-safe word. Ids are ours, but nothing that came out of the database is used as a path as it is."""
    s = _ID_BAD.sub("_", "" if value is None else str(value))[:80]
    if not s:
        raise ValueError("id")
    return s


def _safe_name(name) -> str:
    """The file name a user uploaded, as stored in the database: untrusted. Directory parts (/ and \\) and control characters are
    dropped, so it can only ever be a plain name; a long name is cut and keeps its ending."""
    base = str(name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = "".join(ch for ch in base if ch >= " " and ch != "\x7f").encode("utf-8", "ignore").decode("utf-8")
    if base in ("", ".", ".."):
        return "file"
    if len(base.encode("utf-8")) > NAME_MAX_BYTES:
        stem, ext = os.path.splitext(base)
        ext = ext[:16]
        base = stem.encode("utf-8")[: NAME_MAX_BYTES - len(ext.encode("utf-8"))].decode("utf-8", "ignore") + ext
    return base


def local_file(store_dir: str, case_id, item_id, name) -> str:
    """Where one downloaded file goes. The item id in front keeps two photos with the same name apart."""
    return os.path.join(store_dir, _safe_id(case_id), f"{_safe_id(item_id)}-{_safe_name(name)}")


def write_private(path: str, data: bytes) -> None:
    """Folder 0700, file 0600: case PDFs carry ID numbers."""
    os.makedirs(os.path.dirname(os.path.dirname(path)), mode=0o700, exist_ok=True)
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)


def remove_case_files(store_dir: str, case_id) -> None:
    """The job is over (done or failed): its downloads go. Missing folder = nothing to do. Never raises."""
    try:
        shutil.rmtree(os.path.join(store_dir, _safe_id(case_id)), ignore_errors=True)
    except ValueError:
        pass


def sweep_old_files(store_dir: str, max_age: float = 6 * 3600, now=time.time) -> int:
    """Left-overs: a job that was killed never reached its clean-up, and files from before folders per case lie flat in store_dir.
    Everything directly under store_dir that has not changed for max_age seconds is removed (far longer than any job runs).
    A link is removed, never followed. Returns how many entries went."""
    gone = 0
    try:
        entries = list(os.scandir(store_dir))
    except OSError:
        return 0
    t = now()
    for e in entries:
        try:
            if t - e.stat(follow_symlinks=False).st_mtime < max_age:
                continue
            if e.is_dir(follow_symlinks=False):
                shutil.rmtree(e.path)
            else:
                os.unlink(e.path)
            gone += 1
        except OSError:
            continue
    return gone


API = "https://vercel.com/api/blob"
API_VERSION = "13"


def store_id(token: str) -> str:
    bits = token.split("_")
    if len(bits) < 5 or bits[0] != "vercel" or bits[1] != "blob" or bits[2] != "rw" or not bits[3]:
        raise ValueError("blob token")
    return bits[3]


def put_request(pathname: str, token: str, content_type: str = "image/jpeg") -> tuple[str, dict[str, str]]:
    """Same wire format as @vercel/blob put() with access private. The token goes only into the header."""
    if not pathname or ".." in pathname or pathname.startswith("/"):
        raise ValueError("blob path")
    from urllib.parse import quote

    return f"{API}/?pathname={quote(pathname, safe='/')}", {
        "authorization": f"Bearer {token}",
        "x-api-version": API_VERSION,
        "x-vercel-blob-store-id": store_id(token),
        "x-vercel-blob-access": "private",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "1",
        "x-content-type": content_type,
    }


def delete_request(pathname: str, token: str) -> tuple[str, dict[str, str], bytes]:
    import json

    if not pathname or ".." in pathname or pathname.startswith("/"):
        raise ValueError("blob path")
    return f"{API}/delete", {
        "authorization": f"Bearer {token}",
        "x-api-version": API_VERSION,
        "x-vercel-blob-store-id": store_id(token),
        "content-type": "application/json",
    }, json.dumps({"urls": [pathname]}).encode()


def blob_put(token: str, pathname: str, data: bytes, *, opener=None) -> None:
    import urllib.request

    url, headers = put_request(pathname, token)
    req = urllib.request.Request(url, data=data, method="PUT", headers=headers)
    with (opener or urllib.request.urlopen)(req, timeout=60) as r:
        r.read()


def blob_delete(token: str, pathname: str, *, opener=None) -> None:
    import urllib.request

    url, headers, body = delete_request(pathname, token)
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with (opener or urllib.request.urlopen)(req, timeout=30) as r:
        r.read()
