"""Envelope encryption for a Merimen login. The master key wraps a per-org data key.

AES-256-GCM, 12-byte nonce, 16-byte tag appended to the ciphertext. The website's
Node implementation uses the same layout. The password is decrypted only to type it
into Merimen, and it is never written to a log.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def master_key(raw: str) -> bytes:
    try:
        key = base64.b64decode(raw or "", validate=True)
    except Exception as e:
        raise ValueError("MERIMEN_CRED_KEY") from e
    if len(key) != 32:
        raise ValueError("MERIMEN_CRED_KEY")
    return key


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _raw(s: str) -> bytes:
    return base64.b64decode(s)


def username_hint(name: str) -> str:
    name = (name or "").strip()
    if len(name) <= 2:
        return "•" * len(name)
    return name[:2] + "…"


def seal(master: bytes, org_id: str, username: str, password: str) -> dict[str, str]:
    if not org_id or not username or not password:
        raise ValueError("empty")
    dek = os.urandom(32)
    dek_nonce = os.urandom(12)
    user_nonce = os.urandom(12)
    pass_nonce = os.urandom(12)
    wrapped = AESGCM(master).encrypt(dek_nonce, dek, f"dek:{org_id}".encode())
    user_ct = AESGCM(dek).encrypt(user_nonce, username.encode(), f"user:{org_id}".encode())
    pass_ct = AESGCM(dek).encrypt(pass_nonce, password.encode(), f"pass:{org_id}".encode())
    return {
        "username_hint": username_hint(username),
        "wrapped_dek": _b64(wrapped),
        "dek_nonce": _b64(dek_nonce),
        "username_ct": _b64(user_ct),
        "username_nonce": _b64(user_nonce),
        "password_ct": _b64(pass_ct),
        "password_nonce": _b64(pass_nonce),
    }


def open_secret(master: bytes, org_id: str, row: dict, field: str) -> str:
    """field is 'user' or 'pass'. Caller must not log the return value."""
    dek = AESGCM(master).decrypt(_raw(row["dek_nonce"]), _raw(row["wrapped_dek"]), f"dek:{org_id}".encode())
    if field == "user":
        ct, nonce, aad = row["username_ct"], row["username_nonce"], f"user:{org_id}"
    elif field == "pass":
        ct, nonce, aad = row["password_ct"], row["password_nonce"], f"pass:{org_id}"
    else:
        raise ValueError("field")
    return AESGCM(dek).decrypt(_raw(nonce), _raw(ct), aad.encode()).decode()


def seal_otp(master: bytes, org_id: str, row: dict, code: str) -> dict[str, str]:
    dek = AESGCM(master).decrypt(_raw(row["dek_nonce"]), _raw(row["wrapped_dek"]), f"dek:{org_id}".encode())
    nonce = os.urandom(12)
    ct = AESGCM(dek).encrypt(nonce, code.encode(), f"otp:{org_id}".encode())
    return {"code_ct": _b64(ct), "code_nonce": _b64(nonce)}


def open_otp(master: bytes, org_id: str, row: dict, code_ct: str, code_nonce: str) -> str:
    dek = AESGCM(master).decrypt(_raw(row["dek_nonce"]), _raw(row["wrapped_dek"]), f"dek:{org_id}".encode())
    return AESGCM(dek).decrypt(_raw(code_nonce), _raw(code_ct), f"otp:{org_id}".encode()).decode()
