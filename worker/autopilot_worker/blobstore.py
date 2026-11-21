"""Download a private Vercel Blob. The token stays in the Authorization header and is never logged."""

from __future__ import annotations

import os
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


def local_file(store_dir: str, name: str) -> str:
    base = os.path.basename(name).replace("\x00", "")
    if not base or base in (".", ".."):
        raise ValueError("name")
    return os.path.join(store_dir, base)
